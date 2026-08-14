'use client';

import {
  DndContext,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DraggableAttributes,
  type DraggableSyntheticListeners,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import {
  CARD_DRAG_ACTIVATION_DISTANCE_PX,
  WATCHLIST_PDF_MAX_ENTRIES,
} from '@binder-project-planner/shared';
import { ArrowDown, ArrowUp, ArrowUpDown, CircleCheck, GripVertical, Trash2 } from 'lucide-react';
import { Fragment, useMemo } from 'react';

import { resolveCardImageUrl, type WatchlistEntry } from '@/lib/api';
import { ImagePreview, Tooltip } from '@/shared/feedback';
import { computeCardPriceChange } from '@/shared/finance/computeCardPriceChange';
import { formatCurrency } from '@/shared/finance/formatCurrency';
import { MoneyInput } from '@/shared/finance/MoneyInput';

import { ColumnFilterDropdown } from './ColumnFilterDropdown';
import { VariantSelect } from './VariantSelect';
import {
  getDistinctWatchlistColumnValues,
  type WatchlistColumnFilters,
  type WatchlistColumnKey,
  type WatchlistSortDirection,
  type WatchlistSortOption,
} from '../_lib/watchlistEntryDerivation';
import type { PriceReviewRow, PriceReviewSource } from '../useWatchlistPriceReview';

// Each sortable column's display label, mirroring `CardListTable`'s own
// `COLUMN_LABELS` minus Acquisition.
const COLUMN_LABELS: Record<WatchlistColumnKey, string> = {
  name: 'Name',
  set: 'Set',
  number: 'Number',
  variation: 'Variation',
  price: 'Price',
  priceUpdatedAt: 'Price updated',
};

// Total column count, for the empty-results row's `colSpan`: the 6
// sortable columns plus the drag-handle column plus the thumbnail column
// plus this list's own trailing actions column, plus, only while the
// price-review state is active, its 6 expanded review columns - mirroring
// `getTotalColumnCount`.
function getTotalColumnCount(isPriceReviewActive: boolean): number {
  const baseColumnCount = Object.keys(COLUMN_LABELS).length + 3;
  return isPriceReviewActive ? baseColumnCount + 6 : baseColumnCount;
}

// Story 45's price-review row data a table cell needs, mirroring
// `PriceReviewTableProps` but keyed by `watchlistEntryId`.
export interface WatchlistPriceReviewTableProps {
  isFetching: boolean;
  rows: Map<string, PriceReviewRow>;
  onVariantChange: (watchlistEntryId: string, variantKey: string) => void;
  onPriceInputChange: (watchlistEntryId: string, rawValue: string) => void;
  onFillPrice: (watchlistEntryId: string, value: number | null, source: PriceReviewSource) => void;
}

// One sortable column's header cell, mirroring `SortableColumnHeader` (no
// `headerAccessory`/`align` props - this table has no Acquisition-style
// centered icon column, so those variants have no equivalent here).
function SortableColumnHeader({
  column,
  allEntries,
  sortOption,
  sortDirection,
  onSortColumnClick,
  columnFilters,
  onColumnFilterChange,
  disabled,
}: {
  column: WatchlistColumnKey;
  allEntries: readonly WatchlistEntry[];
  sortOption: WatchlistSortOption;
  sortDirection: WatchlistSortDirection;
  onSortColumnClick: (column: WatchlistColumnKey) => void;
  columnFilters: WatchlistColumnFilters;
  onColumnFilterChange: (column: WatchlistColumnKey, next: Set<string>) => void;
  disabled?: boolean;
}) {
  const label = COLUMN_LABELS[column];
  const isActive = sortOption === column;
  return (
    <th className="py-2 pr-4 font-regular">
      <div className="flex items-center gap-1">
        <button
          type="button"
          disabled={disabled}
          onClick={() => onSortColumnClick(column)}
          aria-label={`Sort by ${label}`}
          className={`flex cursor-pointer items-center gap-1 rounded-standard px-1 py-0.5 hover:bg-neutral-700 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-transparent ${
            isActive ? 'text-primary' : ''
          }`}
        >
          {label}
          {isActive ? (
            sortDirection === 'ascending' ? (
              <ArrowUp className="size-3.5" aria-hidden="true" />
            ) : (
              <ArrowDown className="size-3.5" aria-hidden="true" />
            )
          ) : (
            <ArrowUpDown className="size-3.5" aria-hidden="true" />
          )}
        </button>
        <ColumnFilterDropdown
          columnLabel={label}
          options={getDistinctWatchlistColumnValues(allEntries, column)}
          selected={columnFilters[column]}
          onChange={(next) => onColumnFilterChange(column, next)}
          disabled={disabled}
        />
      </div>
    </th>
  );
}

// Story 52's PDF export divider row's sentinel id - never a real entry's
// id, so it's safely distinguishable within the combined drag-and-drop
// row order alongside every entry id.
const PDF_EXPORT_DIVIDER_ROW_ID = '__pdf_export_divider__';

// One row's drag handle (story 45's manual reordering, now animated via
// `@dnd-kit/sortable`): a small grip icon. Purely presentational - the
// enclosing row (`WatchlistEntryRow`/`DividerRow` below) owns the single
// `useSortable` call for the whole row (row = drag source + drop target +
// sortable list item), and passes its `attributes`/`listeners` down here
// so only this handle (not the whole row) starts a drag, while
// `setActivatorNodeRef` tells dnd-kit which element to focus for keyboard
// dragging.
function DragHandle({
  disabled,
  isDragging,
  attributes,
  listeners,
  setActivatorNodeRef,
}: {
  disabled?: boolean;
  isDragging: boolean;
  attributes: DraggableAttributes;
  listeners: DraggableSyntheticListeners;
  setActivatorNodeRef: (element: HTMLElement | null) => void;
}) {
  return (
    <Tooltip label="Drag to reorder">
      <button
        ref={setActivatorNodeRef}
        type="button"
        disabled={disabled}
        aria-label="Drag to reorder"
        {...attributes}
        {...listeners}
        className={`flex size-7 cursor-grab items-center justify-center rounded-standard text-neutral-500 hover:bg-neutral-700 hover:text-neutral-100 disabled:cursor-not-allowed disabled:opacity-50 ${
          isDragging ? 'opacity-50' : ''
        }`}
      >
        <GripVertical className="size-4" aria-hidden="true" />
      </button>
    </Tooltip>
  );
}

// Story 52's PDF export divider, a real sortable row (rather than a
// fixed, informational-only line) - only rendered while `canReorder` is
// true (no active column sort/search/filter), since its position only has
// meaning against the full, persisted-order list. Uses `useSortable` (not
// bare `useDraggable`/`useDroppable`) so it participates in the same
// animated repositioning as every entry row when something is dragged
// past it.
function DividerRow({ columnCount }: { columnCount: number }) {
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: PDF_EXPORT_DIVIDER_ROW_ID });

  return (
    // `CSS.Translate` (not `CSS.Transform`) deliberately drops the scale
    // component dnd-kit would otherwise compute from this row's rect vs.
    // the dragged row's rect - this divider row's single full-width
    // `colSpan` cell has a very different shape than a normal entry row,
    // so a scale transform here visibly stretched/skewed it.
    <tr ref={setNodeRef} style={{ transform: CSS.Translate.toString(transform), transition }}>
      <td colSpan={columnCount} className="p-0">
        <div
          ref={setActivatorNodeRef}
          {...attributes}
          {...listeners}
          className={`flex cursor-grab items-center gap-2 border-t-2 border-secondary bg-neutral-900/50 px-2 py-1.5 text-caption text-secondary ${
            isDragging ? 'opacity-50' : ''
          }`}
        >
          <GripVertical className="size-4 shrink-0" aria-hidden="true" />
          Only cards above this line are included in the PDF export
        </div>
      </td>
    </tr>
  );
}

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

  const sortableHeaderProps = {
    allEntries,
    sortOption,
    sortDirection,
    onSortColumnClick,
    columnFilters,
    onColumnFilterChange,
    disabled: controlsDisabled,
  };

  return (
    <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
      <table className="w-full border-collapse text-left">
        <thead>
          <tr className="border-b border-neutral-700 text-caption text-neutral-500">
            {/* Drag-handle column has no sort/filter of its own. */}
            <th className="w-8 py-2 pr-2 font-regular">
              <span className="sr-only">Reorder</span>
            </th>
            {/* Thumbnail column has no sort/filter of its own. */}
            <th className="w-16 py-2 pr-2 font-regular">
              <span className="sr-only">Card image</span>
            </th>
            <SortableColumnHeader column="name" {...sortableHeaderProps} />
            <SortableColumnHeader column="variation" {...sortableHeaderProps} />
            <SortableColumnHeader column="set" {...sortableHeaderProps} />
            <SortableColumnHeader column="number" {...sortableHeaderProps} />
            <SortableColumnHeader column="price" {...sortableHeaderProps} />
            <SortableColumnHeader column="priceUpdatedAt" {...sortableHeaderProps} />
            {priceReview && (
              <>
                <th className="py-2 pr-4 font-regular">Variant</th>
                <th className="py-2 pr-4 font-regular">Market price</th>
                <th className="py-2 pr-4 font-regular">Low price</th>
                <th className="py-2 pr-4 font-regular">TCGplayer</th>
                <th className="py-2 pr-4 font-regular">New price</th>
                <th className="py-2 pr-4 font-regular">Change</th>
              </>
            )}
            {/* This list's own trailing Remove/Mark-as-acquired-and-remove
                actions column - no sort/filter of its own. */}
            <th className="py-2 pl-4 font-regular">
              <span className="sr-only">Row actions</span>
            </th>
          </tr>
        </thead>
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

// One entry's row, split out from the table above so its own `useSortable`
// hook (the row is the drag source, drop target, and sortable list item
// all at once, animated via `@dnd-kit/sortable`) can be called once per
// row rather than inside a `.map()` callback, mirroring this codebase's
// existing precedent (e.g. `UnplacedCard`/`BinderSlot`).
function WatchlistEntryRow({
  entry,
  controlsDisabled,
  dragDisabled,
  priceReview,
  onRemove,
  isRemovePending,
  onMarkAcquiredAndRemove,
  isMarkAcquiredPending,
}: {
  entry: WatchlistEntry;
  controlsDisabled: boolean;
  // Story 52: separate from `controlsDisabled` - dragging is also
  // disabled whenever `canReorder` is false (a column sort or active
  // search/filter is applied), independent of the price-review state that
  // `controlsDisabled` alone covers, while Remove/Mark-as-acquired-and-
  // remove stay available either way.
  dragDisabled: boolean;
  priceReview: WatchlistPriceReviewTableProps | null;
  onRemove: (entryId: string) => void;
  isRemovePending: boolean;
  onMarkAcquiredAndRemove: (entryId: string) => void;
  isMarkAcquiredPending: boolean;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: entry.id, disabled: dragDisabled });
  const reviewRow = priceReview?.rows.get(entry.id) ?? null;
  const isReferenced = entry.cardId !== null;
  const isRowPending = isRemovePending || isMarkAcquiredPending;

  return (
    <tr
      ref={setNodeRef}
      // `CSS.Translate` (not `CSS.Transform`) deliberately drops the scale
      // component dnd-kit would otherwise compute from this row's rect vs.
      // the dragged row's rect - rows here can have very differently
      // shaped rects (e.g. against the full-width divider row above), so a
      // scale transform visibly stretched/skewed whichever row it applied
      // to.
      style={{ transform: CSS.Translate.toString(transform), transition }}
      // The dragged row itself lifts above its siblings (`relative z-10`)
      // and dims slightly while every other row animates into its new
      // slot beneath it - the sliding animation itself comes from the
      // `transform`/`transition` style above, driven by `useSortable`.
      className={`border-b border-neutral-800 ${
        isDragging ? 'relative z-10 bg-neutral-800 opacity-90' : ''
      }`}
    >
      <td className="py-2 pr-2 text-center">
        <DragHandle
          disabled={dragDisabled}
          isDragging={isDragging}
          attributes={attributes}
          listeners={listeners}
          setActivatorNodeRef={setActivatorNodeRef}
        />
      </td>
      <td className="py-2 pr-2">
        <ImagePreview src={resolveCardImageUrl(entry.imageUrl)} alt={entry.name}>
          <div className="flex h-12 w-9 items-center justify-center overflow-hidden rounded-standard border border-neutral-700 bg-neutral-800">
            {/* eslint-disable-next-line @next/next/no-img-element -- the
                entry's image comes from an arbitrary backend/provider
                origin, so next/image's fixed-domain optimization doesn't
                apply here. */}
            <img
              src={resolveCardImageUrl(entry.imageUrl)}
              alt={entry.name}
              className="h-full w-full object-contain"
            />
          </div>
        </ImagePreview>
      </td>
      <td className="py-2 pr-4">{entry.name}</td>
      <td className="py-2 pr-4 text-neutral-500">{entry.variation ?? '—'}</td>
      <td className="py-2 pr-4 text-neutral-500">{entry.setName ?? '—'}</td>
      <td className="py-2 pr-4 text-neutral-500">{entry.localNumber ?? '—'}</td>
      <td className="py-2 pr-4">
        {entry.price === null ? (
          <span className="text-neutral-500">--</span>
        ) : priceReview ? (
          <button
            type="button"
            onClick={() => priceReview.onFillPrice(entry.id, entry.price, 'savedPrice')}
            className={`cursor-pointer hover:underline ${
              entry.isManualPrice ? 'text-secondary' : ''
            }`}
          >
            {formatCurrency(entry.price)}
          </button>
        ) : (
          <span className={entry.isManualPrice ? 'text-secondary' : ''}>
            {formatCurrency(entry.price)}
          </span>
        )}
      </td>
      <td className="py-2 pr-4 text-neutral-500">
        {entry.priceUpdatedAt ? new Date(entry.priceUpdatedAt).toLocaleDateString() : '--'}
      </td>
      {priceReview && (
        <WatchlistPriceReviewCells entry={entry} row={reviewRow} priceReview={priceReview} />
      )}
      <td className="py-2 pl-4">
        <div className="flex justify-end gap-2">
          {isReferenced && (
            <Tooltip label="Mark as acquired & remove">
              <button
                type="button"
                disabled={controlsDisabled || isRowPending}
                onClick={() => onMarkAcquiredAndRemove(entry.id)}
                aria-label={`Mark ${entry.name} as acquired and remove from What I'm Looking For`}
                className="flex size-9 cursor-pointer items-center justify-center rounded-standard text-neutral-100 hover:bg-neutral-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <CircleCheck className="size-4" aria-hidden="true" />
              </button>
            </Tooltip>
          )}
          <Tooltip label="Remove from What I'm Looking For">
            <button
              type="button"
              disabled={controlsDisabled || isRowPending}
              onClick={() => onRemove(entry.id)}
              aria-label={`Remove ${entry.name} from What I'm Looking For`}
              className="flex size-9 cursor-pointer items-center justify-center rounded-standard text-neutral-100 hover:bg-neutral-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Trash2 className="size-4" aria-hidden="true" />
            </button>
          </Tooltip>
        </div>
      </td>
    </tr>
  );
}

// This page's 6 expanded review-mode cells for one entry's row, mirroring
// `PriceReviewCells` exactly but keyed by `watchlistEntryId`.
function WatchlistPriceReviewCells({
  entry,
  row,
  priceReview,
}: {
  entry: WatchlistEntry;
  row: PriceReviewRow | null;
  priceReview: WatchlistPriceReviewTableProps;
}) {
  const selectedVariant =
    row?.variants.find((variant) => variant.variantKey === row.selectedVariantKey) ?? null;
  const change = computeCardPriceChange(entry.price, row?.newPrice ?? null);
  const isRowLoading = priceReview.isFetching || row === null;
  const hasPriceAnomaly =
    !!selectedVariant &&
    selectedVariant.marketPrice !== null &&
    selectedVariant.lowPrice !== null &&
    selectedVariant.lowPrice > selectedVariant.marketPrice;

  return (
    <>
      <td className="py-2 pr-4">
        {isRowLoading ? (
          <span className="text-neutral-500">--</span>
        ) : (
          <VariantSelect
            variants={row.variants}
            selectedVariantKey={row.selectedVariantKey}
            onChange={(variantKey) => priceReview.onVariantChange(entry.id, variantKey)}
          />
        )}
      </td>
      <td className="py-2 pr-4">
        {isRowLoading || !selectedVariant || selectedVariant.marketPrice === null ? (
          <span className="text-neutral-500">--</span>
        ) : (
          <button
            type="button"
            onClick={() =>
              priceReview.onFillPrice(entry.id, selectedVariant.marketPrice, 'variant')
            }
            className="cursor-pointer hover:underline"
          >
            {formatCurrency(selectedVariant.marketPrice)}
          </button>
        )}
      </td>
      <td className="py-2 pr-4">
        {isRowLoading || !selectedVariant || selectedVariant.lowPrice === null ? (
          <span className="text-neutral-500">--</span>
        ) : (
          <button
            type="button"
            onClick={() => priceReview.onFillPrice(entry.id, selectedVariant.lowPrice, 'variant')}
            className={`cursor-pointer hover:underline ${hasPriceAnomaly ? 'text-secondary' : ''}`}
          >
            {formatCurrency(selectedVariant.lowPrice)}
          </button>
        )}
      </td>
      <td className="py-2 pr-4">
        {isRowLoading || !row?.tcgplayerUrl ? (
          <span className="text-neutral-500">--</span>
        ) : (
          <a
            href={row.tcgplayerUrl}
            target="_blank"
            rel="noreferrer noopener"
            className="text-primary hover:underline"
          >
            View
          </a>
        )}
      </td>
      <td className="py-2 pr-4">
        <MoneyInput
          min={0}
          disabled={isRowLoading}
          value={row?.newPrice?.toString() ?? ''}
          onChange={(event) => priceReview.onPriceInputChange(entry.id, event.target.value)}
          ariaLabel={`${entry.name} new price`}
          className="w-28"
        />
      </td>
      <td className="py-2 pr-4 whitespace-nowrap">
        {change.direction === null || change.direction === 'unchanged' ? (
          <span className="text-neutral-500">--</span>
        ) : change.direction === 'increase' ? (
          <span className="text-success">▲ +{formatCurrency(change.amount)}</span>
        ) : (
          <span className="text-error">▼ -{formatCurrency(change.amount)}</span>
        )}
      </td>
    </>
  );
}
