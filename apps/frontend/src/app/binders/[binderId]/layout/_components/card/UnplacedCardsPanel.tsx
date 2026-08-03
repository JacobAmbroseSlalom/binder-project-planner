'use client';

import { useDroppable } from '@dnd-kit/core';
import { useVirtualizer } from '@tanstack/react-virtual';
import { Plus } from 'lucide-react';
import { useEffect, useMemo, useRef } from 'react';

import type { Card } from '@/lib/api';

import { UnplacedCard } from './UnplacedCard';

// Cards render in a fixed 3-column grid (rather than one full-width tile
// per row) so each `BinderSlot`-style aspect-ratio tile stays a reasonable
// thumbnail size instead of stretching to the whole panel width. Each
// virtualized "row" is one grid row of up to this many cards. Exported so
// `UnplacedArtPanel` can size its own art tiles proportionally to this
// same grid's column width (see its own usage).
export const UNPLACED_GRID_COLUMNS = 3;

// The grid's column gap in pixels (matches the `gap-2` Tailwind class
// used on the grid below - Tailwind's spacing scale is `0.25rem` per
// step, so `gap-2` is `0.5rem`/`8px` at the default `16px` root font
// size). Exported alongside `UNPLACED_GRID_COLUMNS` for the same reason.
export const UNPLACED_GRID_GAP_PX = 8;

// A grid row's estimated height before the virtualizer measures its real
// rendered height - a rough guess for a `BinderSlot`-style aspect-ratio
// tile at roughly a third of the panel's content width; the virtualizer
// corrects it via `measureElement`'s `ResizeObserver` on the first real
// render.
const ESTIMATED_UNPLACED_ROW_HEIGHT_PX = 160;

// Sorts unplaced cards newest-first by creation timestamp, then by id as a
// deterministic tie-breaker (story 15) - mirrors the backend's own
// `listCardsForBinder` ordering exactly, so an in-flight optimistic
// create/move/swap lands in the same position the backend would
// eventually return it in.
function sortUnplacedCards(unplacedCards: Card[]): Card[] {
  return [...unplacedCards].sort((a, b) => {
    if (a.createdAt !== b.createdAt) return a.createdAt < b.createdAt ? 1 : -1;
    if (a.id === b.id) return 0;
    return a.id < b.id ? -1 : 1;
  });
}

// The "Edit Layout" tab's unplaced-cards section (story 15): an
// independently scrolling, virtualized list of every binder-owned card
// without a physical page/row/column, alongside an add button that opens
// the shared card-selection modal targeting an all-null placement. The
// whole panel - not each row - is one dnd-kit drop target: dropping a
// placed card anywhere within its bounds clears that card's placement.
export function UnplacedCardsPanel({
  cards,
  pendingCardDeletionIds,
  pendingUnplacedCardIds,
  isMovePending,
  onRemoveCard,
  onAddCard,
  slotAspectRatio,
}: {
  // Every card in the binder; filtered internally to the unplaced subset
  // (all-null placement), mirroring `BinderSide`'s own "pass the full list,
  // filter internally" convention.
  cards: Card[];
  pendingCardDeletionIds: Set<string>;
  pendingUnplacedCardIds: Set<string>;
  isMovePending: boolean;
  onRemoveCard: (cardId: string) => void;
  onAddCard: () => void;
  // Story 24: the binder's configured single-slot width-to-height ratio,
  // threaded down from `BinderLayoutView` to each `UnplacedCard` tile.
  slotAspectRatio: number;
}) {
  const unplacedCards = useMemo(
    () => sortUnplacedCards(cards.filter((card) => card.placement.physicalPage === null)),
    [cards],
  );

  // Chunks the flat sorted list into fixed-size grid rows (story 15's
  // reuse of `BinderSlot`'s tile styling, sized down via a multi-column
  // grid rather than one oversized tile per row).
  const unplacedCardRows = useMemo(() => {
    const rows: Card[][] = [];
    for (let index = 0; index < unplacedCards.length; index += UNPLACED_GRID_COLUMNS) {
      rows.push(unplacedCards.slice(index, index + UNPLACED_GRID_COLUMNS));
    }
    return rows;
  }, [unplacedCards]);

  // The whole panel is the one drop target (story 15's technical
  // requirement) - `data.unplaced` distinguishes it from a concrete
  // `BinderSlot`'s `{ physicalPage, row, column }` marker in
  // `BinderLayoutView`'s `handleDragEnd`. Disabled while a move is already
  // in flight, matching every other drop target in the binder.
  const { setNodeRef: setDroppableRef, isOver } = useDroppable({
    id: 'unplaced',
    data: { unplaced: true },
    disabled: isMovePending,
  });

  const scrollContainerRef = useRef<HTMLDivElement>(null);

  const rowVirtualizer = useVirtualizer({
    count: unplacedCardRows.length,
    getScrollElement: () => scrollContainerRef.current,
    estimateSize: () => ESTIMATED_UNPLACED_ROW_HEIGHT_PX,
    overscan: 5,
  });

  // Scrolls a card into view the instant it newly appears in the unplaced
  // list - whether just created, dragged in from a binder slot, or
  // displaced by an unplaced-to-occupied swap (story 15's "the virtualizer
  // scrolls that card into view" requirement). Diffs the current sorted id
  // order against the previous render's, rather than watching
  // `unplacedCards.length` alone, since a move/swap can add a newly
  // unplaced id without changing the total unplaced count (a swap removes
  // one and adds one in the same update).
  const previousIdsRef = useRef<Set<string>>(new Set(unplacedCards.map((card) => card.id)));
  useEffect(() => {
    const previousIds = previousIdsRef.current;
    const newlyUnplacedIndex = unplacedCards.findIndex((card) => !previousIds.has(card.id));
    previousIdsRef.current = new Set(unplacedCards.map((card) => card.id));
    if (newlyUnplacedIndex !== -1) {
      // Scrolls to the grid ROW containing the newly unplaced card, not
      // its flat index, since each virtualized row now holds multiple
      // cards.
      rowVirtualizer.scrollToIndex(Math.floor(newlyUnplacedIndex / UNPLACED_GRID_COLUMNS), {
        align: 'auto',
      });
    }
  }, [unplacedCards, rowVirtualizer]);

  return (
    <div
      ref={setDroppableRef}
      // `w-full` (not a fixed width) since `BinderLayoutView` now sizes this
      // panel via its own dedicated grid column, matching that column's
      // width exactly rather than duplicating it here.
      className={`flex h-full min-h-0 w-full flex-col gap-3 rounded-standard bg-neutral-800 p-3 shadow-panel ${
        isOver ? 'ring-2 ring-inset ring-primary' : ''
      }`}
    >
      <div className="flex items-center gap-2">
        {/* An invisible spacer matching the add button's own size, so the
            title centers on the row's true midpoint instead of leaning
            left toward it (which `justify-between` would do). */}
        <div className="size-8 shrink-0" aria-hidden="true" />
        <h2 className="flex-1 text-center text-subheading">Unplaced Cards</h2>
        {/* Story 15's add button: opens the shared card-selection modal
            with an all-null placement target, exactly like an empty
            slot's own "+" button but scoped to the unplaced section
            instead of one coordinate. */}
        <button
          type="button"
          onClick={onAddCard}
          aria-label="Add an unplaced card"
          title="Add card"
          className="flex size-8 shrink-0 cursor-pointer items-center justify-center rounded-full bg-primary text-neutral-100 hover:brightness-110"
        >
          <Plus className="size-5" aria-hidden="true" />
        </button>
      </div>

      {/* Own vertical scroll container (story 15's "independently
          scrolling... its height does not depend on the rendered binder
          spread" requirement) - `min-h-0` lets it shrink within the
          panel's own fixed/flex height rather than growing to fit its
          content. No separate empty-state message when there are no
          unplaced cards - the add button above is enough. */}
      <div ref={scrollContainerRef} className="min-h-0 flex-1 overflow-y-auto">
        <div style={{ height: `${rowVirtualizer.getTotalSize()}px`, position: 'relative' }}>
          {rowVirtualizer.getVirtualItems().map((virtualRow) => {
            const row = unplacedCardRows[virtualRow.index];
            return (
              <div
                key={row[0].id}
                data-index={virtualRow.index}
                ref={rowVirtualizer.measureElement}
                className="absolute top-0 left-0 grid w-full grid-cols-3 gap-2 pb-2"
                style={{ transform: `translateY(${virtualRow.start}px)` }}
              >
                {row.map((card) => (
                  <UnplacedCard
                    key={card.id}
                    card={card}
                    isRemovalPending={pendingCardDeletionIds.has(card.id)}
                    isPendingCreate={pendingUnplacedCardIds.has(card.id)}
                    isMovePending={isMovePending}
                    onRemoveCard={onRemoveCard}
                    slotAspectRatio={slotAspectRatio}
                  />
                ))}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
