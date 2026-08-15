'use client';

import { useCallback, useState, type Dispatch, type SetStateAction } from 'react';

import {
  updateCardAcquired as updateCardAcquiredRequest,
  updateCardDetails as updateCardDetailsRequest,
  updateCardsAcquisition as updateCardsAcquisitionRequest,
  updateCardVariation as updateCardVariationRequest,
  type Card,
  type UpdateCardDetailsRequest,
} from '@/lib/api';
import { useSaveStatusToast } from '@/shared/feedback';

import { isLockedBinderConflict } from './lockedBinderConflict';

// Story 16/36/38/46/49's simple existing-card field edits (variation,
// full-details edit, single acquisition toggle, and bulk acquisition
// toggle), extracted out of `useCardMutations` (which was growing past
// this house-cleaning pass's line-count threshold) - grouped together
// since each one mutates one or more fields of an already-placed card
// rather than creating, removing, duplicating, or moving it.
export function useCardFieldEdits({
  binderId,
  cards,
  setCards,
  pruneHistoryEntriesForItem,
  retry,
}: {
  binderId: string;
  cards: Card[];
  setCards: Dispatch<SetStateAction<Card[]>>;
  pruneHistoryEntriesForItem: (itemId: string) => void;
  retry: () => void;
}) {
  const { start } = useSaveStatusToast();

  // Story 16's in-flight-card-variation-edit ids, mirroring
  // `pendingCardDeletionIds`.
  const [pendingCardVariationEditIds, setPendingCardVariationEditIds] = useState<Set<string>>(
    new Set(),
  );
  // Story 49's in-flight-card-details-edit ids, mirroring
  // `pendingCardVariationEditIds` - the Card List tab's row edit action
  // uses this to disable its own Save/Cancel buttons while a save request
  // is in flight.
  const [pendingCardDetailsEditIds, setPendingCardDetailsEditIds] = useState<Set<string>>(
    new Set(),
  );
  // Story 36's in-flight-card-acquisition-toggle ids, mirroring
  // `pendingCardVariationEditIds`.
  const [pendingCardAcquiredToggleIds, setPendingCardAcquiredToggleIds] = useState<Set<string>>(
    new Set(),
  );
  // Story 46's single in-flight-bulk-acquisition-toggle flag - unlike the
  // per-card `pendingCardAcquiredToggleIds` above, the whole affected set
  // is applied/rolled back together in one request, so there's nothing to
  // track per-card; the Card List tab's header control disables itself
  // while this is `true`.
  const [isBulkAcquisitionPending, setIsBulkAcquisitionPending] = useState(false);

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

  // Saves a card's edited name/set/number/variation/price and optional
  // replacement image (story 49's Card List row "Edit" action), through
  // `PATCH /cards/{cardId}/details`. Unlike `editCardVariation`/
  // `toggleCardAcquired` below, this isn't applied optimistically - the
  // row's own editable fields already show the user's in-progress edits
  // locally while its request is in flight, so `cards` only needs to
  // reflect the backend's authoritative representation once the save
  // actually succeeds. Returns the request's promise so the row-edit UI
  // can keep itself in the editing state (rather than closing early) on
  // failure, matching this codebase's existing "surface the error, let
  // the user retry" precedent.
  const editCardDetails = useCallback(
    (cardId: string, values: UpdateCardDetailsRequest) => {
      setPendingCardDetailsEditIds((previous) => new Set(previous).add(cardId));
      const toast = start(`edit-card-details-${cardId}`);

      return updateCardDetailsRequest(cardId, values)
        .then((updated) => {
          setCards((previous) => previous.map((card) => (card.id === cardId ? updated : card)));
          toast.markSaved();
          return updated;
        })
        .catch((error) => {
          toast.markFailed(error);
          // Story 32: reload the complete binder graph when this edit was
          // rejected because the binder is now locked.
          if (isLockedBinderConflict(error)) retry();
          throw error;
        })
        .finally(() => {
          setPendingCardDetailsEditIds((previous) => {
            const next = new Set(previous);
            next.delete(cardId);
            return next;
          });
        });
    },
    [setCards, start, retry],
  );

  // Toggles an existing card's acquired state (story 36), mirroring
  // `editCardVariation`'s optimistic-apply/restore-on-failure lifecycle
  // exactly: optimistically flips the value immediately, then either
  // confirms it with the backend's authoritative representation or
  // restores the card's prior value on failure. Not gated by binder lock
  // state on the caller's side (matching this codebase's existing
  // unplaced-card action precedent) - the backend's own 409 response
  // still enforces the restriction and triggers the same retry-on-conflict
  // handling as every other restricted mutation.
  const toggleCardAcquired = useCallback(
    (cardId: string) => {
      const existing = cards.find((card) => card.id === cardId);
      if (!existing) return;

      const previousAcquired = existing.acquired;
      const nextAcquired = !previousAcquired;

      setCards((previous) =>
        previous.map((card) => (card.id === cardId ? { ...card, acquired: nextAcquired } : card)),
      );
      setPendingCardAcquiredToggleIds((previous) => new Set(previous).add(cardId));

      const toast = start(`toggle-card-acquired-${cardId}`);

      updateCardAcquiredRequest(cardId, nextAcquired)
        .then((updated) => {
          setCards((previous) => previous.map((card) => (card.id === cardId ? updated : card)));
          toast.markSaved();
        })
        .catch((error) => {
          setCards((previous) =>
            previous.map((card) =>
              card.id === cardId ? { ...card, acquired: previousAcquired } : card,
            ),
          );
          toast.markFailed(error);
          // Story 32: reload the complete binder graph when this toggle was
          // rejected because the binder is now locked.
          if (isLockedBinderConflict(error)) retry();
        })
        .finally(() => {
          setPendingCardAcquiredToggleIds((previous) => {
            const next = new Set(previous);
            next.delete(cardId);
            return next;
          });
        });
    },
    [cards, setCards, start, retry],
  );

  // Bulk-toggles every card in `cardIds` to `acquired` in one request
  // (story 46's Card List tab header select-all/deselect-all control),
  // mirroring `toggleCardAcquired`'s optimistic-apply/restore-on-failure
  // lifecycle but applied to the whole affected set together rather than
  // one card at a time: every listed card optimistically flips to
  // `acquired` immediately, and if the bulk request fails, every one of
  // them rolls back to its own prior value (all-or-nothing, matching the
  // single request/response shape of the bulk endpoint) rather than each
  // card being applied/rolled back independently. Not gated by binder lock
  // state on the caller's side, mirroring `toggleCardAcquired` above - the
  // backend's bulk endpoint has no lock check at all (story 32's Card List
  // tab exemption).
  const toggleCardsAcquisition = useCallback(
    (cardIds: string[], acquired: boolean) => {
      if (cardIds.length === 0) return;
      const targetIds = new Set(cardIds);

      const previousAcquiredById = new Map(
        cards.filter((card) => targetIds.has(card.id)).map((card) => [card.id, card.acquired]),
      );

      setCards((previous) =>
        previous.map((card) => (targetIds.has(card.id) ? { ...card, acquired } : card)),
      );
      setIsBulkAcquisitionPending(true);

      const toast = start('bulk-toggle-cards-acquisition');

      updateCardsAcquisitionRequest(binderId, cardIds, acquired)
        .then((updated) => {
          setCards((previous) =>
            previous.map((card) => updated.find((row) => row.id === card.id) ?? card),
          );
          toast.markSaved();
        })
        .catch((error) => {
          setCards((previous) =>
            previous.map((card) =>
              previousAcquiredById.has(card.id)
                ? { ...card, acquired: previousAcquiredById.get(card.id)! }
                : card,
            ),
          );
          toast.markFailed(error);
          // Story 32: reload the complete binder graph when this bulk toggle
          // was rejected because the binder is now locked (unreachable in
          // practice today, since this endpoint has no lock check - kept
          // for parity with every other mutation's failure handling).
          if (isLockedBinderConflict(error)) retry();
        })
        .finally(() => {
          setIsBulkAcquisitionPending(false);
        });
    },
    [binderId, cards, setCards, start, retry],
  );

  return {
    editCardVariation,
    pendingCardVariationEditIds,
    editCardDetails,
    pendingCardDetailsEditIds,
    toggleCardAcquired,
    pendingCardAcquiredToggleIds,
    toggleCardsAcquisition,
    isBulkAcquisitionPending,
  };
}
