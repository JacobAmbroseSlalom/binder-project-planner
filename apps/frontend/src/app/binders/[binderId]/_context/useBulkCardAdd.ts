'use client';

import { useCallback, useState, type Dispatch, type SetStateAction } from 'react';

import { createCardsBulk, type Card, type TcgDexCatalogCard } from '@/lib/api';
import { useSaveStatusToast, useToastContext } from '@/shared/feedback';

import { isLockedBinderConflict } from './lockedBinderConflict';
import { placementKey } from './placementKey';

// One failed card from the most recent bulk-add batch (stories 17/18),
// preserved for the failure-details modal's per-card listing and the
// shared failed toast's "View details" action.
export interface BulkAddFailedCard {
  card: TcgDexCatalogCard;
  detail: string;
  httpStatus?: number;
  problemType?: string;
  // The target placement this specific card was attempted at, or `null`
  // if it was submitted to the unplaced section - only ever populated for
  // the batch's first entry (the only one eligible for a real slot
  // target; see `assignCards`'s doc comment below).
  targetPlacement: { physicalPage: number; row: number; column: number } | null;
}

// The most recent bulk-add batch's unresolved failure summary (stories
// 17/18), surfaced through the shared failed toast's "View details" action
// and the `BulkAddFailuresModal`. `null` whenever there's no unresolved
// batch failure to show - cleared by `clearBulkAddFailure` (dismiss) or by
// `retryFailedBulkCards`, which clears it immediately (before the retry
// request even settles), since Retry All Failed always closes the details
// modal right away.
export interface BulkAddFailure {
  items: BulkAddFailedCard[];
  variation: string | null;
  // Story 36: shared across the whole failed batch, mirroring `variation`
  // above.
  acquired: boolean;
}

// A one-shot signal set by `assignCards` when an Add-Card (closes-
// immediately) bulk submission has any failed card (story 17), mirroring
// `ManualEntryRestore`'s "reopen pre-filled" behavior: the layout tab
// reopens the card-selection modal pre-filled with just the failed cards'
// selection and shared variation, rather than losing the whole batch to a
// background toast alone. Never set for an Add-More submission, since that
// view stays open on its own and needs no restore signal.
export interface BulkSelectionRestore {
  placement: { physicalPage: number; row: number; column: number } | null;
  cards: TcgDexCatalogCard[];
  variation: string | null;
  // Story 36: mirrors `variation` above.
  acquired: boolean;
}

// Owns story 17/18's bulk TCGdex card-add flow (`assignCards`, its
// unresolved-failure summary/restore signals, and "Retry All Failed") on
// behalf of `useCardMutations`. `useCardMutations` still owns the
// `pendingPlacementKeys`/`pendingUnplacedCardIds` sets this hook updates
// (passed in as their setters), since `assignCustomCard`'s single-card
// create path shares those same two pending-state sets.
export function useBulkCardAdd({
  binderId,
  setCards,
  setPendingPlacementKeys,
  setPendingUnplacedCardIds,
  retry,
}: {
  binderId: string;
  setCards: Dispatch<SetStateAction<Card[]>>;
  setPendingPlacementKeys: Dispatch<SetStateAction<Set<string>>>;
  setPendingUnplacedCardIds: Dispatch<SetStateAction<Set<string>>>;
  retry: () => void;
}) {
  const { markFailed } = useToastContext();
  const { start } = useSaveStatusToast();

  // True while a bulk card-add request is in flight for this binder
  // (stories 17/18) - see the context value's own doc comment above.
  const [isBulkAddPending, setIsBulkAddPending] = useState(false);
  // The most recent bulk-add batch's unresolved failure summary (stories
  // 17/18) - `null` whenever there's no unresolved batch failure to show.
  const [bulkAddFailure, setBulkAddFailure] = useState<BulkAddFailure | null>(null);
  // Story 17's one-shot Add-Card restore signal, mirroring
  // `manualEntryRestore` above.
  const [bulkSelectionRestore, setBulkSelectionRestore] = useState<BulkSelectionRestore | null>(
    null,
  );

  // Submits one or more selected TCGdex catalog cards to a binder slot, or
  // to the unplaced section (stories 11, 17, 18 - see the context value's
  // own doc comment above for the full contract). Each selected card gets
  // its own optimistic `Card` up front, independent of the others, since
  // the backend persists (and can fail) each one independently too. Only
  // the first entry ever uses `targetPlacement`; every other entry - and
  // the first when `targetPlacement` is itself `null` - is unplaced.
  const assignCards = useCallback(
    (
      selection: TcgDexCatalogCard[],
      variation: string | null,
      acquired: boolean,
      targetPlacement: { physicalPage: number; row: number; column: number } | null,
      reopenOnFailure: boolean,
    ): Promise<boolean> => {
      if (selection.length === 0) return Promise.resolve(true);

      const idempotencyKey = crypto.randomUUID();
      const now = new Date().toISOString();

      const entries = selection.map((catalogCard, index) => {
        const placement =
          index === 0 && targetPlacement
            ? targetPlacement
            : { physicalPage: null, row: null, column: null };
        const optimisticId = `optimistic-${crypto.randomUUID()}`;
        const optimisticCard: Card = {
          id: optimisticId,
          binderId,
          name: catalogCard.name,
          setName: catalogCard.setName,
          localNumber: catalogCard.localNumber,
          source: catalogCard.source,
          providerCardId: catalogCard.providerCardId,
          providerSetId: catalogCard.providerSetId,
          variation,
          placement,
          // The provider's own image URL stands in until the backend's
          // representation (pointing at its own `/cards/{cardId}/image`
          // endpoint) replaces this optimistic entry.
          imageUrl: catalogCard.imageUrl,
          acquired,
          // Story 38: every new card starts with no saved price, matching
          // the backend's default for a newly created card.
          price: null,
          isManualPrice: false,
          priceUpdatedAt: null,
          createdAt: now,
          updatedAt: now,
        };
        return { catalogCard, optimisticCard, placement };
      });

      setCards((previous) => [...previous, ...entries.map((entry) => entry.optimisticCard)]);
      const placedKey = targetPlacement ? placementKey(targetPlacement) : null;
      if (placedKey) {
        setPendingPlacementKeys((previous) => new Set(previous).add(placedKey));
      }
      setPendingUnplacedCardIds((previous) => {
        const next = new Set(previous);
        for (const entry of entries) {
          if (entry.placement.physicalPage === null) next.add(entry.optimisticCard.id);
        }
        return next;
      });
      setIsBulkAddPending(true);

      // Shared across every card in the batch (rather than one toast per
      // card), matching story 18's "one shared saving toast for the whole
      // batch" requirement.
      const toast = start(`bulk-add-cards-${idempotencyKey}`);

      function settle() {
        if (placedKey) {
          setPendingPlacementKeys((previous) => {
            const next = new Set(previous);
            next.delete(placedKey);
            return next;
          });
        }
        setPendingUnplacedCardIds((previous) => {
          const next = new Set(previous);
          for (const entry of entries) next.delete(entry.optimisticCard.id);
          return next;
        });
        setIsBulkAddPending(false);
      }

      return createCardsBulk(
        binderId,
        {
          cards: selection.map(
            ({ source, name, setName, localNumber, providerCardId, providerSetId, imageUrl }) => ({
              source,
              name,
              setName,
              localNumber,
              providerCardId,
              providerSetId,
              imageUrl,
            }),
          ),
          variation,
          acquired,
          targetPlacement: targetPlacement ?? undefined,
        },
        idempotencyKey,
      )
        .then((outcomes) => {
          const failed: BulkAddFailedCard[] = [];

          setCards((previous) => {
            let next = previous;
            outcomes.forEach((outcome, index) => {
              const entry = entries[index]!;
              if (outcome.status === 'created' && outcome.card) {
                const created = outcome.card;
                next = next.map((existing) =>
                  existing.id === entry.optimisticCard.id ? created : existing,
                );
              } else {
                next = next.filter((existing) => existing.id !== entry.optimisticCard.id);
                failed.push({
                  card: entry.catalogCard,
                  detail: outcome.problem?.detail ?? 'This card failed to save.',
                  httpStatus: outcome.problem?.status,
                  problemType: outcome.problem?.type,
                  targetPlacement:
                    entry.placement.physicalPage !== null
                      ? (entry.placement as { physicalPage: number; row: number; column: number })
                      : null,
                });
              }
            });
            return next;
          });

          settle();

          if (failed.length === 0) {
            toast.markSaved();
            return true;
          }

          const successCount = outcomes.length - failed.length;
          markFailed(toast.operationId, {
            detail: `Added ${successCount} card${successCount === 1 ? '' : 's'}; ${failed.length} card${failed.length === 1 ? '' : 's'} failed to save.`,
            action: {
              label: 'View details',
              onClick: () => setBulkAddFailure({ items: failed, variation, acquired }),
            },
          });
          setBulkAddFailure({ items: failed, variation, acquired });
          if (reopenOnFailure) {
            setBulkSelectionRestore({
              placement: targetPlacement,
              cards: failed.map((item) => item.card),
              variation,
              acquired,
            });
          }
          return false;
        })
        .catch((error) => {
          // A request-wide failure (e.g. a network error, or a 4xx/5xx
          // rejecting the whole batch before any per-card outcome exists) -
          // every optimistic card in this batch is rolled back, not just
          // some of them.
          setCards((previous) =>
            previous.filter(
              (card) => !entries.some((entry) => entry.optimisticCard.id === card.id),
            ),
          );
          settle();
          toast.markFailed(error);
          // Story 32: a bulk-add rejected because the binder is now locked
          // reloads the complete binder graph so the UI reflects the fresh
          // locked state and read-only interface.
          if (isLockedBinderConflict(error)) retry();
          if (reopenOnFailure) {
            setBulkSelectionRestore({
              placement: targetPlacement,
              cards: selection,
              variation,
              acquired,
            });
          }
          return false;
        });
    },
    [
      binderId,
      setCards,
      setPendingPlacementKeys,
      setPendingUnplacedCardIds,
      start,
      markFailed,
      retry,
    ],
  );

  // Dismisses the bulk-add failure summary without retrying (story 18).
  const clearBulkAddFailure = useCallback(() => {
    setBulkAddFailure(null);
  }, []);

  // Consumed exactly once by the layout tab after it reopens the
  // card-selection modal pre-filled from `bulkSelectionRestore` (story 17).
  const clearBulkSelectionRestore = useCallback(() => {
    setBulkSelectionRestore(null);
  }, []);

  // Resubmits every failed card from the most recent bulk-add batch
  // (story 18's "Retry All Failed"). Clears `bulkAddFailure` immediately -
  // before the retry even starts - since the details modal always closes
  // right away regardless of the retry's eventual outcome.
  const retryFailedBulkCards = useCallback(() => {
    setBulkAddFailure((current) => {
      if (!current || current.items.length === 0) return current;

      // If the original slot-targeted card is among the failed cards, it's
      // resubmitted first at the same target placement; every other
      // retried card - including any that themselves failed at a target
      // placement, which by construction can only be this same one entry -
      // uses an all-null (unplaced) placement.
      const slotTargetedIndex = current.items.findIndex((item) => item.targetPlacement !== null);
      const orderedItems =
        slotTargetedIndex > 0
          ? [
              current.items[slotTargetedIndex]!,
              ...current.items.filter((_, index) => index !== slotTargetedIndex),
            ]
          : current.items;
      const targetPlacement = slotTargetedIndex >= 0 ? orderedItems[0]!.targetPlacement : null;

      void assignCards(
        orderedItems.map((item) => item.card),
        current.variation,
        current.acquired,
        targetPlacement,
        false,
      );
      return null;
    });
  }, [assignCards]);

  return {
    assignCards,
    isBulkAddPending,
    bulkAddFailure,
    clearBulkAddFailure,
    retryFailedBulkCards,
    bulkSelectionRestore,
    clearBulkSelectionRestore,
  };
}
