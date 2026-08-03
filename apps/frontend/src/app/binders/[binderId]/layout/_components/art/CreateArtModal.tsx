'use client';

import { MIN_ART_PRINT_RESOLUTION_PPI } from '@binder-project-planner/shared';
import { zodResolver } from '@hookform/resolvers/zod';
import { RotateCcw } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useForm } from 'react-hook-form';

import { resolveArtImageUrl, type Art, type Binder } from '@/lib/api';

import type { ArtCreateRestore, ArtEditRestore, ArtFormValues } from '../../../BinderRouteContext';
import { ArtGridSelector } from './ArtGridSelector';
import {
  ArtImageEditor,
  DEFAULT_ART_TRANSFORM,
  useImageFromFile,
  useImageFromUrl,
  type ArtTransform,
} from './ArtImageEditor';
import { computeArtImageQuality } from './artImageQuality';
import {
  artDetailsSchema,
  defaultArtDetailsFormValues,
  type ArtDetailsFormValues,
} from './artSchema';

// Mirrors `CardSelectionModal.tsx`'s manual focus-trap selector
// (styling.instructions.md requires fully custom-built dialogs).
const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

const inputClassName =
  'rounded-standard border border-transparent bg-neutral-800 px-3 py-2 placeholder:text-neutral-500 focus:border-primary focus:outline-none';
const errorInputClassName = `${inputClassName} border-error bg-error/10 ring-2 ring-error`;

// The preview/editor frame's larger on-screen dimension, in pixels - the
// physical `widthSlots`/`heightSlots` aspect ratio is scaled up to fit
// within this box (see `frameWidthPx`/`frameHeightPx` below).
const PREVIEW_MAX_SIZE_PX = 320;

// Displayed in the quality warning below.
const MIN_PPI_LABEL = MIN_ART_PRINT_RESOLUTION_PPI;

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
// `CardSelectionModal.tsx`'s dialog-shell conventions (manual focus trap,
// Escape-to-close, an outer `onPaste` handler). The same component and
// markup serve both modes (planning.md: "Selecting edit opens the same
// modal used to add multi-slot art") - only the initial pre-fill source,
// title text, Save behavior, and the edit-only conflict dialog differ.
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
  const previouslyFocusedElementRef = useRef<Element | null>(null);

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

  const form = useForm<ArtDetailsFormValues>({
    resolver: zodResolver(artDetailsSchema),
    defaultValues: initialValues
      ? { title: initialValues.title, description: initialValues.description ?? '' }
      : defaultArtDetailsFormValues,
  });

  const [widthSlots, setWidthSlots] = useState<number | null>(initialValues?.widthSlots ?? null);
  const [heightSlots, setHeightSlots] = useState<number | null>(initialValues?.heightSlots ?? null);
  const [file, setFile] = useState<File | null>(initialFile);
  const [fileError, setFileError] = useState<string | undefined>(undefined);
  const [transform, setTransform] = useState<ArtTransform>(
    initialValues
      ? {
          imageRotationDegrees: initialValues.imageRotationDegrees,
          focalX: initialValues.focalX,
          focalY: initialValues.focalY,
          scaleX: initialValues.scaleX,
          scaleY: initialValues.scaleY,
        }
      : DEFAULT_ART_TRANSFORM,
  );

  // The three border-style fields (story 24/25): each starts prefilled
  // with the binder's own current setting (rather than behind a separate
  // "use binder setting"/"custom" toggle) and is directly editable. Their
  // value is only submitted as a custom per-art override if it no longer
  // matches the binder's setting - see `handleFormSubmit` below - so an
  // untouched field still inherits the binder's setting dynamically, the
  // same as before.
  const [borderColor, setBorderColor] = useState(initialValues?.borderColor ?? binder.borderColor);
  const [borderRadius, setBorderRadius] = useState(
    initialValues?.borderRadius ?? binder.borderRadius,
  );
  const [borderWidth, setBorderWidth] = useState(initialValues?.borderWidth ?? binder.borderWidth);

  // A pasted image that's awaiting the nested replace-confirmation dialog
  // (only used when a file is already loaded - see `handlePaste` below).
  const [pendingPasteFile, setPendingPasteFile] = useState<File | null>(null);

  // Story 26's nested "Save and Move to Unplaced" confirmation (edit mode
  // only): holds the fully-built submission values while the dialog is
  // open, `null` otherwise. Set by `handleFormSubmit` instead of
  // submitting immediately when `checkPlacementConflict` predicts the
  // new dimensions would no longer fit the art's current placement.
  const [pendingConflictValues, setPendingConflictValues] = useState<ArtFormValues | null>(null);

  const fileImage = useImageFromFile(file);
  // Falls back to the art's own already-hosted image only in edit mode,
  // and only while no replacement file has been chosen yet - the moment a
  // new file is selected, `file` (and therefore `fileImage`) takes over
  // per the `??` below.
  const existingImageUrl =
    mode === 'edit' && !file && editingArt ? resolveArtImageUrl(editingArt.imageUrl) : null;
  const existingImage = useImageFromUrl(existingImageUrl);
  const image = fileImage ?? existingImage;

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

  // The standard modal-mount focus lifecycle (mirrors
  // `CardSelectionModal.tsx`): capture whatever had focus before the modal
  // opened, move focus into the dialog, and restore it on unmount.
  useEffect(() => {
    previouslyFocusedElementRef.current = document.activeElement;
    dialogRef.current?.focus();
    return () => {
      if (previouslyFocusedElementRef.current instanceof HTMLElement) {
        previouslyFocusedElementRef.current.focus();
      }
    };
  }, []);

  function handleKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    if (event.key === 'Escape') {
      event.stopPropagation();
      if (pendingPasteFile) {
        setPendingPasteFile(null);
        return;
      }
      if (pendingConflictValues) {
        setPendingConflictValues(null);
        return;
      }
      onClose();
      return;
    }

    if (event.key !== 'Tab') return;

    const container = dialogRef.current;
    if (!container) return;

    const focusable = Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR));
    if (focusable.length === 0) return;

    const first = focusable[0];
    const last = focusable[focusable.length - 1];

    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  // Selecting a new grid size discards manual image transforms and resets
  // rotation to a centered cover fit (planning.md: "Changing the selected
  // slot width or height discards manual image transforms").
  function handleSelectGridSize(nextWidthSlots: number, nextHeightSlots: number) {
    setWidthSlots(nextWidthSlots);
    setHeightSlots(nextHeightSlots);
    setTransform(DEFAULT_ART_TRANSFORM);
  }

  function applyNewFile(nextFile: File) {
    setFile(nextFile);
    setFileError(undefined);
    setTransform(DEFAULT_ART_TRANSFORM);

    // Autofill the title from the file name (minus its extension) when the
    // title field is still blank, so users don't have to retype an obvious
    // name for every upload/paste - but never overwrite a title they've
    // already entered.
    if (!form.getValues('title').trim()) {
      const nameWithoutExtension = nextFile.name.replace(/\.[^./]+$/, '').trim();
      if (nameWithoutExtension) form.setValue('title', nameWithoutExtension);
    }
  }

  function handleFileInputChange(event: React.ChangeEvent<HTMLInputElement>) {
    const nextFile = event.target.files?.[0];
    if (nextFile) applyNewFile(nextFile);
    // Clears the input's own value so selecting the exact same file again
    // still fires a change event.
    event.target.value = '';
  }

  // Pasting a supported image (planning.md: "does not intercept paste when
  // focus is in the title or description control"). When no image is
  // loaded yet, the pasted image is used immediately; when one is already
  // loaded, a nested confirmation dialog gates replacing it.
  function handlePaste(event: React.ClipboardEvent<HTMLDivElement>) {
    const activeElement = document.activeElement;
    if (activeElement instanceof HTMLInputElement || activeElement instanceof HTMLTextAreaElement) {
      return;
    }

    const items = event.clipboardData?.items;
    if (!items) return;

    for (const item of items) {
      if (item.kind !== 'file' || !item.type.startsWith('image/')) continue;
      const pastedFile = item.getAsFile();
      if (!pastedFile) continue;
      event.preventDefault();
      if (file) {
        setPendingPasteFile(pastedFile);
      } else {
        applyNewFile(pastedFile);
      }
      return;
    }
  }

  function handleConfirmPasteReplace() {
    if (pendingPasteFile) applyNewFile(pendingPasteFile);
    setPendingPasteFile(null);
    dialogRef.current?.focus();
  }

  function handleCancelPasteReplace() {
    setPendingPasteFile(null);
    dialogRef.current?.focus();
  }

  // The live preview always reflects whatever the three fields currently
  // hold (already defaulted to the binder's setting above), so no further
  // binder-setting fallback is needed here.
  const resolvedBorderColor = borderColor;
  const resolvedBorderRadius = borderRadius;
  const resolvedBorderWidth = borderWidth;

  const canShowPreview = widthSlots !== null && heightSlots !== null && image !== null;

  // The binder's own one-slot width/height ratio (mirrors
  // `BinderLayoutView`'s `slotAspectRatio`), used so `ArtGridSelector`'s
  // grid cells read as the same card shape as the actual binder
  // slots/cards instead of plain squares.
  const slotAspectRatio =
    (binder.widthPerSlot + binder.widthBase) / (binder.heightPerSlot + binder.heightBase);

  const physicalWidthCm =
    widthSlots !== null ? widthSlots * binder.widthPerSlot + binder.widthBase : null;
  const physicalHeightCm =
    heightSlots !== null ? heightSlots * binder.heightPerSlot + binder.heightBase : null;

  let frameWidthPx = 0;
  let frameHeightPx = 0;
  if (physicalWidthCm !== null && physicalHeightCm !== null) {
    const aspect = physicalWidthCm / physicalHeightCm;
    frameWidthPx = PREVIEW_MAX_SIZE_PX;
    frameHeightPx = PREVIEW_MAX_SIZE_PX / aspect;
    if (frameHeightPx > PREVIEW_MAX_SIZE_PX) {
      frameHeightPx = PREVIEW_MAX_SIZE_PX;
      frameWidthPx = PREVIEW_MAX_SIZE_PX * aspect;
    }
  }

  // Border width is a physical centimeters measurement (not a percentage
  // like border radius, and not a fixed pixel count either) - it's
  // converted to preview pixels using the frame's own cm-to-px scale
  // factor (`frameWidthPx` is `physicalWidthCm` scaled to fit the preview
  // box, so dividing one by the other recovers that same scale), so the
  // rendered thickness stays physically proportional to the art's actual
  // size instead of drifting from it.
  const pxPerCm =
    physicalWidthCm !== null && physicalWidthCm > 0 ? frameWidthPx / physicalWidthCm : 0;
  const borderWidthPx = resolvedBorderWidth * pxPerCm;

  const quality =
    canShowPreview && physicalWidthCm !== null && physicalHeightCm !== null
      ? computeArtImageQuality({
          effectivePixelWidth:
            transform.imageRotationDegrees === 90 || transform.imageRotationDegrees === 270
              ? image.naturalHeight
              : image.naturalWidth,
          effectivePixelHeight:
            transform.imageRotationDegrees === 90 || transform.imageRotationDegrees === 270
              ? image.naturalWidth
              : image.naturalHeight,
          physicalWidthCm,
          physicalHeightCm,
          scaleX: transform.scaleX,
          scaleY: transform.scaleY,
        })
      : null;

  // In create mode a file is mandatory; in edit mode the existing image
  // stays in place unless a replacement is chosen, so no file is required.
  const canSave = widthSlots !== null && heightSlots !== null && (mode === 'edit' || file !== null);

  const handleFormSubmit = form.handleSubmit((formValues) => {
    if (widthSlots === null || heightSlots === null) return;
    if (mode === 'create' && !file) {
      setFileError('An image is required.');
      return;
    }

    const values: ArtFormValues = {
      title: formValues.title,
      description: formValues.description.trim() || null,
      widthSlots,
      heightSlots,
      imageRotationDegrees: transform.imageRotationDegrees,
      focalX: transform.focalX,
      focalY: transform.focalY,
      scaleX: transform.scaleX,
      scaleY: transform.scaleY,
      // Only sent as a custom override when it no longer matches the
      // binder's own setting - an untouched field submits `null`, so it
      // keeps dynamically inheriting the binder's setting (planning.md's
      // null-means-inherit-at-render-time semantics) exactly as the old
      // explicit toggle did.
      borderColor: borderColor === binder.borderColor ? null : borderColor,
      borderRadius: borderRadius === binder.borderRadius ? null : borderRadius,
      borderWidth: borderWidth === binder.borderWidth ? null : borderWidth,
    };

    // Story 26: only in edit mode, and only when the new dimensions would
    // leave the art's own current placement out of bounds or overlapping
    // another item, defer to the nested confirmation dialog instead of
    // submitting immediately.
    if (mode === 'edit' && checkPlacementConflict?.(widthSlots, heightSlots)) {
      setPendingConflictValues(values);
      return;
    }

    onSubmit(values, file, false);
  });

  // Confirms the nested "Save and Move to Unplaced" dialog (story 26):
  // submits the already-built values with the conflict explicitly
  // acknowledged, so the backend clears the art's placement in the same
  // update instead of rejecting it.
  function handleConfirmMoveToUnplaced() {
    if (pendingConflictValues) onSubmit(pendingConflictValues, file, true);
    setPendingConflictValues(null);
  }

  function handleCancelMoveToUnplaced() {
    setPendingConflictValues(null);
  }

  // Resets all three border-style fields back to the binder's current
  // settings (rather than the shared app defaults - unlike
  // `BinderDetailsForm`'s reset button, this form doesn't have its own
  // "default" to fall back to; the binder's setting *is* the relevant
  // baseline here).
  function resetBorderStyleFields() {
    setBorderColor(binder.borderColor);
    setBorderRadius(binder.borderRadius);
    setBorderWidth(binder.borderWidth);
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
          {/* Left column: size, title/description, image upload, border
              overrides. */}
          <div className="flex flex-1 flex-col gap-4">
            <div className="flex flex-col gap-1">
              <span className="text-caption text-neutral-500">Art size (slots)</span>
              <ArtGridSelector
                binderWidth={binder.width}
                binderHeight={binder.height}
                slotAspectRatio={slotAspectRatio}
                widthSlots={widthSlots}
                heightSlots={heightSlots}
                onSelect={handleSelectGridSize}
              />
            </div>

            <div className="flex flex-col gap-1">
              <label htmlFor="art-title" className="text-caption text-neutral-500">
                Title
              </label>
              <input
                id="art-title"
                type="text"
                className={form.formState.errors.title ? errorInputClassName : inputClassName}
                {...form.register('title')}
              />
              {form.formState.errors.title && (
                <p role="alert" className="text-caption text-error">
                  {form.formState.errors.title.message}
                </p>
              )}
            </div>

            <div className="flex flex-col gap-1">
              <label htmlFor="art-description" className="text-caption text-neutral-500">
                Description
              </label>
              <textarea
                id="art-description"
                rows={3}
                className={form.formState.errors.description ? errorInputClassName : inputClassName}
                {...form.register('description')}
              />
              {form.formState.errors.description && (
                <p role="alert" className="text-caption text-error">
                  {form.formState.errors.description.message}
                </p>
              )}
            </div>

            {/* Border-style overrides (story 24/25): all three fields on
                one row, each prefilled with the binder's own current
                setting and directly editable (no separate "use binder
                setting"/"custom" toggle) - see `resetBorderStyleFields`
                for the reset button. */}
            <div className="flex flex-col gap-1">
              <span className="text-caption text-neutral-500">Border style</span>
              <div className="flex flex-wrap items-end gap-3">
                <label className="flex flex-1 flex-col gap-1">
                  <span className="text-caption text-neutral-500">Color</span>
                  <div className="flex items-center gap-2">
                    <input
                      type="color"
                      aria-label="Border color swatch"
                      value={/^#[0-9A-Fa-f]{6}$/.test(borderColor) ? borderColor : '#000000'}
                      onChange={(event) => setBorderColor(event.target.value.toUpperCase())}
                      className="h-10 w-10 shrink-0 cursor-pointer rounded-standard border border-transparent bg-neutral-800"
                    />
                    <input
                      type="text"
                      aria-label="Border color hex value"
                      value={borderColor}
                      onChange={(event) => setBorderColor(event.target.value.toUpperCase())}
                      className={`${inputClassName} w-full`}
                    />
                  </div>
                </label>
                <label className="flex flex-1 flex-col gap-1">
                  <span className="text-caption text-neutral-500">Radius (%)</span>
                  <input
                    type="number"
                    min={0}
                    max={100}
                    step={0.01}
                    value={borderRadius}
                    onChange={(event) => setBorderRadius(Number(event.target.value))}
                    className={`${inputClassName} w-full`}
                  />
                </label>
                <label className="flex flex-1 flex-col gap-1">
                  <span className="text-caption text-neutral-500">Width (cm)</span>
                  <input
                    type="number"
                    min={0}
                    step={0.01}
                    value={borderWidth}
                    onChange={(event) => setBorderWidth(Number(event.target.value))}
                    className={`${inputClassName} w-full`}
                  />
                </label>
                <button
                  type="button"
                  onClick={resetBorderStyleFields}
                  title="Reset to binder settings"
                  aria-label="Reset border style fields to binder settings"
                  className="flex h-10 shrink-0 cursor-pointer items-center text-neutral-500 hover:text-primary"
                >
                  <RotateCcw className="size-6" />
                </button>
              </div>
            </div>

            <div className="flex flex-col gap-1">
              <span className="text-caption text-neutral-500">Image</span>
              {/* The native `<input type="file">` element's own "No file
                  chosen"/filename text is driven entirely by its internal
                  file list, not React state - it never reflects a pasted
                  image (which sets `file` state directly, bypassing the
                  input), and even for a manually chosen file it reverts to
                  "No file chosen" as soon as `handleFileInputChange` clears
                  `event.target.value` (needed so re-choosing the exact same
                  file still fires a change event). A visually hidden input
                  triggered by its own `<label>`, plus a filename driven by
                  `file` state below, keeps this display correct regardless
                  of how the file arrived. */}
              <div className="flex items-center gap-2">
                <label
                  htmlFor="art-image-file"
                  className="cursor-pointer rounded-standard bg-neutral-800 px-3 py-2 text-caption hover:brightness-110"
                >
                  Choose File
                </label>
                <input
                  id="art-image-file"
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  onChange={handleFileInputChange}
                  className="sr-only"
                />
                <span className="text-caption text-neutral-500">
                  {file
                    ? file.name
                    : mode === 'edit'
                      ? 'Using the current image'
                      : 'No file chosen'}
                </span>
              </div>
              <p className="text-caption text-neutral-500">
                Or paste an image (Cmd/Ctrl+V) while this modal is focused.
              </p>
              {fileError && (
                <p role="alert" className="text-caption text-error">
                  {fileError}
                </p>
              )}
            </div>
          </div>

          {/* Right column: the live editable preview inside its fixed
              border frame, plus the nonblocking quality warning. */}
          <div className="flex flex-1 flex-col items-center gap-3">
            {canShowPreview && physicalWidthCm !== null && physicalHeightCm !== null ? (
              <>
                <ArtImageEditor
                  image={image}
                  frameWidthPx={frameWidthPx}
                  frameHeightPx={frameHeightPx}
                  borderRadiusPercent={resolvedBorderRadius}
                  borderWidthPx={borderWidthPx}
                  borderColor={resolvedBorderColor}
                  transform={transform}
                  onTransformChange={setTransform}
                />
                <p className="text-caption text-neutral-500">
                  {physicalWidthCm.toFixed(2)} cm × {physicalHeightCm.toFixed(2)} cm
                </p>
                {quality && !quality.meetsMinimumResolution && (
                  <p role="alert" className="text-caption text-warning">
                    This image may appear blurry or pixelated when printed. Available resolution is
                    approximately {Math.round(quality.effectivePpiX)}×
                    {Math.round(quality.effectivePpiY)} PPI; at least {MIN_PPI_LABEL} PPI (about{' '}
                    {quality.requiredPixelWidth}×{quality.requiredPixelHeight} pixels) is
                    recommended for this size.
                  </p>
                )}
              </>
            ) : (
              <div className="flex h-full min-h-[16rem] w-full items-center justify-center rounded-standard border border-dashed border-neutral-700 text-center text-caption text-neutral-500">
                Select an art size and upload or paste an image to preview it here.
              </div>
            )}

            <div className="mt-auto flex w-full justify-end gap-3">
              <button
                type="button"
                onClick={onClose}
                className="cursor-pointer rounded-standard px-4 py-2 text-neutral-100 hover:brightness-110"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={!canSave}
                className="cursor-pointer rounded-standard bg-primary px-4 py-2 text-neutral-100 hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Save
              </button>
            </div>
          </div>
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

// The nested "the new size no longer fits" confirmation dialog (story 26,
// planning.md: "If an edit changes placed art so its current footprint
// would be out of bounds or overlap another item, Save opens a nested
// confirmation dialog offering Cancel or Save and Move to Unplaced").
// Mirrors `PasteReplaceConfirmDialog`'s own minimal focus handling.
function PlacementConflictConfirmDialog({
  onConfirm,
  onCancel,
}: {
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const confirmButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    confirmButtonRef.current?.focus();
  }, []);

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-8"
      onClick={onCancel}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="placement-conflict-dialog-title"
        onClick={(event) => event.stopPropagation()}
        className="flex w-full max-w-sm flex-col gap-4 rounded-standard bg-surface p-6 shadow-modal"
      >
        <h3 id="placement-conflict-dialog-title">Move this art to unplaced art?</h3>
        <p className="text-caption text-neutral-500">
          These changes no longer fit this art&apos;s current position on the binder layout. Saving
          will move it to the unplaced art section instead.
        </p>
        <div className="flex justify-end gap-3">
          <button
            type="button"
            onClick={onCancel}
            className="cursor-pointer rounded-standard px-4 py-2 text-neutral-100 hover:brightness-110"
          >
            Cancel
          </button>
          <button
            ref={confirmButtonRef}
            type="button"
            onClick={onConfirm}
            className="cursor-pointer rounded-standard bg-primary px-4 py-2 text-neutral-100 hover:brightness-110"
          >
            Save and Move to Unplaced
          </button>
        </div>
      </div>
    </div>
  );
}

// The nested "replace the loaded image?" confirmation dialog (planning.md:
// paste-confirmation requirement above). Deliberately minimal compared to
// the main dialog's focus trap - it only ever contains two buttons, so
// Tab naturally cycles between them without needing manual wraparound
// logic; Escape still cancels via the parent's own `onKeyDown` (this
// dialog renders inside the same outer backdrop click-catcher).
function PasteReplaceConfirmDialog({
  onConfirm,
  onCancel,
}: {
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const confirmButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    confirmButtonRef.current?.focus();
  }, []);

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-8"
      onClick={onCancel}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="paste-replace-dialog-title"
        onClick={(event) => event.stopPropagation()}
        className="flex w-full max-w-sm flex-col gap-4 rounded-standard bg-surface p-6 shadow-modal"
      >
        <h3 id="paste-replace-dialog-title">Replace the current image?</h3>
        <p className="text-caption text-neutral-500">
          Pasting will replace the currently loaded image and reset its rotation and position to a
          centered fit.
        </p>
        <div className="flex justify-end gap-3">
          <button
            type="button"
            onClick={onCancel}
            className="cursor-pointer rounded-standard px-4 py-2 text-neutral-100 hover:brightness-110"
          >
            Cancel
          </button>
          <button
            ref={confirmButtonRef}
            type="button"
            onClick={onConfirm}
            className="cursor-pointer rounded-standard bg-primary px-4 py-2 text-neutral-100 hover:brightness-110"
          >
            Replace
          </button>
        </div>
      </div>
    </div>
  );
}
