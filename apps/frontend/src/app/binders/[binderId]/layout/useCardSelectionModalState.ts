'use client';

import { useEffect, useState } from 'react';

import type { TcgDexCatalogCard } from '@/lib/api';

import type { CustomCardFormValues } from '../_context/useCardMutations';

// The slot (or unplaced-panel target) currently targeted by an open
// card-selection modal (story 11; unplaced target added in story 15):
// `null` while no modal is open. Physical page is captured alongside
// row/column (rather than re-derived from the spread at selection time) so
// the modal's target stays fixed even if the user could somehow navigate
// spreads while it's open. All 3 fields are `null` together for the
// unplaced panel's own add button - never partially null - mirroring the
// backend's own all-or-none placement shape.
export interface SelectedSlot {
  physicalPage: number | null;
  row: number | null;
  column: number | null;
}

// The unplaced panel's add-button target (story 15): reused as-is by both
// `handleSelectCard` and `handleSubmitCustomCard` below, since its shape
// already matches a concrete slot's, so neither handler needs a separate
// branch for "no slot at all."
export const UNPLACED_SLOT_TARGET: SelectedSlot = { physicalPage: null, row: null, column: null };

type TargetPlacement = { physicalPage: number; row: number; column: number } | null;

// Owns the card-selection modal's open/target state and submission
// handlers for `BinderLayoutView` (stories 11/12/17/18): which slot (or
// the unplaced panel) it's targeting, the manual-entry/bulk-selection
// drafts used to reopen it pre-filled after a failed submission, and the
// Add-Card/Add-More handlers that forward to the route context's
// `assignCards`/`assignCustomCard`. Extracted from `BinderLayoutView`
// since this modal-orchestration concern is self-contained.
export function useCardSelectionModalState({
  assignCards,
  assignCustomCard,
  manualEntryRestore,
  clearManualEntryRestore,
  bulkSelectionRestore,
  clearBulkSelectionRestore,
}: {
  assignCards: (
    cards: TcgDexCatalogCard[],
    variation: string | null,
    acquired: boolean,
    targetPlacement: TargetPlacement,
    reopenOnFailure: boolean,
  ) => Promise<boolean>;
  assignCustomCard: (
    values: CustomCardFormValues,
    file: File,
    placement: TargetPlacement,
    reopenOnFailure: boolean,
  ) => Promise<boolean>;
  manualEntryRestore: {
    placement: TargetPlacement;
    values: CustomCardFormValues;
    file: File;
  } | null;
  clearManualEntryRestore: () => void;
  bulkSelectionRestore: {
    placement: TargetPlacement;
    cards: TcgDexCatalogCard[];
    variation: string | null;
    acquired: boolean;
  } | null;
  clearBulkSelectionRestore: () => void;
}) {
  // The slot (if any) currently targeted by an open card-selection modal
  // (story 11).
  const [selectedSlot, setSelectedSlot] = useState<SelectedSlot | null>(null);

  // The manual-entry values/file to seed the modal with, only set while
  // reopening it to correct a failed custom-card submission (story 12) -
  // `null` for a normal (blank) modal open.
  const [manualEntryDraft, setManualEntryDraft] = useState<{
    values: CustomCardFormValues;
    file: File;
  } | null>(null);

  // Stories 17/18: the failed TCGdex selection/variation to seed the modal
  // with, only set while reopening it to correct a failed Add-Card bulk
  // submission - `null` for a normal (blank) modal open.
  const [bulkSelectionDraft, setBulkSelectionDraft] = useState<{
    cards: TcgDexCatalogCard[];
    variation: string | null;
    acquired: boolean;
  } | null>(null);

  // Auto-reopens the card-selection modal, pre-filled, once a custom-card
  // submission fails (story 12). Derived during render (comparing against
  // the last-seen restore signal), matching `BinderLayoutView`'s own
  // `lastSyncedPhysicalPage` convention, rather than in a `useEffect` -
  // React's documented "adjusting state when a prop changes" pattern -
  // since `manualEntryRestore` is an ordinary context value, not a
  // subscription to an external system. A `null` `placement` reopens
  // targeting the unplaced panel (story 15) rather than being skipped, now
  // that section exists in the UI.
  const [lastSeenManualEntryRestore, setLastSeenManualEntryRestore] = useState(manualEntryRestore);
  if (manualEntryRestore !== lastSeenManualEntryRestore) {
    setLastSeenManualEntryRestore(manualEntryRestore);
    if (manualEntryRestore) {
      setSelectedSlot(manualEntryRestore.placement ?? UNPLACED_SLOT_TARGET);
      setManualEntryDraft({
        values: manualEntryRestore.values,
        file: manualEntryRestore.file,
      });
    }
  }

  // Clears the one-shot restore signal once this hook has consumed it
  // above - a genuine "notify an external owner" side effect (rather than
  // local state), so it belongs in an effect unlike the derivation above.
  useEffect(() => {
    if (manualEntryRestore) clearManualEntryRestore();
  }, [manualEntryRestore, clearManualEntryRestore]);

  // Mirrors the `manualEntryRestore` derivation above, but for an Add-Card
  // TCGdex bulk submission's failure (story 17).
  const [lastSeenBulkSelectionRestore, setLastSeenBulkSelectionRestore] =
    useState(bulkSelectionRestore);
  if (bulkSelectionRestore !== lastSeenBulkSelectionRestore) {
    setLastSeenBulkSelectionRestore(bulkSelectionRestore);
    if (bulkSelectionRestore) {
      setSelectedSlot(bulkSelectionRestore.placement ?? UNPLACED_SLOT_TARGET);
      setBulkSelectionDraft({
        cards: bulkSelectionRestore.cards,
        variation: bulkSelectionRestore.variation,
        acquired: bulkSelectionRestore.acquired,
      });
    }
  }

  useEffect(() => {
    if (bulkSelectionRestore) clearBulkSelectionRestore();
  }, [bulkSelectionRestore, clearBulkSelectionRestore]);

  // "Add Card" for the search view's checkbox selection (stories 17/18,
  // replacing story 11's single-card `handleSelectCard`): fires-and-forgets
  // through `assignCards` and closes the modal immediately - the route
  // context owns the optimistic-update/request lifecycle from here (see
  // `BinderRouteContext.tsx`). `targetPlacement` is already this session's
  // resolved target (or `null`), computed by the modal itself.
  function handleAddCards(
    selection: TcgDexCatalogCard[],
    variation: string | null,
    acquired: boolean,
    targetPlacement: TargetPlacement,
  ) {
    void assignCards(selection, variation, acquired, targetPlacement, true);
    setSelectedSlot(null);
    setBulkSelectionDraft(null);
  }

  // "Add More" for the search view's checkbox selection (story 18): keeps
  // the modal open, so this just forwards to `assignCards` without closing
  // anything - the modal itself awaits the returned promise to decide
  // whether to clear its own search state.
  function handleAddMoreCards(
    selection: TcgDexCatalogCard[],
    variation: string | null,
    acquired: boolean,
    targetPlacement: TargetPlacement,
  ): Promise<boolean> {
    return assignCards(selection, variation, acquired, targetPlacement, false);
  }

  // Submits the manual-entry form's custom card via "Add Card" (story 12)
  // and closes the modal immediately, mirroring `handleAddCards` above.
  function handleSubmitCustomCard(
    values: CustomCardFormValues,
    file: File,
    targetPlacement: TargetPlacement,
  ) {
    void assignCustomCard(values, file, targetPlacement, true);
    setSelectedSlot(null);
    setManualEntryDraft(null);
  }

  // The manual-entry view's own "Add More" (story 18), mirroring
  // `handleAddMoreCards`.
  function handleSubmitCustomCardAddMore(
    values: CustomCardFormValues,
    file: File,
    targetPlacement: TargetPlacement,
  ): Promise<boolean> {
    return assignCustomCard(values, file, targetPlacement, false);
  }

  // Closes the modal outright (its own X/backdrop dismiss), discarding any
  // in-progress drafts rather than just the selected slot.
  function closeCardSelectionModal() {
    setSelectedSlot(null);
    setManualEntryDraft(null);
    setBulkSelectionDraft(null);
  }

  return {
    selectedSlot,
    setSelectedSlot,
    manualEntryDraft,
    bulkSelectionDraft,
    handleAddCards,
    handleAddMoreCards,
    handleSubmitCustomCard,
    handleSubmitCustomCardAddMore,
    closeCardSelectionModal,
  };
}
