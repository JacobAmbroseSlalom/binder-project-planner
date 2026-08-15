'use client';

import { ArrowDown, ArrowUp, ArrowUpDown } from 'lucide-react';

import type { WatchlistEntry } from '@/lib/api';

import { COLUMN_LABELS } from '../_lib/watchlistColumns';
import {
  getDistinctWatchlistColumnValues,
  type WatchlistColumnFilters,
  type WatchlistColumnKey,
  type WatchlistSortDirection,
  type WatchlistSortOption,
} from '../_lib/watchlistEntryDerivation';
import { ColumnFilterDropdown } from './ColumnFilterDropdown';

// One sortable column's header cell, mirroring `SortableColumnHeader` in
// the Card List tab (no `headerAccessory`/`align` props - this table has
// no Acquisition-style centered icon column, so those variants have no
// equivalent here).
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

// The What I'm Looking For table's `<thead>`, extracted out of
// `WatchlistEntryTable` (which was growing past this house-cleaning
// pass's line-count threshold) - mirrors `CardListTableHeader`'s own
// extraction.
export function WatchlistEntryTableHeader({
  allEntries,
  sortOption,
  sortDirection,
  onSortColumnClick,
  columnFilters,
  onColumnFilterChange,
  isPriceReviewActive,
  disabled,
}: {
  allEntries: readonly WatchlistEntry[];
  sortOption: WatchlistSortOption;
  sortDirection: WatchlistSortDirection;
  onSortColumnClick: (column: WatchlistColumnKey) => void;
  columnFilters: WatchlistColumnFilters;
  onColumnFilterChange: (column: WatchlistColumnKey, next: Set<string>) => void;
  isPriceReviewActive: boolean;
  disabled: boolean;
}) {
  const sortableHeaderProps = {
    allEntries,
    sortOption,
    sortDirection,
    onSortColumnClick,
    columnFilters,
    onColumnFilterChange,
    disabled,
  };

  return (
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
        {isPriceReviewActive && (
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
  );
}
