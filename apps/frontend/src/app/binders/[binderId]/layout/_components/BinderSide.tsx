import { useMemo } from 'react';

import type { Card } from '@/lib/api';

import { getMichiGapColumns } from '../michiIndicators';
import { BinderSlot } from './BinderSlot';

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
  physicalPage,
  cards,
  pendingPlacementKeys,
  onSlotClick,
  onRemoveCard,
  pendingCardDeletionIds,
  isMovePending,
  michiIndicatorsVisible = false,
  slotAspectRatio,
}: {
  side: 'left' | 'right';
  width: number;
  height: number;
  // The one-based physical page this side represents (story 11), used to
  // match each slot's (row, column) grid position against the binder's
  // cards.
  physicalPage: number;
  // Every card in the binder (story 11); filtered internally to this
  // side's own `physicalPage` rather than requiring the caller to
  // pre-filter, since `BinderLayoutView` renders up to 2 sides from the
  // same full list.
  cards: Card[];
  // The set of `${physicalPage}-${row}-${column}` keys with an assignment
  // currently in flight, so an in-flight slot can be disabled against
  // further clicks until it settles.
  pendingPlacementKeys: Set<string>;
  // Opens the card-selection modal for the clicked, currently-empty slot
  // (story 11).
  onSlotClick: (row: number, column: number) => void;
  // Permanently removes an occupied slot's card (story 13), revealed as a
  // hover action over the card's top-right corner.
  onRemoveCard: (cardId: string) => void;
  // Card ids with a removal currently in flight (story 13), so that card's
  // own actions are disabled - and no further actions permitted on it -
  // until the request settles.
  pendingCardDeletionIds: Set<string>;
  // True while any move/swap request is in flight for this binder (story
  // 14) - disables dragging and dropping on every slot until it settles.
  isMovePending: boolean;
  // Story 10's toggle: when true, a strip above the slot grid shows a
  // Michi indicator above every gap between paired columns whose slot
  // openings face each other (see `michiIndicators.ts`). Defaults to off,
  // matching the toggle's default state.
  michiIndicatorsVisible?: boolean;
  // Story 24: the binder's configured single-slot width-to-height ratio
  // (see `BinderLayoutView`), replacing the old fixed 6.35:9 constant.
  slotAspectRatio: number;
}) {
  // The grid's overall width-to-height ratio (not just one slot's), used by
  // `.binder-side-grid`'s `min()` width formula in globals.css so the
  // complete grid fits both the available width and height.
  const slotRatio = (width / height) * slotAspectRatio;

  const gapColumns = michiIndicatorsVisible ? getMichiGapColumns(width, side) : [];
  const hasIndicators = gapColumns.length > 0;

  // Looks up a card by its (row, column) on this side's physical page in
  // O(1) rather than scanning the full card list once per slot; rebuilt
  // only when the underlying cards or physical page change.
  const cardsByPosition = useMemo(() => {
    const map = new Map<string, Card>();
    for (const card of cards) {
      const { placement } = card;
      if (placement.physicalPage !== physicalPage) continue;
      if (placement.row === null || placement.column === null) continue;
      map.set(`${placement.row}-${placement.column}`, card);
    }
    return map;
  }, [cards, physicalPage]);

  return (
    <div className="binder-side-fit flex w-full min-w-0 flex-1 items-center justify-center">
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
          {/* Each slot (story 11) shows its assigned card's image if one
              occupies its (row, column) on this physical page, otherwise
              the centered "+" indicating it can receive a card. Only empty
              slots open the card-selection modal; a slot with an
              assignment in flight is disabled so it can't be clicked again
              mid-request. Occupied slots reveal a hover-triggered remove
              action over their top-right corner (story 13) and, per story
              14, can be dragged to another slot or dropped onto to swap
              with another card - see `BinderSlot` (extracted so its
              per-slot `useDraggable`/`useDroppable` hooks aren't called
              from within this loop). */}
          {Array.from({ length: width * height }, (_, index) => {
            const row = Math.floor(index / width) + 1;
            const column = (index % width) + 1;
            const card = cardsByPosition.get(`${row}-${column}`);
            const isPending = pendingPlacementKeys.has(`${physicalPage}-${row}-${column}`);
            // A pending removal disables the card's own action (story 13:
            // "permits no further actions on that pending card") without
            // needing a whole-slot pending flag like the empty slot's own
            // `isPending` above, since only the X action exists on an
            // occupied slot right now.
            const isRemovalPending = card ? pendingCardDeletionIds.has(card.id) : false;

            return (
              <BinderSlot
                key={index}
                physicalPage={physicalPage}
                row={row}
                column={column}
                card={card}
                isPendingPlacement={isPending}
                isRemovalPending={isRemovalPending}
                isMovePending={isMovePending}
                onSlotClick={onSlotClick}
                onRemoveCard={onRemoveCard}
                slotAspectRatio={slotAspectRatio}
              />
            );
          })}
        </div>
      </div>
    </div>
  );
}
