'use client';

import { useCallback, useState, type Dispatch, type SetStateAction } from 'react';

import {
  createCustomCard,
  deleteCard,
  duplicateCard as duplicateCardRequest,
  moveCards,
  updateCardVariation as updateCardVariationRequest,
  type Card,
  type CardPositionUpdate,
  type PlacementCoordinates,
} from '@/lib/api';
import { useSaveStatusToast } from '@/shared/feedback';

import { isLockedBinderConflict } from './lockedBinderConflict';
import { placementKey } from './placementKey';
import { useBulkCardAdd } from './useBulkCardAdd';
import type { LayoutMovementHistoryAction } from './useLayoutMovement';

export type { BulkAddFailedCard, BulkAddFailure, BulkSelectionRestore } from './useBulkCardAdd';

interface CardMovementActionEntry {
  cardId: string;
  from: PlacementCoordinates;
  to: PlacementCoordinates;
}

type CardMovementActionEntries =
  [CardMovementActionEntry] | [CardMovementActionEntry, CardMovementActionEntry];

// The manual-entry form's text-field values (story 12) - excludes the
// image file (handled separately as a `File`). `variation` (story 16) is
// entered through the same shared add-card modal field the TCGdex search
// view uses, rather than a separate manual-entry-only field.
export interface CustomCardFormValues {
  name: string;
  setName: string | null;
  localNumber: string | null;
  variation: string | null;
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

// Owns every card-scoped mutation (stories 11-19: search/manual add,
// remove, edit variation, duplicate, move) and their pending-request/
// restore state, operating on the `cards` collection owned by
// `BinderRouteContext` and passed in here (rather than owned by this hook)
// so `useLayoutMovement`'s undo/redo executor can also reach it directly
// without this hook and `useLayoutMovement` needing to depend on each
// other's setters. `moveCard` shares its "movement in flight" flag and
// undo/redo history recording with `useArtMutations` (per story 14/28's
// single binder-scoped movement queue), so both are passed in from the
// shared `useLayoutMovement` hook rather than owned here.
export function useCardMutations({
  binderId,
  cards,
  setCards,
  isMovePending,
  setIsMovePending,
  recordSuccessfulMovement,
  pruneHistoryEntriesForItem,
  retry,
}: {
  binderId: string;
  cards: Card[];
  setCards: Dispatch<SetStateAction<Card[]>>;
  isMovePending: boolean;
  setIsMovePending: Dispatch<SetStateAction<boolean>>;
  recordSuccessfulMovement: (action: LayoutMovementHistoryAction) => void;
  pruneHistoryEntriesForItem: (itemId: string) => void;
  retry: () => void;
}) {
  const { start } = useSaveStatusToast();

  // The slots (by `placementKey`) with an assignment currently in flight
  // (story 11), so the layout tab can disable them until the request
  // settles. Shared between `assignCustomCard` below and `useBulkCardAdd`'s
  // `assignCards`, so it's owned here rather than by either mutation path
  // individually.
  const [pendingPlacementKeys, setPendingPlacementKeys] = useState<Set<string>>(new Set());
  // Story 15's in-flight-unplaced-create ids (see the context value's own
  // doc comment above) - also shared between `assignCustomCard` and
  // `useBulkCardAdd`.
  const [pendingUnplacedCardIds, setPendingUnplacedCardIds] = useState<Set<string>>(new Set());
  // Story 12's one-shot restore signal (see the context value type's doc
  // comment above) - `null` whenever there's no failed custom-card
  // submission awaiting correction.
  const [manualEntryRestore, setManualEntryRestore] = useState<ManualEntryRestore | null>(null);

  // Story 17/18's bulk TCGdex card-add flow, extracted to its own hook
  // since `assignCards` and its failure/restore state make up a
  // substantial share of this hook's overall size on their own.
  const {
    assignCards,
    isBulkAddPending,
    bulkAddFailure,
    clearBulkAddFailure,
    retryFailedBulkCards,
    bulkSelectionRestore,
    clearBulkSelectionRestore,
  } = useBulkCardAdd({
    binderId,
    setCards,
    setPendingPlacementKeys,
    setPendingUnplacedCardIds,
    retry,
  });

  // Story 13's in-flight card removals, by card id - lets the layout tab
  // disable a pending card's own actions until its delete request settles.
  const [pendingCardDeletionIds, setPendingCardDeletionIds] = useState<Set<string>>(new Set());
  // Story 16's in-flight-card-variation-edit ids, mirroring
  // `pendingCardDeletionIds`.
  const [pendingCardVariationEditIds, setPendingCardVariationEditIds] = useState<Set<string>>(
    new Set(),
  );
  // Story 19's in-flight-card-duplication ids (optimistic ids only),
  // mirroring `pendingArtDuplicateIds`.
  const [pendingCardDuplicateIds, setPendingCardDuplicateIds] = useState<Set<string>>(new Set());

  // Assigns a manually-entered custom card to a binder slot (story 12).
  // Mirrors `assignCards`'s optimistic lifecycle, but creates its own
  // object-URL preview from the uploaded `file` for the optimistic card's
  // `imageUrl` (independent of the card-selection modal's own preview
  // object URL - each owns and revokes its own). Revoking it
  // unconditionally in `.finally()` is safe either way: by the time
  // `.finally()` runs, the `.then()`/`.catch()` above has already replaced
  // or removed the optimistic card from `cards`, so nothing continues to
  // reference this URL regardless of outcome. `reopenOnFailure` mirrors
  // `assignCards`'s own parameter (story 17): `true` only for an Add-Card
  // (closes-immediately) submission, so an Add-More custom-card submission
  // - whose view stays open on its own - never sets `manualEntryRestore`.
  // Returns whether the submission succeeded, so an Add-More caller can
  // await it to decide whether to clear its own form state.
  const assignCustomCard = useCallback(
    (
      values: CustomCardFormValues,
      file: File,
      placement: { physicalPage: number; row: number; column: number } | null,
      reopenOnFailure: boolean,
    ): Promise<boolean> => {
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
        variation: values.variation,
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

      return createCustomCard(binderId, { ...values, placement, image: file })
        .then((created) => {
          setCards((previous) =>
            previous.map((card) => (card.id === optimisticId ? created : card)),
          );
          toast.markSaved();
          return true;
        })
        .catch((error) => {
          setCards((previous) => previous.filter((card) => card.id !== optimisticId));
          // Preserves the failed attempt's values/file so the layout tab
          // can reopen the modal pre-filled (see `ManualEntryRestore`'s doc
          // comment above) instead of the user having to re-enter
          // everything.
          if (reopenOnFailure) setManualEntryRestore({ placement, values, file });
          toast.markFailed(error);
          // Story 32: reload the complete binder graph when this card
          // creation was rejected because the binder is now locked.
          if (isLockedBinderConflict(error)) retry();
          return false;
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
    [binderId, setCards, start, retry],
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
          pruneHistoryEntriesForItem(cardId);
          toast.markSaved();
        })
        .catch((error) => {
          setCards((previous) => {
            const restored = [...previous];
            restored.splice(index, 0, removedCard);
            return restored;
          });
          toast.markFailed(error);
          // Story 32: reload the complete binder graph when this removal was
          // rejected because the binder is now locked.
          if (isLockedBinderConflict(error)) retry();
        })
        .finally(() => {
          setPendingCardDeletionIds((previous) => {
            const next = new Set(previous);
            next.delete(cardId);
            return next;
          });
        });
    },
    [cards, setCards, pruneHistoryEntriesForItem, start, retry],
  );

  // Edits an existing card's saved variation (story 16), mirroring
  // `removeCard`'s optimistic-apply/restore-on-failure lifecycle:
  // optimistically applies the new value immediately, then either confirms
  // it with the backend's authoritative representation or restores the
  // card's prior variation on failure.
  const editCardVariation = useCallback(
    (cardId: string, variation: string | null) => {
      const existing = cards.find((card) => card.id === cardId);
      if (!existing) return;

      const previousVariation = existing.variation;

      setCards((previous) =>
        previous.map((card) => (card.id === cardId ? { ...card, variation } : card)),
      );
      setPendingCardVariationEditIds((previous) => new Set(previous).add(cardId));

      const toast = start(`edit-card-variation-${cardId}`);

      updateCardVariationRequest(cardId, variation)
        .then((updated) => {
          setCards((previous) => previous.map((card) => (card.id === cardId ? updated : card)));
          pruneHistoryEntriesForItem(cardId);
          toast.markSaved();
        })
        .catch((error) => {
          setCards((previous) =>
            previous.map((card) =>
              card.id === cardId ? { ...card, variation: previousVariation } : card,
            ),
          );
          toast.markFailed(error);
          // Story 32: reload the complete binder graph when this variation
          // edit was rejected because the binder is now locked.
          if (isLockedBinderConflict(error)) retry();
        })
        .finally(() => {
          setPendingCardVariationEditIds((previous) => {
            const next = new Set(previous);
            next.delete(cardId);
            return next;
          });
        });
    },
    [cards, setCards, pruneHistoryEntriesForItem, start, retry],
  );

  // Duplicates a card into the unplaced-cards section (story 19),
  // mirroring `duplicateArt`'s optimistic-insert/replace-or-remove
  // lifecycle exactly: the copy always lands unplaced (even when the
  // source card is currently placed), sharing the source's existing image
  // asset/URL rather than triggering any new upload. A fresh
  // `crypto.randomUUID()` idempotency key accompanies the request (not
  // reused across retries within this simple fire-once action) so a
  // dropped response the backend actually processed is still replayed
  // rather than silently duplicated if this action is ever retried.
  const duplicateCard = useCallback(
    (cardId: string) => {
      const source = cards.find((card) => card.id === cardId);
      if (!source) return;

      const optimisticId = `optimistic-${crypto.randomUUID()}`;
      const idempotencyKey = crypto.randomUUID();
      const now = new Date().toISOString();
      const optimisticCard: Card = {
        ...source,
        id: optimisticId,
        placement: { physicalPage: null, row: null, column: null },
        createdAt: now,
        updatedAt: now,
      };

      setCards((previous) => [...previous, optimisticCard]);
      setPendingCardDuplicateIds((previous) => new Set(previous).add(optimisticId));

      const toast = start(`duplicate-card-${optimisticId}`);

      duplicateCardRequest(cardId, idempotencyKey)
        .then((created) => {
          setCards((previous) =>
            previous.map((card) => (card.id === optimisticId ? created : card)),
          );
          toast.markSaved();
        })
        .catch((error) => {
          setCards((previous) => previous.filter((card) => card.id !== optimisticId));
          toast.markFailed(error);
          // Story 32: reload the complete binder graph when this
          // duplication was rejected because the binder is now locked.
          if (isLockedBinderConflict(error)) retry();
        })
        .finally(() => {
          setPendingCardDuplicateIds((previous) => {
            const next = new Set(previous);
            next.delete(optimisticId);
            return next;
          });
        });
    },
    [cards, setCards, start, retry],
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
      if (isMovePending) return;

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
          const historyUpdates: CardMovementActionEntries = occupyingCard
            ? [
                { cardId: draggedCard.id, from: previousDraggedPlacement, to: destination },
                {
                  cardId: occupyingCard.id,
                  from: previousOccupyingPlacement!,
                  to: previousDraggedPlacement,
                },
              ]
            : [{ cardId: draggedCard.id, from: previousDraggedPlacement, to: destination }];
          recordSuccessfulMovement({
            id: crypto.randomUUID(),
            kind: 'card',
            focalCardId: draggedCard.id,
            updates: historyUpdates,
          });
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
          // Story 32: reload the complete binder graph when this move was
          // rejected because the binder is now locked.
          if (isLockedBinderConflict(error)) retry();
        })
        .finally(() => {
          setIsMovePending(false);
        });
    },
    [cards, setCards, isMovePending, recordSuccessfulMovement, setIsMovePending, start, retry],
  );

  return {
    pendingPlacementKeys,
    assignCards,
    isBulkAddPending,
    bulkAddFailure,
    clearBulkAddFailure,
    retryFailedBulkCards,
    bulkSelectionRestore,
    clearBulkSelectionRestore,
    assignCustomCard,
    pendingUnplacedCardIds,
    manualEntryRestore,
    clearManualEntryRestore,
    removeCard,
    pendingCardDeletionIds,
    editCardVariation,
    pendingCardVariationEditIds,
    duplicateCard,
    pendingCardDuplicateIds,
    moveCard,
  };
}
