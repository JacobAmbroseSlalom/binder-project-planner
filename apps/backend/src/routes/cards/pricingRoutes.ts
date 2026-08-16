import { POKEMONTCG_PRICE_FETCH_CONCURRENCY } from '@binder-project-planner/shared';
import { eq, inArray } from 'drizzle-orm';
import { type Router } from 'express';

import { binders, cards } from '../../database/schema.js';
import { toCents } from '../../finance/currency.js';
import {
  createPriceFetchBatchCache,
  fetchCardPriceData,
  PokemonTcgAbortedError,
} from '../../integrations/pokemontcg/index.js';

import { mapWithConcurrencyLimit } from '../concurrency.js';

import { problem, serializeCard, serializeCardPriceFetchResults } from './serialization.js';
import type {
  CardPriceFetchRequestBody,
  CardRow,
  CardsRouteDeps,
  UpdateCardPricesRequestBody,
} from './types.js';

// One submitted price update's independent outcome (story 38), mirroring
// `BulkCardOutcome`'s "created"/"failed" pattern - preserves the submitted
// array's order regardless of processing completion order.
type CardPriceUpdateOutcome =
  | { status: 'updated'; card: ReturnType<typeof serializeCard> }
  | { status: 'failed'; problem: ReturnType<typeof problem> };

// Story 38's price-fetch and "Save all" endpoints: fetching pokemontcg.io
// price data for the Card List's currently displayed cards, and
// committing the user's reviewed prices back to each card.
export function registerCardPricingRoutes(router: Router, deps: CardsRouteDeps): void {
  const { database, pokemonTcgApiKey } = deps;

  // Story 38's price-fetch endpoint: requests pokemontcg.io price data for
  // exactly the card ids the Card List's active search/sort/filter state
  // currently produces (not every card in the binder) - the frontend's
  // "Fetch card prices" button. Every listed card must belong to the path
  // binder. Purely a read: no card is mutated by this endpoint - fetched
  // prices are client-side review state until "Save all" calls the
  // sibling `PATCH /binders/{binderId}/cards/prices` endpoint below.
  router.post('/binders/:binderId/cards/prices/fetch', async (request, response) => {
    const { binderId } = request.params;
    const body = request.body as CardPriceFetchRequestBody;

    const binder = database.select().from(binders).where(eq(binders.id, binderId)).get();
    if (!binder) {
      response
        .status(404)
        .type('application/problem+json')
        .json(problem(404, 'Not Found', `No binder exists with id "${binderId}".`));
      return;
    }

    const cardRows = database
      .select()
      .from(cards)
      .where(inArray(cards.id, body.cardIds))
      .all() as CardRow[];
    const foundIds = new Set(cardRows.map((row) => row.id));
    const missingId = body.cardIds.find((id) => !foundIds.has(id));
    if (missingId) {
      response
        .status(404)
        .type('application/problem+json')
        .json(problem(404, 'Not Found', `No card exists with id "${missingId}".`));
      return;
    }

    const foreignCard = cardRows.find((row) => row.binderId !== binderId);
    if (foreignCard) {
      response
        .status(400)
        .type('application/problem+json')
        .json(problem(400, 'Bad Request', 'Every cardId must belong to the path binder.'));
      return;
    }

    // Propagates a disconnected/aborted client request to every in-flight
    // upstream pokemontcg.io lookup (planning.md's existing convention for
    // proxied provider requests).
    const controller = new AbortController();
    request.on('close', () => controller.abort());

    // Shared across every card in this request so two cards resolving to
    // the same pokemontcg.io card (e.g. a "normal" print and a "Reverse
    // Holo" print of the same physical card share one set + number)
    // trigger a single upstream price request instead of one each - see
    // `createPriceFetchBatchCache`'s own comment for why this is scoped to
    // one request rather than reused across requests.
    const priceFetchBatchCache = createPriceFetchBatchCache();

    try {
      const results = await mapWithConcurrencyLimit(
        cardRows,
        POKEMONTCG_PRICE_FETCH_CONCURRENCY,
        (row) =>
          fetchCardPriceData(
            {
              cardId: row.id,
              setName: row.setName,
              providerSetId: row.providerSetId,
              localNumber: row.localNumber,
            },
            pokemonTcgApiKey,
            controller.signal,
            priceFetchBatchCache,
          ),
      );
      response.status(200).json(serializeCardPriceFetchResults(results));
    } catch (error) {
      // The per-card lookup itself never throws for an individual provider
      // failure (see `fetchCardPriceData`'s own try/catch) - only a client
      // disconnect (`PokemonTcgAbortedError`) or a genuinely unexpected
      // error reaches here, both of which are request-level failures.
      if (error instanceof PokemonTcgAbortedError) return;
      throw error;
    }
  });

  // Story 38's "Save all" endpoint: commits every reviewed row's new price
  // in one request. Mirrors the bulk create-cards endpoint's (stories
  // 17/18) per-item independent outcome pattern - a failure on one card's
  // price rolls back only that card rather than the whole batch, since
  // each is applied as its own update.
  router.patch('/binders/:binderId/cards/prices', (request, response) => {
    const { binderId } = request.params;
    const body = request.body as UpdateCardPricesRequestBody;

    const binder = database.select().from(binders).where(eq(binders.id, binderId)).get();
    if (!binder) {
      response
        .status(404)
        .type('application/problem+json')
        .json(problem(404, 'Not Found', `No binder exists with id "${binderId}".`));
      return;
    }

    const requestedIds = body.prices.map((entry) => entry.cardId);
    const cardRows = database
      .select()
      .from(cards)
      .where(inArray(cards.id, requestedIds))
      .all() as CardRow[];
    const cardRowsById = new Map(cardRows.map((row) => [row.id, row]));

    const updatedAt = new Date().toISOString();
    const outcomes: CardPriceUpdateOutcome[] = body.prices.map((entry) => {
      const existing = cardRowsById.get(entry.cardId);
      if (!existing) {
        return {
          status: 'failed',
          problem: problem(404, 'Not Found', `No card exists with id "${entry.cardId}".`),
        };
      }
      if (existing.binderId !== binderId) {
        return {
          status: 'failed',
          problem: problem(400, 'Bad Request', 'Every cardId must belong to the path binder.'),
        };
      }

      const priceCents = toCents(entry.price);
      database
        .update(cards)
        .set({
          priceCents,
          isManualPrice: entry.isManualPrice,
          priceUpdatedAt: updatedAt,
          updatedAt,
        })
        .where(eq(cards.id, entry.cardId))
        .run();

      return {
        status: 'updated',
        card: serializeCard({
          ...existing,
          priceCents,
          isManualPrice: entry.isManualPrice,
          priceUpdatedAt: updatedAt,
          updatedAt,
        }),
      };
    });

    const responseStatus = outcomes.some((outcome) => outcome.status === 'failed') ? 207 : 200;
    response.status(responseStatus).json(outcomes);
  });
}
