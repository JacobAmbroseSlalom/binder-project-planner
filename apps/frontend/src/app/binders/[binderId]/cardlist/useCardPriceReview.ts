'use client';

import { useCallback, useRef, useState, type Dispatch, type SetStateAction } from 'react';

import {
  fetchCardPrices,
  updateCardPrices,
  type Card,
  type CardPriceUpdate,
  type CardPriceVariant,
} from '@/lib/api';
import { toProblemDetailsInfo, useSaveStatusToast, useToastContext } from '@/shared/feedback';

import { deriveDefaultVariantKey } from './_lib/priceVariantMatching';

// Fixed toast id for a request-level "Fetch card prices" failure - later
// attempts replace this operation's own toast rather than stacking a new
// one, matching the pattern used elsewhere (e.g. `OPEN_BINDER_TOAST_ID`).
const FETCH_CARD_PRICES_TOAST_ID = 'fetch-card-prices';

// Tracks how a review row's current `newPrice` value was arrived at, so
// `saveReview` can derive the right `isManualPrice` value per story 38's
// technical requirements: a value auto-filled from the selected variant's
// market/lowest price (whether by the initial auto-fill or by clicking
// that column's value) always saves as `false`; a value auto-filled by
// clicking the card's currently saved price inherits that card's existing
// `isManualPrice` instead of resetting it; any hand-edited value saves as
// `true`.
export type PriceReviewSource = 'variant' | 'savedPrice' | 'manual';

// One card's client-side price-review row - never persisted until "Save
// all" is selected.
export interface PriceReviewRow {
  cardId: string;
  // Empty when the card couldn't be matched to a pokemontcg.io card, or
  // that card has no TCGplayer price data - the table renders `--` for
  // this row's market price and lowest price in that case, while its
  // currently saved price stays visible.
  variants: CardPriceVariant[];
  selectedVariantKey: string | null;
  // The same TCGplayer product-page link for every variant of this card
  // (pokemontcg.io only exposes one per card, not per variant) - a
  // best-guess link inferred from the card's pokemontcg.io id even when
  // `variants` is empty; null only when the card couldn't be matched to a
  // pokemontcg.io card at all.
  tcgplayerUrl: string | null;
  newPrice: number | null;
  priceSource: PriceReviewSource;
}

// Owns story 38's entire client-side price-review lifecycle: fetching
// prices for a set of cards, letting the user adjust each row's variant
// selection and new-price value, then either saving every row at once or
// discarding the whole review. Colocated with the Card List tab (rather
// than lifted into `BinderRouteContext`) since no other tab needs this
// state, and per the story's technical requirements "Cancel" simply
// discards it without a backend request.
export function useCardPriceReview({
  binderId,
  cards,
  setCards,
}: {
  binderId: string;
  cards: Card[];
  setCards: Dispatch<SetStateAction<Card[]>>;
}) {
  const [isActive, setIsActive] = useState(false);
  const [isFetching, setIsFetching] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [rows, setRows] = useState<Map<string, PriceReviewRow>>(new Map());

  const { start } = useSaveStatusToast();
  const { markFailed } = useToastContext();

  // Aborts a still-in-flight fetch if the user cancels the review (or
  // starts a second fetch) before it resolves, so a stale response can
  // never populate `rows` after the review's been abandoned.
  const fetchControllerRef = useRef<AbortController | null>(null);

  // Looks up a card's own market-price-or-saved-price default new-price
  // value and provenance for `cardId`'s selected variant - shared by the
  // initial fetch-populated row and by `updateReviewVariant` below, since
  // switching variants re-derives the same default.
  const deriveDefaultPrice = useCallback(
    (
      cardId: string,
      variant: CardPriceVariant | null,
    ): { newPrice: number | null; priceSource: PriceReviewSource } => {
      if (variant && variant.marketPrice !== null) {
        return { newPrice: variant.marketPrice, priceSource: 'variant' };
      }
      const card = cards.find((existing) => existing.id === cardId);
      return { newPrice: card?.price ?? null, priceSource: 'savedPrice' };
    },
    [cards],
  );

  // Requests pokemontcg.io price data for exactly `cardIds` and enters the
  // price-review state once it resolves. Per the story's technical
  // requirements, the caller passes only the currently filtered/displayed
  // card ids, not every card in the binder.
  const startReview = useCallback(
    (cardIds: string[]) => {
      fetchControllerRef.current?.abort();
      const controller = new AbortController();
      fetchControllerRef.current = controller;

      setIsActive(true);
      setIsFetching(true);
      setRows(new Map());

      fetchCardPrices(binderId, cardIds, controller.signal)
        .then((results) => {
          if (controller.signal.aborted) return;
          setRows(() => {
            const next = new Map<string, PriceReviewRow>();
            for (const result of results) {
              const card = cards.find((existing) => existing.id === result.cardId);
              const selectedVariantKey = deriveDefaultVariantKey(
                card?.variation ?? null,
                result.variants,
              );
              const selectedVariant =
                result.variants.find((variant) => variant.variantKey === selectedVariantKey) ??
                null;
              const { newPrice, priceSource } = deriveDefaultPrice(result.cardId, selectedVariant);
              next.set(result.cardId, {
                cardId: result.cardId,
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
          // A request-level failure (rather than a per-card one, which the
          // backend reports as an empty `variants` array instead of
          // throwing) leaves nothing to review, so the review state exits
          // entirely.
          setIsActive(false);
          markFailed(FETCH_CARD_PRICES_TOAST_ID, toProblemDetailsInfo(error));
        });
    },
    [binderId, cards, deriveDefaultPrice, markFailed],
  );

  // Switches `cardId`'s selected variant, re-deriving its new-price value
  // and provenance from the newly selected variant's market price (or the
  // card's saved price, if that variant has none) - matching the story's
  // "selecting a different variant updates the displayed prices" and
  // "auto-filled... left unedited" requirements.
  const updateReviewVariant = useCallback(
    (cardId: string, variantKey: string) => {
      setRows((previous) => {
        const row = previous.get(cardId);
        if (!row) return previous;
        const variant = row.variants.find((existing) => existing.variantKey === variantKey) ?? null;
        const { newPrice, priceSource } = deriveDefaultPrice(cardId, variant);
        const next = new Map(previous);
        next.set(cardId, { ...row, selectedVariantKey: variantKey, newPrice, priceSource });
        return next;
      });
    },
    [deriveDefaultPrice],
  );

  // Fills `cardId`'s new-price input with `value` and records `source` as
  // its provenance - used both by clicking the market/lowest/saved-price
  // columns (a fixed, known source per click target) and by hand-editing
  // the input directly (always `'manual'`).
  const setReviewPrice = useCallback(
    (cardId: string, value: number | null, source: PriceReviewSource) => {
      setRows((previous) => {
        const row = previous.get(cardId);
        if (!row) return previous;
        const next = new Map(previous);
        next.set(cardId, { ...row, newPrice: value, priceSource: source });
        return next;
      });
    },
    [],
  );

  // Discards every bit of client-side review state (fetched data,
  // selected variants, edited new-price values) without any backend
  // request, and re-enables the card list's search/sort/filter controls.
  const cancelReview = useCallback(() => {
    fetchControllerRef.current?.abort();
    setIsActive(false);
    setIsFetching(false);
    setRows(new Map());
  }, []);

  // Commits every reviewed row's current new-price value at once (the
  // "Save all" action). Optimistically applies every value to `cards`
  // immediately (so the Card List/Financials totals reflect it right
  // away), then reconciles per-card against the backend's outcome array -
  // replacing a succeeded row with its authoritative representation, or
  // rolling back just that one card's price/isManualPrice/priceUpdatedAt
  // to their pre-save values on a per-card failure. A whole-request
  // failure rolls back every optimistic update.
  const saveReview = useCallback(() => {
    const entries = Array.from(rows.values()).filter((row) => row.newPrice !== null);
    if (entries.length === 0) {
      cancelReview();
      return;
    }

    const now = new Date().toISOString();
    const previousByCardId = new Map(
      entries.map((row) => {
        const card = cards.find((existing) => existing.id === row.cardId);
        return [
          row.cardId,
          card
            ? {
                price: card.price,
                isManualPrice: card.isManualPrice,
                priceUpdatedAt: card.priceUpdatedAt,
              }
            : null,
        ] as const;
      }),
    );

    const updates: CardPriceUpdate[] = entries.map((row) => {
      const card = cards.find((existing) => existing.id === row.cardId);
      const isManualPrice =
        row.priceSource === 'manual'
          ? true
          : row.priceSource === 'savedPrice'
            ? (card?.isManualPrice ?? false)
            : false;
      return { cardId: row.cardId, price: row.newPrice as number, isManualPrice };
    });

    setCards((previous) =>
      previous.map((card) => {
        const update = updates.find((entry) => entry.cardId === card.id);
        if (!update) return card;
        return {
          ...card,
          price: update.price,
          isManualPrice: update.isManualPrice,
          priceUpdatedAt: now,
        };
      }),
    );

    setIsSaving(true);
    const toast = start(`save-card-prices-${binderId}`);

    return updateCardPrices(binderId, updates)
      .then((outcomes) => {
        const failedCount = outcomes.filter((outcome) => outcome.status === 'failed').length;

        setCards((previous) =>
          previous.map((card) => {
            const index = updates.findIndex((entry) => entry.cardId === card.id);
            if (index === -1) return card;
            const outcome = outcomes[index];
            if (outcome?.status === 'updated' && outcome.card) {
              return outcome.card;
            }
            const snapshot = previousByCardId.get(card.id);
            return snapshot ? { ...card, ...snapshot } : card;
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
        setCards((previous) =>
          previous.map((card) => {
            const snapshot = previousByCardId.get(card.id);
            return snapshot ? { ...card, ...snapshot } : card;
          }),
        );
        setIsSaving(false);
        toast.markFailed(error);
      });
  }, [rows, cards, binderId, setCards, start, markFailed, cancelReview]);

  return {
    isPriceReviewActive: isActive,
    isFetchingCardPrices: isFetching,
    isSavingCardPrices: isSaving,
    priceReviewRows: rows,
    startPriceReview: startReview,
    cancelPriceReview: cancelReview,
    updateReviewVariant,
    setReviewPrice,
    savePriceReview: saveReview,
  };
}
