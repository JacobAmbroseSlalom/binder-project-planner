'use client';

import { useEffect, useRef, type KeyboardEvent } from 'react';

import { type Art, type Binder } from '@/lib/api';
import { useModalFocusTrap } from '@/shared/hooks/useModalFocusTrap';

import type { ArtCreateRestore, ArtEditRestore, ArtFormValues } from '../../../BinderRouteContext';
import { ArtDetailsFields } from './ArtDetailsFields';
import {
  PasteReplaceConfirmDialog,
  PlacementConflictConfirmDialog,
} from './ArtModalConfirmDialogs';
import { ArtPreviewColumn } from './ArtPreviewColumn';
import { useArtFormState } from './useArtFormState';

// Converts an existing `Art` record into this modal's own form-values
// shape (story 26's edit mode), resolving each nullable border override
// to its currently effective value (mirroring `ArtTile`'s own `??
// binder.borderX` resolution) so the field starts populated with what's
// actually rendering today, exactly like the create flow's own
// binder-setting-seeded fields.
function artToFormValues(art: Art, binder: Binder): ArtFormValues {
  return {
    title: art.title,
    description: art.description,
    widthSlots: art.widthSlots,
    heightSlots: art.heightSlots,
    imageRotationDegrees: art.imageRotationDegrees,
    focalX: art.focalX,
    focalY: art.focalY,
    scaleX: art.scaleX,
    scaleY: art.scaleY,
    borderColor: art.borderColor ?? binder.borderColor,
    borderRadius: art.borderRadius ?? binder.borderRadius,
    borderWidth: art.borderWidth ?? binder.borderWidth,
  };
}

interface CreateArtModalProps {
  binder: Binder;
  // 'create' (story 25) opens a blank modal targeting the unplaced-art
  // section's own add button; 'edit' (story 26) opens the identical modal
  // pre-filled from an existing art item, per planning.md's "Selecting
  // edit opens the same modal used to add multi-slot art."
  mode: 'create' | 'edit';
  // Present when reopening after a failed create (story 25's "Failure ...
  // reopens the editor with the image, metadata ... preserved"); `null` for
  // a fresh add-art click. Only ever set in 'create' mode.
  restore: ArtCreateRestore | null;
  // The art item being edited; required in 'edit' mode, ignored in
  // 'create' mode.
  editingArt?: Art;
  // Present when reopening after a failed edit submission (story 26,
  // mirroring `restore` above); `null` for a fresh edit click. Only ever
  // set in 'edit' mode.
  editRestore?: ArtEditRestore | null;
  // 'edit' mode only: reports whether the given candidate dimensions
  // would leave `editingArt`'s own CURRENT placement (if it's currently
  // placed at all) out of bounds or overlapping another item, using the
  // binder route context's own up-to-date `cards`/`art` state - drives
  // the nested "Save and Move to Unplaced" confirmation dialog per
  // planning.md's "If an edit changes placed art so its current footprint
  // would be out of bounds or overlap another item, Save opens a nested
  // confirmation dialog."
  checkPlacementConflict?: (widthSlots: number, heightSlots: number) => boolean;
  onClose: () => void;
  // Called with the finished form values, the replacement file (`null` in
  // edit mode when the existing image is kept as-is), and - only ever
  // `true` in edit mode - whether the user confirmed "Save and Move to
  // Unplaced" in the nested conflict dialog. The caller (BinderLayoutView,
  // via the route context's `createArt`/`editArt`) owns the actual
  // optimistic-update/request lifecycle from that point on, so this modal
  // closes right away rather than waiting on the multipart request.
  onSubmit: (values: ArtFormValues, file: File | null, moveToUnplacedOnConflict?: boolean) => void;
  // Called once this modal has copied `restore`/`editRestore`'s file/values
  // into its own local state, so the route context can revoke its own now-
  // unneeded copy of the preview object URL (see `BinderRouteContext.tsx`'s
  // `artCreateRestore`/`artEditRestore` comments).
  onConsumeRestore: () => void;
}

// The create/edit-art modal (stories 25 and 26): grid-based slot-size
// selection, title/description fields, image upload/paste with a
// Konva-based position/scale/rotation editor, per-field border-style
// overrides, and a nonblocking image-quality warning. Fully custom-built
// (no headless UI library) per styling.instructions.md, mirroring
// `CardSelectionModal.tsx`'s dialog-shell conventions (shared focus trap
// via `useModalFocusTrap`, Escape-to-close, an outer `onPaste` handler).
// The same component and markup serve both modes (planning.md: "Selecting
// edit opens the same modal used to add multi-slot art") - only the
// initial pre-fill source, title text, Save behavior, and the edit-only
// conflict dialog differ.
//
// The size/title/description/image/border-style form state and its
// preview/quality derivations live in `useArtFormState` (below), and the
// two form columns' own large JSX blocks live in `ArtDetailsFields`/
// `ArtPreviewColumn` - this component composes them and owns what's left:
// the one-time restore-consumption effect and the dialog's own
// focus/keyboard handling (including the two nested confirmation
// dialogs' open/close state, which `useArtFormState` tracks but only this
// component renders).
export function CreateArtModal({
  binder,
  mode,
  restore,
  editingArt,
  editRestore,
  checkPlacementConflict,
  onClose,
  onSubmit,
  onConsumeRestore,
}: CreateArtModalProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  // The dialog's shared focus-capture/restore-on-unmount lifecycle and
  // Tab-trap - see `useModalFocusTrap`.
  const { handleTabTrap } = useModalFocusTrap(dialogRef);

  // The one set of initial values/file this modal pre-fills from,
  // regardless of mode: a failed create's restore, a failed edit's
  // restore, or (only in 'edit' mode, and only when neither restore is
  // set) the art item being edited itself. At most one of `restore`/
  // `editRestore` is ever non-null for a given mode, so this doesn't need
  // to special-case which one "wins".
  const initialValues: ArtFormValues | null =
    restore?.values ??
    editRestore?.values ??
    (editingArt ? artToFormValues(editingArt, binder) : null);
  const initialFile: File | null = restore?.file ?? editRestore?.file ?? null;

  const {
    form,
    widthSlots,
    heightSlots,
    file,
    fileError,
    transform,
    setTransform,
    borderColor,
    setBorderColor,
    borderRadius,
    setBorderRadius,
    borderWidth,
    setBorderWidth,
    pendingPasteFile,
    pendingConflictValues,
    image,
    handleSelectGridSize,
    handleFileInputChange,
    handlePaste,
    handleConfirmPasteReplace,
    handleCancelPasteReplace,
    resetBorderStyleFields,
    handleFormSubmit,
    handleConfirmMoveToUnplaced,
    handleCancelMoveToUnplaced,
    resolvedBorderColor,
    resolvedBorderRadius,
    canShowPreview,
    slotAspectRatio,
    physicalWidthCm,
    physicalHeightCm,
    frameWidthPx,
    frameHeightPx,
    borderWidthPx,
    quality,
    canSave,
  } = useArtFormState({
    mode,
    binder,
    editingArt,
    initialValues,
    initialFile,
    checkPlacementConflict,
    onSubmit,
  });

  // Consumes `restore`/`editRestore` exactly once on mount: this modal has
  // already copied its file/values into its own local state above, so the
  // route context's own copy of the preview object URL is no longer
  // needed and can be revoked.
  const hasConsumedRestoreRef = useRef(false);
  useEffect(() => {
    if ((restore || editRestore) && !hasConsumedRestoreRef.current) {
      hasConsumedRestoreRef.current = true;
      onConsumeRestore();
    }
    // Deliberately runs once on mount only - `restore` is only ever read
    // at that moment, matching the ref guard above.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Escape closes the modal, first dismissing whichever nested
  // confirmation dialog (if any) is currently open instead; Tab/Shift+Tab
  // is delegated to the shared focus-trap hook so focus never escapes to
  // the page behind the backdrop.
  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === 'Escape') {
      event.stopPropagation();
      if (pendingPasteFile) {
        handleCancelPasteReplace();
        return;
      }
      if (pendingConflictValues) {
        handleCancelMoveToUnplaced();
        return;
      }
      onClose();
      return;
    }

    handleTabTrap(event);
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-8"
      onClick={onClose}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="create-art-modal-title"
        tabIndex={-1}
        onClick={(event) => event.stopPropagation()}
        onKeyDown={handleKeyDown}
        onPaste={handlePaste}
        className="flex h-full max-h-[44rem] w-full max-w-4xl flex-col gap-4 overflow-y-auto rounded-standard bg-surface p-6 shadow-modal"
      >
        <h2 id="create-art-modal-title" className="text-center">
          {mode === 'edit' ? 'Edit multi-slot art' : 'Add multi-slot art'}
        </h2>

        <form onSubmit={handleFormSubmit} className="flex flex-1 flex-col gap-6 md:flex-row">
          <ArtDetailsFields
            form={form}
            binder={binder}
            widthSlots={widthSlots}
            heightSlots={heightSlots}
            slotAspectRatio={slotAspectRatio}
            onSelectGridSize={handleSelectGridSize}
            borderColor={borderColor}
            onBorderColorChange={setBorderColor}
            borderRadius={borderRadius}
            onBorderRadiusChange={setBorderRadius}
            borderWidth={borderWidth}
            onBorderWidthChange={setBorderWidth}
            onResetBorderStyle={resetBorderStyleFields}
            file={file}
            mode={mode}
            onFileInputChange={handleFileInputChange}
            fileError={fileError}
          />

          <ArtPreviewColumn
            canShowPreview={canShowPreview}
            physicalWidthCm={physicalWidthCm}
            physicalHeightCm={physicalHeightCm}
            image={image}
            frameWidthPx={frameWidthPx}
            frameHeightPx={frameHeightPx}
            resolvedBorderRadius={resolvedBorderRadius}
            borderWidthPx={borderWidthPx}
            resolvedBorderColor={resolvedBorderColor}
            transform={transform}
            onTransformChange={setTransform}
            quality={quality}
            onClose={onClose}
            canSave={canSave}
          />
        </form>
      </div>

      {/* The nested paste-replace confirmation dialog (planning.md:
          "Pasting a supported image when one is already loaded opens a
          nested custom confirmation dialog ... only the top dialog is
          interactive and owns the focus trap"). A higher `z-[60]` stacking
          context plus its own backdrop keeps it visually and functionally
          above the art editor beneath it. */}
      {pendingPasteFile && (
        <PasteReplaceConfirmDialog
          onConfirm={handleConfirmPasteReplace}
          onCancel={handleCancelPasteReplace}
        />
      )}

      {/* Story 26's nested "Save and Move to Unplaced" confirmation,
          mirroring `PasteReplaceConfirmDialog`'s own minimal two-button
          dialog shell. */}
      {pendingConflictValues && (
        <PlacementConflictConfirmDialog
          onConfirm={handleConfirmMoveToUnplaced}
          onCancel={handleCancelMoveToUnplaced}
        />
      )}
    </div>
  );
}
