'use client';

import { WATCHLIST_PDF_MAX_ENTRIES } from '@binder-project-planner/shared';
import { Plus } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';

import {
  createWatchlistEntriesBulk,
  createWatchlistEntry,
  deleteWatchlistEntry,
  listWatchlistEntries,
  markWatchlistEntryAcquired,
  updateWatchlistEntryOrder,
  type TcgDexCatalogCard,
  type WatchlistEntry,
} from '@/lib/api';
import {
  LoadingIndicator,
  Tooltip,
  toProblemDetailsInfo,
  useSaveStatusToast,
  useToastContext,
} from '@/shared/feedback';
import { useSetAppHeaderTitle, useSetNavigationGuardMessage } from '@/shared/navigation';

import { AppliedFiltersRow } from './_components/AppliedFiltersRow';
import { ExportWatchlistPdfButton } from './_components/ExportWatchlistPdfButton';
import { WatchlistCardSelectionModal } from './_components/WatchlistCardSelectionModal';
import { WatchlistEntryTable } from './_components/WatchlistEntryTable';
import { WatchlistTotals } from './_components/WatchlistTotals';
import {
  createDefaultWatchlistColumnFilters,
  deriveVisibleWatchlistEntries,
  hasActiveWatchlistColumnFilters,
  type WatchlistColumnFilters,
  type WatchlistColumnKey,
  type WatchlistSortDirection,
  type WatchlistSortOption,
} from './_lib/watchlistEntryDerivation';
import { useWatchlistPriceReview } from './useWatchlistPriceReview';

const DEFAULT_SORT_OPTION: WatchlistSortOption = 'persistedOrder';
const DEFAULT_SORT_DIRECTION: WatchlistSortDirection = 'ascending';

// Mirrors the Card List tab's own `UNSAVED_PRICE_REVIEW_MESSAGE`.
const UNSAVED_PRICE_REVIEW_MESSAGE = 'You have unsaved price changes. Leave without saving?';

// Story 45's "What I'm Looking For" page: a binder-less list of cards the
// user wants to acquire, either standalone entries or ones referencing an
// existing (unacquired) binder card. Unlike the binder Card List tab, this
// page owns its own data fetch (there's no route-scoped context to supply
// it). Story 52 persists the list's drag order and PDF export divider
// server-side (replacing Story 45's client-only, lost-on-reload manual
// order) - dragging is only enabled while the default sort is active and
// no search/filter narrows the visible list, since the persisted order
// only has meaning against the full list.
export default function WatchlistPage() {
  useSetAppHeaderTitle("What I'm Looking For");

  const { markFailed } = useToastContext();
  const { start } = useSaveStatusToast();

  const [entries, setEntries] = useState<WatchlistEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [searchQuery, setSearchQuery] = useState('');
  const [sortOption, setSortOption] = useState<WatchlistSortOption>(DEFAULT_SORT_OPTION);
  const [sortDirection, setSortDirection] =
    useState<WatchlistSortDirection>(DEFAULT_SORT_DIRECTION);
  const [columnFilters, setColumnFilters] = useState<WatchlistColumnFilters>(() =>
    createDefaultWatchlistColumnFilters(entries),
  );
  // Story 52's persisted PDF export divider position - how many entries
  // (in persisted `sortOrder`) currently sit above it. Never decremented
  // when an entry is removed (matching the backend's own rule); only
  // clamped down to the current `entries.length` where it's read/used
  // below, so it never points past the end of a list that has since
  // shrunk.
  const [pdfExportCutoffCount, setPdfExportCutoffCount] = useState(0);

  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isBulkAddPending, setIsBulkAddPending] = useState(false);
  const [pendingRemoveIds, setPendingRemoveIds] = useState<Set<string>>(new Set());
  const [pendingMarkAcquiredIds, setPendingMarkAcquiredIds] = useState<Set<string>>(new Set());

  const {
    isPriceReviewActive,
    isFetchingWatchlistPrices,
    isSavingWatchlistPrices,
    priceReviewRows,
    startPriceReview,
    cancelPriceReview,
    updateReviewVariant,
    setReviewPrice,
    savePriceReview,
  } = useWatchlistPriceReview({ entries, setEntries });

  useSetNavigationGuardMessage(isPriceReviewActive, UNSAVED_PRICE_REVIEW_MESSAGE);

  useEffect(() => {
    if (!isPriceReviewActive) return;

    function handleBeforeUnload(event: BeforeUnloadEvent) {
      event.preventDefault();
    }

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [isPriceReviewActive]);

  // Fetches the full list once on mount - there's no route param or
  // parent context driving a refetch here, so an empty dependency array is
  // correct (matching this codebase's other top-level, self-fetching
  // pages).
  useEffect(() => {
    const controller = new AbortController();

    listWatchlistEntries(controller.signal)
      .then((result) => {
        setEntries(result.entries);
        setPdfExportCutoffCount(result.pdfExportCutoffCount);
        setColumnFilters(createDefaultWatchlistColumnFilters(result.entries));
        setIsLoading(false);
      })
      .catch((error) => {
        if (controller.signal.aborted) return;
        setLoadError(toProblemDetailsInfo(error).detail ?? 'Failed to load the watchlist.');
        setIsLoading(false);
      });

    return () => controller.abort();
  }, []);

  // Story 52: entries are already ordered by their own persisted
  // `sortOrder` when the default sort is active (see
  // `compareWatchlistEntries`'s `persistedOrder` branch), so this is the
  // page's single source of visible order - no separate client-only
  // manual-order layer is needed anymore.
  const visibleEntries = useMemo(
    () =>
      deriveVisibleWatchlistEntries({
        entries,
        searchQuery,
        columnFilters,
        sortOption,
        sortDirection,
      }),
    [entries, searchQuery, columnFilters, sortOption, sortDirection],
  );

  const isDefaultSort =
    sortOption === DEFAULT_SORT_OPTION && sortDirection === DEFAULT_SORT_DIRECTION;

  // Story 52: dragging (entries or the PDF export divider) is only
  // enabled while the default sort is active and no search/filter
  // narrows the visible list - in every other state, `visibleEntries`
  // isn't the full list in persisted order, so a drag there couldn't be
  // translated into a valid `sortOrder` renumbering.
  const hasActiveSearch = searchQuery.trim().length > 0;
  const canReorder =
    isDefaultSort && !hasActiveSearch && !hasActiveWatchlistColumnFilters(entries, columnFilters);

  // Clamped down to the current entry count (story 52: deleting an entry
  // never decrements the persisted value itself, only this read-time
  // clamp), so the divider never renders or exports past the end of a
  // list that has since shrunk.
  const effectivePdfExportCutoffCount = Math.min(pdfExportCutoffCount, entries.length);

  function handleSortColumnClick(column: WatchlistColumnKey) {
    if (sortOption === column) {
      setSortDirection((current) => (current === 'ascending' ? 'descending' : 'ascending'));
    } else {
      setSortOption(column);
      setSortDirection('ascending');
    }
  }

  function handleResetAll() {
    setSearchQuery('');
    setSortOption(DEFAULT_SORT_OPTION);
    setSortDirection(DEFAULT_SORT_DIRECTION);
    setColumnFilters(createDefaultWatchlistColumnFilters(entries));
  }

  function handleColumnFilterChange(column: WatchlistColumnKey, next: Set<string>) {
    setColumnFilters((current) => ({ ...current, [column]: next }));
  }

  // Story 52's single reorder handler: applies the new order/divider
  // position optimistically (each entry's own `sortOrder` field is
  // rewritten to match its new index, since `persistedOrder` sorts by
  // that field directly), then persists both together through
  // `PATCH /watchlist-entries/order`, rolling back on failure.
  function handleReorder(orderedEntryIds: string[], nextPdfExportCutoffCount: number) {
    const previousEntries = entries;
    const previousCutoffCount = pdfExportCutoffCount;

    const sortOrderById = new Map(orderedEntryIds.map((id, index) => [id, index]));
    setEntries((current) =>
      current.map((entry) => ({
        ...entry,
        sortOrder: sortOrderById.get(entry.id) ?? entry.sortOrder,
      })),
    );
    setPdfExportCutoffCount(nextPdfExportCutoffCount);

    const toast = start(`reorder-watchlist-entries-${crypto.randomUUID()}`);
    updateWatchlistEntryOrder(orderedEntryIds, nextPdfExportCutoffCount)
      .then(() => toast.markSaved())
      .catch((error) => {
        setEntries(previousEntries);
        setPdfExportCutoffCount(previousCutoffCount);
        toast.markFailed(error);
      });
  }

  function handleFetchWatchlistPrices() {
    startPriceReview(visibleEntries.map((entry) => entry.id));
  }

  function handlePriceInputChange(watchlistEntryId: string, rawValue: string) {
    const parsed = rawValue.trim() === '' ? null : Number.parseFloat(rawValue);
    setReviewPrice(
      watchlistEntryId,
      parsed === null || Number.isNaN(parsed) ? null : parsed,
      'manual',
    );
  }

  // Optimistically removes `entryId` from view, restoring it on failure -
  // used both by Remove and by Mark as acquired & remove below.
  function removeEntryOptimistically(entryId: string): WatchlistEntry | undefined {
    const removed = entries.find((entry) => entry.id === entryId);
    setEntries((previous) => previous.filter((entry) => entry.id !== entryId));
    return removed;
  }

  function restoreEntry(entry: WatchlistEntry) {
    setEntries((previous) => [...previous, entry]);
  }

  // Mirrors the backend's own `extendPdfExportCutoffForNewEntries` (story
  // 52): if the divider was already sitting at the true end of the list
  // (`pdfExportCutoffCount === previousTotalEntryCount`) and there's still
  // room under `WATCHLIST_PDF_MAX_ENTRIES`, extends it to also cover as
  // many of the newly appended entries as fit - keeping the client's
  // optimistic divider position in sync with what the backend just did
  // for the same request, without waiting on a follow-up fetch.
  function extendPdfExportCutoffForNewEntries(
    previousTotalEntryCount: number,
    createdCount: number,
  ) {
    if (createdCount === 0) return;
    setPdfExportCutoffCount((current) => {
      if (current !== previousTotalEntryCount) return current;
      return Math.min(current + createdCount, WATCHLIST_PDF_MAX_ENTRIES);
    });
  }

  function handleRemove(entryId: string) {
    const removed = removeEntryOptimistically(entryId);
    if (!removed) return;

    setPendingRemoveIds((previous) => new Set(previous).add(entryId));
    const toast = start(`remove-watchlist-entry-${entryId}`);

    deleteWatchlistEntry(entryId)
      .then(() => toast.markSaved())
      .catch((error) => {
        restoreEntry(removed);
        toast.markFailed(error);
      })
      .finally(() => {
        setPendingRemoveIds((previous) => {
          const next = new Set(previous);
          next.delete(entryId);
          return next;
        });
      });
  }

  function handleMarkAcquiredAndRemove(entryId: string) {
    const removed = removeEntryOptimistically(entryId);
    if (!removed) return;

    setPendingMarkAcquiredIds((previous) => new Set(previous).add(entryId));
    const toast = start(`mark-watchlist-entry-acquired-${entryId}`);

    markWatchlistEntryAcquired(entryId)
      .then(() => toast.markSaved())
      .catch((error) => {
        restoreEntry(removed);
        toast.markFailed(error);
      })
      .finally(() => {
        setPendingMarkAcquiredIds((previous) => {
          const next = new Set(previous);
          next.delete(entryId);
          return next;
        });
      });
  }

  // "Add Card" (search view): closes the modal immediately and creates
  // every selected card in one bulk request, appending each successfully
  // created entry to the list on completion - a partial failure is
  // reported through the shared failed toast rather than reopening the
  // modal (this page has no restore-on-failure flow, unlike the binder
  // Layout tab's bulk-add).
  function handleAddCards(cards: TcgDexCatalogCard[], variation: string | null) {
    setIsAddModalOpen(false);
    submitBulkAdd(cards, variation);
  }

  // "Add More" (search view): stays open, awaiting the outcome so the
  // modal can decide whether to clear its own selection.
  async function handleAddMoreCards(
    cards: TcgDexCatalogCard[],
    variation: string | null,
  ): Promise<boolean> {
    return submitBulkAdd(cards, variation);
  }

  function submitBulkAdd(cards: TcgDexCatalogCard[], variation: string | null): Promise<boolean> {
    if (cards.length === 0) return Promise.resolve(true);

    const idempotencyKey = crypto.randomUUID();
    setIsBulkAddPending(true);
    const toast = start(`bulk-add-watchlist-entries-${idempotencyKey}`);

    return createWatchlistEntriesBulk({ cards, variation }, idempotencyKey)
      .then((outcomes) => {
        const created = outcomes
          .filter((outcome) => outcome.status === 'created' && outcome.entry)
          .map((outcome) => outcome.entry as WatchlistEntry);
        const failedCount = outcomes.length - created.length;

        extendPdfExportCutoffForNewEntries(entries.length, created.length);
        setEntries((previous) => [...previous, ...created]);

        if (failedCount === 0) {
          toast.markSaved();
          return true;
        }
        markFailed(toast.operationId, {
          detail: `Added ${created.length} card${created.length === 1 ? '' : 's'}; ${failedCount} card${failedCount === 1 ? '' : 's'} failed to add.`,
        });
        return false;
      })
      .catch((error) => {
        toast.markFailed(error);
        return false;
      })
      .finally(() => {
        setIsBulkAddPending(false);
      });
  }

  // "Add Card" (manual-entry view): closes the modal immediately.
  function handleSubmitCustomCard(
    values: {
      name: string;
      setName: string | null;
      localNumber: string | null;
      variation: string | null;
    },
    file: File,
  ) {
    setIsAddModalOpen(false);
    submitCustomCard(values, file);
  }

  // "Add More" (manual-entry view): stays open, awaiting the outcome.
  async function handleSubmitCustomCardAddMore(
    values: {
      name: string;
      setName: string | null;
      localNumber: string | null;
      variation: string | null;
    },
    file: File,
  ): Promise<boolean> {
    return submitCustomCard(values, file);
  }

  function submitCustomCard(
    values: {
      name: string;
      setName: string | null;
      localNumber: string | null;
      variation: string | null;
    },
    file: File,
  ): Promise<boolean> {
    setIsBulkAddPending(true);
    const toast = start(`add-custom-watchlist-entry-${crypto.randomUUID()}`);

    return createWatchlistEntry({ ...values, image: file })
      .then((entry) => {
        extendPdfExportCutoffForNewEntries(entries.length, 1);
        setEntries((previous) => [...previous, entry]);
        toast.markSaved();
        return true;
      })
      .catch((error) => {
        toast.markFailed(error);
        return false;
      })
      .finally(() => {
        setIsBulkAddPending(false);
      });
  }

  if (isLoading) {
    return (
      <div className="flex justify-center px-8 pt-8">
        <LoadingIndicator label="Loading your watchlist…" size="5" className="" />
      </div>
    );
  }

  if (loadError) {
    return <div className="px-8 pt-8 text-error">{loadError}</div>;
  }

  return (
    <div className="flex flex-col gap-2 px-8 pb-8">
      <WatchlistTotals
        allEntries={entries}
        filteredEntries={visibleEntries}
        className="mt-4 justify-center text-center"
      />

      <div className="flex items-center gap-4">
        <input
          type="text"
          value={searchQuery}
          onChange={(event) => setSearchQuery(event.target.value)}
          placeholder="Search by name, set, number, or variation"
          aria-label="Search the watchlist"
          disabled={isPriceReviewActive}
          className="flex-1 rounded-standard border border-transparent bg-neutral-800 px-3 py-2 focus:border-primary focus:outline-none disabled:cursor-not-allowed disabled:opacity-50"
        />
        {isPriceReviewActive ? (
          <>
            <button
              type="button"
              disabled={isSavingWatchlistPrices}
              onClick={cancelPriceReview}
              className="cursor-pointer rounded-standard px-4 py-2 font-bold text-neutral-100 hover:bg-neutral-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={isFetchingWatchlistPrices || isSavingWatchlistPrices}
              onClick={savePriceReview}
              className="cursor-pointer rounded-standard bg-primary px-4 py-2 font-bold hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Save all
            </button>
          </>
        ) : (
          <button
            type="button"
            onClick={handleFetchWatchlistPrices}
            className="cursor-pointer rounded-standard bg-primary px-4 py-2 font-bold whitespace-nowrap hover:brightness-110"
          >
            Fetch card prices
          </button>
        )}
        {isFetchingWatchlistPrices && (
          <LoadingIndicator label="Fetching card prices…" size="5" className="" />
        )}
        <Tooltip label="Add card">
          <button
            type="button"
            disabled={isPriceReviewActive}
            onClick={() => setIsAddModalOpen(true)}
            aria-label="Add card"
            className="flex shrink-0 cursor-pointer items-center justify-center rounded-standard bg-primary p-2 text-neutral-100 hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Plus className="size-5" />
          </button>
        </Tooltip>
        <ExportWatchlistPdfButton
          watchlistEntryIds={
            canReorder
              ? visibleEntries.slice(0, effectivePdfExportCutoffCount).map((entry) => entry.id)
              : visibleEntries.slice(0, WATCHLIST_PDF_MAX_ENTRIES).map((entry) => entry.id)
          }
        />
      </div>

      <AppliedFiltersRow
        allEntries={entries}
        columnFilters={columnFilters}
        isDefaultSort={isDefaultSort}
        hasActiveSearch={searchQuery.trim().length > 0}
        onResetAll={handleResetAll}
      />

      <WatchlistEntryTable
        allEntries={entries}
        visibleEntries={visibleEntries}
        sortOption={sortOption}
        sortDirection={sortDirection}
        onSortColumnClick={handleSortColumnClick}
        columnFilters={columnFilters}
        onColumnFilterChange={handleColumnFilterChange}
        canReorder={canReorder}
        pdfExportCutoffCount={effectivePdfExportCutoffCount}
        onReorder={handleReorder}
        onRemove={handleRemove}
        pendingRemoveIds={pendingRemoveIds}
        onMarkAcquiredAndRemove={handleMarkAcquiredAndRemove}
        pendingMarkAcquiredIds={pendingMarkAcquiredIds}
        priceReview={
          isPriceReviewActive
            ? {
                isFetching: isFetchingWatchlistPrices,
                rows: priceReviewRows,
                onVariantChange: updateReviewVariant,
                onPriceInputChange: handlePriceInputChange,
                onFillPrice: setReviewPrice,
              }
            : null
        }
      />

      {isAddModalOpen && (
        <WatchlistCardSelectionModal
          onClose={() => setIsAddModalOpen(false)}
          onAddCards={handleAddCards}
          onAddMoreCards={handleAddMoreCards}
          onSubmitCustomCard={handleSubmitCustomCard}
          onSubmitCustomCardAddMore={handleSubmitCustomCardAddMore}
          isBulkAddPending={isBulkAddPending}
        />
      )}
    </div>
  );
}
