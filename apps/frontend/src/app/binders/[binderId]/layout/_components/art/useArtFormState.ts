'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useState, type ChangeEvent, type ClipboardEvent } from 'react';
import { useForm } from 'react-hook-form';

import { resolveArtImageUrl, type Art, type Binder } from '@/lib/api';

import type { ArtFormValues } from '../../../BinderRouteContext';
import {
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

// The preview/editor frame's larger on-screen dimension, in pixels - the
// physical `widthSlots`/`heightSlots` aspect ratio is scaled up to fit
// within this box (see `frameWidthPx`/`frameHeightPx` below).
const PREVIEW_MAX_SIZE_PX = 320;

// Owns `CreateArtModal`'s size/title/description/image/border-style form
// state and its size-preview/quality-warning derivations (stories 24, 25,
// 26): the RHF form instance itself, the grid-size selection, the pasted/
// chosen file and its loaded image, the three border-style override
// fields, the nested paste-replace and placement-conflict confirmation
// state, and the Save submission handlers. Extracted from `CreateArtModal`
// since this is a large, cohesive concern independent of the dialog shell
// (focus trap/keyboard handling) and its own JSX layout.
export function useArtFormState({
  mode,
  binder,
  editingArt,
  initialValues,
  initialFile,
  checkPlacementConflict,
  onSubmit,
}: {
  mode: 'create' | 'edit';
  binder: Binder;
  editingArt?: Art;
  initialValues: ArtFormValues | null;
  initialFile: File | null;
  checkPlacementConflict?: (widthSlots: number, heightSlots: number) => boolean;
  onSubmit: (values: ArtFormValues, file: File | null, moveToUnplacedOnConflict?: boolean) => void;
}) {
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

  function handleFileInputChange(event: ChangeEvent<HTMLInputElement>) {
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
  function handlePaste(event: ClipboardEvent<HTMLDivElement>) {
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
  }

  function handleCancelPasteReplace() {
    setPendingPasteFile(null);
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

  return {
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
    resolvedBorderWidth,
    canShowPreview,
    slotAspectRatio,
    physicalWidthCm,
    physicalHeightCm,
    frameWidthPx,
    frameHeightPx,
    borderWidthPx,
    quality,
    canSave,
  };
}
