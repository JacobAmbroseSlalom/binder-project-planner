'use client';

import { DndContext, useDraggable, useDroppable, type DragEndEvent } from '@dnd-kit/core';
import {
  CARD_DRAG_ACTIVATION_DISTANCE_PX,
  WATCHLIST_PDF_MAX_ENTRIES,
} from '@binder-project-planner/shared';
import { ArrowDown, ArrowUp, ArrowUpDown, CircleCheck, GripVertical, Trash2 } from 'lucide-react';
import { Fragment } from 'react';
import { PointerSensor, useSensor, useSensors } from '@dnd-kit/core';

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

// One row's drag handle (story 45's manual reordering): a small grip icon,
// draggable via `@dnd-kit/core`'s bare `useDraggable` (this project's
// existing dependency - no `@dnd-kit/sortable` addition, per the story's
// technical requirements) - the drop target is the enclosing `<tr>` itself
// (see `WatchlistEntryRow` below), so hovering anywhere over another row
// while dragging (not just its own handle) registers as a valid drop.
function DragHandle({ entryId, disabled }: { entryId: string; disabled?: boolean }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: entryId,
    disabled,
  });
  return (
    <Tooltip label="Drag to reorder">
      <button
        ref={setNodeRef}
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
  // The already search/sort/filter-derived (and possibly manually
  // reordered) entries to render as rows.
  visibleEntries: readonly WatchlistEntry[];
  sortOption: WatchlistSortOption;
  sortDirection: WatchlistSortDirection;
  onSortColumnClick: (column: WatchlistColumnKey) => void;
  columnFilters: WatchlistColumnFilters;
  onColumnFilterChange: (column: WatchlistColumnKey, next: Set<string>) => void;
  // Story 45's manual drag-and-drop reorder: called with the dragged
  // entry's id and the id of the row it was dropped onto - the page owns
  // translating this into its own client-only ordered-id-list state.
  onReorder: (draggedEntryId: string, targetEntryId: string) => void;
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

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    onReorder(active.id as string, over.id as string);
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
          {visibleEntries.map((entry, index) => (
            <Fragment key={entry.id}>
              {/* Story 45's PDF export cutoff (`WATCHLIST_PDF_MAX_ENTRIES`):
                  the backend's fixed page 1 layout can't fit more than 40
                  cards on one page, so only the entries above this divider
                  are ever sent to the export button - shown here (as a
                  plain line, with the explanation in a native hover title
                  rather than the shared `Tooltip`, since this is a passive
                  divider rather than an actionable icon button) so the
                  cutoff is visible before the user exports. */}
              {index === WATCHLIST_PDF_MAX_ENTRIES && (
                <tr aria-hidden="true">
                  <td colSpan={getTotalColumnCount(priceReview !== null)} className="p-0">
                    <div
                      title="Only cards above this line are included in the PDF export"
                      className="border-t-2 border-secondary"
                    />
                  </td>
                </tr>
              )}
              <WatchlistEntryRow
                entry={entry}
                controlsDisabled={controlsDisabled}
                priceReview={priceReview}
                onRemove={onRemove}
                isRemovePending={pendingRemoveIds.has(entry.id)}
                onMarkAcquiredAndRemove={onMarkAcquiredAndRemove}
                isMarkAcquiredPending={pendingMarkAcquiredIds.has(entry.id)}
              />
            </Fragment>
          ))}
        </tbody>
      </table>
    </DndContext>
  );
}

// One entry's row, split out from the table above so its own
// `useDroppable` drop-target hook (the row is the reorder drop target;
// `DragHandle` above is the drag source) can be called once per row rather
// than inside a `.map()` callback, mirroring this codebase's existing
// precedent (e.g. `UnplacedCard`/`BinderSlot`).
function WatchlistEntryRow({
  entry,
  controlsDisabled,
  priceReview,
  onRemove,
  isRemovePending,
  onMarkAcquiredAndRemove,
  isMarkAcquiredPending,
}: {
  entry: WatchlistEntry;
  controlsDisabled: boolean;
  priceReview: WatchlistPriceReviewTableProps | null;
  onRemove: (entryId: string) => void;
  isRemovePending: boolean;
  onMarkAcquiredAndRemove: (entryId: string) => void;
  isMarkAcquiredPending: boolean;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: entry.id });
  const reviewRow = priceReview?.rows.get(entry.id) ?? null;
  const isReferenced = entry.cardId !== null;
  const isRowPending = isRemovePending || isMarkAcquiredPending;

  return (
    <tr
      ref={setNodeRef}
      className={`border-b border-neutral-800 ${isOver ? 'bg-neutral-800' : ''}`}
    >
      <td className="py-2 pr-2 text-center">
        <DragHandle entryId={entry.id} disabled={controlsDisabled} />
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
