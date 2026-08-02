'use client';

import {
  CARD_SEARCH_INCLUDE_TCG_POCKET_DEFAULT,
  CARD_SEARCH_LANGUAGE_DEFAULT,
} from '@binder-project-planner/shared';
import { useRouter } from 'next/navigation';
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

import {
  createCard,
  createCustomCard,
  deleteCard,
  getBinder,
  listBinderArt,
  listBinderCards,
  moveCards,
  type Binder,
  type Card,
  type CardPositionUpdate,
  type CardSearchLanguage,
  type CreateCardRequest,
} from '@/lib/api';
import {
  LoadingIndicator,
  toProblemDetailsInfo,
  useDelayedLoading,
  useSaveStatusToast,
  useToastContext,
} from '@/shared/feedback';

import { BinderTabs } from './BinderTabs';

// Builds the key used to look up a card by slot, and to track a slot's
// pending-assignment state, from its placement coordinates (story 11). All
// 3 coordinates are always populated together for a placed card (see the
// `PlacementCoordinates` schema), so this never needs to handle a partially
// null placement.
function placementKey(placement: { physicalPage: number; row: number; column: number }): string {
  return `${placement.physicalPage}-${placement.row}-${placement.column}`;
}

// The manual-entry form's text-field values (story 12) - excludes the
// image file (handled separately as a `File`) and `variation` (not part of
// the manual-entry form; set later through the same later-story flow used
// for TCGdex cards).
export interface CustomCardFormValues {
  name: string;
  setName: string | null;
  localNumber: string | null;
}

// A one-shot signal set by `assignCustomCard` when a custom-card submission
// fails (story 12: "the manual-entry view reopens ... with the entered
// values and selected file preserved"). `BinderLayoutView` consumes this
// exactly once (reopening the card-selection modal pre-filled, then
// clearing it via `clearManualEntryRestore`) rather than it living as
// persistent state, so a later unrelated modal open never accidentally
// restores a stale failed attempt.
export interface ManualEntryRestore {
  placement: { physicalPage: number; row: number; column: number } | null;
  values: CustomCardFormValues;
  file: File;
}

// Fixed (not per-attempt-random) toast id, matching the pattern established
// by BinderList's `LIST_BINDERS_TOAST_ID`: a later attempt (retry, or a
// fresh mount after the redirect-home case below) replaces this operation's
// own toast rather than stacking a new one on top of a still-visible one.
const OPEN_BINDER_TOAST_ID = 'open-binder';

// The 3 states one binder-load attempt can be in (mirrors BinderList's
// `BinderListStatus`, extended here with the redirect-triggering 404/400
// handling in the effect below rather than as a 4th status).
type BinderLoadStatus = 'loading' | 'success' | 'error';

// The shared binder route context value (story 7): the binder details,
// cards, and multi-slot art loaded in parallel by the route's provider, plus
// a setter the Edit Details tab uses to sync the context after a successful
// `PATCH` without forcing a full reload. Art doesn't have a real schema yet
// (story 25; see BinderRouteProvider's fetch below), so it's still typed as
// `unknown[]` for now.
interface BinderRouteContextValue {
  binder: Binder;
  cards: Card[];
  art: unknown[];
  // Replaces the context's binder with the backend's authoritative
  // representation, e.g. after the Edit Details tab's `PATCH` succeeds.
  updateBinder: (binder: Binder) => void;
  // The most recently displayed one-based physical page on the "Edit
  // Layout" tab (story 8), or `null` if that tab hasn't been visited yet
  // this route mount. Retained here (rather than in the layout tab's own
  // state) so it survives switching to another tab and back without
  // needing to reload binder data.
  layoutFocalPage: number | null;
  setLayoutFocalPage: (page: number) => void;
  // Assigns a TCGdex catalog card to a binder slot (story 11): inserts an
  // optimistic `Card` immediately (so the slot shows the card without
  // waiting on the request), then replaces it with the backend's
  // authoritative representation on success, or removes it (restoring the
  // empty slot) and surfaces the shared failed toast on failure.
  assignCard: (request: CreateCardRequest) => void;
  // Assigns a manually-entered custom card to a binder slot (story 12),
  // mirroring `assignCard`'s optimistic-insert/replace-or-remove lifecycle.
  // `placement` is `null` for an unplaced-section target (story 15's panel
  // add button).
  assignCustomCard: (
    values: CustomCardFormValues,
    file: File,
    placement: { physicalPage: number; row: number; column: number } | null,
  ) => void;
  // The set of optimistic card ids for a card currently being created
  // directly into the unplaced section (story 15) - either through
  // `assignCard` or `assignCustomCard` with an all-null placement target -
  // so the unplaced panel can disable that one pending card's own actions
  // until its create request settles. Keyed by id (not `placementKey`,
  // which needs concrete coordinates that an unplaced card never has).
  pendingUnplacedCardIds: Set<string>;
  // Set once by `assignCustomCard` when a submission fails, so the layout
  // tab can reopen the card-selection modal pre-filled with the failed
  // attempt's values/file rather than losing them. Consumed exactly once
  // via `clearManualEntryRestore`.
  manualEntryRestore: ManualEntryRestore | null;
  clearManualEntryRestore: () => void;
  // The set of `placementKey`-formatted slots with an assignment currently
  // in flight, so the layout tab can disable those slots against further
  // clicks until the request settles.
  pendingPlacementKeys: Set<string>;
  // Permanently removes a card from its binder slot (story 13):
  // optimistically removes it from context immediately, restoring it to
  // its exact prior list index if the backend delete fails.
  removeCard: (cardId: string) => void;
  // The set of card ids with a removal currently in flight, so the layout
  // tab can disable that card's own actions (permitting no further actions
  // on it) until the request settles.
  pendingCardDeletionIds: Set<string>;
  // Moves (or, if `destination` is already occupied, swaps with) a card to
  // another slot on the same binder (story 14): optimistically applies the
  // new placement(s) immediately, then replaces the affected cards with
  // the backend's authoritative representation on success, or restores
  // both cards' exact prior placements on failure (e.g. a `409 Conflict`
  // from a stale expected position or an occupied destination).
  moveCard: (
    cardId: string,
    destination: { physicalPage: number | null; row: number | null; column: number | null },
  ) => void;
  // True while a move/swap request is in flight for this binder. Per story
  // 14's serialization requirement, at most one movement request is ever
  // in flight at a time, so this single flag (rather than a per-card set)
  // is enough for the layout tab to disable all card dragging in the
  // binder until it settles - new movement operations are never queued
  // behind it.
  isMovePending: boolean;
  // Story 41's card-selection modal language toggle: ephemeral React state
  // that lives above the modal so it survives the modal closing and
  // reopening within the same binder visit, but resets (back to
  // `CARD_SEARCH_LANGUAGE_DEFAULT`) whenever this route context itself
  // remounts (a fresh binder visit or a page reload) - it's never persisted
  // to the backend or browser storage.
  cardSearchLanguage: CardSearchLanguage;
  setCardSearchLanguage: (language: CardSearchLanguage) => void;
  // Story 41's card-selection modal TCG Pocket toggle: ephemeral React
  // state with the same lifetime and reset behavior as `cardSearchLanguage`
  // above.
  includeTcgPocket: boolean;
  setIncludeTcgPocket: (includeTcgPocket: boolean) => void;
}

const BinderRouteContext = createContext<BinderRouteContextValue | null>(null);

// Reads the binder route context, throwing if called outside a
// `BinderRouteProvider` so a tab rendered without the provider mounted above
// it (a programming error) fails loudly rather than silently.
export function useBinderRouteContext(): BinderRouteContextValue {
  const context = useContext(BinderRouteContext);
  if (!context) {
    throw new Error('useBinderRouteContext must be used within a BinderRouteProvider.');
  }
  return context;
}

// Mounted once per binder route (from `[binderId]/layout.tsx`) and remains
// mounted while the user switches between its nested tabs, so tab
// navigation never refetches unchanged binder data or discards local
// updates (story 7). Loads the binder's details, cards, and art through 3
// parallel requests and only publishes them - and only renders the tab nav
// and `children` - once every request has succeeded, so nested tabs never
// receive a partially loaded binder graph.
export function BinderRouteProvider({
  binderId,
  children,
}: {
  binderId: string;
  children: React.ReactNode;
}) {
  const router = useRouter();
  const { markFailed, dismiss } = useToastContext();
  const { start } = useSaveStatusToast();

  const [status, setStatus] = useState<BinderLoadStatus>('loading');
  const [binder, setBinder] = useState<Binder | null>(null);
  const [cards, setCards] = useState<Card[]>([]);
  const [art, setArt] = useState<unknown[]>([]);
  // The slots (by `placementKey`) with an assignment currently in flight
  // (story 11), so the layout tab can disable them until the request
  // settles.
  const [pendingPlacementKeys, setPendingPlacementKeys] = useState<Set<string>>(new Set());
  // Bumped by the retry button to re-run the load effect below without
  // needing a separate imperative "reload" function threaded through state.
  const [retryToken, setRetryToken] = useState(0);
  // Story 8's retained layout focal page; `null` means the layout tab
  // hasn't been visited yet during this route mount, so it should still
  // default to physical page 1 without adding `?page=1` to the URL.
  const [layoutFocalPage, setLayoutFocalPage] = useState<number | null>(null);
  // Story 41's card-selection modal language toggle - ephemeral, scoped to
  // this route mount (see the context value's own doc comment above).
  const [cardSearchLanguage, setCardSearchLanguage] = useState<CardSearchLanguage>(
    CARD_SEARCH_LANGUAGE_DEFAULT,
  );
  // Story 41's card-selection modal TCG Pocket toggle - ephemeral, scoped
  // the same way as `cardSearchLanguage` above.
  const [includeTcgPocket, setIncludeTcgPocket] = useState<boolean>(
    CARD_SEARCH_INCLUDE_TCG_POCKET_DEFAULT,
  );
  // Story 12's one-shot restore signal (see the context value type's doc
  // comment above) - `null` whenever there's no failed custom-card
  // submission awaiting correction.
  const [manualEntryRestore, setManualEntryRestore] = useState<ManualEntryRestore | null>(null);
  // Story 13's in-flight card removals, by card id - lets the layout tab
  // disable a pending card's own actions until its delete request settles.
  const [pendingCardDeletionIds, setPendingCardDeletionIds] = useState<Set<string>>(new Set());
  // Story 14's single in-flight-movement flag (see the context value's own
  // doc comment above for why one flag suffices instead of a per-card set).
  const [isMovePending, setIsMovePending] = useState(false);
  // Story 15's in-flight-unplaced-create ids (see the context value's own
  // doc comment above).
  const [pendingUnplacedCardIds, setPendingUnplacedCardIds] = useState<Set<string>>(new Set());

  const showLoading = useDelayedLoading(status === 'loading');

  useEffect(() => {
    const controller = new AbortController();

    async function load() {
      setStatus('loading');
      try {
        // Story 7 requires all 3 requests to run in parallel and to publish
        // together only once every one succeeds, so a consumer never sees
        // e.g. cards without matching binder details.
        const [binderResult, cardsResult, artResult] = await Promise.all([
          getBinder(binderId, controller.signal),
          listBinderCards(binderId, controller.signal),
          listBinderArt(binderId, controller.signal),
        ]);
        setBinder(binderResult);
        setCards(cardsResult);
        setArt(artResult);
        setStatus('success');
        dismiss(OPEN_BINDER_TOAST_ID);
      } catch (error) {
        // An aborted request's rejection isn't a real failure - it means this
        // attempt was superseded (e.g. the user navigated away), so it's
        // ignored rather than reported as an error.
        if (controller.signal.aborted) return;

        const info = toProblemDetailsInfo(error);
        if (info.httpStatus === 404 || info.httpStatus === 400) {
          // Missing binder (404) or malformed binderId (400, rejected by
          // request validation before the database lookup) both use the
          // same redirect-home-and-toast behavior per story 7's acceptance
          // criteria. `replace` (not `push`) so the invalid binder URL isn't
          // left in browser history.
          markFailed(OPEN_BINDER_TOAST_ID, info);
          router.replace('/');
          return;
        }

        setStatus('error');
        markFailed(OPEN_BINDER_TOAST_ID, info);
      }
    }

    load();

    return () => {
      controller.abort();
    };
  }, [binderId, retryToken, router, markFailed, dismiss]);

  // Lets the Edit Details tab sync the context with the backend's
  // authoritative binder after a successful `PATCH`, without re-fetching
  // cards/art or discarding the rest of the loaded route state.
  const updateBinder = useCallback((updated: Binder) => {
    setBinder(updated);
  }, []);

  // A failed (non-404/400) load's retry action: re-runs all 3 requests per
  // story 7's "retry starts all three requests again".
  const retry = useCallback(() => {
    setRetryToken((token) => token + 1);
  }, []);

  // Assigns a TCGdex catalog card to a binder slot, or to the unplaced
  // section if `request.placement` is all-null (story 11; unplaced target
  // added in story 15). A placed target is tracked by `placementKey` (so
  // the occupied/targeted slot itself can be disabled); an unplaced target
  // has no slot to disable, so it's tracked by the optimistic card's own id
  // in `pendingUnplacedCardIds` instead. Uses a synthetic
  // `crypto.randomUUID()` id for the optimistic card so it can be found and
  // replaced/removed again once the request settles, without colliding
  // with any real backend-issued id.
  const assignCard = useCallback(
    (request: CreateCardRequest) => {
      const { physicalPage, row, column } = request.placement;
      const isPlaced = physicalPage !== null && row !== null && column !== null;
      const key = isPlaced ? placementKey({ physicalPage, row, column }) : null;
      const optimisticId = `optimistic-${crypto.randomUUID()}`;
      const now = new Date().toISOString();
      const optimisticCard: Card = {
        id: optimisticId,
        binderId,
        name: request.name,
        setName: request.setName,
        localNumber: request.localNumber,
        source: 'tcgdex',
        providerCardId: request.providerCardId,
        providerSetId: request.providerSetId,
        variation: request.variation ?? null,
        placement: request.placement,
        // The provider's own image URL stands in until the backend's
        // representation (pointing at its own `/cards/{cardId}/image`
        // endpoint) replaces this optimistic entry.
        imageUrl: request.imageUrl,
        createdAt: now,
        updatedAt: now,
      };

      setCards((previous) => [...previous, optimisticCard]);
      if (key) {
        setPendingPlacementKeys((previous) => new Set(previous).add(key));
      } else {
        setPendingUnplacedCardIds((previous) => new Set(previous).add(optimisticId));
      }

      const toast = start(key ? `assign-card-${key}` : `assign-card-${optimisticId}`);

      createCard(binderId, request)
        .then((created) => {
          setCards((previous) =>
            previous.map((card) => (card.id === optimisticId ? created : card)),
          );
          toast.markSaved();
        })
        .catch((error) => {
          setCards((previous) => previous.filter((card) => card.id !== optimisticId));
          toast.markFailed(error);
        })
        .finally(() => {
          if (key) {
            setPendingPlacementKeys((previous) => {
              const next = new Set(previous);
              next.delete(key);
              return next;
            });
          } else {
            setPendingUnplacedCardIds((previous) => {
              const next = new Set(previous);
              next.delete(optimisticId);
              return next;
            });
          }
        });
    },
    [binderId, start],
  );

  // Assigns a manually-entered custom card to a binder slot (story 12).
  // Mirrors `assignCard`'s optimistic lifecycle, but creates its own
  // object-URL preview from the uploaded `file` for the optimistic card's
  // `imageUrl` (independent of the card-selection modal's own preview
  // object URL - each owns and revokes its own). Revoking it
  // unconditionally in `.finally()` is safe either way: by the time
  // `.finally()` runs, the `.then()`/`.catch()` above has already replaced
  // or removed the optimistic card from `cards`, so nothing continues to
  // reference this URL regardless of outcome.
  const assignCustomCard = useCallback(
    (
      values: CustomCardFormValues,
      file: File,
      placement: { physicalPage: number; row: number; column: number } | null,
    ) => {
      const key = placement ? placementKey(placement) : `unplaced-${crypto.randomUUID()}`;
      const optimisticId = `optimistic-${crypto.randomUUID()}`;
      const previewUrl = URL.createObjectURL(file);
      const now = new Date().toISOString();
      const optimisticCard: Card = {
        id: optimisticId,
        binderId,
        name: values.name,
        setName: values.setName,
        localNumber: values.localNumber,
        source: 'custom',
        providerCardId: null,
        providerSetId: null,
        variation: null,
        placement: placement ?? { physicalPage: null, row: null, column: null },
        imageUrl: previewUrl,
        createdAt: now,
        updatedAt: now,
      };

      setCards((previous) => [...previous, optimisticCard]);
      if (placement) {
        setPendingPlacementKeys((previous) => new Set(previous).add(key));
      } else {
        setPendingUnplacedCardIds((previous) => new Set(previous).add(optimisticId));
      }

      const toast = start(`assign-custom-card-${key}`);

      createCustomCard(binderId, { ...values, placement, image: file })
        .then((created) => {
          setCards((previous) =>
            previous.map((card) => (card.id === optimisticId ? created : card)),
          );
          toast.markSaved();
        })
        .catch((error) => {
          setCards((previous) => previous.filter((card) => card.id !== optimisticId));
          // Preserves the failed attempt's values/file so the layout tab
          // can reopen the modal pre-filled (see `ManualEntryRestore`'s doc
          // comment above) instead of the user having to re-enter
          // everything.
          setManualEntryRestore({ placement, values, file });
          toast.markFailed(error);
        })
        .finally(() => {
          URL.revokeObjectURL(previewUrl);
          if (placement) {
            setPendingPlacementKeys((previous) => {
              const next = new Set(previous);
              next.delete(key);
              return next;
            });
          } else {
            setPendingUnplacedCardIds((previous) => {
              const next = new Set(previous);
              next.delete(optimisticId);
              return next;
            });
          }
        });
    },
    [binderId, start],
  );

  // Clears the one-shot restore signal once `BinderLayoutView` has consumed
  // it (copied it into its own local state and reopened the modal).
  const clearManualEntryRestore = useCallback(() => {
    setManualEntryRestore(null);
  }, []);

  // Permanently removes a card from a binder slot (story 13). Sending X
  // immediately: no confirmation dialog. Captures the card's current list
  // index and full record before removing it so a failed delete restores
  // it to the exact same spot rather than appending it back at the end -
  // this list itself is what already encodes each card's slot, so there's
  // no separate placement state to roll back alongside it.
  const removeCard = useCallback(
    (cardId: string) => {
      const index = cards.findIndex((card) => card.id === cardId);
      if (index === -1) return;
      const removedCard = cards[index];

      setCards((previous) => previous.filter((card) => card.id !== cardId));
      setPendingCardDeletionIds((previous) => new Set(previous).add(cardId));

      const toast = start(`remove-card-${cardId}`);

      deleteCard(cardId)
        .then(() => {
          toast.markSaved();
        })
        .catch((error) => {
          setCards((previous) => {
            const restored = [...previous];
            restored.splice(index, 0, removedCard);
            return restored;
          });
          toast.markFailed(error);
        })
        .finally(() => {
          setPendingCardDeletionIds((previous) => {
            const next = new Set(previous);
            next.delete(cardId);
            return next;
          });
        });
    },
    [cards, start],
  );

  // Moves (or swaps) a card to another slot in the same binder, or into the
  // unplaced section if `destination` is all-null (story 14; unplaced
  // destination/source added in story 15). `destination` always identifies
  // whatever the layout tab's drop target resolved to (a concrete slot or
  // the unplaced panel); a `null`/missing dragged card is unreachable in
  // practice (dragging only starts from an occupied slot or an unplaced
  // list item) but guarded rather than asserted. If another card already
  // occupies a *placed* `destination`, both cards trade placements (a
  // swap) in a single `PATCH` request; otherwise only the dragged card
  // moves. An all-null destination never has an "occupant" to swap with -
  // every unplaced card already shares that same null placement, and the
  // backend's unique-placement index is inert for null coordinates - so
  // the occupant lookup only ever runs against a placed destination.
  const moveCard = useCallback(
    (
      cardId: string,
      destination: { physicalPage: number | null; row: number | null; column: number | null },
    ) => {
      const draggedCard = cards.find((card) => card.id === cardId);
      if (!draggedCard) return;

      const occupyingCard =
        destination.physicalPage !== null
          ? cards.find(
              (card) =>
                card.id !== cardId &&
                card.placement.physicalPage === destination.physicalPage &&
                card.placement.row === destination.row &&
                card.placement.column === destination.column,
            )
          : undefined;

      const previousDraggedPlacement = draggedCard.placement;
      const previousOccupyingPlacement = occupyingCard?.placement ?? null;

      setCards((previous) =>
        previous.map((card) => {
          if (card.id === draggedCard.id) return { ...card, placement: destination };
          if (occupyingCard && card.id === occupyingCard.id) {
            return { ...card, placement: previousDraggedPlacement };
          }
          return card;
        }),
      );
      setIsMovePending(true);

      const updates: CardPositionUpdate[] = [
        {
          cardId: draggedCard.id,
          expectedPlacement: previousDraggedPlacement,
          finalPlacement: destination,
        },
      ];
      if (occupyingCard && previousOccupyingPlacement) {
        updates.push({
          cardId: occupyingCard.id,
          expectedPlacement: previousOccupyingPlacement,
          finalPlacement: previousDraggedPlacement,
        });
      }

      const toast = start(`move-card-${draggedCard.id}`);

      moveCards(draggedCard.id, updates)
        .then((updatedCards) => {
          setCards((previous) =>
            previous.map((card) => updatedCards.find((updated) => updated.id === card.id) ?? card),
          );
          toast.markSaved();
        })
        .catch((error) => {
          // Rolls both cards back to their exact pre-drop placements
          // (rather than re-fetching the binder) so an unaffected slot's
          // optimistic state elsewhere in the grid is left untouched.
          setCards((previous) =>
            previous.map((card) => {
              if (card.id === draggedCard.id) {
                return { ...card, placement: previousDraggedPlacement };
              }
              if (occupyingCard && card.id === occupyingCard.id) {
                return { ...card, placement: previousOccupyingPlacement! };
              }
              return card;
            }),
          );
          toast.markFailed(error);
        })
        .finally(() => {
          setIsMovePending(false);
        });
    },
    [cards, start],
  );

  // Only meaningful once `status === 'success'`; computed unconditionally
  // (rather than after an early return) so hook call order stays stable
  // across renders.
  const value = useMemo<BinderRouteContextValue | null>(() => {
    if (!binder) return null;
    return {
      binder,
      cards,
      art,
      updateBinder,
      layoutFocalPage,
      setLayoutFocalPage,
      assignCard,
      pendingPlacementKeys,
      assignCustomCard,
      pendingUnplacedCardIds,
      manualEntryRestore,
      clearManualEntryRestore,
      removeCard,
      pendingCardDeletionIds,
      moveCard,
      isMovePending,
      cardSearchLanguage,
      setCardSearchLanguage,
      includeTcgPocket,
      setIncludeTcgPocket,
    };
  }, [
    binder,
    cards,
    art,
    updateBinder,
    layoutFocalPage,
    assignCard,
    pendingPlacementKeys,
    assignCustomCard,
    pendingUnplacedCardIds,
    manualEntryRestore,
    clearManualEntryRestore,
    removeCard,
    pendingCardDeletionIds,
    moveCard,
    isMovePending,
    cardSearchLanguage,
    includeTcgPocket,
  ]);

  if (status === 'loading') {
    return showLoading ? <LoadingIndicator label="Loading binder…" size="10" /> : null;
  }

  if (status === 'error') {
    return (
      <div className="flex flex-col items-center gap-4 p-8">
        <p className="text-body text-neutral-500">The binder could not be loaded.</p>
        <button
          type="button"
          onClick={retry}
          className="cursor-pointer rounded-standard bg-primary px-4 py-2 font-bold hover:brightness-110"
        >
          Retry
        </button>
      </div>
    );
  }

  // Unreachable in practice (status is only 'success' once `binder` is set),
  // but keeps the render function total instead of asserting `value!` below.
  if (!value) return null;

  return (
    <BinderRouteContext.Provider value={value}>
      <h1 className="pt-4 text-center">{value.binder.name}</h1>
      <BinderTabs binderId={binderId} />
      {/* `flex-1 min-h-0`: gives the active tab a definite, fill-remaining-
          space container to grow into. Tabs that don't need it (Edit
          Details, View Financials) just render their normal top-aligned
          content inside it, identical to before; the Edit Layout tab (story
          8) uses it to size its binder-side grids to the viewport without
          scrolling. */}
      <div className="flex min-h-0 flex-1 flex-col">{children}</div>
    </BinderRouteContext.Provider>
  );
}
