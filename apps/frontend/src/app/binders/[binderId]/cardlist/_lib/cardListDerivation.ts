import type { Card } from '@/lib/api';

// Story 37's Card List tab: all client-side derivation logic (search,
// sort, and per-column filtering) lives here as pure functions, kept
// separate from `page.tsx`'s state wiring and the table/dropdown
// components' own rendering, per `docs/data-types.md`'s `CardListState`
// shape.

// The 4 columns that get their own clickable sort header and filter
// dropdown. "Set + Number" (the default combined sort) has no column of
// its own - see `CardListSortOption` below.
export type CardListColumnKey = 'name' | 'set' | 'number' | 'acquisition';

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
    acquisition: new Set(
      getDistinctColumnValues(cards, 'acquisition').map((option) => option.value),
    ),
  };
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
    case 'acquisition':
      return card.acquired ? 'acquired' : 'unacquired';
  }
}

export interface CardListFilterOption {
  value: string;
  label: string;
}

// This column's distinct values found among every binder card (not just
// the currently-visible subset), for populating its filter dropdown's
// option list. Sorted so "(None)" always trails the real values, matching
// the "always sorts last" convention used for sorting the same nullable
// columns below.
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

  const values = new Set(cards.map((card) => getColumnFilterValue(card, column)));
  const hasNone = values.has(NONE_FILTER_VALUE);
  values.delete(NONE_FILTER_VALUE);

  const sortedValues = [...values].sort((a, b) =>
    column === 'number' ? compareNumberStrings(a, b) : a.localeCompare(b),
  );

  const options: CardListFilterOption[] = sortedValues.map((value) => ({ value, label: value }));
  if (hasNone) {
    options.push({ value: NONE_FILTER_VALUE, label: '(None)' });
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
// with a `null` `setName`/`localNumber` always sorting last regardless of
// direction (the story's explicit exception to the usual ascending/
// descending flip).
function compareByColumn(
  a: Card,
  b: Card,
  column: 'name' | 'set' | 'number',
  direction: CardListSortDirection,
): number {
  if (column === 'name') {
    const cmp = a.name.localeCompare(b.name);
    return direction === 'ascending' ? cmp : -cmp;
  }

  const aValue = column === 'set' ? a.setName : a.localNumber;
  const bValue = column === 'set' ? b.setName : b.localNumber;
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
