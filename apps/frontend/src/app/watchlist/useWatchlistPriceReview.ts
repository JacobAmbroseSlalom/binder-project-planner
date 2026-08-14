'use client';

import { useCallback, useRef, useState, type Dispatch, type SetStateAction } from 'react';

import {
  fetchWatchlistEntryPrices,
  updateWatchlistEntryPrices,
  type CardPriceVariant,
  type WatchlistEntry,
  type WatchlistEntryPriceUpdate,
} from '@/lib/api';
import { toProblemDetailsInfo, useSaveStatusToast, useToastContext } from '@/shared/feedback';

import { deriveDefaultVariantKey } from './_lib/priceVariantMatching';

// Fixed toast id for a request-level "Fetch card prices" failure on this
// page, mirroring the Card List tab's own `FETCH_CARD_PRICES_TOAST_ID`
// (a distinct id since the two pages can be open/reviewed independently).
const FETCH_WATCHLIST_PRICES_TOAST_ID = 'fetch-watchlist-entry-prices';

export type PriceReviewSource = 'variant' | 'savedPrice' | 'manual';

// One entry's client-side price-review row - never persisted until "Save
// all" is selected, mirroring the Card List tab's own `PriceReviewRow`.
export interface PriceReviewRow {
  watchlistEntryId: string;
  variants: CardPriceVariant[];
  selectedVariantKey: string | null;
  tcgplayerUrl: string | null;
  newPrice: number | null;
  priceSource: PriceReviewSource;
}

// Story 45's What I'm Looking For page's own price-review lifecycle - a
// copy of the Card List tab's `useCardPriceReview`, keyed by
// `watchlistEntryId` instead of `cardId` and calling the watchlist-scoped
// price endpoints (which resolve each entry's effective identity from its
// joined card when referenced, or its own columns when standalone) instead
// of the binder-scoped ones.
export function useWatchlistPriceReview({
  entries,
  setEntries,
}: {
  entries: WatchlistEntry[];
  setEntries: Dispatch<SetStateAction<WatchlistEntry[]>>;
}) {
  const [isActive, setIsActive] = useState(false);
  const [isFetching, setIsFetching] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [rows, setRows] = useState<Map<string, PriceReviewRow>>(new Map());

  const { start } = useSaveStatusToast();
  const { markFailed } = useToastContext();

  const fetchControllerRef = useRef<AbortController | null>(null);

  const deriveDefaultPrice = useCallback(
    (
      watchlistEntryId: string,
      variant: CardPriceVariant | null,
    ): { newPrice: number | null; priceSource: PriceReviewSource } => {
      if (variant && variant.marketPrice !== null) {
        return { newPrice: variant.marketPrice, priceSource: 'variant' };
      }
      const entry = entries.find((existing) => existing.id === watchlistEntryId);
      return { newPrice: entry?.price ?? null, priceSource: 'savedPrice' };
    },
    [entries],
  );

  // Requests pokemontcg.io price data for exactly `watchlistEntryIds` and
  // enters the price-review state once it resolves - the caller passes
  // only the currently filtered/displayed entry ids, matching the Card
  // List tab's own convention.
  const startReview = useCallback(
    (watchlistEntryIds: string[]) => {
      fetchControllerRef.current?.abort();
      const controller = new AbortController();
      fetchControllerRef.current = controller;

      setIsActive(true);
      setIsFetching(true);
      setRows(new Map());

      fetchWatchlistEntryPrices(watchlistEntryIds, controller.signal)
        .then((results) => {
          if (controller.signal.aborted) return;
          setRows(() => {
            const next = new Map<string, PriceReviewRow>();
            for (const result of results) {
              const entry = entries.find((existing) => existing.id === result.watchlistEntryId);
              const selectedVariantKey = deriveDefaultVariantKey(
                entry?.variation ?? null,
                result.variants,
              );
              const selectedVariant =
                result.variants.find((variant) => variant.variantKey === selectedVariantKey) ??
                null;
              const { newPrice, priceSource } = deriveDefaultPrice(
                result.watchlistEntryId,
                selectedVariant,
              );
              next.set(result.watchlistEntryId, {
                watchlistEntryId: result.watchlistEntryId,
                variants: result.variants,
                selectedVariantKey,
                tcgplayerUrl: result.tcgplayerUrl,
                newPrice,
                priceSource,
              });
            }
            return next;
          });
          setIsFetching(false);
        })
        .catch((error) => {
          if (controller.signal.aborted) return;
          setIsFetching(false);
          setIsActive(false);
          markFailed(FETCH_WATCHLIST_PRICES_TOAST_ID, toProblemDetailsInfo(error));
        });
    },
    [entries, deriveDefaultPrice, markFailed],
  );

  const updateReviewVariant = useCallback(
    (watchlistEntryId: string, variantKey: string) => {
      setRows((previous) => {
        const row = previous.get(watchlistEntryId);
        if (!row) return previous;
        const variant = row.variants.find((existing) => existing.variantKey === variantKey) ?? null;
        const { newPrice, priceSource } = deriveDefaultPrice(watchlistEntryId, variant);
        const next = new Map(previous);
        next.set(watchlistEntryId, {
          ...row,
          selectedVariantKey: variantKey,
          newPrice,
          priceSource,
        });
        return next;
      });
    },
    [deriveDefaultPrice],
  );

  const setReviewPrice = useCallback(
    (watchlistEntryId: string, value: number | null, source: PriceReviewSource) => {
      setRows((previous) => {
        const row = previous.get(watchlistEntryId);
        if (!row) return previous;
        const next = new Map(previous);
        next.set(watchlistEntryId, { ...row, newPrice: value, priceSource: source });
        return next;
      });
    },
    [],
  );

  const cancelReview = useCallback(() => {
    fetchControllerRef.current?.abort();
    setIsActive(false);
    setIsFetching(false);
    setRows(new Map());
  }, []);

  // Commits every reviewed row's current new-price value at once, mirroring
  // the Card List tab's own `saveReview`: optimistic apply, then reconcile
  // per-entry against the backend's outcome array.
  const saveReview = useCallback(() => {
    const reviewedEntries = Array.from(rows.values()).filter((row) => row.newPrice !== null);
    if (reviewedEntries.length === 0) {
      cancelReview();
      return;
    }

    const now = new Date().toISOString();
    const previousByEntryId = new Map(
      reviewedEntries.map((row) => {
        const entry = entries.find((existing) => existing.id === row.watchlistEntryId);
        return [
          row.watchlistEntryId,
          entry
            ? {
                price: entry.price,
                isManualPrice: entry.isManualPrice,
                priceUpdatedAt: entry.priceUpdatedAt,
              }
            : null,
        ] as const;
      }),
    );

    const updates: WatchlistEntryPriceUpdate[] = reviewedEntries.map((row) => {
      const entry = entries.find((existing) => existing.id === row.watchlistEntryId);
      const isManualPrice =
        row.priceSource === 'manual'
          ? true
          : row.priceSource === 'savedPrice'
            ? (entry?.isManualPrice ?? false)
            : false;
      return {
        watchlistEntryId: row.watchlistEntryId,
        price: row.newPrice as number,
        isManualPrice,
      };
    });

    setEntries((previous) =>
      previous.map((entry) => {
        const update = updates.find((item) => item.watchlistEntryId === entry.id);
        if (!update) return entry;
        return {
          ...entry,
          price: update.price,
          isManualPrice: update.isManualPrice,
          priceUpdatedAt: now,
        };
      }),
    );

    setIsSaving(true);
    const toast = start('save-watchlist-entry-prices');

    return updateWatchlistEntryPrices(updates)
      .then((outcomes) => {
        const failedCount = outcomes.filter((outcome) => outcome.status === 'failed').length;

        setEntries((previous) =>
          previous.map((entry) => {
            const index = updates.findIndex((item) => item.watchlistEntryId === entry.id);
            if (index === -1) return entry;
            const outcome = outcomes[index];
            if (outcome?.status === 'updated' && outcome.entry) {
              return outcome.entry;
            }
            const snapshot = previousByEntryId.get(entry.id);
            return snapshot ? { ...entry, ...snapshot } : entry;
          }),
        );

        setIsSaving(false);
        setIsActive(false);
        setRows(new Map());

        if (failedCount === 0) {
          toast.markSaved();
        } else {
          const successCount = updates.length - failedCount;
          markFailed(toast.operationId, {
            detail: `Saved ${successCount} price${successCount === 1 ? '' : 's'}; ${failedCount} price${failedCount === 1 ? '' : 's'} failed to save.`,
          });
        }
      })
      .catch((error) => {
        setEntries((previous) =>
          previous.map((entry) => {
            const snapshot = previousByEntryId.get(entry.id);
            return snapshot ? { ...entry, ...snapshot } : entry;
          }),
        );
        setIsSaving(false);
        toast.markFailed(error);
      });
  }, [rows, entries, setEntries, start, markFailed, cancelReview]);

  return {
    isPriceReviewActive: isActive,
    isFetchingWatchlistPrices: isFetching,
    isSavingWatchlistPrices: isSaving,
    priceReviewRows: rows,
    startPriceReview: startReview,
    cancelPriceReview: cancelReview,
    updateReviewVariant,
    setReviewPrice,
    savePriceReview: saveReview,
  };
}
