'use client';

import { useState } from 'react';

import type { Art, Binder, Card } from '@/lib/api';

import { getFootprintCells, isFootprintBlocked, isFootprintInBounds } from '../artFootprint';
import type { ArtCreateRestore, ArtEditRestore } from '../_context/useArtMutations';

// Owns the create-art and edit-art modals' open/target state for
// `BinderLayoutView` (stories 25/26): whether the create modal is open
// (or auto-reopened after a failed create), which art item (if any) an
// edit modal targets, and the placement-conflict check the edit modal
// uses for its "Save and Move to Unplaced" confirmation. Extracted from
// `BinderLayoutView` since this modal-orchestration concern is
// self-contained.
export function useArtModalState({
  binder,
  cards,
  art,
  artCreateRestore,
  clearArtCreateRestore,
  artEditRestore,
  clearArtEditRestore,
}: {
  binder: Binder;
  cards: Card[];
  art: Art[];
  artCreateRestore: ArtCreateRestore | null;
  clearArtCreateRestore: () => void;
  artEditRestore: ArtEditRestore | null;
  clearArtEditRestore: () => void;
}) {
  // Whether the create-art modal was opened via the unplaced-art panel's
  // own add button (story 25) - `showCreateArtModal` below also reopens it
  // automatically after a failed create, without this flag needing to be
  // set for that case.
  const [isCreateArtModalOpen, setIsCreateArtModalOpen] = useState(false);
  // The modal is visible either because the user just clicked "Add art" or
  // because a previous create attempt failed and needs correcting
  // (planning.md: "Failure ... reopens the editor with the image,
  // metadata ... preserved").
  const showCreateArtModal = isCreateArtModalOpen || artCreateRestore !== null;

  function handleCloseCreateArtModal() {
    setIsCreateArtModalOpen(false);
    // A no-op when there's no pending restore to discard, but clears one
    // if the user manually closes a modal that was auto-reopened after a
    // failure, so it doesn't keep reopening itself.
    clearArtCreateRestore();
  }

  // The art item currently targeted by an open edit-art modal (story 26),
  // set by an `ArtActionsOverlay`'s Edit button; `null` while no edit
  // modal is open and no edit attempt has failed. A failed edit's restore
  // clears its own optimistic changes back to the original record in the
  // route context, so looking the id back up in `art` here (rather than
  // keeping a stale local copy) always finds the right record to reopen
  // with, combined with `artEditRestore`'s own preserved form values/file.
  const [editingArtId, setEditingArtId] = useState<string | null>(null);
  const editingArtRecordId = editingArtId ?? artEditRestore?.artId ?? null;
  const editingArt = editingArtRecordId
    ? (art.find((item) => item.id === editingArtRecordId) ?? null)
    : null;
  const showEditArtModal = editingArt !== null;

  function handleCloseEditArtModal() {
    setEditingArtId(null);
    clearArtEditRestore();
  }

  // Story 26's nested "Save and Move to Unplaced" conflict check, passed
  // to the edit modal: only art that's currently placed on the layout can
  // conflict at all - unplaced art has nowhere to overlap or go out of
  // bounds - and the art being edited is excluded from its own overlap
  // check via `isFootprintBlocked`'s `excludeArtId`.
  function checkEditPlacementConflict(widthSlots: number, heightSlots: number): boolean {
    if (!editingArt) return false;
    const { physicalPage, row, column } = editingArt.placement;
    if (physicalPage === null || row === null || column === null) return false;

    if (!isFootprintInBounds(row, column, widthSlots, heightSlots, binder.width, binder.height)) {
      return true;
    }

    const cells = getFootprintCells(row, column, widthSlots, heightSlots);
    return isFootprintBlocked(cards, art, physicalPage, cells, editingArt.id);
  }

  return {
    isCreateArtModalOpen,
    setIsCreateArtModalOpen,
    showCreateArtModal,
    handleCloseCreateArtModal,
    editingArtId,
    setEditingArtId,
    editingArt,
    showEditArtModal,
    handleCloseEditArtModal,
    checkEditPlacementConflict,
  };
}
