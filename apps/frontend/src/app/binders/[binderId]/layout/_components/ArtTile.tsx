'use client';

import { useState } from 'react';

import { resolveArtImageUrl, type Art, type Binder } from '@/lib/api';

import { computeArtDisplayGeometry } from './computeArtDisplayGeometry';
import { useElementSize } from './useElementSize';

// One art item's read-only tile, rendered in the unplaced-art section
// (story 25). Unlike `CardTile`, this has no dnd-kit wiring at all - art
// always starts unplaced in story 25, and placement/dragging is story
// 26's scope (see planning.md's "Placement and other interactions for
// multi-slot art on the binder layout will be defined in the next
// story"). Reproduces the same rotation/focal/scale transform and border
// styling the create-art modal's editor previewed, per planning.md's
// "Outside the editor, the art renders with the saved positioning,
// scaling, rotation, aspect-ratio adjustments, and border settings."
export function ArtTile({
  art,
  binder,
  isPendingCreate,
  widthPx,
}: {
  art: Art;
  binder: Binder;
  // True while this art's own optimistic create request is still in
  // flight (story 25) - disables it visually, mirroring
  // `UnplacedCard`'s `isPendingCreate` treatment.
  isPendingCreate: boolean;
  // The tile's rendered width in pixels, computed by `UnplacedArtPanel` so
  // every art tile is sized proportionally to the unplaced cards grid's
  // own column width (a shared physical cm-to-px scale derived from one
  // slot's width) rather than always stretching to the full panel width.
  // Omitted (story 26) when this tile is placed on the binder layout -
  // its size then comes entirely from the CSS Grid area `PlacedArtTile`
  // spans it across, and this component just fills that area instead of
  // forcing its own fixed size/aspect ratio.
  widthPx?: number;
}) {
  const [containerRef, { width, height }] = useElementSize<HTMLDivElement>();
  const [naturalSize, setNaturalSize] = useState<{ width: number; height: number } | null>(null);

  // The art's own physical aspect ratio (story 25: "an aspect ratio
  // derived from its configured physical dimensions"), independent of any
  // single fixed slot ratio - unlike cards, art can span multiple slots
  // with its own width/height.
  const physicalWidthCm = art.widthSlots * binder.widthPerSlot + binder.widthBase;
  const physicalHeightCm = art.heightSlots * binder.heightPerSlot + binder.heightBase;
  const aspectRatio = physicalWidthCm / physicalHeightCm;

  const resolvedBorderColor = art.borderColor ?? binder.borderColor;
  const resolvedBorderRadius = art.borderRadius ?? binder.borderRadius;
  const resolvedBorderWidth = art.borderWidth ?? binder.borderWidth;
  // Border width is a physical centimeters measurement (not a percentage
  // like border radius, and not a fixed pixel count either) - it's
  // converted to rendered pixels using the tile's own cm-to-px scale
  // factor (`width` is `physicalWidthCm` scaled to the tile's rendered
  // size, so dividing one by the other recovers that same scale), so the
  // rendered thickness stays physically proportional to the art's actual
  // size instead of drifting from it. `width` comes from the outer,
  // unbordered wrapper (see `useElementSize`'s comment above), so it's the
  // tile's true full (border-box-equivalent) size and this scale factor
  // matches the one the create-art modal's fixed-size preview uses.
  const pxPerCm = width > 0 ? width / physicalWidthCm : 0;
  const borderWidthPx = resolvedBorderWidth * pxPerCm;

  // The image's own rounded clip needs an explicitly-computed inner
  // radius (rather than relying on the outer div's `overflow: hidden` to
  // auto-round it) because that automatic padding-box radius reduction
  // isn't reliably applied by every browser to an absolutely-positioned,
  // CSS-transformed child like the `<img>` below - without this, the
  // image's corner is clipped to the *outer* (unreduced) radius, leaving
  // a visible sharp seam where it meets the border's true (correctly
  // reduced) inner curve. `width`/`height` are already the tile's full
  // outer size (see above), matching what CSS's `%` radius on the
  // bordered div is relative to; the standard reduction formula (outer
  // radius minus border thickness, clamped to zero) then gives the
  // matching inner curve, in pixels since the inner box's dimensions
  // differ from the outer box's.
  const outerRadiusXPx = (resolvedBorderRadius / 100) * width;
  const outerRadiusYPx = (resolvedBorderRadius / 100) * height;
  const innerRadiusXPx = Math.max(0, outerRadiusXPx - borderWidthPx);
  const innerRadiusYPx = Math.max(0, outerRadiusYPx - borderWidthPx);

  const geometry =
    naturalSize && width > 0 && height > 0
      ? computeArtDisplayGeometry({
          naturalWidth: naturalSize.width,
          naturalHeight: naturalSize.height,
          frameWidthPx: width - 2 * borderWidthPx,
          frameHeightPx: height - 2 * borderWidthPx,
          transform: {
            imageRotationDegrees: art.imageRotationDegrees,
            focalX: art.focalX,
            focalY: art.focalY,
            scaleX: art.scaleX,
            scaleY: art.scaleY,
          },
        })
      : null;

  return (
    <div
      ref={containerRef}
      // `widthPx` set (unplaced-panel usage): a fixed-size, `shrink-0`
      // tile with its own physical `aspectRatio` forced, so it renders at
      // a consistent thumbnail size regardless of its parent's layout.
      // `widthPx` omitted (placed-on-layout usage, story 26): fills
      // `PlacedArtTile`'s own already-correctly-sized CSS Grid area
      // instead - forcing this art's own physical aspect ratio there
      // would fight the grid's own (slot-count-derived) sizing, and
      // `PlacedArtTile`'s grid span already reflects this art's
      // `widthSlots`/`heightSlots` footprint.
      className={`relative ${widthPx !== undefined ? 'shrink-0' : 'h-full w-full'} ${isPendingCreate ? 'opacity-50' : ''}`}
      style={widthPx !== undefined ? { width: widthPx, aspectRatio } : undefined}
    >
      <div
        className="relative h-full w-full"
        style={{
          borderRadius: `${resolvedBorderRadius}%`,
          border: `${borderWidthPx}px solid ${resolvedBorderColor}`,
          boxSizing: 'border-box',
          overflow: 'hidden',
        }}
      >
        <div
          // Insets `0` (not `borderWidthPx`) on every side: this wrapper's
          // containing block (for its own absolute positioning) is the
          // bordered ancestor's *padding box*, which - since that ancestor
          // has a border but no padding - is already inset by
          // `borderWidthPx` from its outer edge. Offsetting by
          // `borderWidthPx` again here would double that inset, leaving a
          // gap between the image and the border exactly `borderWidthPx`
          // wide on every side.
          className="absolute inset-0 overflow-hidden"
          style={{
            borderRadius: `${innerRadiusXPx}px / ${innerRadiusYPx}px`,
          }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element -- the art
              image comes from the backend's own arbitrary-origin
              `/art/{artId}/image` endpoint, so next/image's fixed-domain
              optimization doesn't apply here; its rendered position/size
              is also driven by inline transform math rather than
              `object-fit`, which next/image doesn't support overriding.
              Always rendered (rather than only once `geometry` is ready)
              so its own `onLoad` can populate `naturalSize` in the first
              place; before that first load, it falls back to a plain
              `object-fit: cover` fill instead of the precise transform. */}
          <img
            src={resolveArtImageUrl(art.imageUrl)}
            alt={art.title}
            draggable={false}
            onLoad={(event) => {
              const imgElement = event.currentTarget;
              setNaturalSize({
                width: imgElement.naturalWidth,
                height: imgElement.naturalHeight,
              });
            }}
            className={geometry ? 'absolute' : 'absolute inset-0 h-full w-full object-cover'}
            style={
              geometry
                ? {
                    // Tailwind's Preflight reset applies `max-width: 100%;
                    // height: auto` to every `<img>`, which clamps a
                    // deliberately-oversized cover-fit crop back down to
                    // fit inside the frame - shrinking it and leaving a
                    // gap around it instead of the intended overflowing
                    // cover fit (Konva's canvas-based editor preview isn't
                    // subject to this since it isn't a real `<img>`
                    // element). Explicitly overriding both here restores
                    // the exact pixel size `computeArtDisplayGeometry`
                    // calculated.
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
      </div>
    </div>
  );
}
