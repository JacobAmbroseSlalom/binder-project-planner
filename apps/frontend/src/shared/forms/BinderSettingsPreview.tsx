'use client';

import { useMemo, useState } from 'react';

import {
  BINDER_DIMENSION_MAX,
  BINDER_SETTINGS_PREVIEW_ART_SLOT_SPAN,
  DEFAULT_BINDER_HEIGHT,
  DEFAULT_BINDER_WIDTH,
  DEFAULT_BORDER_COLOR,
  DEFAULT_BORDER_RADIUS_PERCENT,
  DEFAULT_BORDER_WIDTH_CM,
  DEFAULT_HEIGHT_BASE_CM,
  DEFAULT_HEIGHT_PER_SLOT_CM,
  DEFAULT_WIDTH_BASE_CM,
  DEFAULT_WIDTH_PER_SLOT_CM,
} from '@binder-project-planner/shared';
import type { UseFormReturn } from 'react-hook-form';

import { useElementSize } from '@/shared/hooks/useElementSize';

import type { BinderDetailsFormInput, BinderDetailsFormValues } from './binderDetailsSchema';

// The reusable binder-details form's live, read-only previews (story 42).
// Two separate previews are rendered by `BinderDetailsForm` itself so both
// the new-binder page and the "Edit Details" tab get them automatically:
//
// 1. `BinderSettingsLayoutPreview` - a representative left+right binder
//    spread of empty slots, shown below the width/height fields, sized from
//    the form's current width/height and dimension values.
// 2. `BinderSettingsArtPreview` - an example multi-slot-art border outline,
//    shown below the border-style fields, rendered from the form's current
//    border color/radius/width (and dimension values, for its aspect
//    ratio).
//
// Both are computed entirely from the form's current React Hook Form
// values; they make no backend request and aren't part of any saved binder
// data. They reuse the same CSS Grid + container-query "contain, don't
// crop" sizing technique as the full "Edit Layout" tab's `BinderSide`
// (story 8) and the home-page preview's `PreviewSide` (story 20), plus the
// same border-frame math as `ArtTile` (story 25/26), but with placeholder
// content and no interactivity - `PreviewSide`/`PreviewArtTile` (story 20)
// already established this "reimplement the visual, drop the interactivity"
// pattern for an analogous read-only preview.

interface BinderSettingsPreviewValues {
  width: number;
  height: number;
  widthPerSlot: number;
  widthBase: number;
  heightPerSlot: number;
  heightBase: number;
  borderColor: string;
  borderRadius: number;
  borderWidth: number;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

// Width/height validity mirrors `binderDetailsSchema`'s own `width`/`height`
// bounds (a whole number from 1 through `BINDER_DIMENSION_MAX`) - an
// out-of-range or non-integer value is treated the same as blank/invalid
// input for preview purposes.
function isValidDimensionCount(value: unknown): value is number {
  return (
    isFiniteNumber(value) && Number.isInteger(value) && value >= 1 && value <= BINDER_DIMENSION_MAX
  );
}

function isValidHexColor(value: unknown): value is string {
  return typeof value === 'string' && /^#[0-9A-Fa-f]{6}$/.test(value);
}

function isValidPercentage(value: unknown): value is number {
  return isFiniteNumber(value) && value >= 0 && value <= 100;
}

function isValidNonNegativeNumber(value: unknown): value is number {
  return isFiniteNumber(value) && value >= 0;
}

// The canonical shared defaults, used as the initial value before the
// form's own values have produced any valid input, per story 42's "the
// preview only uses the canonical defaults.ts values as its very first
// render, before the form's own default values are applied."
const INITIAL_PREVIEW_VALUES: BinderSettingsPreviewValues = {
  width: DEFAULT_BINDER_WIDTH,
  height: DEFAULT_BINDER_HEIGHT,
  widthPerSlot: DEFAULT_WIDTH_PER_SLOT_CM,
  widthBase: DEFAULT_WIDTH_BASE_CM,
  heightPerSlot: DEFAULT_HEIGHT_PER_SLOT_CM,
  heightBase: DEFAULT_HEIGHT_BASE_CM,
  borderColor: DEFAULT_BORDER_COLOR,
  borderRadius: DEFAULT_BORDER_RADIUS_PERCENT,
  borderWidth: DEFAULT_BORDER_WIDTH_CM,
};

// Tracks the most recently valid parsed value for each preview-relevant
// field, per story 42's "while a field's current input is blank or fails
// validation, the preview uses that field's last valid parsed value rather
// than clearing or erroring." Shared by both previews so a single edit
// keeps both in sync.
function useBinderSettingsPreviewValues(
  form: UseFormReturn<BinderDetailsFormInput, unknown, BinderDetailsFormValues>,
): BinderSettingsPreviewValues {
  const width = form.watch('width');
  const height = form.watch('height');
  const widthPerSlot = form.watch('widthPerSlot');
  const widthBase = form.watch('widthBase');
  const heightPerSlot = form.watch('heightPerSlot');
  const heightBase = form.watch('heightBase');
  const borderColor = form.watch('borderColor');
  const borderRadius = form.watch('borderRadius');
  const borderWidth = form.watch('borderWidth');

  // Seeded from the canonical shared defaults so the very first render
  // (before the form's own values yield anything valid) still has valid
  // values to show. Updated only when a field's current input is valid.
  const [lastValid, setLastValid] = useState<BinderSettingsPreviewValues>(INITIAL_PREVIEW_VALUES);

  // Derives the effective preview values purely from the current watched
  // values and the last-valid fallback: a valid field uses its live value
  // immediately (no debounce), an invalid one falls back to the last valid
  // value. Computed in render (not an effect) so a valid edit is reflected
  // on the same render it occurs.
  const effective = useMemo<BinderSettingsPreviewValues>(() => {
    const dimensionsValid =
      isFiniteNumber(widthPerSlot) &&
      widthPerSlot > 0 &&
      isFiniteNumber(widthBase) &&
      widthPerSlot + widthBase > 0;
    const heightsValid =
      isFiniteNumber(heightPerSlot) &&
      heightPerSlot > 0 &&
      isFiniteNumber(heightBase) &&
      heightPerSlot + heightBase > 0;

    return {
      width: isValidDimensionCount(width) ? width : lastValid.width,
      height: isValidDimensionCount(height) ? height : lastValid.height,
      // Per-slot and base are tracked as a pair since their validity is
      // interdependent (story 24's one-slot-formula-must-stay-positive
      // cross-field rule); a non-positive combined size would produce a
      // broken (zero/negative/NaN) aspect ratio.
      widthPerSlot: dimensionsValid ? widthPerSlot : lastValid.widthPerSlot,
      widthBase: dimensionsValid ? widthBase : lastValid.widthBase,
      heightPerSlot: heightsValid ? heightPerSlot : lastValid.heightPerSlot,
      heightBase: heightsValid ? heightBase : lastValid.heightBase,
      borderColor: isValidHexColor(borderColor) ? borderColor : lastValid.borderColor,
      borderRadius: isValidPercentage(borderRadius) ? borderRadius : lastValid.borderRadius,
      borderWidth: isValidNonNegativeNumber(borderWidth) ? borderWidth : lastValid.borderWidth,
    };
  }, [
    width,
    height,
    widthPerSlot,
    widthBase,
    heightPerSlot,
    heightBase,
    borderColor,
    borderRadius,
    borderWidth,
    lastValid,
  ]);

  // Persists the effective values as the new last-valid fallback so that,
  // once a field goes invalid, the preview keeps showing the value it last
  // held. This is React's endorsed "adjust state while rendering" pattern
  // (https://react.dev/learn/you-might-not-need-an-effect) rather than an
  // effect: the guard makes it converge in one extra render (only when a
  // valid edit actually changed a value), and it avoids both the
  // ref-access-during-render and setState-in-effect pitfalls.
  const isStale = (Object.keys(effective) as (keyof BinderSettingsPreviewValues)[]).some(
    (key) => lastValid[key] !== effective[key],
  );
  if (isStale) {
    setLastValid(effective);
  }

  return effective;
}

// One binder side's slot grid within the layout-spread preview: the same
// CSS Grid + container-query sizing technique as `BinderSide`/`PreviewSide`,
// with plain placeholder empty slots (no "+" click affordance, hover
// actions, or dnd-kit registration). The blue `bg-surface` lives on this
// grid alone (not the outer frame), so - matching the full "Edit Layout"
// tab - the surface hugs only the slots rather than the whole preview.
function BinderSettingsPreviewSide({
  side,
  values,
  slotAspectRatio,
  spinePosition,
}: {
  side: 'left' | 'right';
  values: BinderSettingsPreviewValues;
  slotAspectRatio: number;
  // Which edge sits at the spread's spine, matching `PreviewSide`: the two
  // sides are pushed flush against their shared spine so only the frame's
  // gap separates them, with the extra whitespace on the outer edges.
  spinePosition: 'left' | 'right';
}) {
  const { width, height } = values;

  // The grid's overall width-to-height ratio, mirroring `BinderSide`'s own
  // `--slot-ratio` derivation so `.binder-side-grid`'s width-capping
  // `min()` formula produces the identical contained shape at this size.
  const slotRatio = (width / height) * slotAspectRatio;

  const gridMargin: React.CSSProperties =
    spinePosition === 'left'
      ? { marginLeft: 'auto', marginRight: 0 }
      : { marginLeft: 0, marginRight: 'auto' };

  const slotCells = useMemo(() => {
    const cells: { row: number; column: number }[] = [];
    for (let row = 1; row <= height; row++) {
      for (let column = 1; column <= width; column++) {
        cells.push({ row, column });
      }
    }
    return cells;
  }, [width, height]);

  return (
    <div className="settings-preview-side-fit flex min-w-0 flex-1 items-center justify-center">
      <div
        className="binder-side-grid"
        style={{ '--slot-ratio': slotRatio, ...gridMargin } as React.CSSProperties}
      >
        <div
          role="img"
          aria-label={`Binder layout preview, ${side} page`}
          className="grid gap-1 rounded-standard bg-surface p-2 shadow-panel"
          style={{
            gridTemplateColumns: `repeat(${width}, 1fr)`,
            gridTemplateRows: `repeat(${height}, auto)`,
          }}
        >
          {slotCells.map(({ row, column }) => (
            <div
              key={`${row}-${column}`}
              aria-hidden="true"
              className="rounded-standard border border-neutral-700 bg-neutral-800"
              style={{ aspectRatio: slotAspectRatio, gridRow: row, gridColumn: column }}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

// The stable, fixed on-screen frame the layout-spread preview renders
// within (story 42: "stable on-screen dimensions ... independent of the
// home-page preview frame's dimensions"). Landscape so both pages of the
// spread fit side by side. No `bg-surface` here - that lives on each
// side's slot grid instead, so the blue only surrounds the slots.
const LAYOUT_FRAME_CLASS_NAME = 'h-64 w-full';

// The example art frame's fixed height; its width derives from the art's
// own physical aspect ratio so the outline's shape tracks the dimension
// fields.
const ART_FRAME_HEIGHT_CLASS_NAME = 'h-40';

// The live layout-spread preview: a representative intermediate spread
// (both a left and a right page) of empty slots, sized from the form's
// current width/height and dimension values. Rendered below the
// width/height fields.
export function BinderSettingsLayoutPreview({
  form,
}: {
  form: UseFormReturn<BinderDetailsFormInput, unknown, BinderDetailsFormValues>;
}) {
  const values = useBinderSettingsPreviewValues(form);

  // The binder's own single-slot width-to-height ratio (story 24), matching
  // `BinderLayoutView`/`BinderPreview`'s identical derivation.
  const slotAspectRatio =
    (values.widthPerSlot + values.widthBase) / (values.heightPerSlot + values.heightBase);

  return (
    <div className="flex flex-col gap-2">
      <span className="text-caption text-neutral-500">Layout preview</span>
      <div className={`flex ${LAYOUT_FRAME_CLASS_NAME} items-center justify-center gap-1`}>
        <BinderSettingsPreviewSide
          side="left"
          values={values}
          slotAspectRatio={slotAspectRatio}
          spinePosition="left"
        />
        <BinderSettingsPreviewSide
          side="right"
          values={values}
          slotAspectRatio={slotAspectRatio}
          spinePosition="right"
        />
      </div>
    </div>
  );
}

// The live example art-outline preview: just the multi-slot-art border
// frame (transparent interior, no image or fill) at the representative
// art's physical aspect ratio, using the same border-frame math as
// `ArtTile` (story 25/26). Rendered below the border-style fields.
export function BinderSettingsArtPreview({
  form,
}: {
  form: UseFormReturn<BinderDetailsFormInput, unknown, BinderDetailsFormValues>;
}) {
  const values = useBinderSettingsPreviewValues(form);
  const [containerRef, { width, height }] = useElementSize<HTMLDivElement>();

  const artWidthSlots = Math.min(BINDER_SETTINGS_PREVIEW_ART_SLOT_SPAN, values.width);
  const artHeightSlots = Math.min(BINDER_SETTINGS_PREVIEW_ART_SLOT_SPAN, values.height);

  const physicalWidthCm = artWidthSlots * values.widthPerSlot + values.widthBase;
  const physicalHeightCm = artHeightSlots * values.heightPerSlot + values.heightBase;
  const aspectRatio = physicalWidthCm / physicalHeightCm;

  // Same cm-to-px derivation as `ArtTile`: `width` is the frame's own
  // rendered pixel width, so dividing by its physical cm width recovers the
  // scale the physically-proportional border thickness needs.
  const pxPerCm = width > 0 ? width / physicalWidthCm : 0;
  const borderWidthPx = values.borderWidth * pxPerCm;

  // Capped by the shorter dimension, matching `ArtTile`, so corners stay
  // circular instead of stretching into a lopsided ellipse.
  const outerRadiusPx = (values.borderRadius / 100) * Math.min(width, height);

  return (
    <div className="flex flex-col gap-2">
      <span className="text-caption text-neutral-500">Art border preview</span>
      <div className={`flex ${ART_FRAME_HEIGHT_CLASS_NAME} items-center justify-center`}>
        {/* Outer wrapper carries the art's physical aspect ratio at a
            fixed height; the bordered box fills it and `useElementSize`
            measures it for the cm-to-px border-width scale. */}
        <div ref={containerRef} className="h-full" style={{ aspectRatio }}>
          <div
            role="img"
            aria-label="Example multi-slot art border with the current settings"
            className="h-full w-full"
            style={{
              // Explicit pixel radius (not a `%`) so CSS doesn't resolve it
              // per-axis into a lopsided ellipse - matching `ArtTile`.
              borderRadius: `${outerRadiusPx}px`,
              border: `${borderWidthPx}px solid ${values.borderColor}`,
              boxSizing: 'border-box',
              // Transparent interior: the preview shows only the border
              // outline, not any placeholder artwork.
              backgroundColor: 'transparent',
            }}
          />
        </div>
      </div>
    </div>
  );
}
