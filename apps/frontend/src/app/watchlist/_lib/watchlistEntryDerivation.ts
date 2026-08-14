import type { WatchlistEntry } from '@/lib/api';
import { formatCurrency } from '@/shared/finance/formatCurrency';

// Story 45's What I'm Looking For page: client-side search, sort, and
// per-column filtering, mirroring the Card List tab's own
// `cardListDerivation.ts` almost exactly - the only structural difference
// is this list has no Acquisition column at all (the story's "columns
// match the Card List's columns, minus Acquisition"), so `acquisition` is
// dropped from every column-keyed type/function below rather than kept
// and simply hidden.
export type WatchlistColumnKey =
  'name' | 'set' | 'number' | 'variation' | 'price' | 'priceUpdatedAt';

// One more option than `WatchlistColumnKey` has entries: `setAndNumber` is
// the default combined sort with no single clickable column header,
// mirroring `CardListSortOption`.
export type WatchlistSortOption = WatchlistColumnKey | 'setAndNumber';

export type WatchlistSortDirection = 'ascending' | 'descending';

// Sentinel filter value representing a `null` `setName`/`localNumber`/
// `variation`, mirroring `NONE_FILTER_VALUE` in `cardListDerivation.ts`.
export const NONE_FILTER_VALUE = '__none__';

export type WatchlistColumnFilters = Record<WatchlistColumnKey, Set<string>>;

// Every column's filter defaults to every value selected (no entries
// excluded) - computed once from the full `entries` array.
export function createDefaultWatchlistColumnFilters(
  entries: readonly WatchlistEntry[],
): WatchlistColumnFilters {
  return {
    name: new Set(getDistinctWatchlistColumnValues(entries, 'name').map((option) => option.value)),
    set: new Set(getDistinctWatchlistColumnValues(entries, 'set').map((option) => option.value)),
    number: new Set(
      getDistinctWatchlistColumnValues(entries, 'number').map((option) => option.value),
    ),
    variation: new Set(
      getDistinctWatchlistColumnValues(entries, 'variation').map((option) => option.value),
    ),
    price: new Set(
      getDistinctWatchlistColumnValues(entries, 'price').map((option) => option.value),
    ),
    priceUpdatedAt: new Set(
      getDistinctWatchlistColumnValues(entries, 'priceUpdatedAt').map((option) => option.value),
    ),
  };
}

// `priceUpdatedAt`'s filter groups entries by calendar day, mirroring
// `cardListDerivation.ts`'s own `toLocalDateKey`.
function toLocalDateKey(isoTimestamp: string): string {
  const date = new Date(isoTimestamp);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

// This entry's own filter value for `column`.
export function getWatchlistColumnFilterValue(
  entry: WatchlistEntry,
  column: WatchlistColumnKey,
): string {
  switch (column) {
    case 'name':
      return entry.name;
    case 'set':
      return entry.setName ?? NONE_FILTER_VALUE;
    case 'number':
      return entry.localNumber ?? NONE_FILTER_VALUE;
    case 'variation':
      return entry.variation ?? NONE_FILTER_VALUE;
    case 'price':
      return entry.price === null ? NONE_FILTER_VALUE : entry.price.toString();
    case 'priceUpdatedAt':
      return entry.priceUpdatedAt === null
        ? NONE_FILTER_VALUE
        : toLocalDateKey(entry.priceUpdatedAt);
  }
}

export interface WatchlistFilterOption {
  value: string;
  label: string;
}

// This column's distinct values found among every entry (not just the
// currently-visible subset), for populating its filter dropdown's option
// list, mirroring `getDistinctColumnValues`.
export function getDistinctWatchlistColumnValues(
  entries: readonly WatchlistEntry[],
  column: WatchlistColumnKey,
): WatchlistFilterOption[] {
  if (column === 'price' || column === 'priceUpdatedAt') {
    const labelByValue = new Map<string, string>();
    for (const entry of entries) {
      const value = getWatchlistColumnFilterValue(entry, column);
      if (value === NONE_FILTER_VALUE || labelByValue.has(value)) continue;
      const label =
        column === 'price'
          ? formatCurrency(entry.price as number)
          : new Date(entry.priceUpdatedAt as string).toLocaleDateString();
      labelByValue.set(value, label);
    }
    const hasNone = entries.some(
      (entry) => getWatchlistColumnFilterValue(entry, column) === NONE_FILTER_VALUE,
    );

    const sortedEntries = [...labelByValue.entries()].sort(([a], [b]) =>
      column === 'price' ? compareNumberStrings(a, b) : a.localeCompare(b),
    );

    const options: WatchlistFilterOption[] = sortedEntries.map(([value, label]) => ({
      value,
      label,
    }));
    if (hasNone) {
      options.unshift({ value: NONE_FILTER_VALUE, label: '(None)' });
    }
    return options;
  }

  const values = new Set(entries.map((entry) => getWatchlistColumnFilterValue(entry, column)));
  const hasNone = values.has(NONE_FILTER_VALUE);
  values.delete(NONE_FILTER_VALUE);

  const sortedValues = [...values].sort((a, b) =>
    column === 'number' ? compareNumberStrings(a, b) : a.localeCompare(b),
  );

  const options: WatchlistFilterOption[] = sortedValues.map((value) => ({ value, label: value }));
  if (hasNone) {
    options.unshift({ value: NONE_FILTER_VALUE, label: '(None)' });
  }
  return options;
}

// Compares two entries' number-column strings numerically when both start
// with a parseable number, mirroring `cardListDerivation.ts`'s own
// `compareNumberStrings`.
function compareNumberStrings(a: string, b: string): number {
  const aNumber = Number.parseFloat(a);
  const bNumber = Number.parseFloat(b);
  if (!Number.isNaN(aNumber) && !Number.isNaN(bNumber) && aNumber !== bNumber) {
    return aNumber - bNumber;
  }
  return a.localeCompare(b);
}

// The page's single search input: matches when the trimmed,
// case-insensitive query is a substring of any of `name`, `setName`,
// `localNumber`, or `variation` (OR logic across fields), mirroring
// `matchesCardListSearch`.
export function matchesWatchlistSearch(entry: WatchlistEntry, searchQuery: string): boolean {
  const trimmed = searchQuery.trim().toLowerCase();
  if (trimmed.length === 0) return true;

  const searchableValues = [
    entry.name,
    entry.setName ?? '',
    entry.localNumber ?? '',
    entry.variation ?? '',
  ];
  return searchableValues.some((value) => value.toLowerCase().includes(trimmed));
}

// Every column's current filter selection must include this entry's own
// value for that column (AND logic across columns), mirroring
// `matchesCardListFilters`.
export function matchesWatchlistFilters(
  entry: WatchlistEntry,
  filters: WatchlistColumnFilters,
): boolean {
  return (Object.keys(filters) as WatchlistColumnKey[]).every((column) =>
    filters[column].has(getWatchlistColumnFilterValue(entry, column)),
  );
}

// Compares two entries by one column's own value, ascending or
// descending, with a `null` `setName`/`localNumber`/`variation` always
// sorting last regardless of direction, mirroring `compareByColumn`.
function compareByColumn(
  a: WatchlistEntry,
  b: WatchlistEntry,
  column: 'name' | 'set' | 'number' | 'variation' | 'price' | 'priceUpdatedAt',
  direction: WatchlistSortDirection,
): number {
  if (column === 'name') {
    const cmp = a.name.localeCompare(b.name);
    return direction === 'ascending' ? cmp : -cmp;
  }

  if (column === 'price') {
    const aValue = a.price;
    const bValue = b.price;
    if (aValue === null && bValue === null) return 0;
    if (aValue === null) return 1;
    if (bValue === null) return -1;
    const cmp = aValue - bValue;
    return direction === 'ascending' ? cmp : -cmp;
  }

  if (column === 'priceUpdatedAt') {
    const aValue = a.priceUpdatedAt;
    const bValue = b.priceUpdatedAt;
    if (aValue === null && bValue === null) return 0;
    if (aValue === null) return 1;
    if (bValue === null) return -1;
    const cmp = aValue.localeCompare(bValue);
    return direction === 'ascending' ? cmp : -cmp;
  }

  const aValue = column === 'set' ? a.setName : column === 'number' ? a.localNumber : a.variation;
  const bValue = column === 'set' ? b.setName : column === 'number' ? b.localNumber : b.variation;
  if (aValue === null && bValue === null) return 0;
  if (aValue === null) return 1;
  if (bValue === null) return -1;

  const cmp =
    column === 'number' ? compareNumberStrings(aValue, bValue) : aValue.localeCompare(bValue);
  return direction === 'ascending' ? cmp : -cmp;
}

// The full comparator driving the page's active column sort: dispatches
// to `compareByColumn` for the 5 single-column options, handles the
// `setAndNumber` combined default (always ascending), then falls back to
// `createdAt` ascending as a stable tiebreaker, mirroring `compareCards`
// (minus its `acquisition` branch, which has no equivalent here).
export function compareWatchlistEntries(
  a: WatchlistEntry,
  b: WatchlistEntry,
  sortOption: WatchlistSortOption,
  sortDirection: WatchlistSortDirection,
): number {
  let cmp: number;

  if (sortOption === 'setAndNumber') {
    cmp = compareByColumn(a, b, 'set', 'ascending');
    if (cmp === 0) cmp = compareByColumn(a, b, 'number', 'ascending');
  } else {
    cmp = compareByColumn(a, b, sortOption, sortDirection);
  }

  if (cmp !== 0) return cmp;
  if (a.createdAt !== b.createdAt) return a.createdAt < b.createdAt ? -1 : 1;
  return 0;
}

// The single entry point the watchlist page calls: applies search, then
// column filters, then sorts the remaining entries by the active column
// sort - the page itself applies any manual drag order on top of this
// result, per the story's "manual order... persists across search/filter
// changes" requirement.
export function deriveVisibleWatchlistEntries({
  entries,
  searchQuery,
  columnFilters,
  sortOption,
  sortDirection,
}: {
  entries: readonly WatchlistEntry[];
  searchQuery: string;
  columnFilters: WatchlistColumnFilters;
  sortOption: WatchlistSortOption;
  sortDirection: WatchlistSortDirection;
}): WatchlistEntry[] {
  return entries
    .filter(
      (entry) =>
        matchesWatchlistSearch(entry, searchQuery) && matchesWatchlistFilters(entry, columnFilters),
    )
    .sort((a, b) => compareWatchlistEntries(a, b, sortOption, sortDirection));
}
