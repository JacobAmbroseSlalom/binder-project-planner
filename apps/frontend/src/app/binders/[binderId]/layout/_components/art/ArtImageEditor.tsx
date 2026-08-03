'use client';

import { RotateCcw, RotateCw } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Image as KonvaImage, Layer, Stage } from 'react-konva';
import type Konva from 'konva';

import {
  computeArtDisplayGeometry,
  type ArtTransform,
} from '@/shared/geometry/computeArtDisplayGeometry';

const MAX_SCALE_MULTIPLIER = 3;

// Re-exported so this module's existing consumers (e.g. CreateArtModal.tsx)
// keep importing the type from here - its canonical definition now lives in
// `@/shared/geometry/computeArtDisplayGeometry` alongside the pure geometry
// function itself (story 20 needed a second, non-Konva consumer for that
// function, so the shape it operates on moved with it).
export type { ArtTransform };

// A fresh, untransformed starting point: centered, unrotated, and scaled
// to exactly the cover-fit minimum (planning.md: "a newly selected image
// starts unrotated and centered with an aspect-ratio-preserving cover fit
// that scales it just enough to fill the selected frame").
export const DEFAULT_ART_TRANSFORM: ArtTransform = {
  imageRotationDegrees: 0,
  focalX: 0.5,
  focalY: 0.5,
  scaleX: 1,
  scaleY: 1,
};

interface ArtImageEditorProps {
  image: HTMLImageElement;
  // The border frame's outer pixel size (the frame's actual physical
  // proportions - width/height in cm - scaled up to a comfortable
  // on-screen size by the caller). The border itself is drawn *inside*
  // this component (see the canvas wrapper below) rather than by the
  // caller wrapping the whole editor, so that the border's clipping only
  // ever affects the canvas - not the rotate/scale controls rendered
  // below it.
  frameWidthPx: number;
  frameHeightPx: number;
  // The border style drawn around the canvas, resolved by the caller from
  // the art's own overrides/binder defaults.
  borderRadiusPercent: number;
  borderWidthPx: number;
  borderColor: string;
  transform: ArtTransform;
  onTransformChange: (transform: ArtTransform) => void;
  disabled?: boolean;
}

// The Konva-based image editor for the create-art modal (story 25):
// drag-to-reposition the focal point, rotate in 90-degree increments, and
// resize (uniformly, or stretched independently per axis). The transformed
// image is always constrained to fully cover the frame (no transparent
// gaps) by keeping both scale multipliers >= 1 on top of an automatically
// computed centered "cover" base fit - see the width/height math below,
// which mirrors `artImageQuality.ts`'s resolution formula but in preview
// pixels instead of physical inches.
export function ArtImageEditor({
  image,
  frameWidthPx,
  frameHeightPx,
  borderRadiusPercent,
  borderWidthPx,
  borderColor,
  transform,
  onTransformChange,
  disabled,
}: ArtImageEditorProps) {
  const imageNodeRef = useRef<Konva.Image>(null);

  const { imageRotationDegrees, scaleX, scaleY } = transform;

  // The canvas's own size, inset from the outer frame by the border width
  // on each side - all of the fit/rotate/focal/clamp math below operates
  // in these dimensions, matching what's actually visible inside the
  // border.
  const canvasWidthPx = frameWidthPx - 2 * borderWidthPx;
  const canvasHeightPx = frameHeightPx - 2 * borderWidthPx;

  // The shared fit/rotate/focal math (see computeArtDisplayGeometry.ts),
  // in preview-canvas pixels.
  const { localWidth, localHeight, centerX, centerY } = computeArtDisplayGeometry({
    naturalWidth: image.naturalWidth,
    naturalHeight: image.naturalHeight,
    frameWidthPx: canvasWidthPx,
    frameHeightPx: canvasHeightPx,
    transform,
  });

  // The displayed (rotated) bounding box's size - always axis-aligned
  // regardless of rotation, since rotation is constrained to exact
  // multiples of 90 degrees. Used only to clamp dragging so the image
  // keeps fully covering the frame.
  const rotated = imageRotationDegrees === 90 || imageRotationDegrees === 270;
  const displayedEffW = rotated ? localHeight : localWidth;
  const displayedEffH = rotated ? localWidth : localHeight;

  // Keeps the dragged image's bounding box fully covering the frame (no
  // transparent gaps) by clamping the center point so the box's edges
  // never move inside the frame's own edges.
  function clampPosition(pos: { x: number; y: number }) {
    const minX = canvasWidthPx - displayedEffW / 2;
    const maxX = displayedEffW / 2;
    const minY = canvasHeightPx - displayedEffH / 2;
    const maxY = displayedEffH / 2;
    return {
      x: Math.min(Math.max(pos.x, minX), maxX),
      y: Math.min(Math.max(pos.y, minY), maxY),
    };
  }

  function handleDragMove() {
    const node = imageNodeRef.current;
    if (!node) return;
    const { x, y } = node.position();
    const newFocalX = (canvasWidthPx / 2 + displayedEffW / 2 - x) / displayedEffW;
    const newFocalY = (canvasHeightPx / 2 + displayedEffH / 2 - y) / displayedEffH;
    onTransformChange({
      ...transform,
      focalX: Math.min(Math.max(newFocalX, 0), 1),
      focalY: Math.min(Math.max(newFocalY, 0), 1),
    });
  }

  function rotate(directionDegrees: 90 | -90) {
    const next = ((imageRotationDegrees + directionDegrees + 360) % 360) as 0 | 90 | 180 | 270;
    onTransformChange({ ...transform, imageRotationDegrees: next });
  }

  function handleUniformScaleChange(value: number) {
    onTransformChange({ ...transform, scaleX: value, scaleY: value });
  }

  return (
    <div className="flex flex-col items-center gap-3">
      <div className="flex items-start gap-4">
        {/* The border frame (planning.md: "the border frame remains fixed
            while the image can be repositioned within it") - sized and
            clipped at the outer frame size, but drawing the border
            *inside* that box (`boxSizing: 'border-box'`) so the Stage
            below still gets exactly `canvasWidthPx`/`canvasHeightPx`.
            Kept inside this component (rather than a wrapper the caller
            renders around the whole editor) so its `overflow: hidden`
            clipping never also cuts off the rotate/scale controls
            rendered beside it. */}
        <div
          style={{
            width: frameWidthPx,
            height: frameHeightPx,
            borderRadius: `${borderRadiusPercent}%`,
            border: `${borderWidthPx}px solid ${borderColor}`,
            boxSizing: 'border-box',
            overflow: 'hidden',
          }}
        >
          <Stage width={canvasWidthPx} height={canvasHeightPx}>
            <Layer>
              <KonvaImage
                ref={imageNodeRef}
                image={image}
                width={localWidth}
                height={localHeight}
                offsetX={localWidth / 2}
                offsetY={localHeight / 2}
                rotation={imageRotationDegrees}
                x={centerX}
                y={centerY}
                draggable={!disabled}
                dragBoundFunc={clampPosition}
                onDragMove={handleDragMove}
                onDragEnd={handleDragMove}
              />
            </Layer>
          </Stage>
        </div>

        {/* Rotate/scale controls, beside the canvas rather than below it
            so the frame's own height (which can be quite tall for a
            portrait-oriented art size) doesn't push them far down the
            modal. Fixed narrow width so it reads as a compact side panel
            regardless of the frame's own width. */}
        <div className="flex w-32 shrink-0 flex-col gap-4">
          <div className="flex items-center justify-center gap-2">
            <button
              type="button"
              disabled={disabled}
              onClick={() => rotate(-90)}
              aria-label="Rotate left"
              title="Rotate left"
              className="cursor-pointer rounded-full p-2 text-neutral-100 hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <RotateCcw className="size-5" />
            </button>
            <button
              type="button"
              disabled={disabled}
              onClick={() => rotate(90)}
              aria-label="Rotate right"
              title="Rotate right"
              className="cursor-pointer rounded-full p-2 text-neutral-100 hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <RotateCw className="size-5" />
            </button>
          </div>

          <div className="flex w-full flex-col gap-3">
            <label className="flex flex-col gap-1 text-caption text-neutral-500">
              Scale
              <input
                type="range"
                min={1}
                max={MAX_SCALE_MULTIPLIER}
                step={0.01}
                disabled={disabled}
                value={Math.max(scaleX, scaleY)}
                onChange={(event) => handleUniformScaleChange(Number(event.target.value))}
              />
            </label>
            <label className="flex flex-col gap-1 text-caption text-neutral-500">
              Stretch horizontal
              <input
                type="range"
                min={1}
                max={MAX_SCALE_MULTIPLIER}
                step={0.01}
                disabled={disabled}
                value={scaleX}
                onChange={(event) =>
                  onTransformChange({ ...transform, scaleX: Number(event.target.value) })
                }
              />
            </label>
            <label className="flex flex-col gap-1 text-caption text-neutral-500">
              Stretch vertical
              <input
                type="range"
                min={1}
                max={MAX_SCALE_MULTIPLIER}
                step={0.01}
                disabled={disabled}
                value={scaleY}
                onChange={(event) =>
                  onTransformChange({ ...transform, scaleY: Number(event.target.value) })
                }
              />
            </label>
          </div>
        </div>
      </div>
    </div>
  );
}

// Loads a `File` into an `HTMLImageElement` via an object URL, for use as
// both the Konva editor's source image and (via `naturalWidth`/
// `naturalHeight`) the quality-warning calculation's pixel dimensions.
// Revokes the object URL once the image has loaded (or the file changes/
// unmounts) - Konva only needs the decoded bitmap, not a live URL.
export function useImageFromFile(file: File | null): HTMLImageElement | null {
  // Bundles the loaded image together with the exact `file` it was loaded
  // for (rather than tracking them as two separate pieces of state, or
  // via a ref) - comparing `loaded.file` against the current `file` prop
  // below is a plain state/prop read during render, both of which are
  // fine; a `useRef` read during render is not (React Compiler's
  // `react-hooks/refs` rule), and calling `setImage(null)` synchronously
  // inside the effect purely to react to `file` becoming `null` would
  // trip `react-hooks/set-state-in-effect`. This lets the effect below
  // stay a one-way "start loading when `file` changes" subscription,
  // while a stale previous file's image (or a still-loading new one) is
  // filtered out here instead.
  const [loaded, setLoaded] = useState<{ file: File; image: HTMLImageElement } | null>(null);

  useEffect(() => {
    if (!file) return;

    const objectUrl = URL.createObjectURL(file);
    const nextImage = new window.Image();
    nextImage.onload = () => setLoaded({ file, image: nextImage });
    nextImage.src = objectUrl;

    return () => {
      URL.revokeObjectURL(objectUrl);
    };
  }, [file]);

  return loaded && loaded.file === file ? loaded.image : null;
}

// Loads an already-hosted image URL (story 26: editing existing art whose
// image hasn't been replaced yet) into an `HTMLImageElement`, mirroring
// `useImageFromFile` above but for a real URL rather than a `File` needing
// an object URL - no object URL to revoke here since nothing was created.
export function useImageFromUrl(url: string | null): HTMLImageElement | null {
  const [loaded, setLoaded] = useState<{ url: string; image: HTMLImageElement } | null>(null);

  useEffect(() => {
    if (!url) return;

    const nextImage = new window.Image();
    nextImage.onload = () => setLoaded({ url, image: nextImage });
    nextImage.src = url;
  }, [url]);

  return loaded && loaded.url === url ? loaded.image : null;
}
