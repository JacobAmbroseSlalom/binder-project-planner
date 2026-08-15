import { randomUUID } from 'node:crypto';
import { unlinkSync } from 'node:fs';

import {
  BULK_CARD_CREATE_CONCURRENCY,
  CARD_VARIATION_MAX_LENGTH,
  DEFAULT_CARD_IS_MANUAL_PRICE,
} from '@binder-project-planner/shared';
import { eq } from 'drizzle-orm';
import type { Router } from 'express';

import { cardImageAssets, watchlistEntries } from '../../database/schema.js';
import {
  findIdempotentOutcome,
  saveIdempotentOutcome,
} from '../../idempotency/mutationIdempotency.js';
import { PokemonTcgProviderError } from '../../integrations/pokemontcg.js';
import { TcgDexProviderError } from '../../integrations/tcgdex.js';

import { mapWithConcurrencyLimit } from '../concurrency.js';
import { resolveCardCatalogImageAsset, type ResolvedImageAsset } from '../cards/index.js';

import { countWatchlistEntries, extendPdfExportCutoffForNewEntries } from './pdfExportCutoff.js';
import { problem, serializeWatchlistEntry } from './serialization.js';
import type {
  BulkCreateWatchlistEntriesRequestBody,
  WatchlistEntriesRouteDeps,
  WatchlistEntryRow,
} from './types.js';

// One submitted card's independent creation outcome (story 45), mirroring
// `routes/cards/`'s own `BulkCardOutcome` pattern.
type BulkWatchlistEntryOutcome =
  | { status: 'created'; entry: ReturnType<typeof serializeWatchlistEntry> }
  | { status: 'failed'; problem: ReturnType<typeof problem> };

// Story 45's standalone bulk TCGdex-entry endpoint, mirroring
// `POST /binders/{binderId}/cards/bulk`'s per-item independent-outcome
// pattern minus placement/acquisition/per-binder guard, none of which
// apply to a binder-less entry.
export function registerBulkCreateWatchlistEntriesRoute(
  router: Router,
  deps: WatchlistEntriesRouteDeps,
): void {
  const { database, imagesDirectory } = deps;

  router.post('/watchlist-entries/bulk', async (request, response) => {
    const idempotencyKey = request.header('Idempotency-Key');
    if (!idempotencyKey) {
      response
        .status(400)
        .type('application/problem+json')
        .json(problem(400, 'Bad Request', 'An Idempotency-Key header is required.'));
      return;
    }

    const replayed = findIdempotentOutcome(
      database,
      'bulk-create-watchlist-entries',
      idempotencyKey,
    );
    if (replayed) {
      response.status(replayed.responseStatus).json(replayed.responseBody);
      return;
    }

    const body = request.body as BulkCreateWatchlistEntriesRequestBody;
    const variation = body.variation?.trim() || null;
    if (variation && variation.length > CARD_VARIATION_MAX_LENGTH) {
      response
        .status(400)
        .type('application/problem+json')
        .json(
          problem(
            400,
            'Bad Request',
            `variation must be ${CARD_VARIATION_MAX_LENGTH} characters or fewer.`,
          ),
        );
      return;
    }

    // Mirrors the bulk create-cards endpoint's own never-aborted signal
    // (planning.md: an accepted bulk request keeps running to completion
    // even if the client disconnects); each TCGdex request is still
    // bounded by its own internal timeout.
    const neverAbortedSignal = new AbortController().signal;

    // Story 52: sortOrder is assigned from each item's position in the
    // *submitted* `body.cards` array (not completion order, which varies
    // with `mapWithConcurrencyLimit`'s concurrency), so the outcome is
    // deterministic regardless of which network requests finish first. A
    // failed item's index is simply skipped, leaving a harmless gap in
    // the value space rather than a used sortOrder.
    const initialTotalEntryCount = countWatchlistEntries(database);

    const outcomes = await mapWithConcurrencyLimit(
      body.cards,
      BULK_CARD_CREATE_CONCURRENCY,
      async (item, index): Promise<BulkWatchlistEntryOutcome> => {
        let asset: ResolvedImageAsset;
        try {
          asset = await resolveCardCatalogImageAsset(
            database,
            imagesDirectory,
            item,
            neverAbortedSignal,
          );
        } catch (error) {
          if (error instanceof TcgDexProviderError || error instanceof PokemonTcgProviderError) {
            const status = error.isTimeout ? 504 : 502;
            return { status: 'failed', problem: problem(status, 'Bad Gateway', error.message) };
          }
          throw error;
        }

        const now = new Date().toISOString();
        const entry: WatchlistEntryRow = {
          id: randomUUID(),
          cardId: null,
          sortOrder: initialTotalEntryCount + index,
          name: item.name,
          setName: item.setName,
          localNumber: item.localNumber,
          source: item.source,
          providerCardId: item.providerCardId,
          providerSetId: item.providerSetId,
          variation,
          imageAssetId: asset.assetId,
          priceCents: null,
          isManualPrice: DEFAULT_CARD_IS_MANUAL_PRICE,
          priceUpdatedAt: null,
          createdAt: now,
          updatedAt: now,
        };

        try {
          database.insert(watchlistEntries).values(entry).run();
        } catch (error) {
          if (asset.newlyCreatedFilePath) {
            unlinkSync(asset.newlyCreatedFilePath);
            database.delete(cardImageAssets).where(eq(cardImageAssets.id, asset.assetId)).run();
          }
          throw error;
        }

        return { status: 'created', entry: serializeWatchlistEntry(entry, null) };
      },
    );

    extendPdfExportCutoffForNewEntries(
      database,
      initialTotalEntryCount,
      outcomes.filter((outcome) => outcome.status === 'created').length,
    );

    const responseStatus = outcomes.some((outcome) => outcome.status === 'failed') ? 207 : 201;
    saveIdempotentOutcome(database, 'bulk-create-watchlist-entries', idempotencyKey, {
      responseStatus,
      responseBody: outcomes,
      locationHeader: null,
    });
    response.status(responseStatus).json(outcomes);
  });
}
