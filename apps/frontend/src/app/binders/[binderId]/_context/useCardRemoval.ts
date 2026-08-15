'use client';

import { useCallback, useState, type Dispatch, type SetStateAction } from 'react';

import { deleteCard, type Card } from '@/lib/api';
import { useSaveStatusToast } from '@/shared/feedback';

import { isLockedBinderConflict } from './lockedBinderConflict';

// Story 13's card-removal mutation, extracted out of `useCardMutations`
// (which was growing past this house-cleaning pass's line-count
// threshold).
export function useCardRemoval({
  cards,
  setCards,
  pruneHistoryEntriesForItem,
  retry,
}: {
  cards: Card[];
  setCards: Dispatch<SetStateAction<Card[]>>;
  pruneHistoryEntriesForItem: (itemId: string) => void;
  retry: () => void;
}) {
  const { start } = useSaveStatusToast();

  // Story 13's in-flight card removals, by card id - lets the layout tab
  // disable a pending card's own actions until its delete request settles.
  const [pendingCardDeletionIds, setPendingCardDeletionIds] = useState<Set<string>>(new Set());

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

  return { removeCard, pendingCardDeletionIds };
}
