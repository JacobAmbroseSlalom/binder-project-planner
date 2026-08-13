'use client';

import { useEffect, useMemo, useState } from 'react';

import { LoadingIndicator } from '@/shared/feedback';
import { useSetNavigationGuardMessage } from '@/shared/navigation';

import { useBinderRouteContext } from '../BinderRouteContext';
import { AppliedFiltersRow } from './_components/AppliedFiltersRow';
import { CardListTable } from './_components/CardListTable';
import { CardListTotals } from './_components/CardListTotals';
import { ExportCardListButton } from './_components/ExportCardListButton';
import {
  createDefaultColumnFilters,
  deriveVisibleCards,
  type CardListColumnFilters,
  type CardListColumnKey,
  type CardListSortDirection,
  type CardListSortOption,
} from './_lib/cardListDerivation';
import { useCardPriceReview } from './useCardPriceReview';

// The default sort - Set + Number, ascending - used both on first render
// and whenever "Reset sort" is clicked.
const DEFAULT_SORT_OPTION: CardListSortOption = 'setAndNumber';
const DEFAULT_SORT_DIRECTION: CardListSortDirection = 'ascending';

// Shown while a price-review-in-progress leaves unsaved new-price values,
// both for the in-app navigation guard (tab switches, the app header's
// home link) and the browser-native `beforeunload` prompt (tab close/
// refresh/external navigation).
const UNSAVED_PRICE_REVIEW_MESSAGE = 'You have unsaved card price changes. Leave without saving?';

// The "Card List" tab (story 37): lists every card in the binder (both
// placed and unplaced) with a search box, sortable/filterable columns, a
// progress tracker, per-entry acquisition toggling, and a print-ready PDF
// export - reusing the already-loaded `cards` array and story 36's
// acquisition mutation from `BinderRouteContext` rather than fetching or
// mutating anything on its own. Story 38 adds a price-review workflow
// ("Fetch card prices" -> adjust each row's variant/new-price -> "Save
// all"/"Cancel") plus a totals row, both driven by `useCardPriceReview`.
export default function BinderCardListPage() {
  const {
    binder,
    cards,
    setCards,
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

  const {
    isPriceReviewActive,
    isFetchingCardPrices,
    isSavingCardPrices,
    priceReviewRows,
    startPriceReview,
    cancelPriceReview,
    updateReviewVariant,
    setReviewPrice,
    savePriceReview,
  } = useCardPriceReview({ binderId: binder.id, cards, setCards });

  // Registers the in-app "navigate away" guard for the whole lifetime of
  // an active price review (both while fetching and while the user is
  // still adjusting rows) - clears itself automatically on unmount or once
  // the review ends (save/cancel).
  useSetNavigationGuardMessage(isPriceReviewActive, UNSAVED_PRICE_REVIEW_MESSAGE);

  // The browser-native equivalent of the above guard, for a tab close,
  // refresh, or typed/bookmarked navigation the in-app guard can't
  // intercept.
  useEffect(() => {
    if (!isPriceReviewActive) return;

    function handleBeforeUnload(event: BeforeUnloadEvent) {
      event.preventDefault();
    }

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [isPriceReviewActive]);

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

  // Starts the price-review workflow (story 38): fetches prices only for
  // the currently filtered/displayed cards (`visibleCards`), per this
  // story's AC - the active search/sort/filter state is left alone rather
  // than cleared, since it's what determines this review's scope.
  function handleFetchCardPrices() {
    startPriceReview(visibleCards.map((card) => card.id));
  }

  function handlePriceInputChange(cardId: string, rawValue: string) {
    const parsed = rawValue.trim() === '' ? null : Number.parseFloat(rawValue);
    setReviewPrice(cardId, parsed === null || Number.isNaN(parsed) ? null : parsed, 'manual');
  }

  return (
    <div className="flex flex-col gap-2 px-8 pb-8">
      <CardListTotals
        allCards={cards}
        unacquiredCards={cards.filter((card) => !card.acquired)}
        filteredCards={visibleCards}
        className="mt-4 justify-center text-center"
      />

      <div className="flex items-center gap-4">
        <input
          type="text"
          value={searchQuery}
          onChange={(event) => setSearchQuery(event.target.value)}
          placeholder="Search by name, set, number, or variation"
          aria-label="Search the card list"
          disabled={isPriceReviewActive}
          className="flex-1 rounded-standard border border-transparent bg-neutral-800 px-3 py-2 focus:border-primary focus:outline-none disabled:cursor-not-allowed disabled:opacity-50"
        />
        {isPriceReviewActive ? (
          <>
            <button
              type="button"
              disabled={isSavingCardPrices}
              onClick={cancelPriceReview}
              className="cursor-pointer rounded-standard px-4 py-2 font-bold text-neutral-100 hover:bg-neutral-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={isFetchingCardPrices || isSavingCardPrices}
              onClick={savePriceReview}
              className="cursor-pointer rounded-standard bg-primary px-4 py-2 font-bold hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Save all
            </button>
          </>
        ) : (
          <button
            type="button"
            onClick={handleFetchCardPrices}
            className="cursor-pointer rounded-standard bg-primary px-4 py-2 font-bold whitespace-nowrap hover:brightness-110"
          >
            Fetch card prices
          </button>
        )}
        {isFetchingCardPrices && (
          <LoadingIndicator label="Fetching card prices…" size="5" className="" />
        )}
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
        priceReview={
          isPriceReviewActive
            ? {
                isFetching: isFetchingCardPrices,
                rows: priceReviewRows,
                onVariantChange: updateReviewVariant,
                onPriceInputChange: handlePriceInputChange,
                onFillPrice: setReviewPrice,
              }
            : null
        }
      />
    </div>
  );
}
