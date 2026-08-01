import { SLOT_HEIGHT_CM, SLOT_WIDTH_CM } from '@binder-project-planner/shared';
import { Plus } from 'lucide-react';

import { getMichiGapColumns } from '../michiIndicators';

// One binder side's slot grid (story 8): a CSS Grid with `width` columns
// and `height` rows. Sized to fit the available spread area without
// overflowing or scrolling in either dimension - see the
// `.binder-side-fit`/`.binder-side-grid` rules in globals.css for the
// width-capping half of that, and each slot's own `aspect-ratio` below for
// the height-deriving half - while every slot preserves the physical
// 6.35:9 card-slot ratio.
export function BinderSide({
  side,
  width,
  height,
  michiIndicatorsVisible = false,
}: {
  side: 'left' | 'right';
  width: number;
  height: number;
  // Story 10's toggle: when true, a strip above the slot grid shows a
  // Michi indicator above every gap between paired columns whose slot
  // openings face each other (see `michiIndicators.ts`). Defaults to off,
  // matching the toggle's default state.
  michiIndicatorsVisible?: boolean;
}) {
  // The grid's overall width-to-height ratio (not just one slot's), used by
  // `.binder-side-grid`'s `min()` width formula in globals.css so the
  // complete grid fits both the available width and height.
  const slotRatio = (width * SLOT_WIDTH_CM) / (height * SLOT_HEIGHT_CM);

  const gapColumns = michiIndicatorsVisible ? getMichiGapColumns(width, side) : [];
  const hasIndicators = gapColumns.length > 0;

  return (
    <div className="binder-side-fit flex h-full min-h-0 w-full min-w-0 flex-1 items-center justify-center">
      {/* `.binder-side-grid` (the size-capping class) now lives on this
          outer wrapper rather than the surface box below, so the Michi
          indicator strip (story 10) can render as its own row above the
          surface box without changing that box's own size when the toggle
          flips - only this wrapper's total height grows to fit it. */}
      <div
        className="binder-side-grid flex flex-col"
        style={{ '--slot-ratio': slotRatio } as React.CSSProperties}
      >
        {/* Michi indicators (story 10): noninteractive "|--|" brackets
            centered on the gap between each pair of columns whose slot
            openings face each other - just wide enough to straddle that
            gap, not the full width of either paired column - rendered in a
            strip above (outside) the blue surface box so toggling
            indicators never resizes or reflows the binder side itself.
            `justify-self-center` within the paired columns' combined
            2-column span lands the fixed-width bracket exactly on the
            boundary between them, since both are equal-width tracks.
            `aria-hidden` and the lack of any interactive role/tabIndex keep
            them out of the accessibility tree and tab order. */}
        {hasIndicators && (
          <div
            aria-hidden="true"
            className="grid gap-1 px-2 pb-1"
            style={{ gridTemplateColumns: `repeat(${width}, 1fr)` }}
          >
            {gapColumns.map((gapColumn) => (
              <div
                key={`michi-${gapColumn}`}
                className="flex h-2 w-8 items-center justify-self-center self-end"
                style={{ gridRow: 1, gridColumn: `${gapColumn} / span 2` }}
              >
                <span className="h-2 w-0.5 shrink-0 bg-secondary" />
                <span className="h-0.5 flex-1 bg-secondary" />
                <span className="h-2 w-0.5 shrink-0 bg-secondary" />
              </div>
            ))}
          </div>
        )}

        <div
          role="group"
          aria-label={`${side === 'left' ? 'Left' : 'Right'} binder side`}
          className="grid gap-1 rounded-standard bg-surface p-2 shadow-panel"
          style={{
            gridTemplateColumns: `repeat(${width}, 1fr)`,
            // `auto` (not a fixed `1fr`/height-based track) so each cell's
            // own `aspect-ratio` below - not an explicit grid height -
            // derives every row's height from the grid's already-capped
            // width.
            gridTemplateRows: `repeat(${height}, auto)`,
          }}
        >
          {/* Every slot is unoccupied for now - card assignment (story 11)
              hasn't been implemented yet, so each slot always shows the
              centered "+" indicating it can receive a card. */}
          {Array.from({ length: width * height }, (_, index) => (
            <div
              key={index}
              className="flex items-center justify-center rounded-standard border border-neutral-700 bg-neutral-800"
              style={{ aspectRatio: `${SLOT_WIDTH_CM} / ${SLOT_HEIGHT_CM}` }}
            >
              <Plus className="size-6 text-neutral-500" aria-hidden="true" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
