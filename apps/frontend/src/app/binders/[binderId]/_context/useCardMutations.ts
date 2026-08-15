'use client';

import { useState, type Dispatch, type SetStateAction } from 'react';

import type { Card } from '@/lib/api';

import { useBulkCardAdd } from './useBulkCardAdd';
import { useCardDuplication } from './useCardDuplication';
import { useCardFieldEdits } from './useCardFieldEdits';
import { useCardMovement } from './useCardMovement';
import { useCardRemoval } from './useCardRemoval';
import { useCustomCardAssignment } from './useCustomCardAssignment';
import type { LayoutMovementHistoryAction } from './useLayoutMovement';

export type { BulkAddFailedCard, BulkAddFailure, BulkSelectionRestore } from './useBulkCardAdd';
export type { CustomCardFormValues, ManualEntryRestore } from './useCustomCardAssignment';

// Owns every card-scoped mutation (stories 11-19: search/manual add,
// remove, edit variation, duplicate, move) and their pending-request/
// restore state, operating on the `cards` collection owned by
// `BinderRouteContext` and passed in here (rather than owned by this hook)
// so `useLayoutMovement`'s undo/redo executor can also reach it directly
// without this hook and `useLayoutMovement` needing to depend on each
// other's setters. `moveCard` shares its "movement in flight" flag and
// undo/redo history recording with `useArtMutations` (per story 14/28's
// single binder-scoped movement queue), so both are passed in from the
// shared `useLayoutMovement` hook rather than owned here. Each mutation
// group (bulk add, custom-card assignment, removal, field edits,
// duplication, movement) is broken out into its own sibling hook - this
// hook's own job is purely wiring their shared state together and
// combining their return values into one object for `BinderRouteContext`.
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
  // The slots (by `placementKey`) with an assignment currently in flight
  // (story 11), so the layout tab can disable them until the request
  // settles. Shared between `useCustomCardAssignment` and
  // `useBulkCardAdd`'s `assignCards`, so it's owned here rather than by
  // either mutation path individually.
  const [pendingPlacementKeys, setPendingPlacementKeys] = useState<Set<string>>(new Set());
  // Story 15's in-flight-unplaced-create ids (see `useCustomCardAssignment`'s
  // `ManualEntryRestore` doc comment) - also shared between
  // `useCustomCardAssignment` and `useBulkCardAdd`.
  const [pendingUnplacedCardIds, setPendingUnplacedCardIds] = useState<Set<string>>(new Set());

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

  const { assignCustomCard, manualEntryRestore, clearManualEntryRestore } = useCustomCardAssignment(
    {
      binderId,
      setCards,
      setPendingPlacementKeys,
      setPendingUnplacedCardIds,
      retry,
    },
  );

  const { removeCard, pendingCardDeletionIds } = useCardRemoval({
    cards,
    setCards,
    pruneHistoryEntriesForItem,
    retry,
  });

  const {
    editCardVariation,
    pendingCardVariationEditIds,
    editCardDetails,
    pendingCardDetailsEditIds,
    toggleCardAcquired,
    pendingCardAcquiredToggleIds,
    toggleCardsAcquisition,
    isBulkAcquisitionPending,
  } = useCardFieldEdits({
    binderId,
    cards,
    setCards,
    pruneHistoryEntriesForItem,
    retry,
  });

  const { duplicateCard, pendingCardDuplicateIds } = useCardDuplication({
    cards,
    setCards,
    retry,
  });

  const { moveCard } = useCardMovement({
    cards,
    setCards,
    isMovePending,
    setIsMovePending,
    recordSuccessfulMovement,
    retry,
  });

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
    editCardDetails,
    pendingCardDetailsEditIds,
    toggleCardAcquired,
    pendingCardAcquiredToggleIds,
    toggleCardsAcquisition,
    isBulkAcquisitionPending,
    duplicateCard,
    pendingCardDuplicateIds,
    moveCard,
  };
}
