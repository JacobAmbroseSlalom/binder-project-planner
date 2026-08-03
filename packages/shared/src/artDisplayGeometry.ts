// One rotation/focal/scale transform, matching `art`'s stored columns
// one-to-one (story 25's ten-thousandths-integer columns are just this
// shape's storage encoding - see schema.ts/art.ts). Framework-free so both
// apps can import it: the frontend's Konva-based `ArtImageEditor`, its
// plain-CSS consumers (`ArtTile`, and the home-page preview's
// `PreviewArtTile`), and, since story 29, the backend's PDF exporter all
// need this exact shape.
export interface ArtTransform {
  imageRotationDegrees: 0 | 90 | 180 | 270;
  focalX: number;
  focalY: number;
  scaleX: number;
  scaleY: number;
}

export interface ArtDisplayGeometryInput {
  naturalWidth: number;
  naturalHeight: number;
  frameWidthPx: number;
  frameHeightPx: number;
  transform: ArtTransform;
}

export interface ArtDisplayGeometry {
  // The rendered image element's own (pre-rotation) width/height, in the
  // same pixel units as `frameWidthPx`/`frameHeightPx`.
  localWidth: number;
  localHeight: number;
  // The image's rotation center, in frame-relative pixels - both the Konva
  // editor and the plain-CSS unplaced-art tile position their image node
  // by this center point plus a `rotate()` around it, rather than a
  // top-left corner, since that's what stays fixed as rotation changes.
  centerX: number;
  centerY: number;
}

// The shared geometry math behind story 25's "editor, layout, preview, and
// print renderers derive transformed image geometry from the same
// rotation, focal-point, and scale-multiplier contract" requirement.
// `ArtImageEditor.tsx` (Konva, while editing), `ArtTile.tsx` (plain CSS,
// full layout), the home-page preview's `PreviewArtTile.tsx` (story 20,
// plain CSS, read-only miniature), and the backend's binder-PDF exporter
// (story 29) all call this rather than each reimplementing the
// fit/rotate/focal math independently. Originally colocated with the
// frontend (`apps/frontend/src/shared/geometry/computeArtDisplayGeometry.ts`,
// which now just re-exports from here); moved to the shared package once
// the backend needed the identical math for print output.
export function computeArtDisplayGeometry({
  naturalWidth,
  naturalHeight,
  frameWidthPx,
  frameHeightPx,
  transform,
}: ArtDisplayGeometryInput): ArtDisplayGeometry {
  const { imageRotationDegrees, focalX, focalY, scaleX, scaleY } = transform;
  const rotated = imageRotationDegrees === 90 || imageRotationDegrees === 270;

  // The image's natural dimensions, oriented for the *rotated* bounding
  // box (used only for the cover-fit scale and displayed-size math below).
  const effW = rotated ? naturalHeight : naturalWidth;
  const effH = rotated ? naturalWidth : naturalHeight;

  // The centered-cover-fit base scale: the larger of the two per-axis
  // ratios, so both frame axes are always fully covered before the
  // configured scale multipliers are applied.
  const baseScale = Math.max(frameWidthPx / effW, frameHeightPx / effH);

  // The rotated bounding box's on-screen size - always axis-aligned
  // regardless of rotation, since rotation is constrained to exact
  // multiples of 90 degrees.
  const displayedEffW = effW * baseScale * scaleX;
  const displayedEffH = effH * baseScale * scaleY;

  // The rendered element's own local (pre-rotation) size - swapped from
  // the displayed bounding box when rotated, since rotating a `w`-by-`h`
  // rectangle 90/270 degrees produces an `h`-by-`w` bounding box.
  const localWidth = rotated ? displayedEffH : displayedEffW;
  const localHeight = rotated ? displayedEffW : displayedEffH;

  // The bounding box's center, derived from the normalized focal point
  // (0-1): `focalX`/`focalY` name the point *within the displayed image*
  // that should sit at the frame's center.
  const centerX = frameWidthPx / 2 + displayedEffW / 2 - focalX * displayedEffW;
  const centerY = frameHeightPx / 2 + displayedEffH / 2 - focalY * displayedEffH;

  return { localWidth, localHeight, centerX, centerY };
}
