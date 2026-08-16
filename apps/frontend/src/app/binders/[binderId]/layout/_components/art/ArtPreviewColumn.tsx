'use client';

import { MIN_ART_PRINT_RESOLUTION_PPI } from '@binder-project-planner/shared';

import { ArtImageEditor, type ArtTransform } from './ArtImageEditor';
import type { computeArtImageQuality } from '../../_lib/art/artImageQuality';

// Displayed in the quality warning below.
const MIN_PPI_LABEL = MIN_ART_PRINT_RESOLUTION_PPI;

// `CreateArtModal`'s right-column live preview (stories 24, 25): the
// editable Konva-based art preview inside its fixed border frame, the
// physical-size caption, the nonblocking image-quality warning, and the
// Cancel/Save footer buttons. Extracted from `CreateArtModal` since this
// is a large, purely presentational block driven entirely by props
// (mostly `useArtFormState`'s return value) rather than owning any state
// of its own.
export function ArtPreviewColumn({
  canShowPreview,
  physicalWidthCm,
  physicalHeightCm,
  image,
  frameWidthPx,
  frameHeightPx,
  resolvedBorderRadius,
  borderWidthPx,
  resolvedBorderColor,
  transform,
  onTransformChange,
  quality,
  onClose,
  canSave,
}: {
  canShowPreview: boolean;
  physicalWidthCm: number | null;
  physicalHeightCm: number | null;
  image: HTMLImageElement | null;
  frameWidthPx: number;
  frameHeightPx: number;
  resolvedBorderRadius: number;
  borderWidthPx: number;
  resolvedBorderColor: string;
  transform: ArtTransform;
  onTransformChange: (transform: ArtTransform) => void;
  quality: ReturnType<typeof computeArtImageQuality> | null;
  onClose: () => void;
  canSave: boolean;
}) {
  return (
    <div className="flex flex-1 flex-col items-center gap-3">
      {canShowPreview && image && physicalWidthCm !== null && physicalHeightCm !== null ? (
        <>
          <ArtImageEditor
            image={image}
            frameWidthPx={frameWidthPx}
            frameHeightPx={frameHeightPx}
            borderRadiusPercent={resolvedBorderRadius}
            borderWidthPx={borderWidthPx}
            borderColor={resolvedBorderColor}
            transform={transform}
            onTransformChange={onTransformChange}
          />
          <p className="text-caption text-neutral-500">
            {physicalWidthCm.toFixed(2)} cm × {physicalHeightCm.toFixed(2)} cm
          </p>
          {quality && !quality.meetsMinimumResolution && (
            <p role="alert" className="text-caption text-warning">
              This image may appear blurry or pixelated when printed. Available resolution is
              approximately {Math.round(quality.effectivePpiX)}×{Math.round(quality.effectivePpiY)}{' '}
              PPI; at least {MIN_PPI_LABEL} PPI (about {quality.requiredPixelWidth}×
              {quality.requiredPixelHeight} pixels) is recommended for this size.
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
  );
}
