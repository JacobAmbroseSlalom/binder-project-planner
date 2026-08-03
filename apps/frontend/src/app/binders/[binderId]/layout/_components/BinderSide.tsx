import { useMemo } from 'react';

import type { Art, Binder, Card } from '@/lib/api';

import { getMichiGapColumns } from '../michiIndicators';
import { PlacedArtTile } from './art/PlacedArtTile';
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
  binder,
  cards,
  art,
  pendingPlacementKeys,
  onSlotClick,
  onRemoveCard,
  onEditVariation,
  pendingCardVariationEditIds,
  onDuplicateCard,
  pendingCardDuplicateIds,
  variationsVisible = false,
  pendingCardDeletionIds,
  pendingArtEditIds,
  pendingArtDeletionIds,
  pendingArtDuplicateIds,
  onEditArt,
  onRemoveArt,
  onDuplicateArt,
  isMovePending,
  michiIndicatorsVisible = false,
  slotAspectRatio,
  dragCandidateFootprint,
}: {
  side: 'left' | 'right';
  width: number;
  height: number;
  // The one-based physical page this side represents (story 11), used to
  // match each slot's (row, column) grid position against the binder's
  // cards.
  physicalPage: number;
  // Needed to compute each art item's own physical aspect ratio/border
  // styling (story 26), passed straight through to `PlacedArtTile`/
  // `ArtTile`.
  binder: Binder;
  // Every card in the binder (story 11); filtered internally to this
  // side's own `physicalPage` rather than requiring the caller to
  // pre-filter, since `BinderLayoutView` renders up to 2 sides from the
  // same full list.
  cards: Card[];
  // Every art item in the binder (story 26); filtered internally to this
  // side's own `physicalPage`, mirroring `cards` above.
  art: Art[];
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
  // Opens the edit-variation modal for an occupied slot's card (story 16),
  // revealed as a second hover action alongside `onRemoveCard`.
  onEditVariation: (card: Card) => void;
  // Card ids with a variation edit currently in flight (story 16), so that
  // card's own actions are disabled until the request settles - mirrors
  // `pendingCardDeletionIds`.
  pendingCardVariationEditIds: Set<string>;
  // Duplicates an occupied slot's card into the unplaced-cards section
  // (story 19), revealed as a third hover action alongside
  // `onRemoveCard`/`onEditVariation`.
  onDuplicateCard: (cardId: string) => void;
  // Card ids with a duplication currently in flight (story 19), mirroring
  // `pendingCardVariationEditIds` - only ever contains real (non-optimistic)
  // card ids here, since the optimistic copy itself always renders in the
  // unplaced section, never in a `BinderSlot`.
  pendingCardDuplicateIds: Set<string>;
  // Story 16's toggle: when true, every occupied slot with a saved
  // variation overlays it on the bottom edge of its card image (see
  // `CardTile`). An overlay rather than reserved space, so toggling this
  // never changes any slot's size or the binder side's overall
  // dimensions. Defaults to off, matching the toggle's default state.
  variationsVisible?: boolean;
  // Card ids with a removal currently in flight (story 13), so that card's
  // own actions are disabled - and no further actions permitted on it -
  // until the request settles.
  pendingCardDeletionIds: Set<string>;
  // Art ids with an edit/removal/duplication currently in flight (story
  // 26), passed straight through to each `PlacedArtTile`.
  pendingArtEditIds: Set<string>;
  pendingArtDeletionIds: Set<string>;
  pendingArtDuplicateIds: Set<string>;
  onEditArt: (art: Art) => void;
  onRemoveArt: (artId: string) => void;
  onDuplicateArt: (artId: string) => void;
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
  // The in-progress art drag's candidate destination footprint (story
  // 26), if it currently targets this side's own physical page - drives
  // the live valid/blocked highlight overlay drawn on top of the grid.
  // `null`/`undefined` (no active art drag, or one targeting a different
  // page/the unplaced sections) renders no overlay at all.
  dragCandidateFootprint?: {
    physicalPage: number;
    anchorRow: number;
    anchorColumn: number;
    widthSlots: number;
    heightSlots: number;
    valid: boolean;
  } | null;
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

  // Every art item placed on this side's own physical page (story 26),
  // plus (separately) the exact set of cells its footprint covers - the
  // latter drives each covered `BinderSlot`'s own `isCoveredByArt` flag,
  // computed once here rather than per-slot.
  const artOnThisPage = useMemo(
    () =>
      art.filter(
        (item) =>
          item.placement.physicalPage === physicalPage &&
          item.placement.row !== null &&
          item.placement.column !== null,
      ),
    [art, physicalPage],
  );
  const coveredByArt = useMemo(() => {
    const covered = new Set<string>();
    for (const item of artOnThisPage) {
      const anchorRow = item.placement.row as number;
      const anchorColumn = item.placement.column as number;
      for (let row = anchorRow; row < anchorRow + item.heightSlots; row++) {
        for (let column = anchorColumn; column < anchorColumn + item.widthSlots; column++) {
          covered.add(`${row}-${column}`);
        }
      }
    }
    return covered;
  }, [artOnThisPage]);

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
                isCoveredByArt={coveredByArt.has(`${row}-${column}`)}
                onSlotClick={onSlotClick}
                onRemoveCard={onRemoveCard}
                onEditVariation={onEditVariation}
                isVariationEditPending={card ? pendingCardVariationEditIds.has(card.id) : false}
                onDuplicateCard={onDuplicateCard}
                isDuplicatePending={card ? pendingCardDuplicateIds.has(card.id) : false}
                variationsVisible={variationsVisible}
                slotAspectRatio={slotAspectRatio}
              />
            );
          })}

          {/* Placed multi-slot art (story 26): each item renders as its own
              grid-spanning overlay, explicitly positioned (rather than
              relying on CSS Grid auto-placement to skip the
              already-covered `BinderSlot` cells above) so it lines up
              exactly with the footprint `coveredByArt` used to suppress
              those cells' own "+" affordance. */}
          {artOnThisPage.map((item) => (
            <div
              key={item.id}
              style={{
                gridRow: `${item.placement.row} / span ${item.heightSlots}`,
                gridColumn: `${item.placement.column} / span ${item.widthSlots}`,
              }}
            >
              <PlacedArtTile
                art={item}
                binder={binder}
                isMovePending={isMovePending}
                isEditPending={pendingArtEditIds.has(item.id)}
                isDeletionPending={pendingArtDeletionIds.has(item.id)}
                isDuplicatePending={pendingArtDuplicateIds.has(item.id)}
                onEditArt={onEditArt}
                onRemoveArt={onRemoveArt}
                onDuplicateArt={onDuplicateArt}
              />
            </div>
          ))}

          {/* The in-progress art drag's candidate-destination highlight
              (story 26): a single overlay spanning the whole candidate
              footprint, styled green (valid) or red (blocked) - drawn
              above the placed-art tiles above so it stays visible even
              over a covered cell. `pointer-events-none` and `aria-hidden`
              keep it out of the way of both dnd-kit's own hit-testing (see
              `BinderSlot`'s own comment on `pointerWithin` being rect-based)
              and the accessibility tree. The rendered span is clamped to
              this grid's own `width`/`height` track count (rather than
              rendered at the candidate's raw, possibly out-of-bounds
              anchor/size) - an unclamped span whose end line falls past
              the last explicit track would make CSS Grid create an extra
              implicit column/row to fit it, growing this side's rendered
              size and visibly resizing the whole spread mid-drag. An
              out-of-bounds candidate is already marked `valid: false` by
              `handleDragOver`, so clamping its *display* here doesn't
              affect the blocked styling - it only keeps the highlight
              from ever extending past the real slots.
          */}
          {dragCandidateFootprint && dragCandidateFootprint.physicalPage === physicalPage && (
            <div
              aria-hidden="true"
              className={`pointer-events-none z-20 rounded-standard ${
                dragCandidateFootprint.valid
                  ? 'bg-primary/30 ring-2 ring-inset ring-primary'
                  : 'bg-red-500/30 ring-2 ring-inset ring-red-500'
              }`}
              style={{
                gridRow: `${Math.max(1, dragCandidateFootprint.anchorRow)} / ${Math.min(height + 1, dragCandidateFootprint.anchorRow + dragCandidateFootprint.heightSlots)}`,
                gridColumn: `${Math.max(1, dragCandidateFootprint.anchorColumn)} / ${Math.min(width + 1, dragCandidateFootprint.anchorColumn + dragCandidateFootprint.widthSlots)}`,
              }}
            />
          )}
        </div>
      </div>
    </div>
  );
}
