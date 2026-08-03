'use client';

import { useState } from 'react';

import { resolveArtImageUrl, type BinderPreviewArt, type BinderSummary } from '@/lib/api';
import { computeArtDisplayGeometry } from '@/shared/geometry/computeArtDisplayGeometry';
import { useElementSize } from '@/shared/hooks/useElementSize';

// One placed multi-slot art item within the home-page binder preview
// (story 20). Renders the same rotation/focal/scale transform and border
// styling as the full layout's `ArtTile`/`PlacedArtTile`, but noninteractive
// - no drag handles, hover actions, or edit/duplicate/remove controls -
// and driven entirely by the minimal `BinderPreviewArt` shape rather than
// the complete `Art` row (see planning.md's "Embedded preview data
// contains only spread identity, placed card and multi-slot-art geometry,
// display metadata, and image URLs").
export function PreviewArtTile({
  art,
  binder,
}: {
  art: BinderPreviewArt;
  // Only the binder-level style fields this tile needs to resolve art's
  // nullable per-item overrides against, plus the dimension fields needed
  // for its own physical aspect ratio - not the complete `BinderSummary`.
  binder: Pick<
    BinderSummary,
    | 'widthPerSlot'
    | 'widthBase'
    | 'heightPerSlot'
    | 'heightBase'
    | 'borderColor'
    | 'borderRadius'
    | 'borderWidth'
  >;
}) {
  const [containerRef, { width, height }] = useElementSize<HTMLDivElement>();
  const [naturalSize, setNaturalSize] = useState<{ width: number; height: number } | null>(null);
  // Story 20's "a failed card or multi-slot-art image preserves its
  // occupied preview geometry and renders a neutral missing-image
  // placeholder" - tracked locally rather than relying on the `<img>`
  // staying broken, so the placeholder can reuse this tile's own
  // border/geometry chrome instead of the browser's default broken-image
  // icon.
  const [imageFailed, setImageFailed] = useState(false);

  const physicalWidthCm = art.widthSlots * binder.widthPerSlot + binder.widthBase;
  const physicalHeightCm = art.heightSlots * binder.heightPerSlot + binder.heightBase;
  const aspectRatio = physicalWidthCm / physicalHeightCm;

  const resolvedBorderColor = art.borderColor ?? binder.borderColor;
  const resolvedBorderRadius = art.borderRadius ?? binder.borderRadius;
  const resolvedBorderWidth = art.borderWidth ?? binder.borderWidth;
  // Same cm-to-px scale factor derivation as `ArtTile` (see its own
  // comment): `width` is this tile's own rendered pixel width, so dividing
  // by its physical cm width recovers the scale physically proportional
  // border thickness needs.
  const pxPerCm = width > 0 ? width / physicalWidthCm : 0;
  const borderWidthPx = resolvedBorderWidth * pxPerCm;

  // Capped by the SHORTER of the tile's two dimensions (rather than
  // computed independently against each axis) so corners stay circular
  // instead of stretching into an extreme, lopsided-looking ellipse on a
  // tall/narrow or short/wide frame - matching `ArtTile.tsx`'s own
  // treatment.
  const outerRadiusPx = (resolvedBorderRadius / 100) * Math.min(width, height);
  const innerRadiusPx = Math.max(0, outerRadiusPx - borderWidthPx);

  const geometry =
    naturalSize && width > 0 && height > 0
      ? computeArtDisplayGeometry({
          naturalWidth: naturalSize.width,
          naturalHeight: naturalSize.height,
          frameWidthPx: width - 2 * borderWidthPx,
          frameHeightPx: height - 2 * borderWidthPx,
          transform: {
            imageRotationDegrees: art.imageRotationDegrees as 0 | 90 | 180 | 270,
            focalX: art.focalX,
            focalY: art.focalY,
            scaleX: art.scaleX,
            scaleY: art.scaleY,
          },
        })
      : null;

  return (
    <div ref={containerRef} className="relative h-full w-full" style={{ aspectRatio }}>
      <div
        className="relative h-full w-full"
        style={{
          // An explicit pixel value (not a plain `${resolvedBorderRadius}%`)
          // because CSS always resolves a percentage `border-radius`
          // per-axis (horizontal against width, vertical against height)
          // even for a single shorthand value - which would silently
          // reintroduce the lopsided ellipse `outerRadiusPx` above exists
          // to avoid.
          borderRadius: `${outerRadiusPx}px`,
          border: `${borderWidthPx}px solid ${resolvedBorderColor}`,
          boxSizing: 'border-box',
          overflow: 'hidden',
        }}
      >
        {imageFailed ? (
          // Neutral missing-image placeholder, keeping this item's
          // occupied footprint/border chrome intact rather than
          // collapsing or blanking the whole preview.
          <div className="h-full w-full bg-neutral-800" />
        ) : (
          <div
            className="absolute inset-0 overflow-hidden"
            style={{ borderRadius: `${innerRadiusPx}px` }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element -- the
                art image comes from the backend's own arbitrary-origin
                `/art/{artId}/image` endpoint, so next/image's
                fixed-domain optimization doesn't apply here; its rendered
                position/size is also driven by inline transform math
                rather than `object-fit`. */}
            <img
              src={resolveArtImageUrl(art.imageUrl)}
              alt="" // Story 20's previews omit descriptive metadata (title/description isn't even sent); decorative here, matching the full layout's read-only tiles.
              draggable={false}
              onLoad={(event) => {
                const imgElement = event.currentTarget;
                setNaturalSize({
                  width: imgElement.naturalWidth,
                  height: imgElement.naturalHeight,
                });
              }}
              onError={() => setImageFailed(true)}
              className={geometry ? 'absolute' : 'absolute inset-0 h-full w-full object-cover'}
              style={
                geometry
                  ? {
                      maxWidth: 'none',
                      maxHeight: 'none',
                      width: geometry.localWidth,
                      height: geometry.localHeight,
                      left: geometry.centerX - geometry.localWidth / 2,
                      top: geometry.centerY - geometry.localHeight / 2,
                      transformOrigin: 'center center',
                      transform: `rotate(${art.imageRotationDegrees}deg)`,
                    }
                  : undefined
              }
            />
          </div>
        )}
      </div>
    </div>
  );
}
