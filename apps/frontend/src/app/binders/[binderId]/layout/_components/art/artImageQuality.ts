import { MIN_ART_PRINT_RESOLUTION_PPI } from '@binder-project-planner/shared';

const CM_PER_INCH = 2.54;

// Story 25's nonblocking image-quality warning math: computes the
// effective horizontal/vertical print resolution (pixels per inch) an
// uploaded image achieves at its currently configured slot dimensions and
// transform, independent of any preview-canvas rendering size.
//
// The image is displayed using a centered "cover" fit (scaled up just
// enough, uniformly, so both frame axes are fully covered) plus
// independent horizontal/vertical scale multipliers (each >= 1, since the
// editor constrains the transformed image to always cover the frame - see
// ArtImageEditor.tsx). Under a uniform cover-fit scale `S` (inches of
// output per source image pixel) and multiplier `scaleX`/`scaleY`, the
// displayed size along an axis is `sourcePixels * S * multiplier` inches,
// so the achieved resolution along that axis is
// `sourcePixels / (sourcePixels * S * multiplier)` = `1 / (S * multiplier)`
// pixels per inch - independent of the source pixel count itself once `S`
// is fixed.
export interface ArtImageQualityInput {
  // The image's correctly-oriented pixel dimensions (i.e. already
  // reflecting `imageRotationDegrees` - the caller swaps width/height
  // itself for a 90/270-degree rotation before calling this function).
  effectivePixelWidth: number;
  effectivePixelHeight: number;
  physicalWidthCm: number;
  physicalHeightCm: number;
  scaleX: number;
  scaleY: number;
}

export interface ArtImageQualityResult {
  effectivePpiX: number;
  effectivePpiY: number;
  // The minimum source pixel dimensions that would exactly meet
  // `MIN_ART_PRINT_RESOLUTION_PPI` at the configured physical size and
  // current scale multipliers - shown in the quality warning.
  requiredPixelWidth: number;
  requiredPixelHeight: number;
  meetsMinimumResolution: boolean;
}

export function computeArtImageQuality({
  effectivePixelWidth,
  effectivePixelHeight,
  physicalWidthCm,
  physicalHeightCm,
  scaleX,
  scaleY,
}: ArtImageQualityInput): ArtImageQualityResult {
  const physicalWidthIn = physicalWidthCm / CM_PER_INCH;
  const physicalHeightIn = physicalHeightCm / CM_PER_INCH;

  // The centered-cover-fit base scale (inches of output per source image
  // pixel): the larger of the two per-axis ratios, so both axes are fully
  // covered - the smaller axis exactly fits, the larger overflows and is
  // cropped.
  const coverScale = Math.max(
    physicalWidthIn / effectivePixelWidth,
    physicalHeightIn / effectivePixelHeight,
  );

  const effectivePpiX = 1 / (coverScale * scaleX);
  const effectivePpiY = 1 / (coverScale * scaleY);

  const requiredPixelWidth = Math.ceil(physicalWidthIn * MIN_ART_PRINT_RESOLUTION_PPI);
  const requiredPixelHeight = Math.ceil(physicalHeightIn * MIN_ART_PRINT_RESOLUTION_PPI);

  return {
    effectivePpiX,
    effectivePpiY,
    requiredPixelWidth,
    requiredPixelHeight,
    meetsMinimumResolution:
      effectivePpiX >= MIN_ART_PRINT_RESOLUTION_PPI &&
      effectivePpiY >= MIN_ART_PRINT_RESOLUTION_PPI,
  };
}
