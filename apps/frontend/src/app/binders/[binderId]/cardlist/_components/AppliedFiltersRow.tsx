'use client';

import type { Card } from '@/lib/api';

import {
  getDistinctColumnValues,
  type CardListColumnFilters,
  type CardListColumnKey,
} from '../_lib/cardListDerivation';

// Fixed left-to-right pill order, matching the table's column order (minus
// the non-filterable thumbnail column).
const COLUMN_ORDER: CardListColumnKey[] = [
  'name',
  'set',
  'number',
  'variation',
  'acquisition',
  'price',
  'priceUpdatedAt',
];

// Each column's plural/summary label for its pill - distinct from
// `CardListTable`'s singular column header labels ("Set" vs "Sets") since
// a pill summarizes potentially many selected values for that column.
const COLUMN_PILL_LABELS: Record<CardListColumnKey, string> = {
  name: 'Names',
  set: 'Sets',
  number: 'Numbers',
  variation: 'Variations',
  acquisition: 'Acquisition',
  price: 'Prices',
  priceUpdatedAt: 'Price updated dates',
};

// Above this many selected values, a pill shows a count ("5 Selected")
// instead of listing every selected value by name - keeps a
// heavily-narrowed column's pill from growing unreasonably wide.
const MAX_LISTED_VALUES = 3;

// Story 37's "Applied filters" row: below the search bar, summarizes every
// column with an active filter as its own pill, plus a single button that
// resets both sort and every column filter back to their defaults. Always
// renders at a fixed minimum height (even with nothing to show) so the
// table below never shifts as filters/sort are applied and cleared.
export function AppliedFiltersRow({
  allCards,
  columnFilters,
  isDefaultSort,
  hasActiveSearch,
  onResetAll,
}: {
  // Every binder card, used only to compute each column's full
  // distinct-value list, needed to tell whether a column's current
  // selection is actually a filter (fewer than every value selected) and
  // to look up each selected value's display label.
  allCards: readonly Card[];
  columnFilters: CardListColumnFilters;
  // Whether the current sort is already the default (Set + Number,
  // ascending) - the reset button is hidden when this, `hasActiveSearch`,
  // and every column's filter are all at their defaults, since there'd be
  // nothing to reset.
  isDefaultSort: boolean;
  // Whether the search box currently has a non-empty query - the reset
  // button should surface even when sort/filters are untouched, so the
  // user always has a one-click way back to the unfiltered list once
  // they've started typing.
  hasActiveSearch: boolean;
  // Resets the search query, sort, and every column's filter back to
  // their defaults.
  onResetAll: () => void;
}) {
  const pills = COLUMN_ORDER.map((column) => {
    const options = getDistinctColumnValues(allCards, column);
    const selected = columnFilters[column];
    const isFiltered = selected.size < options.length;
    if (!isFiltered) return null;

    const selectedOptions = options.filter((option) => selected.has(option.value));
    const valuesText =
      selectedOptions.length > MAX_LISTED_VALUES
        ? `${selectedOptions.length} Selected`
        : selectedOptions.map((option) => option.label).join(', ');

    return { column, text: `${COLUMN_PILL_LABELS[column]}: ${valuesText}` };
  }).filter((pill): pill is { column: CardListColumnKey; text: string } => pill !== null);

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
