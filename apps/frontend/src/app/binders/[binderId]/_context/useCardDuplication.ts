'use client';

import { useCallback, useState, type Dispatch, type SetStateAction } from 'react';

import { duplicateCard as duplicateCardRequest, type Card } from '@/lib/api';
import { useSaveStatusToast } from '@/shared/feedback';

import { isLockedBinderConflict } from './lockedBinderConflict';

// Story 19's card-duplication mutation, extracted out of
// `useCardMutations` (which was growing past this house-cleaning pass's
// line-count threshold).
export function useCardDuplication({
  cards,
  setCards,
  retry,
}: {
  cards: Card[];
  setCards: Dispatch<SetStateAction<Card[]>>;
  retry: () => void;
}) {
  const { start } = useSaveStatusToast();

  // Story 19's in-flight-card-duplication ids (optimistic ids only),
  // mirroring `pendingArtDuplicateIds`.
  const [pendingCardDuplicateIds, setPendingCardDuplicateIds] = useState<Set<string>>(new Set());

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

  return { duplicateCard, pendingCardDuplicateIds };
}
