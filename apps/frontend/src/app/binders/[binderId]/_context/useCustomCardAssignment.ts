'use client';

import { useCallback, useState, type Dispatch, type SetStateAction } from 'react';

import { createCustomCard, type Card } from '@/lib/api';
import { useSaveStatusToast } from '@/shared/feedback';

import { isLockedBinderConflict } from './lockedBinderConflict';
import { placementKey } from './placementKey';

// The manual-entry form's text-field values (story 12) - excludes the
// image file (handled separately as a `File`). `variation` (story 16) is
// entered through the same shared add-card modal field the TCGdex search
// view uses, rather than a separate manual-entry-only field.
export interface CustomCardFormValues {
  name: string;
  setName: string | null;
  localNumber: string | null;
  variation: string | null;
  // Story 36: the modal's "Acquired" checkbox value, entered through the
  // same shared add-card modal field the TCGdex search view uses.
  acquired: boolean;
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

// Story 12's manual-entry custom-card assignment, extracted out of
// `useCardMutations` (which was growing past this house-cleaning pass's
// line-count threshold): assigns a manually-entered custom card to a
// binder slot, sharing `pendingPlacementKeys`/`pendingUnplacedCardIds`
// state with `useBulkCardAdd` (both passed in from `useCardMutations`
// rather than owned by either mutation path individually).
export function useCustomCardAssignment({
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
  const { start } = useSaveStatusToast();

  // Story 12's one-shot restore signal (see `ManualEntryRestore`'s doc
  // comment above) - `null` whenever there's no failed custom-card
  // submission awaiting correction.
  const [manualEntryRestore, setManualEntryRestore] = useState<ManualEntryRestore | null>(null);

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
        acquired: values.acquired,
        // Story 38: every new card starts with no saved price, matching
        // the backend's default for a newly created card.
        price: null,
        isManualPrice: false,
        priceUpdatedAt: null,
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
    [binderId, setCards, setPendingPlacementKeys, setPendingUnplacedCardIds, start, retry],
  );

  // Clears the one-shot restore signal once `BinderLayoutView` has consumed
  // it (copied it into its own local state and reopened the modal).
  const clearManualEntryRestore = useCallback(() => {
    setManualEntryRestore(null);
  }, []);

  return { assignCustomCard, manualEntryRestore, clearManualEntryRestore };
}
