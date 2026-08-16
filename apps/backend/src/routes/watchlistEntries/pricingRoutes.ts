import { POKEMONTCG_PRICE_FETCH_CONCURRENCY } from '@binder-project-planner/shared';
import { eq, inArray } from 'drizzle-orm';
import type { Router } from 'express';

import { cards, watchlistEntries } from '../../database/schema.js';
import { fromCents, toCents } from '../../finance/currency.js';
import {
  createPriceFetchBatchCache,
  fetchCardPriceData,
  PokemonTcgAbortedError,
} from '../../integrations/pokemontcg/index.js';

import { mapWithConcurrencyLimit } from '../concurrency.js';

import { loadCardsByIdForEntries } from './cardHydration.js';
import { problem, serializeWatchlistEntry } from './serialization.js';
import type {
  UpdateWatchlistEntryPricesRequestBody,
  WatchlistEntriesRouteDeps,
  WatchlistEntryPriceFetchRequestBody,
} from './types.js';

// One submitted price update's independent outcome (story 45), mirroring
// `routes/cards/`'s own `CardPriceUpdateOutcome` pattern.
type WatchlistEntryPriceUpdateOutcome =
  | { status: 'updated'; entry: ReturnType<typeof serializeWatchlistEntry> }
  | { status: 'failed'; problem: ReturnType<typeof problem> };

// Story 45's price-fetch and "Save all" endpoints, mirroring
// `POST /binders/{binderId}/cards/prices/fetch` and `PATCH /binders/
// {binderId}/cards/prices` (story 38) but generalized across entries that
// may reference cards from many different binders, or no binder at all -
// each entry's effective set/number identity comes from its joined card
// when referenced, or its own columns when standalone.
export function registerWatchlistEntryPricingRoutes(
  router: Router,
  deps: WatchlistEntriesRouteDeps,
): void {
  const { database, pokemonTcgApiKey } = deps;

  // Story 45's price-fetch endpoint. Nothing is persisted by this
  // endpoint.
  router.post('/watchlist-entries/prices/fetch', async (request, response) => {
    const body = request.body as WatchlistEntryPriceFetchRequestBody;

    const entryRows = database
      .select()
      .from(watchlistEntries)
      .where(inArray(watchlistEntries.id, body.watchlistEntryIds))
      .all();
    const entriesById = new Map(entryRows.map((entry) => [entry.id, entry]));
    const missingId = body.watchlistEntryIds.find((id) => !entriesById.has(id));
    if (missingId) {
      response
        .status(400)
        .type('application/problem+json')
        .json(problem(400, 'Bad Request', `No entry exists with id "${missingId}".`));
      return;
    }
    const cardsById = loadCardsByIdForEntries(database, entryRows);

    const controller = new AbortController();
    request.on('close', () => controller.abort());
    // Shared across every entry in this request so entries resolving to
    // the same pokemontcg.io card share a single upstream lookup, mirroring
    // `POST /binders/{binderId}/cards/prices/fetch`'s own batch cache.
    const priceFetchBatchCache = createPriceFetchBatchCache();

    try {
      const results = await mapWithConcurrencyLimit(
        body.watchlistEntryIds,
        POKEMONTCG_PRICE_FETCH_CONCURRENCY,
        (watchlistEntryId) => {
          const entry = entriesById.get(watchlistEntryId)!;
          const fields = entry.cardId ? cardsById.get(entry.cardId) : undefined;
          return fetchCardPriceData(
            {
              // `fetchCardPriceData` passes `cardId` straight through as
              // a correlation id, never validating it against the `cards`
              // table - safe to key by `watchlistEntryId` here instead.
              cardId: watchlistEntryId,
              setName: fields ? fields.setName : entry.setName,
              providerSetId: fields ? fields.providerSetId : entry.providerSetId,
              localNumber: fields ? fields.localNumber : entry.localNumber,
            },
            pokemonTcgApiKey,
            controller.signal,
            priceFetchBatchCache,
          );
        },
      );
      response.status(200).json(
        results.map((result) => ({
          watchlistEntryId: result.cardId,
          tcgplayerUrl: result.tcgplayerUrl,
          variants: result.variants.map((variant) => ({
            variantKey: variant.variantKey,
            marketPrice:
              variant.marketPriceCents === null ? null : fromCents(variant.marketPriceCents),
            lowPrice: variant.lowPriceCents === null ? null : fromCents(variant.lowPriceCents),
          })),
        })),
      );
    } catch (error) {
      if (error instanceof PokemonTcgAbortedError) return;
      throw error;
    }
  });

  // Story 45's "Save all" endpoint, mirroring `PATCH /binders/{binderId}/
  // cards/prices` (story 38): a referenced entry's update is written to
  // its underlying card (visible back on that card's own binder Card
  // List); a standalone entry's update is written to its own columns.
  // Each submitted price is applied independently, so a failure on one
  // entry rolls back only that entry rather than the whole batch.
  router.patch('/watchlist-entries/prices', (request, response) => {
    const body = request.body as UpdateWatchlistEntryPricesRequestBody;

    const requestedIds = body.prices.map((entry) => entry.watchlistEntryId);
    const entryRows = database
      .select()
      .from(watchlistEntries)
      .where(inArray(watchlistEntries.id, requestedIds))
      .all();
    const entriesById = new Map(entryRows.map((entry) => [entry.id, entry]));
    const cardsById = loadCardsByIdForEntries(database, entryRows);

    const updatedAt = new Date().toISOString();
    const outcomes: WatchlistEntryPriceUpdateOutcome[] = body.prices.map((item) => {
      const entry = entriesById.get(item.watchlistEntryId);
      if (!entry) {
        return {
          status: 'failed',
          problem: problem(404, 'Not Found', `No entry exists with id "${item.watchlistEntryId}".`),
        };
      }

      const priceCents = toCents(item.price);

      if (entry.cardId !== null) {
        const card = cardsById.get(entry.cardId);
        if (!card) {
          // Never expected: the FK's `onDelete: 'cascade'` removes a
          // referenced entry whenever its card is deleted, so a dangling
          // reference shouldn't be observable. Guarded defensively.
          return {
            status: 'failed',
            problem: problem(
              404,
              'Not Found',
              `No card exists for watchlist entry "${item.watchlistEntryId}".`,
            ),
          };
        }
        database
          .update(cards)
          .set({
            priceCents,
            isManualPrice: item.isManualPrice,
            priceUpdatedAt: updatedAt,
            updatedAt,
          })
          .where(eq(cards.id, entry.cardId))
          .run();
        return {
          status: 'updated',
          entry: serializeWatchlistEntry(entry, {
            ...card,
            priceCents,
            isManualPrice: item.isManualPrice,
            priceUpdatedAt: updatedAt,
          }),
        };
      }

      database
        .update(watchlistEntries)
        .set({
          priceCents,
          isManualPrice: item.isManualPrice,
          priceUpdatedAt: updatedAt,
          updatedAt,
        })
        .where(eq(watchlistEntries.id, entry.id))
        .run();
      return {
        status: 'updated',
        entry: serializeWatchlistEntry(
          {
            ...entry,
            priceCents,
            isManualPrice: item.isManualPrice,
            priceUpdatedAt: updatedAt,
            updatedAt,
          },
          null,
        ),
      };
    });

    const responseStatus = outcomes.some((outcome) => outcome.status === 'failed') ? 207 : 200;
    response.status(responseStatus).json(outcomes);
  });
}
