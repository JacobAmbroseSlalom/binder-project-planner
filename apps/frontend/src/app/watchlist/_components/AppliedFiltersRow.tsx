'use client';

import type { WatchlistEntry } from '@/lib/api';

import {
  getDistinctWatchlistColumnValues,
  type WatchlistColumnFilters,
  type WatchlistColumnKey,
} from '../_lib/watchlistEntryDerivation';

// Fixed left-to-right pill order, matching the table's column order (minus
// the non-filterable thumbnail/drag-handle columns and the trailing
// actions column) - mirrors the Card List tab's own `COLUMN_ORDER` minus
// `acquisition`, which has no equivalent on this page.
const COLUMN_ORDER: WatchlistColumnKey[] = [
  'name',
  'set',
  'number',
  'variation',
  'price',
  'priceUpdatedAt',
];

const COLUMN_PILL_LABELS: Record<WatchlistColumnKey, string> = {
  name: 'Names',
  set: 'Sets',
  number: 'Numbers',
  variation: 'Variations',
  price: 'Prices',
  priceUpdatedAt: 'Price updated dates',
};

const MAX_LISTED_VALUES = 3;

// Story 45's "Applied filters" row for the What I'm Looking For page - a
// copy of the Card List tab's own `AppliedFiltersRow`, minus its
// Acquisition column pill, operating over `WatchlistEntry` instead of
// `Card`.
export function AppliedFiltersRow({
  allEntries,
  columnFilters,
  isDefaultSort,
  hasActiveSearch,
  onResetAll,
}: {
  allEntries: readonly WatchlistEntry[];
  columnFilters: WatchlistColumnFilters;
  isDefaultSort: boolean;
  hasActiveSearch: boolean;
  onResetAll: () => void;
}) {
  const pills = COLUMN_ORDER.map((column) => {
    const options = getDistinctWatchlistColumnValues(allEntries, column);
    const selected = columnFilters[column];
    const isFiltered = selected.size < options.length;
    if (!isFiltered) return null;

    const selectedOptions = options.filter((option) => selected.has(option.value));
    const valuesText =
      selectedOptions.length > MAX_LISTED_VALUES
        ? `${selectedOptions.length} Selected`
        : selectedOptions.map((option) => option.label).join(', ');

    return { column, text: `${COLUMN_PILL_LABELS[column]}: ${valuesText}` };
  }).filter((pill): pill is { column: WatchlistColumnKey; text: string } => pill !== null);

  const hasAnythingToReset = pills.length > 0 || !isDefaultSort || hasActiveSearch;

  return (
    <div className="flex min-h-9 flex-wrap items-center gap-2">
      {hasAnythingToReset && (
        <button
          type="button"
          onClick={onResetAll}
          className="shrink-0 cursor-pointer rounded-standard px-2 py-1 font-bold text-primary hover:brightness-110"
        >
          Reset sort &amp; filters
        </button>
      )}
      {pills.length > 0 && (
        <>
          <span className="text-caption text-neutral-500">Applied filters:</span>
          {pills.map((pill) => (
            <span
              key={pill.column}
              className="rounded-full bg-neutral-800 px-3 py-1 text-caption text-neutral-100"
            >
              {pill.text}
            </span>
          ))}
        </>
      )}
    </div>
  );
}
