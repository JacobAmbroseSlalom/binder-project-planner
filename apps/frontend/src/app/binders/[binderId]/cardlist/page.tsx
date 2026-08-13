'use client';

import { useMemo, useState } from 'react';

import { useBinderRouteContext } from '../BinderRouteContext';
import { AppliedFiltersRow } from './_components/AppliedFiltersRow';
import { CardListTable } from './_components/CardListTable';
import { ExportCardListButton } from './_components/ExportCardListButton';
import { ProgressTracker } from './_components/ProgressTracker';
import {
  createDefaultColumnFilters,
  deriveVisibleCards,
  type CardListColumnFilters,
  type CardListColumnKey,
  type CardListSortDirection,
  type CardListSortOption,
} from './_lib/cardListDerivation';

// The default sort - Set + Number, ascending - used both on first render
// and whenever "Reset sort" is clicked.
const DEFAULT_SORT_OPTION: CardListSortOption = 'setAndNumber';
const DEFAULT_SORT_DIRECTION: CardListSortDirection = 'ascending';

// The "Card List" tab (story 37): lists every card in the binder (both
// placed and unplaced) with a search box, sortable/filterable columns, a
// progress tracker, per-entry acquisition toggling, and a print-ready PDF
// export - reusing the already-loaded `cards` array and story 36's
// acquisition mutation from `BinderRouteContext` rather than fetching or
// mutating anything on its own.
export default function BinderCardListPage() {
  const {
    binder,
    cards,
    toggleCardAcquired,
    pendingCardAcquiredToggleIds,
    toggleCardsAcquisition,
    isBulkAcquisitionPending,
  } = useBinderRouteContext();

  const [searchQuery, setSearchQuery] = useState('');
  const [sortOption, setSortOption] = useState<CardListSortOption>(DEFAULT_SORT_OPTION);
  const [sortDirection, setSortDirection] = useState<CardListSortDirection>(DEFAULT_SORT_DIRECTION);
  // Each column's filter starts with every one of its distinct values
  // selected (no cards excluded) - recomputed only when the binder's own
  // card set changes size (a card added/removed), not on every render.
  const [columnFilters, setColumnFilters] = useState<CardListColumnFilters>(() =>
    createDefaultColumnFilters(cards),
  );

  const visibleCards = useMemo(
    () =>
      deriveVisibleCards({
        cards,
        searchQuery,
        columnFilters,
        sortOption,
        sortDirection,
      }),
    [cards, searchQuery, columnFilters, sortOption, sortDirection],
  );

  const isDefaultSort =
    sortOption === DEFAULT_SORT_OPTION && sortDirection === DEFAULT_SORT_DIRECTION;

  // A column header click either selects that column ascending (if it
  // wasn't already active) or flips its direction (if it was) - the
  // story's technical requirement for the 4 single-column headers.
  function handleSortColumnClick(column: CardListColumnKey) {
    if (sortOption === column) {
      setSortDirection((current) => (current === 'ascending' ? 'descending' : 'ascending'));
    } else {
      setSortOption(column);
      setSortDirection('ascending');
    }
  }

  // Resets search, sort, and every column's filter back to their defaults
  // - the "Applied filters" row's single combined reset control.
  function handleResetAll() {
    setSearchQuery('');
    setSortOption(DEFAULT_SORT_OPTION);
    setSortDirection(DEFAULT_SORT_DIRECTION);
    setColumnFilters(createDefaultColumnFilters(cards));
  }

  function handleColumnFilterChange(column: CardListColumnKey, next: Set<string>) {
    setColumnFilters((current) => ({ ...current, [column]: next }));
  }

  // Story 46's header select-all/deselect-all control: bulk-toggles every
  // currently visible (search/filter-derived) card to `acquired` in one
  // request, rather than the currently displayed set including cards
  // hidden by the active search/filters.
  function handleToggleAllAcquisition(acquired: boolean) {
    toggleCardsAcquisition(
      visibleCards.map((card) => card.id),
      acquired,
    );
  }

  return (
    <div className="flex flex-col gap-2 px-8 pb-8">
      <div className="mt-4 flex items-center gap-4">
        <input
          type="text"
          value={searchQuery}
          onChange={(event) => setSearchQuery(event.target.value)}
          placeholder="Search by name, set, number, or variation"
          aria-label="Search the card list"
          className="flex-1 rounded-standard border border-transparent bg-neutral-800 px-3 py-2 focus:border-primary focus:outline-none"
        />
        <ProgressTracker cards={cards} />
        <ExportCardListButton binderId={binder.id} cardIds={visibleCards.map((card) => card.id)} />
      </div>

      <AppliedFiltersRow
        allCards={cards}
        columnFilters={columnFilters}
        isDefaultSort={isDefaultSort}
        hasActiveSearch={searchQuery.trim().length > 0}
        onResetAll={handleResetAll}
      />

      <CardListTable
        allCards={cards}
        visibleCards={visibleCards}
        sortOption={sortOption}
        sortDirection={sortDirection}
        onSortColumnClick={handleSortColumnClick}
        columnFilters={columnFilters}
        onColumnFilterChange={handleColumnFilterChange}
        onToggleAcquired={toggleCardAcquired}
        pendingCardAcquiredToggleIds={pendingCardAcquiredToggleIds}
        onToggleAllAcquisition={handleToggleAllAcquisition}
        isBulkAcquisitionPending={isBulkAcquisitionPending}
      />
    </div>
  );
}
