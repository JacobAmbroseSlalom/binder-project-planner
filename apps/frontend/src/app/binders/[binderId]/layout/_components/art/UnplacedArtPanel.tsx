'use client';

import { useDroppable } from '@dnd-kit/core';
import { Plus } from 'lucide-react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { useEffect, useMemo, useRef, useState } from 'react';

import type { Art, Binder } from '@/lib/api';

import { UnplacedArt } from './UnplacedArt';
import { UNPLACED_GRID_COLUMNS, UNPLACED_GRID_GAP_PX } from '../card/UnplacedCardsPanel';

// A rough guess for a single-column art row's height before the
// virtualizer measures its real rendered height (story 25: "the unplaced
// art section's virtualizer measures variable art-row heights after
// rendering rather than assuming the unplaced cards section's fixed
// card-row estimate") - each art item's real aspect ratio (and therefore
// height) varies per item, unlike cards' fixed slot ratio, so this is
// only ever a first-paint estimate corrected by `measureElement` below.
const ESTIMATED_UNPLACED_ART_ROW_HEIGHT_PX = 200;

// Sorts unplaced art newest-first by creation timestamp, then by id as a
// deterministic tie-breaker - mirrors the backend's own
// `listArtForBinder` ordering exactly (story 25), and the unplaced-cards
// section's own tie-breaking rule (`UnplacedCardsPanel.tsx`).
function sortUnplacedArt(unplacedArt: Art[]): Art[] {
  return [...unplacedArt].sort((a, b) => {
    if (a.createdAt !== b.createdAt) return a.createdAt < b.createdAt ? 1 : -1;
    if (a.id === b.id) return 0;
    return a.id < b.id ? -1 : 1;
  });
}

// The "Edit Layout" tab's unplaced-art section (stories 25 and 26): an
// independently scrolling, virtualized single-column list of every
// binder-owned multi-slot art item without a physical page/row/column,
// alongside an add button that opens the create-art modal. Rendered as
// its own separate panel (not combined with `UnplacedCardsPanel`) per
// planning.md's "separate from the unplaced cards section." The whole
// panel is one dnd-kit drop target (story 26), sharing the exact
// `{ unplaced: true }` marker `UnplacedCardsPanel` uses so either panel
// accepts a dropped card or art item, unplacing it.
export function UnplacedArtPanel({
  art,
  binder,
  pendingUnplacedArtIds,
  pendingArtEditIds,
  pendingArtDeletionIds,
  pendingArtDuplicateIds,
  isMovePending,
  onAddArt,
  onEditArt,
  onRemoveArt,
  onDuplicateArt,
}: {
  // Every art item in the binder; filtered internally to the unplaced
  // subset (all-null placement), mirroring `UnplacedCardsPanel`'s own
  // "pass the full list, filter internally" convention.
  art: Art[];
  binder: Binder;
  pendingUnplacedArtIds: Set<string>;
  pendingArtEditIds: Set<string>;
  pendingArtDeletionIds: Set<string>;
  pendingArtDuplicateIds: Set<string>;
  // True while any card/art move or swap is in flight for the binder
  // (story 26's shared movement queue) - disables dragging every art item
  // and dropping onto this panel until it settles.
  isMovePending: boolean;
  onAddArt: () => void;
  onEditArt: (art: Art) => void;
  onRemoveArt: (artId: string) => void;
  onDuplicateArt: (artId: string) => void;
}) {
  const unplacedArt = useMemo(
    () => sortUnplacedArt(art.filter((item) => item.placement.physicalPage === null)),
    [art],
  );

  // The whole panel is the one drop target (story 26, mirroring
  // `UnplacedCardsPanel`'s own `useDroppable`) - reuses the identical
  // `{ unplaced: true }` marker so `BinderLayoutView`'s drag-end handler
  // doesn't need a separate case for which unplaced panel a card or art
  // item was dropped onto.
  const { setNodeRef: setDroppableRef, isOver } = useDroppable({
    id: 'unplaced-art',
    data: { unplaced: true },
    disabled: isMovePending,
  });

  const scrollContainerRef = useRef<HTMLDivElement>(null);

  // The scroll container's own rendered width (story 25/26 revision: art
  // tiles are sized proportionally to the unplaced cards grid's own
  // column width - see `tileWidthPx` below - rather than always
  // stretching to the full panel width), measured reactively so resizing
  // the window/panel keeps both sections' relative scale in sync.
  const [panelWidth, setPanelWidth] = useState(0);
  useEffect(() => {
    const element = scrollContainerRef.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => {
      setPanelWidth(entry.contentRect.width);
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  // The same physical cm-to-px scale factor a single unplaced card renders
  // at in its own 3-column grid (`UnplacedCardsPanel`) - both panels are
  // fixed-width sibling columns in `BinderLayoutView`'s grid, so measuring
  // this panel's own content width reproduces that same column width
  // without needing to reach into the cards panel's own DOM. A one-slot
  // card's physical width is `1 * widthPerSlot + widthBase`, matching the
  // formula every `physicalWidthCm` calculation in this file (and
  // `ArtTile`) already uses for arbitrary slot counts.
  const oneCardWidthCm = binder.widthPerSlot + binder.widthBase;
  const referenceCardWidthPx =
    panelWidth > 0
      ? (panelWidth - UNPLACED_GRID_GAP_PX * (UNPLACED_GRID_COLUMNS - 1)) / UNPLACED_GRID_COLUMNS
      : 0;
  const pxPerCm = oneCardWidthCm > 0 ? referenceCardWidthPx / oneCardWidthCm : 0;

  const rowVirtualizer = useVirtualizer({
    count: unplacedArt.length,
    getScrollElement: () => scrollContainerRef.current,
    estimateSize: () => ESTIMATED_UNPLACED_ART_ROW_HEIGHT_PX,
    overscan: 5,
  });

  // Scrolls a newly added art item into view, mirroring
  // `UnplacedCardsPanel`'s own "diff the current sorted id order against
  // the previous render's" approach.
  const previousIdsRef = useRef<Set<string>>(new Set(unplacedArt.map((item) => item.id)));
  useEffect(() => {
    const previousIds = previousIdsRef.current;
    const newlyUnplacedIndex = unplacedArt.findIndex((item) => !previousIds.has(item.id));
    previousIdsRef.current = new Set(unplacedArt.map((item) => item.id));
    if (newlyUnplacedIndex !== -1) {
      rowVirtualizer.scrollToIndex(newlyUnplacedIndex, { align: 'auto' });
    }
  }, [unplacedArt, rowVirtualizer]);

  return (
    <div
      ref={setDroppableRef}
      className={`flex h-full min-h-0 w-full flex-col gap-3 rounded-standard bg-neutral-800 p-3 shadow-panel ${
        isOver ? 'ring-2 ring-inset ring-primary' : ''
      }`}
    >
      <div className="flex items-center gap-2">
        {/* An invisible spacer matching the add button's own size, so the
            title centers on the row's true midpoint instead of leaning
            left toward it (which `justify-between` would do) - mirrors
            `UnplacedCardsPanel`'s header row. */}
        <div className="size-8 shrink-0" aria-hidden="true" />
        <h2 className="flex-1 text-center text-subheading">Unplaced Art</h2>
        <button
          type="button"
          onClick={onAddArt}
          aria-label="Add multi-slot art"
          title="Add art"
          className="flex size-8 shrink-0 cursor-pointer items-center justify-center rounded-full bg-primary text-neutral-100 hover:brightness-110"
        >
          <Plus className="size-5" aria-hidden="true" />
        </button>
      </div>

      {/* Own vertical scroll container, independent of the rendered
          binder spread - mirrors `UnplacedCardsPanel`'s own scroll
          container. No separate empty-state message when there's no
          unplaced art - the add button above is enough. */}
      <div ref={scrollContainerRef} className="min-h-0 flex-1 overflow-y-auto">
        <div style={{ height: `${rowVirtualizer.getTotalSize()}px`, position: 'relative' }}>
          {rowVirtualizer.getVirtualItems().map((virtualRow) => {
            const item = unplacedArt[virtualRow.index];
            const physicalWidthCm = item.widthSlots * binder.widthPerSlot + binder.widthBase;
            // Clamped to the panel's own width so art spanning more slots
            // than the cards grid has columns for (e.g. wider than 3
            // card-widths) still fits within the panel instead of
            // overflowing it horizontally.
            const tileWidthPx = Math.min(pxPerCm * physicalWidthCm, panelWidth);
            return (
              <div
                key={item.id}
                data-index={virtualRow.index}
                ref={rowVirtualizer.measureElement}
                className="absolute top-0 left-0 flex w-full justify-center pb-2"
                style={{ transform: `translateY(${virtualRow.start}px)` }}
              >
                <UnplacedArt
                  art={item}
                  binder={binder}
                  widthPx={tileWidthPx}
                  isPendingCreate={pendingUnplacedArtIds.has(item.id)}
                  isMovePending={isMovePending}
                  isEditPending={pendingArtEditIds.has(item.id)}
                  isDeletionPending={pendingArtDeletionIds.has(item.id)}
                  isDuplicatePending={pendingArtDuplicateIds.has(item.id)}
                  onEditArt={onEditArt}
                  onRemoveArt={onRemoveArt}
                  onDuplicateArt={onDuplicateArt}
                />
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
