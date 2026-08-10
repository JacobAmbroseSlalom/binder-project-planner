'use client';

import {
  CARD_SEARCH_INCLUDE_TCG_POCKET_DEFAULT,
  CARD_SEARCH_LANGUAGE_DEFAULT,
} from '@binder-project-planner/shared';
import { useRouter } from 'next/navigation';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

import {
  getBinder,
  listBinderArt,
  listBinderCards,
  type Art,
  type Binder,
  type Card,
  type CardSearchLanguage,
  type UpdateBinderResult,
} from '@/lib/api';
import {
  LoadingIndicator,
  toProblemDetailsInfo,
  useDelayedLoading,
  useToastContext,
} from '@/shared/feedback';
import { useSetAppHeaderTitle } from '@/shared/navigation';

import { BinderTabs } from './BinderTabs';
import type { BinderRouteContextValue } from './_context/binderRouteContextTypes';
import type { BulkAddFailure, CustomCardFormValues } from './_context/useCardMutations';
import { useCardMutations } from './_context/useCardMutations';
import type { ArtCreateRestore, ArtEditRestore, ArtFormValues } from './_context/useArtMutations';
import { useArtMutations } from './_context/useArtMutations';
import { useLayoutMovement } from './_context/useLayoutMovement';

// Re-exported so components importing these types from this file (rather
// than the hook file that actually defines them) continue to resolve, since
// this file is the conventional "route context" module other components
// reach for.
export type {
  ArtCreateRestore,
  ArtEditRestore,
  ArtFormValues,
  BulkAddFailure,
  CustomCardFormValues,
};

// Fixed (not per-attempt-random) toast id, matching the pattern established
// by BinderList's `LIST_BINDERS_TOAST_ID`: a later attempt (retry, or a
// fresh mount after the redirect-home case below) replaces this operation's
// own toast rather than stacking a new one on top of a still-visible one.
const OPEN_BINDER_TOAST_ID = 'open-binder';

// The 3 states one binder-load attempt can be in (mirrors BinderList's
// `BinderListStatus`, extended here with the redirect-triggering 404/400
// handling in the effect below rather than as a 4th status).
type BinderLoadStatus = 'loading' | 'success' | 'error';

function didLayoutBoundsChange(previous: Binder, next: Binder): boolean {
  return (
    previous.width !== next.width ||
    previous.height !== next.height ||
    previous.pages !== next.pages
  );
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
//
// The bulk of the binder-scoped mutation logic (cards, art, and their
// shared movement/undo-redo history) lives in the `useCardMutations`/
// `useArtMutations`/`useLayoutMovement` hooks composed below; this
// provider itself is responsible only for loading the binder graph and
// assembling the final context value from those hooks' outputs.
export function BinderRouteProvider({
  binderId,
  children,
}: {
  binderId: string;
  children: React.ReactNode;
}) {
  const router = useRouter();
  const { markFailed, dismiss } = useToastContext();

  const [status, setStatus] = useState<BinderLoadStatus>('loading');
  const [binder, setBinder] = useState<Binder | null>(null);
  // Owned here (rather than by `useCardMutations`/`useArtMutations`
  // themselves) so `useLayoutMovement`'s undo/redo executor and the load
  // effect below can also set them directly, without those hooks needing
  // to depend on one another's setters.
  const [cards, setCards] = useState<Card[]>([]);
  const [art, setArt] = useState<Art[]>([]);
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

  const showLoading = useDelayedLoading(status === 'loading');

  // Show the binder's name in the app header bar (rather than an in-page
  // heading) while a binder page is open; cleared automatically on navigate
  // away. `null` until the binder loads. Story 32: also passes the binder's
  // locked state so the header can show its "Locked" badge directly beside
  // the name, rather than as a separate row above the tabs.
  useSetAppHeaderTitle(binder?.name ?? null, binder?.locked ?? false);

  // A live ref lets `updateBinder`/`applyBinderResizeUpdate` below avoid
  // depending on `binder` itself while still reading its latest value when
  // they run.
  const binderRef = useRef<Binder | null>(binder);

  useEffect(() => {
    binderRef.current = binder;
  }, [binder]);

  // A failed (non-404/400) load's retry action: re-runs all 3 requests per
  // story 7's "retry starts all three requests again".
  const retry = useCallback(() => {
    setRetryToken((token) => token + 1);
  }, []);

  // Story 28's shared movement-in-flight flag, undo/redo history stacks,
  // and undo/redo executor, spanning both cards and art.
  const layoutMovement = useLayoutMovement({ setCards, setArt });

  const cardMutations = useCardMutations({
    binderId,
    cards,
    setCards,
    isMovePending: layoutMovement.isMovePending,
    setIsMovePending: layoutMovement.setIsMovePending,
    recordSuccessfulMovement: layoutMovement.recordSuccessfulMovement,
    pruneHistoryEntriesForItem: layoutMovement.pruneHistoryEntriesForItem,
    retry,
  });

  const artMutations = useArtMutations({
    binderId,
    cards,
    art,
    setArt,
    isMovePending: layoutMovement.isMovePending,
    setIsMovePending: layoutMovement.setIsMovePending,
    recordSuccessfulMovement: layoutMovement.recordSuccessfulMovement,
    pruneHistoryEntriesForItem: layoutMovement.pruneHistoryEntriesForItem,
    retry,
  });

  // Lets the Edit Details tab sync the context with the backend's
  // authoritative binder after a successful `PATCH`, without re-fetching
  // cards/art or discarding the rest of the loaded route state.
  const updateBinder = useCallback(
    (updated: Binder) => {
      const previous = binderRef.current;
      if (previous && didLayoutBoundsChange(previous, updated)) {
        layoutMovement.clearLayoutMovementHistory();
      }
      setBinder(updated);
    },
    // Depends only on this one stable field (not the whole `layoutMovement`
    // object, which is a fresh object literal every render) to avoid
    // regenerating this callback on every unrelated `layoutMovement` state
    // change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [layoutMovement.clearLayoutMovementHistory],
  );

  // Story 27 reconciliation helper: updates binder details and folds in
  // any moved card/art records returned by the same successful resize
  // update response, without refetching either collection.
  const applyBinderResizeUpdate = useCallback(
    (result: Pick<UpdateBinderResult, 'binder' | 'movedCards' | 'movedArt'>) => {
      const previous = binderRef.current;
      if (previous && didLayoutBoundsChange(previous, result.binder)) {
        layoutMovement.clearLayoutMovementHistory();
      }

      setBinder(result.binder);

      if (result.movedCards.length > 0) {
        const movedCardsById = new Map(
          result.movedCards.map((cardItem) => [cardItem.id, cardItem]),
        );
        setCards((previous) =>
          previous.map((cardItem) => movedCardsById.get(cardItem.id) ?? cardItem),
        );
      }

      if (result.movedArt.length > 0) {
        const movedArtById = new Map(result.movedArt.map((artItem) => [artItem.id, artItem]));
        setArt((previous) => previous.map((artItem) => movedArtById.get(artItem.id) ?? artItem));
      }
    },
    // See `updateBinder`'s comment above for why this depends on a single
    // stable `layoutMovement` field rather than the whole object.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [layoutMovement.clearLayoutMovementHistory, setArt, setCards],
  );

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
        layoutMovement.clearLayoutMovementHistory();
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
    // See `updateBinder`'s comment above for why this depends on a single
    // stable `layoutMovement` field rather than the whole object.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    binderId,
    retryToken,
    router,
    markFailed,
    dismiss,
    layoutMovement.clearLayoutMovementHistory,
  ]);

  // Only meaningful once `status === 'success'`; computed unconditionally
  // (rather than after an early return) so hook call order stays stable
  // across renders.
  const value = useMemo<BinderRouteContextValue | null>(() => {
    if (status !== 'success' || !binder) return null;
    return {
      binder,
      cards,
      art,
      updateBinder,
      applyBinderResizeUpdate,
      layoutFocalPage,
      setLayoutFocalPage,
      assignCards: cardMutations.assignCards,
      isBulkAddPending: cardMutations.isBulkAddPending,
      bulkAddFailure: cardMutations.bulkAddFailure,
      clearBulkAddFailure: cardMutations.clearBulkAddFailure,
      retryFailedBulkCards: cardMutations.retryFailedBulkCards,
      bulkSelectionRestore: cardMutations.bulkSelectionRestore,
      clearBulkSelectionRestore: cardMutations.clearBulkSelectionRestore,
      pendingPlacementKeys: cardMutations.pendingPlacementKeys,
      assignCustomCard: cardMutations.assignCustomCard,
      pendingUnplacedCardIds: cardMutations.pendingUnplacedCardIds,
      manualEntryRestore: cardMutations.manualEntryRestore,
      clearManualEntryRestore: cardMutations.clearManualEntryRestore,
      removeCard: cardMutations.removeCard,
      pendingCardDeletionIds: cardMutations.pendingCardDeletionIds,
      editCardVariation: cardMutations.editCardVariation,
      pendingCardVariationEditIds: cardMutations.pendingCardVariationEditIds,
      toggleCardAcquired: cardMutations.toggleCardAcquired,
      pendingCardAcquiredToggleIds: cardMutations.pendingCardAcquiredToggleIds,
      duplicateCard: cardMutations.duplicateCard,
      pendingCardDuplicateIds: cardMutations.pendingCardDuplicateIds,
      moveCard: cardMutations.moveCard,
      isMovePending: layoutMovement.isMovePending,
      canUndoLayoutMovement: layoutMovement.undoMovementStack.length > 0,
      canRedoLayoutMovement: layoutMovement.redoMovementStack.length > 0,
      undoLayoutMovement: layoutMovement.undoLayoutMovement,
      redoLayoutMovement: layoutMovement.redoLayoutMovement,
      cardSearchLanguage,
      setCardSearchLanguage,
      includeTcgPocket,
      setIncludeTcgPocket,
      createArt: artMutations.createArt,
      pendingUnplacedArtIds: artMutations.pendingUnplacedArtIds,
      artCreateRestore: artMutations.artCreateRestore,
      clearArtCreateRestore: artMutations.clearArtCreateRestore,
      moveArt: artMutations.moveArt,
      editArt: artMutations.editArt,
      pendingArtEditIds: artMutations.pendingArtEditIds,
      artEditRestore: artMutations.artEditRestore,
      clearArtEditRestore: artMutations.clearArtEditRestore,
      removeArt: artMutations.removeArt,
      pendingArtDeletionIds: artMutations.pendingArtDeletionIds,
      duplicateArt: artMutations.duplicateArt,
      pendingArtDuplicateIds: artMutations.pendingArtDuplicateIds,
    };
  }, [
    status,
    binder,
    cards,
    art,
    updateBinder,
    applyBinderResizeUpdate,
    layoutFocalPage,
    cardMutations.assignCards,
    cardMutations.isBulkAddPending,
    cardMutations.bulkAddFailure,
    cardMutations.clearBulkAddFailure,
    cardMutations.retryFailedBulkCards,
    cardMutations.bulkSelectionRestore,
    cardMutations.clearBulkSelectionRestore,
    cardMutations.pendingPlacementKeys,
    cardMutations.assignCustomCard,
    cardMutations.pendingUnplacedCardIds,
    cardMutations.manualEntryRestore,
    cardMutations.clearManualEntryRestore,
    cardMutations.removeCard,
    cardMutations.pendingCardDeletionIds,
    cardMutations.editCardVariation,
    cardMutations.pendingCardVariationEditIds,
    cardMutations.toggleCardAcquired,
    cardMutations.pendingCardAcquiredToggleIds,
    cardMutations.duplicateCard,
    cardMutations.pendingCardDuplicateIds,
    cardMutations.moveCard,
    layoutMovement.isMovePending,
    layoutMovement.undoMovementStack,
    layoutMovement.redoMovementStack,
    layoutMovement.undoLayoutMovement,
    layoutMovement.redoLayoutMovement,
    cardSearchLanguage,
    includeTcgPocket,
    artMutations.createArt,
    artMutations.pendingUnplacedArtIds,
    artMutations.artCreateRestore,
    artMutations.clearArtCreateRestore,
    artMutations.moveArt,
    artMutations.editArt,
    artMutations.pendingArtEditIds,
    artMutations.artEditRestore,
    artMutations.clearArtEditRestore,
    artMutations.removeArt,
    artMutations.pendingArtDeletionIds,
    artMutations.duplicateArt,
    artMutations.pendingArtDuplicateIds,
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

  return (
    <BinderRouteContext.Provider value={value as BinderRouteContextValue}>
      {/* The binder name is shown in the app header bar (via
          `useSetAppHeaderTitle` above), including its "Locked" badge
          (story 32) when the binder is currently locked, rather than as an
          in-page heading. */}
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
