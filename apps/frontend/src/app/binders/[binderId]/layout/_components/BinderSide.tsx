import { SLOT_HEIGHT_CM, SLOT_WIDTH_CM } from '@binder-project-planner/shared';
import { Plus } from 'lucide-react';

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
}: {
  side: 'left' | 'right';
  width: number;
  height: number;
}) {
  // The grid's overall width-to-height ratio (not just one slot's), used by
  // `.binder-side-grid`'s `min()` width formula in globals.css so the
  // complete grid fits both the available width and height.
  const slotRatio = (width * SLOT_WIDTH_CM) / (height * SLOT_HEIGHT_CM);

  return (
    <div className="binder-side-fit flex h-full min-h-0 w-full min-w-0 flex-1 items-center justify-center">
      <div
        role="group"
        aria-label={`${side === 'left' ? 'Left' : 'Right'} binder side`}
        className="binder-side-grid grid gap-1 rounded-standard bg-surface p-2 shadow-panel"
        style={
          {
            '--slot-ratio': slotRatio,
            gridTemplateColumns: `repeat(${width}, 1fr)`,
            // `auto` (not a fixed `1fr`/height-based track) so each cell's
            // own `aspect-ratio` below - not an explicit grid height -
            // derives every row's height from the grid's already-capped
            // width.
            gridTemplateRows: `repeat(${height}, auto)`,
          } as React.CSSProperties
        }
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
  );
}
