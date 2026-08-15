'use client';

import { DndContext, PointerSensor, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core';
import { arrayMove, SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import {
  CARD_DRAG_ACTIVATION_DISTANCE_PX,
  WATCHLIST_PDF_MAX_ENTRIES,
} from '@binder-project-planner/shared';
import { Fragment, useMemo } from 'react';

import type { WatchlistEntry } from '@/lib/api';

import { getTotalColumnCount } from '../_lib/watchlistColumns';
import type {
  WatchlistColumnFilters,
  WatchlistColumnKey,
  WatchlistSortDirection,
  WatchlistSortOption,
} from '../_lib/watchlistEntryDerivation';
import { DividerRow, PDF_EXPORT_DIVIDER_ROW_ID } from './WatchlistDividerRow';
import { WatchlistEntryTableHeader } from './WatchlistEntryTableHeader';
import { WatchlistEntryRow, type WatchlistPriceReviewTableProps } from './WatchlistEntryTableRow';

export type { WatchlistPriceReviewTableProps };

// Story 45's What I'm Looking For table: the page's main content,
// combining each column's sortable header + filter dropdown with the
// currently search/sort/filter-derived (and possibly manually reordered)
// rows, plus an empty-results state - mirroring `CardListTable` closely,
// with three deliberate differences: no Acquisition column (dropped
// entirely, per the story's "columns match the Card List's columns, minus
// Acquisition"), no inline row-edit action (this page's only acceptance
// criteria for editing a row are the shared price-review workflow, Remove,
// and Mark as acquired & remove - not a full field-by-field edit), and a
// leading drag-handle column powering the manual reorder.
export function WatchlistEntryTable({
  allEntries,
  visibleEntries,
  sortOption,
  sortDirection,
  onSortColumnClick,
  columnFilters,
  onColumnFilterChange,
  canReorder,
  pdfExportCutoffCount,
  onReorder,
  priceReview,
  onRemove,
  pendingRemoveIds,
  onMarkAcquiredAndRemove,
  pendingMarkAcquiredIds,
}: {
  // Every entry, used only to compute each column's full distinct-value
  // list for its filter dropdown - never rendered directly.
  allEntries: readonly WatchlistEntry[];
  // The already search/sort/filter-derived entries to render as rows -
  // when `canReorder` is true, this is always the full list in its
  // persisted `sortOrder` (no search/filter/column-sort narrows or
  // reorders it in that state).
  visibleEntries: readonly WatchlistEntry[];
  sortOption: WatchlistSortOption;
  sortDirection: WatchlistSortDirection;
  onSortColumnClick: (column: WatchlistColumnKey) => void;
  columnFilters: WatchlistColumnFilters;
  onColumnFilterChange: (column: WatchlistColumnKey, next: Set<string>) => void;
  // Story 52: dragging (of entries or the PDF export divider) is only
  // meaningful, and only enabled, while no column sort or active
  // search/filter is narrowing or reordering the visible list.
  canReorder: boolean;
  // How many entries (from the top of `visibleEntries`, when `canReorder`
  // is true) currently sit above the PDF export divider - already clamped
  // to `visibleEntries.length` by the caller.
  pdfExportCutoffCount: number;
  // Story 52's single reorder callback: called with the complete new
  // entry-id order and the new divider position together, on every
  // drag-end - the page owns persisting both in one request.
  onReorder: (orderedEntryIds: string[], pdfExportCutoffCount: number) => void;
  priceReview: WatchlistPriceReviewTableProps | null;
  onRemove: (entryId: string) => void;
  pendingRemoveIds: ReadonlySet<string>;
  onMarkAcquiredAndRemove: (entryId: string) => void;
  pendingMarkAcquiredIds: ReadonlySet<string>;
}) {
  const controlsDisabled = priceReview !== null;

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: CARD_DRAG_ACTIVATION_DISTANCE_PX },
    }),
  );

  // Story 52: while `canReorder`, the divider is a real row within the
  // same combined drag-and-drop order as every entry - computed by
  // splicing its sentinel id into `visibleEntries`' own id order at
  // `pdfExportCutoffCount`. `null` while dragging is disabled, since the
  // divider isn't rendered as a draggable row at all in that state.
  const combinedRowIds = useMemo(() => {
    if (!canReorder) return null;
    const ids = visibleEntries.map((entry) => entry.id);
    ids.splice(pdfExportCutoffCount, 0, PDF_EXPORT_DIVIDER_ROW_ID);
    return ids;
  }, [canReorder, visibleEntries, pdfExportCutoffCount]);

  function handleDragEnd(event: DragEndEvent) {
    if (!combinedRowIds) return;
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const activeIndex = combinedRowIds.indexOf(active.id as string);
    const overIndex = combinedRowIds.indexOf(over.id as string);
    if (activeIndex === -1 || overIndex === -1) return;

    const next = arrayMove(combinedRowIds, activeIndex, overIndex);

    // The divider's own index within `next` numerically equals how many
    // entries now precede it (every other element is an entry id) - so
    // this is `pdfExportCutoffCount` before any cap is applied. Clamped to
    // `WATCHLIST_PDF_MAX_ENTRIES` so dragging an entry above the divider
    // can never push more than 40 entries above it (per the story's own
    // acceptance criterion), rather than rejecting the drag outright.
    const nextCutoffCount = Math.min(
      next.indexOf(PDF_EXPORT_DIVIDER_ROW_ID),
      WATCHLIST_PDF_MAX_ENTRIES,
    );
    const orderedEntryIds = next.filter((id) => id !== PDF_EXPORT_DIVIDER_ROW_ID);
    onReorder(orderedEntryIds, nextCutoffCount);
  }

  return (
    <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
      <table className="w-full border-collapse text-left">
        <WatchlistEntryTableHeader
          allEntries={allEntries}
          sortOption={sortOption}
          sortDirection={sortDirection}
          onSortColumnClick={onSortColumnClick}
          columnFilters={columnFilters}
          onColumnFilterChange={onColumnFilterChange}
          isPriceReviewActive={priceReview !== null}
          disabled={controlsDisabled}
        />
        <tbody>
          {visibleEntries.length === 0 && (
            <tr>
              <td
                colSpan={getTotalColumnCount(priceReview !== null)}
                className="py-8 text-center text-neutral-500"
              >
                No entries match the current search and filters.
              </td>
            </tr>
          )}
          {/* `SortableContext`'s own `items` list drives each row's animated
              repositioning (`useSortable` compares a row's previous vs. new
              index within this list to compute its slide transform) - it
              always gets a valid, complete id list (falling back to the
              plain visible-entries order when `canReorder` is false and no
              divider row is rendered), even though no drag can actually
              start in that state (`dragDisabled` disables every row's own
              `useSortable` call). */}
          <SortableContext
            items={combinedRowIds ?? visibleEntries.map((entry) => entry.id)}
            strategy={verticalListSortingStrategy}
          >
            {visibleEntries.map((entry, index) => (
              <Fragment key={entry.id}>
                {/* Story 45's PDF export cutoff (`WATCHLIST_PDF_MAX_ENTRIES`):
                    while dragging is disabled (a column sort or active
                    search/filter is applied, story 52), this stays a plain,
                    non-draggable indicator against the currently-visible
                    order - not the same movable, persisted divider row
                    rendered below when `canReorder` is true. */}
                {!canReorder && index === WATCHLIST_PDF_MAX_ENTRIES && (
                  <tr aria-hidden="true">
                    <td colSpan={getTotalColumnCount(priceReview !== null)} className="p-0">
                      <div
                        title="Only cards above this line are included in the PDF export"
                        className="border-t-2 border-secondary"
                      />
                    </td>
                  </tr>
                )}
                {/* Story 52's movable PDF export divider row: rendered right
                    before the entry that currently follows it in the
                    persisted order, only while `canReorder` is true. */}
                {canReorder && index === pdfExportCutoffCount && (
                  <DividerRow columnCount={getTotalColumnCount(priceReview !== null)} />
                )}
                <WatchlistEntryRow
                  entry={entry}
                  controlsDisabled={controlsDisabled}
                  dragDisabled={controlsDisabled || !canReorder}
                  priceReview={priceReview}
                  onRemove={onRemove}
                  isRemovePending={pendingRemoveIds.has(entry.id)}
                  onMarkAcquiredAndRemove={onMarkAcquiredAndRemove}
                  isMarkAcquiredPending={pendingMarkAcquiredIds.has(entry.id)}
                />
              </Fragment>
            ))}
            {/* The divider row can also trail every entry (its default
                position, or after being dragged to the very end). */}
            {canReorder && pdfExportCutoffCount >= visibleEntries.length && (
              <DividerRow columnCount={getTotalColumnCount(priceReview !== null)} />
            )}
          </SortableContext>
        </tbody>
      </table>
    </DndContext>
  );
}
