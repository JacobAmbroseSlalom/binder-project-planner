'use client';

import { DndContext, DragOverlay, pointerWithin } from '@dnd-kit/core';
import {
  DEFAULT_BINDER_MICHI_INDICATORS_VISIBLE,
  DEFAULT_BINDER_NOTES_VISIBLE,
  DEFAULT_BINDER_VARIATIONS_VISIBLE,
} from '@binder-project-planner/shared';
import { useState } from 'react';

import { exportBinderLayoutPdf, resolveCardImageUrl } from '@/lib/api';
import { useSaveStatusToast } from '@/shared/feedback';
import { useLocalStorageBoolean } from '@/shared/hooks/useLocalStorageBoolean';

import { useBinderRouteContext } from '../../BinderRouteContext';
import { getSpreadLabel } from '../layoutSpread';
import { useArtModalState } from '../useArtModalState';
import { UNPLACED_SLOT_TARGET, useCardSelectionModalState } from '../useCardSelectionModalState';
import { useLayoutDragAndDrop } from '../useLayoutDragAndDrop';
import { useLayoutSpreadNavigation } from '../useLayoutSpreadNavigation';
import { ArtTile } from './art/ArtTile';
import { CreateArtModal } from './art/CreateArtModal';
import { PrintArtModal } from './art/PrintArtModal';
import { UnplacedArtPanel } from './art/UnplacedArtPanel';
import { BinderLayoutSummaryStats } from './BinderLayoutSummaryStats';
import { BinderNotesSection } from './BinderNotesSection';
import { BulkAddFailuresModal } from './card/BulkAddFailuresModal';
import { CardSelectionModal } from './card/CardSelectionModal';
import { EditCardVariationModal } from './card/EditCardVariationModal';
import { UnplacedCardsPanel } from './card/UnplacedCardsPanel';
import { LayoutSpreadView } from './LayoutSpreadView';
import { LayoutToolbar } from './LayoutToolbar';

// The "Edit Layout" tab's real content (stories 8 and 9): visualizes the
// binder as a sequence of displayed spreads - the first showing only the
// right side, the last only the left side, and every one in between
// showing both - navigated with the arrow controls or the direct
// page-number input in the toolbar above. The current spread is tracked
// by the route's `page` query parameter (a one-based physical page) so
// refreshes and copied URLs retain it; see `layoutSpread.ts` for the
// physical-page/spread math this component drives.
//
// Most of this tab's individual concerns - drag-and-drop (story 14/26),
// page/spread navigation (story 8/9), the card-selection modal's target/
// restore state (story 11/12/17/18), and the create/edit art modals'
// target state (story 25/26) - are each owned by their own extracted hook
// (see the `use*` imports above) rather than living directly in this
// component, which composes them and owns only what's left: the
// edit-variation modal, the undo/redo history reveal, the visibility
// toggles, and PDF export.
export function BinderLayoutView() {
  const {
    binder,
    layoutFocalPage,
    setLayoutFocalPage,
    cards,
    pendingPlacementKeys,
    assignCards,
    isBulkAddPending,
    bulkAddFailure,
    clearBulkAddFailure,
    retryFailedBulkCards,
    bulkSelectionRestore,
    clearBulkSelectionRestore,
    assignCustomCard,
    manualEntryRestore,
    clearManualEntryRestore,
    removeCard,
    pendingCardDeletionIds,
    editCardVariation,
    pendingCardVariationEditIds,
    duplicateCard,
    pendingCardDuplicateIds,
    moveCard,
    isMovePending,
    canUndoLayoutMovement = false,
    canRedoLayoutMovement = false,
    undoLayoutMovement = async () => null,
    redoLayoutMovement = async () => null,
    pendingUnplacedCardIds,
    art,
    createArt,
    pendingUnplacedArtIds,
    artCreateRestore,
    clearArtCreateRestore,
    moveArt,
    editArt,
    pendingArtEditIds,
    artEditRestore,
    clearArtEditRestore,
    removeArt,
    pendingArtDeletionIds,
    duplicateArt,
    pendingArtDuplicateIds,
  } = useBinderRouteContext();
  const { start } = useSaveStatusToast();

  // Story 24: the binder's configured one-slot width/height (per-slot cm
  // formulas resolved to a single slot's actual size) define the on-screen
  // slot/card aspect ratio everywhere in this tab, replacing the old fixed
  // `SLOT_WIDTH_CM`/`SLOT_HEIGHT_CM` ratio. CSS `aspect-ratio` accepts a
  // unitless number directly, so this is computed once here and threaded
  // down as a single prop rather than each component re-deriving it.
  const slotAspectRatio =
    (binder.widthPerSlot + binder.widthBase) / (binder.heightPerSlot + binder.heightBase);

  // Story 32: derived once here and threaded down to every add/edit/
  // remove/duplicate/move-capable child - Undo/Redo are hidden entirely
  // below rather than threaded further, since there's nothing left for
  // them to act on once every mutation is unavailable.
  const isLocked = binder.locked;

  // Story 11/12/17/18's card-selection modal target/restore state and
  // Add-Card/Add-More submission handlers - see `useCardSelectionModalState`.
  const {
    selectedSlot,
    setSelectedSlot,
    manualEntryDraft,
    bulkSelectionDraft,
    handleAddCards,
    handleAddMoreCards,
    handleSubmitCustomCard,
    handleSubmitCustomCardAddMore,
    closeCardSelectionModal,
  } = useCardSelectionModalState({
    assignCards,
    assignCustomCard,
    manualEntryRestore,
    clearManualEntryRestore,
    bulkSelectionRestore,
    clearBulkSelectionRestore,
  });

  // Story 25/26's create-art/edit-art modal target state and placement-
  // conflict check - see `useArtModalState`.
  const {
    setIsCreateArtModalOpen,
    showCreateArtModal,
    handleCloseCreateArtModal,
    setEditingArtId,
    editingArt,
    showEditArtModal,
    handleCloseEditArtModal,
    checkEditPlacementConflict,
  } = useArtModalState({
    binder,
    cards,
    art,
    artCreateRestore,
    clearArtCreateRestore,
    artEditRestore,
    clearArtEditRestore,
  });

  // The card currently targeted by an open edit-variation modal (story
  // 16), set by a `CardTile`'s hover-revealed Pencil action; `null` while
  // no such modal is open. Looked up from `cards` by id (rather than
  // stored as a full record) so the modal always reflects the card's
  // latest optimistic state.
  const [editingCardId, setEditingCardId] = useState<string | null>(null);
  const editingCard = editingCardId
    ? (cards.find((item) => item.id === editingCardId) ?? null)
    : null;

  function handleSaveCardVariation(variation: string | null) {
    if (!editingCard) return;
    editCardVariation(editingCard.id, variation);
  }

  // Story 14/26's drag-and-drop lifecycle - see `useLayoutDragAndDrop`.
  const {
    activeDragCard,
    activeDragArt,
    dragCandidateFootprint,
    sensors,
    handleDragStart,
    handleDragOver,
    handleDragEnd,
    handleDragCancel,
  } = useLayoutDragAndDrop({ binder, cards, art, moveCard, moveArt });

  // Story 8/9's physical-page/spread navigation - see
  // `useLayoutSpreadNavigation`.
  const {
    maxPhysicalPage,
    physicalPage,
    spread,
    isFirstSpread,
    isLastSpread,
    totalPhysicalPages,
    navigateToPhysicalPage,
    pageInputValue,
    setPageInputValue,
    commitPageInput,
  } = useLayoutSpreadNavigation({ totalPages: binder.pages, layoutFocalPage, setLayoutFocalPage });

  // Story 10's Michi-indicator toggle is a presentation preference,
  // persisted in local storage (mirroring notes visibility) rather than
  // encoded in the route query string.
  const [michiIndicatorsVisible, setMichiIndicatorsVisible] = useLocalStorageBoolean(
    'binder-layout-michi-visible',
    DEFAULT_BINDER_MICHI_INDICATORS_VISIBLE,
  );

  // Story 23's notes-visibility toggle. Unlike the michi/variations
  // toggles (which are per-view URL query params), notes visibility is a
  // persisted preference: it's remembered across binders and reloads via
  // browser local storage and defaults to visible on a first visit.
  const [notesVisible, setNotesVisible] = useLocalStorageBoolean(
    'binder-notes-visible',
    DEFAULT_BINDER_NOTES_VISIBLE,
  );

  // Story 16's card-variation overlay toggle is a persisted presentation
  // preference (hidden by default), and story 29's PDF export reads this
  // same state so printed output matches what's shown on screen.
  const [variationsVisible, setVariationsVisible] = useLocalStorageBoolean(
    'binder-layout-variations-visible',
    DEFAULT_BINDER_VARIATIONS_VISIBLE,
  );

  // Story 28 post-undo/redo unplaced navigation: when the resulting focal
  // placement is unplaced, keep the current spread and ask the matching
  // unplaced panel to reveal that specific item.
  const [pendingHistoryCardRevealId, setPendingHistoryCardRevealId] = useState<string | null>(null);
  const [pendingHistoryArtRevealId, setPendingHistoryArtRevealId] = useState<string | null>(null);

  async function handleUndoLayoutMovement() {
    const result = await undoLayoutMovement();
    if (!result) return;

    if (result.placement.physicalPage !== null) {
      navigateToPhysicalPage(result.placement.physicalPage);
      return;
    }

    if (result.itemType === 'card') {
      setPendingHistoryArtRevealId(null);
      setPendingHistoryCardRevealId(result.itemId);
      return;
    }

    setPendingHistoryCardRevealId(null);
    setPendingHistoryArtRevealId(result.itemId);
  }

  async function handleRedoLayoutMovement() {
    const result = await redoLayoutMovement();
    if (!result) return;

    if (result.placement.physicalPage !== null) {
      navigateToPhysicalPage(result.placement.physicalPage);
      return;
    }

    if (result.itemType === 'card') {
      setPendingHistoryArtRevealId(null);
      setPendingHistoryCardRevealId(result.itemId);
      return;
    }

    setPendingHistoryCardRevealId(null);
    setPendingHistoryArtRevealId(result.itemId);
  }

  // The print-art button/modal only ever consider currently PLACED art
  // (planning.md: "Unplaced multi-slot art is never listed in the modal
  // and is never included in the PDF").
  const placedArt = art.filter((item) => item.placement.physicalPage !== null);

  // Story 29's print-to-PDF button disables itself while its own export is
  // in flight; a fresh `useState` (rather than a shared pending-set) is
  // enough since only one binder's layout tab renders at a time.
  const [isExportingPdf, setIsExportingPdf] = useState(false);

  // Story 30's print-art button opens a selection modal rather than
  // immediately generating a PDF; the modal itself owns the in-flight
  // export state (see `PrintArtModal.tsx`).
  const [isPrintArtModalOpen, setIsPrintArtModalOpen] = useState(false);

  // Generates and downloads the binder's layout PDF (story 29): drives the
  // shared save-status toast exactly like every other mutation (a
  // persistent "saving" toast the whole time, replaced by "saved" on
  // success or the persistent "failed" toast with the backend's Problem
  // Details detail on failure), and triggers the browser's native download
  // via a throwaway anchor element once the blob arrives.
  async function handleExportPdf() {
    setIsExportingPdf(true);
    const toast = start();
    try {
      const { blob, filename } = await exportBinderLayoutPdf(binder.id, variationsVisible);
      const objectUrl = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = objectUrl;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(objectUrl);
      toast.markSaved();
    } catch (error) {
      toast.markFailed(error);
    } finally {
      setIsExportingPdf(false);
    }
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={pointerWithin}
      onDragStart={handleDragStart}
      onDragOver={handleDragOver}
      onDragEnd={handleDragEnd}
      onDragCancel={handleDragCancel}
      // Story 15: the unplaced panel's own scroll position must stay
      // stationary during a drag rather than dnd-kit auto-scrolling it (or
      // any other ancestor) toward the pointer.
      autoScroll={false}
    >
      {/* A 3-column grid: the unplaced-cards panel, the centered
          toolbar+spread content, and a fixed-width invisible spacer
          (story 15) - in that order. The spacer's width always mirrors
          the panel's own fixed width, so the middle column is centered on
          the *entire* tab's width exactly as it was before the panel
          existed, rather than being re-centered only within the leftover
          space next to the panel. A single explicit row
          (`grid-rows-[minmax(0,1fr)]`) fills the tab's full height and
          stretches every column - including the panel - to it, so the
          panel's top edge lines up with the toolbar row above the spread
          instead of starting only alongside the spread. */}
      <div className="grid h-full min-h-0 flex-1 grid-cols-[24rem_1fr_24rem] grid-rows-[minmax(0,1fr)] gap-8 p-8">
        {/* Story 32: replaced with a blank placeholder while the binder is
            locked - every one of the panel's own controls
            (add/edit/remove/duplicate/move) is a restricted mutation, so
            there's nothing left in it to interact with. A grid child (not
            simply omitting the panel) is required here: CSS Grid's
            auto-placement re-packs any *remaining* children into the
            earliest explicit tracks, so dropping this child entirely would
            shove the center spread into this first (`24rem`) column
            instead of leaving it blank. */}
        {isLocked ? (
          <div aria-hidden="true" />
        ) : (
          <UnplacedCardsPanel
            cards={cards}
            pendingCardDeletionIds={pendingCardDeletionIds}
            pendingUnplacedCardIds={pendingUnplacedCardIds}
            isMovePending={isMovePending}
            onRemoveCard={removeCard}
            onEditVariation={(clickedCard) => setEditingCardId(clickedCard.id)}
            pendingCardVariationEditIds={pendingCardVariationEditIds}
            onDuplicateCard={duplicateCard}
            pendingCardDuplicateIds={pendingCardDuplicateIds}
            variationsVisible={variationsVisible}
            onAddCard={() => setSelectedSlot(UNPLACED_SLOT_TARGET)}
            slotAspectRatio={slotAspectRatio}
            scrollToCardId={pendingHistoryCardRevealId}
            onScrollToCardHandled={() => setPendingHistoryCardRevealId(null)}
          />
        )}

        <div className={`flex h-full min-h-0 flex-col gap-4`}>
          {/* The toolbar row (michi/variations/notes toggles, direct
              page-number input, undo/redo, print buttons) - see
              `LayoutToolbar`. */}
          <LayoutToolbar
            michiIndicatorsVisible={michiIndicatorsVisible}
            onToggleMichiIndicators={() => setMichiIndicatorsVisible(!michiIndicatorsVisible)}
            variationsVisible={variationsVisible}
            onToggleVariationsVisible={() => setVariationsVisible(!variationsVisible)}
            notesVisible={notesVisible}
            onToggleNotesVisible={() => setNotesVisible(!notesVisible)}
            isLocked={isLocked}
            maxPhysicalPage={maxPhysicalPage}
            pageInputValue={pageInputValue}
            onPageInputChange={setPageInputValue}
            onCommitPageInput={commitPageInput}
            canUndoLayoutMovement={canUndoLayoutMovement}
            canRedoLayoutMovement={canRedoLayoutMovement}
            isMovePending={isMovePending}
            onUndo={() => void handleUndoLayoutMovement()}
            onRedo={() => void handleRedoLayoutMovement()}
            isExportingPdf={isExportingPdf}
            onExportPdf={handleExportPdf}
            placedArtCount={placedArt.length}
            onOpenPrintArtModal={() => setIsPrintArtModalOpen(true)}
          />

          {/* Story 40: summary stats (slots filled + unplaced counts, with
              an over-capacity warning) on their own row above the spread
              label. */}
          <BinderLayoutSummaryStats binder={binder} cards={cards} art={art} />

          {/* The current spread's label (story 9) lives on its own row,
              centered above the binder visualization. */}
          <p className="text-center text-caption text-neutral-500">
            {getSpreadLabel(spread)} / {totalPhysicalPages}
          </p>

          {/* The chevron-flanked spread visualization itself - see
              `LayoutSpreadView`. */}
          <LayoutSpreadView
            binder={binder}
            cards={cards}
            art={art}
            pendingPlacementKeys={pendingPlacementKeys}
            spread={spread}
            physicalPage={physicalPage}
            maxPhysicalPage={maxPhysicalPage}
            isFirstSpread={isFirstSpread}
            isLastSpread={isLastSpread}
            isDragActive={activeDragCard !== null || activeDragArt !== null}
            navigateToPhysicalPage={navigateToPhysicalPage}
            onSlotClick={(pageForSlot, row, column) =>
              setSelectedSlot({ physicalPage: pageForSlot, row, column })
            }
            onRemoveCard={removeCard}
            pendingCardDeletionIds={pendingCardDeletionIds}
            onEditVariation={(clickedCard) => setEditingCardId(clickedCard.id)}
            pendingCardVariationEditIds={pendingCardVariationEditIds}
            onDuplicateCard={duplicateCard}
            pendingCardDuplicateIds={pendingCardDuplicateIds}
            variationsVisible={variationsVisible}
            pendingArtEditIds={pendingArtEditIds}
            pendingArtDeletionIds={pendingArtDeletionIds}
            pendingArtDuplicateIds={pendingArtDuplicateIds}
            onEditArt={(clickedArt) => setEditingArtId(clickedArt.id)}
            onRemoveArt={removeArt}
            onDuplicateArt={duplicateArt}
            isMovePending={isMovePending}
            michiIndicatorsVisible={michiIndicatorsVisible}
            slotAspectRatio={slotAspectRatio}
            dragCandidateFootprint={dragCandidateFootprint}
          />

          {/* Story 23: the notes section, within the center column below
                the spread (not spanning the unplaced side panels), shown
                unless the notes toggle is off. Story 32: also hidden
                entirely while the binder is locked, since its own editing
                is a restricted mutation. */}
          {notesVisible && !isLocked && <BinderNotesSection />}
        </div>

        {/* Story 32: mirrors the unplaced-cards column above - a blank
            placeholder grid child (not an omitted one) so the last
            (`24rem`) column stays reserved and the center spread doesn't
            get re-packed leftward by CSS Grid auto-placement. */}
        {isLocked ? (
          <div aria-hidden="true" />
        ) : (
          <UnplacedArtPanel
            art={art}
            binder={binder}
            pendingUnplacedArtIds={pendingUnplacedArtIds}
            pendingArtEditIds={pendingArtEditIds}
            pendingArtDeletionIds={pendingArtDeletionIds}
            pendingArtDuplicateIds={pendingArtDuplicateIds}
            isMovePending={isMovePending}
            onAddArt={() => setIsCreateArtModalOpen(true)}
            onEditArt={(clickedArt) => setEditingArtId(clickedArt.id)}
            onRemoveArt={removeArt}
            onDuplicateArt={duplicateArt}
            scrollToArtId={pendingHistoryArtRevealId}
            onScrollToArtHandled={() => setPendingHistoryArtRevealId(null)}
          />
        )}
      </div>

      {/* The drag overlay (story 14): renders the dragged card's image
          following the pointer, sized to match the original slot's
          rendered dimensions automatically (dnd-kit sizes `DragOverlay`'s
          content to the original draggable node's measured rect). */}
      <DragOverlay>
        {activeDragCard && (
          <div
            className="flex h-full w-full items-center justify-center overflow-hidden rounded-standard border border-neutral-700 bg-neutral-800"
            style={{ aspectRatio: slotAspectRatio }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element -- mirrors
                the same arbitrary-origin image handling as `BinderSlot`. */}
            <img
              src={resolveCardImageUrl(activeDragCard.imageUrl)}
              alt={activeDragCard.name}
              className="h-full w-full object-contain"
            />
          </div>
        )}
        {/* Story 26: the dragged art item's own tile, filling whatever size
            dnd-kit auto-sizes this overlay to (the original draggable
            node's measured rect), mirroring the card branch above. */}
        {activeDragArt && (
          <div className="h-full w-full">
            <ArtTile art={activeDragArt.art} binder={binder} isPendingCreate={false} />
          </div>
        )}
      </DragOverlay>

      {selectedSlot && (
        <CardSelectionModal
          onClose={closeCardSelectionModal}
          initialTarget={selectedSlot}
          onAddCards={handleAddCards}
          onAddMoreCards={handleAddMoreCards}
          onSubmitCustomCard={handleSubmitCustomCard}
          onSubmitCustomCardAddMore={handleSubmitCustomCardAddMore}
          isBulkAddPending={isBulkAddPending}
          initialManualEntry={manualEntryDraft ?? undefined}
          initialSelectionRestore={bulkSelectionDraft ?? undefined}
        />
      )}

      {bulkAddFailure && (
        <BulkAddFailuresModal
          failure={bulkAddFailure}
          onRetryAll={retryFailedBulkCards}
          onClose={clearBulkAddFailure}
        />
      )}

      {showCreateArtModal && (
        <CreateArtModal
          binder={binder}
          mode="create"
          restore={artCreateRestore}
          onClose={handleCloseCreateArtModal}
          onSubmit={(values, file) => {
            if (!file) return;
            createArt(values, file);
            setIsCreateArtModalOpen(false);
          }}
          onConsumeRestore={clearArtCreateRestore}
        />
      )}

      {showEditArtModal && editingArt && (
        <CreateArtModal
          binder={binder}
          mode="edit"
          restore={null}
          editingArt={editingArt}
          editRestore={artEditRestore}
          checkPlacementConflict={checkEditPlacementConflict}
          onClose={handleCloseEditArtModal}
          onSubmit={(values, file, moveToUnplacedOnConflict) => {
            editArt(editingArt.id, values, file, moveToUnplacedOnConflict);
            setEditingArtId(null);
          }}
          onConsumeRestore={clearArtEditRestore}
        />
      )}

      {isPrintArtModalOpen && (
        <PrintArtModal
          binder={binder}
          placedArt={placedArt}
          onClose={() => setIsPrintArtModalOpen(false)}
        />
      )}

      {editingCard && (
        <EditCardVariationModal
          card={editingCard}
          isSaving={pendingCardVariationEditIds.has(editingCard.id)}
          onSave={handleSaveCardVariation}
          onClose={() => setEditingCardId(null)}
        />
      )}
    </DndContext>
  );
}
