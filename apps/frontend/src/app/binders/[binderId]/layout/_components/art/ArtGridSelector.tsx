'use client';

import { useState } from 'react';

interface ArtGridSelectorProps {
  binderWidth: number;
  binderHeight: number;
  // The binder's own one-slot width/height ratio (`BinderLayoutView`'s
  // `slotAspectRatio`: `(widthPerSlot + widthBase) / (heightPerSlot +
  // heightBase)`), so each grid cell button reads as the same card shape
  // as the actual binder slots/cards instead of a plain square.
  slotAspectRatio: number;
  widthSlots: number | null;
  heightSlots: number | null;
  onSelect: (widthSlots: number, heightSlots: number) => void;
  disabled?: boolean;
}

// The height (in pixels) of one grid cell button, including its 1px gap -
// the cell's width is then derived from `slotAspectRatio` (see
// `cellWidthPx` below) so the button shape itself matches a real card's
// proportions. Kept small and fixed so binders with many slots still
// render as a compact selector rather than growing unboundedly.
const CELL_HEIGHT_PX = 30;

// Story 25's multi-slot-art size picker: an `binderWidth`-by-`binderHeight`
// grid mirroring the binder's own slot grid, used to choose the new art
// item's `widthSlots`/`heightSlots` (art always starts unplaced - see
// planning.md - so this grid is purely a size picker, not a placement
// picker). Hovering cell (row, column) highlights every cell from the
// top-left corner through that cell (planning.md's "hover-highlight
// rectangle anchored at the grid's top-left corner"), previewing the
// N-wide-by-M-tall footprint a click there would select. No dimension
// label is shown until a selection is actually made (or currently
// hovered) - the grid itself carries the meaning.
export function ArtGridSelector({
  binderWidth,
  binderHeight,
  slotAspectRatio,
  widthSlots,
  heightSlots,
  onSelect,
  disabled,
}: ArtGridSelectorProps) {
  // The cell currently under the pointer, or `null` when the pointer isn't
  // over the grid - drives the live hover-preview rectangle. Falls back to
  // the current selection (if any) once the pointer leaves, so the
  // selected footprint stays visibly highlighted rather than reverting to
  // nothing.
  const [hovered, setHovered] = useState<{ row: number; column: number } | null>(null);

  const highlighted =
    hovered ??
    (widthSlots !== null && heightSlots !== null
      ? { row: heightSlots - 1, column: widthSlots - 1 }
      : null);

  const displayWidth = highlighted ? highlighted.column + 1 : null;
  const displayHeight = highlighted ? highlighted.row + 1 : null;

  // The cell's own width, derived from the fixed height above and the
  // binder's card ratio, rounded to a whole pixel (CSS grid track sizes
  // don't support fractional-pixel `aspect-ratio` the way a single
  // flexible box does - see `BinderSlot`'s own `style={{ aspectRatio }}`
  // - so each track's px size is computed up front instead).
  const cellWidthPx = Math.round(CELL_HEIGHT_PX * slotAspectRatio);

  return (
    <div className="flex flex-col items-center gap-2">
      <div
        role="grid"
        aria-label="Art size, in binder slots"
        onMouseLeave={() => setHovered(null)}
        className="inline-grid gap-[1px]"
        style={{
          gridTemplateColumns: `repeat(${binderWidth}, ${cellWidthPx}px)`,
          gridTemplateRows: `repeat(${binderHeight}, ${CELL_HEIGHT_PX}px)`,
        }}
      >
        {Array.from({ length: binderHeight }, (_, row) =>
          Array.from({ length: binderWidth }, (_, column) => {
            const isHighlighted =
              highlighted !== null && row <= highlighted.row && column <= highlighted.column;
            return (
              <button
                key={`${row}-${column}`}
                type="button"
                role="gridcell"
                disabled={disabled}
                aria-label={`${column + 1} wide by ${row + 1} tall`}
                onMouseEnter={() => setHovered({ row, column })}
                onFocus={() => setHovered({ row, column })}
                onClick={() => onSelect(column + 1, row + 1)}
                className={`border border-neutral-700 ${
                  isHighlighted ? 'bg-primary' : 'bg-neutral-800'
                } ${disabled ? 'cursor-not-allowed' : 'cursor-pointer'}`}
              />
            );
          }),
        )}
      </div>
      {/* Always rendered (rather than only while hovered/selected) so it
          reserves its own line height up front - conditionally rendering
          this element only once hovered made the grid's own height grow
          on first hover, shifting the rest of the form down. `invisible`
          hides it without collapsing its box when there's nothing to
          show yet. */}
      <p className={`text-caption text-neutral-500 ${highlighted === null ? 'invisible' : ''}`}>
        {displayWidth ?? 0} wide × {displayHeight ?? 0} tall
      </p>
    </div>
  );
}
