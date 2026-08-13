import type { Card } from '@/lib/api';
import { formatCurrency } from '@/shared/finance/formatCurrency';

// Story 37's Card List tab: all client-side derivation logic (search,
// sort, and per-column filtering) lives here as pure functions, kept
// separate from `page.tsx`'s state wiring and the table/dropdown
// components' own rendering, per `docs/data-types.md`'s `CardListState`
// shape.

// The 7 columns that get their own clickable sort header and filter
// dropdown - the original 5 (story 37) plus `price`/`priceUpdatedAt`
// (story 38's saved-price columns, added here after the fact so they get
// the same sort/filter treatment as every other column). "Set + Number"
// (the default combined sort) has no column of its own - see
// `CardListSortOption` below.
export type CardListColumnKey =
  'name' | 'set' | 'number' | 'variation' | 'acquisition' | 'price' | 'priceUpdatedAt';

// One more option than `CardListColumnKey` has entries: `setAndNumber` is
// the default combined sort with no single clickable column header (per
// the story's technical requirements), selectable only via "Reset sort".
export type CardListSortOption = CardListColumnKey | 'setAndNumber';

export type CardListSortDirection = 'ascending' | 'descending';

// Sentinel filter value representing a `null` `setName`/`localNumber`
// (possible for custom cards) - given its own selectable "(None)" filter
// entry per the story's acceptance criteria, rather than being silently
// excluded from every column's distinct-value list.
export const NONE_FILTER_VALUE = '__none__';

export type CardListColumnFilters = Record<CardListColumnKey, Set<string>>;

// Every column's filter defaults to every value selected (no cards
// excluded) - computed once from the full `cards` array so a column's
// available values never change out from under an in-progress filter
// selection just because the currently-filtered results shrank.
export function createDefaultColumnFilters(cards: readonly Card[]): CardListColumnFilters {
  return {
    name: new Set(getDistinctColumnValues(cards, 'name').map((option) => option.value)),
    set: new Set(getDistinctColumnValues(cards, 'set').map((option) => option.value)),
    number: new Set(getDistinctColumnValues(cards, 'number').map((option) => option.value)),
    variation: new Set(getDistinctColumnValues(cards, 'variation').map((option) => option.value)),
    acquisition: new Set(
      getDistinctColumnValues(cards, 'acquisition').map((option) => option.value),
    ),
    price: new Set(getDistinctColumnValues(cards, 'price').map((option) => option.value)),
    priceUpdatedAt: new Set(
      getDistinctColumnValues(cards, 'priceUpdatedAt').map((option) => option.value),
    ),
  };
}

// `priceUpdatedAt`'s filter groups cards by calendar day (matching what
// the table cell actually displays via `toLocaleDateString`) rather than
// by exact timestamp, since two cards updated seconds apart on the same
// day would otherwise never share a filter value. Built from the date's
// local (not UTC) year/month/day so it lines up with `toLocaleDateString`
// exactly, and zero-padded so plain string comparison still sorts
// chronologically.
function toLocalDateKey(isoTimestamp: string): string {
  const date = new Date(isoTimestamp);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

// This card's own filter value for `column` - the same value used both to
// build each column's distinct-value list and to test a card against the
// currently selected filter set.
export function getColumnFilterValue(card: Card, column: CardListColumnKey): string {
  switch (column) {
    case 'name':
      return card.name;
    case 'set':
      return card.setName ?? NONE_FILTER_VALUE;
    case 'number':
      return card.localNumber ?? NONE_FILTER_VALUE;
    case 'variation':
      return card.variation ?? NONE_FILTER_VALUE;
    case 'acquisition':
      return card.acquired ? 'acquired' : 'unacquired';
    case 'price':
      return card.price === null ? NONE_FILTER_VALUE : card.price.toString();
    case 'priceUpdatedAt':
      return card.priceUpdatedAt === null ? NONE_FILTER_VALUE : toLocalDateKey(card.priceUpdatedAt);
  }
}

export interface CardListFilterOption {
  value: string;
  label: string;
}

// This column's distinct values found among every binder card (not just
// the currently-visible subset), for populating its filter dropdown's
// option list. "(None)" always leads the real values here (the opposite of
// the "always sorts last" convention used for sorting the same nullable
// columns below), so it's easy to find/toggle at the top of the dropdown
// rather than scrolling to the bottom.
export function getDistinctColumnValues(
  cards: readonly Card[],
  column: CardListColumnKey,
): CardListFilterOption[] {
  if (column === 'acquisition') {
    // Fixed two-value column - always offered regardless of which values
    // are actually present, so toggling acquisition state never changes
    // this column's available filter options.
    return [
      { value: 'acquired', label: 'Acquired' },
      { value: 'unacquired', label: 'Unacquired' },
    ];
  }

  if (column === 'price' || column === 'priceUpdatedAt') {
    // Unlike the other columns, this filter's value (raw price/local date
    // key, for correct numeric/chronological sorting and exact-match
    // testing) and its label (the same formatted text the table cell
    // itself displays) come from different transforms of the same card
    // field, so they can't share one `value === label` mapping the way
    // the generic branch below does - build the value/label pairing
    // directly from each distinct card instead.
    const labelByValue = new Map<string, string>();
    for (const card of cards) {
      const value = getColumnFilterValue(card, column);
      if (value === NONE_FILTER_VALUE || labelByValue.has(value)) continue;
      const label =
        column === 'price'
          ? formatCurrency(card.price as number)
          : new Date(card.priceUpdatedAt as string).toLocaleDateString();
      labelByValue.set(value, label);
    }
    const hasNone = cards.some((card) => getColumnFilterValue(card, column) === NONE_FILTER_VALUE);

    const sortedEntries = [...labelByValue.entries()].sort(([a], [b]) =>
      column === 'price' ? compareNumberStrings(a, b) : a.localeCompare(b),
    );

    const options: CardListFilterOption[] = sortedEntries.map(([value, label]) => ({
      value,
      label,
    }));
    if (hasNone) {
      options.unshift({ value: NONE_FILTER_VALUE, label: '(None)' });
    }
    return options;
  }

  const values = new Set(cards.map((card) => getColumnFilterValue(card, column)));
  const hasNone = values.has(NONE_FILTER_VALUE);
  values.delete(NONE_FILTER_VALUE);

  const sortedValues = [...values].sort((a, b) =>
    column === 'number' ? compareNumberStrings(a, b) : a.localeCompare(b),
  );

  const options: CardListFilterOption[] = sortedValues.map((value) => ({ value, label: value }));
  if (hasNone) {
    options.unshift({ value: NONE_FILTER_VALUE, label: '(None)' });
  }
  return options;
}

// Compares two card-number strings numerically when both start with a
// parseable number (the common case for real card numbers like "25" or
// "025/102"), falling back to a plain string compare otherwise - "lowest
// to highest" only makes unambiguous sense numerically.
function compareNumberStrings(a: string, b: string): number {
  const aNumber = Number.parseFloat(a);
  const bNumber = Number.parseFloat(b);
  if (!Number.isNaN(aNumber) && !Number.isNaN(bNumber) && aNumber !== bNumber) {
    return aNumber - bNumber;
  }
  return a.localeCompare(b);
}

// The card list's single search input (story 37): matches when the
// trimmed, case-insensitive query is a substring of any of `name`,
// `setName`, `localNumber`, or `variation` (OR logic across fields). An
// empty/whitespace-only query matches every card.
export function matchesCardListSearch(card: Card, searchQuery: string): boolean {
  const trimmed = searchQuery.trim().toLowerCase();
  if (trimmed.length === 0) return true;

  const searchableValues = [
    card.name,
    card.setName ?? '',
    card.localNumber ?? '',
    card.variation ?? '',
  ];
  return searchableValues.some((value) => value.toLowerCase().includes(trimmed));
}

// Every column's current filter selection must include this card's own
// value for that column (AND logic across columns, matching the story's
// technical requirements).
export function matchesCardListFilters(card: Card, filters: CardListColumnFilters): boolean {
  return (Object.keys(filters) as CardListColumnKey[]).every((column) =>
    filters[column].has(getColumnFilterValue(card, column)),
  );
}

// Compares two cards by one column's own value, ascending or descending,
// with a `null` `setName`/`localNumber`/`variation` always sorting last
// regardless of direction (the story's explicit exception to the usual
// ascending/descending flip).
function compareByColumn(
  a: Card,
  b: Card,
  column: 'name' | 'set' | 'number' | 'variation' | 'price' | 'priceUpdatedAt',
  direction: CardListSortDirection,
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
    // ISO timestamps compare correctly under plain string ordering, same
    // as `createdAt`'s tiebreaker comparison below.
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

// The full comparator driving the card list's current sort: dispatches to
// `compareByColumn` for the 4 single-column options, handles the
// `setAndNumber` combined default (always ascending - it has no column
// header of its own to toggle its direction) and the `acquisition`
// column's reversed ascending convention (Acquired first, then
// Unacquired) as explicit exceptions, then falls back to `createdAt`
// ascending as a stable tiebreaker.
export function compareCards(
  a: Card,
  b: Card,
  sortOption: CardListSortOption,
  sortDirection: CardListSortDirection,
): number {
  let cmp: number;

  if (sortOption === 'setAndNumber') {
    cmp = compareByColumn(a, b, 'set', 'ascending');
    if (cmp === 0) cmp = compareByColumn(a, b, 'number', 'ascending');
  } else if (sortOption === 'acquisition') {
    // Ascending means Acquired first, then Unacquired - the story's one
    // exception to the usual ascending/descending flip semantics.
    const rank = (card: Card) => (card.acquired ? 0 : 1);
    cmp = rank(a) - rank(b);
    if (sortDirection === 'descending') cmp = -cmp;
  } else {
    cmp = compareByColumn(a, b, sortOption, sortDirection);
  }

  if (cmp !== 0) return cmp;
  if (a.createdAt !== b.createdAt) return a.createdAt < b.createdAt ? -1 : 1;
  return 0;
}

// The single entry point `page.tsx` calls: applies search, then column
// filters, then sorts the remaining cards - in that order, since sorting
// an already-narrowed list is cheaper and the result is identical either
// way.
export function deriveVisibleCards({
  cards,
  searchQuery,
  columnFilters,
  sortOption,
  sortDirection,
}: {
  cards: readonly Card[];
  searchQuery: string;
  columnFilters: CardListColumnFilters;
  sortOption: CardListSortOption;
  sortDirection: CardListSortDirection;
}): Card[] {
  return cards
    .filter(
      (card) =>
        matchesCardListSearch(card, searchQuery) && matchesCardListFilters(card, columnFilters),
    )
    .sort((a, b) => compareCards(a, b, sortOption, sortDirection));
}
