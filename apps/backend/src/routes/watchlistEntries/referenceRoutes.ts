import { randomUUID } from 'node:crypto';

import { DEFAULT_CARD_IS_MANUAL_PRICE } from '@binder-project-planner/shared';
import { eq } from 'drizzle-orm';
import type { Router } from 'express';

import { cards, watchlistEntries } from '../../database/schema.js';
import { isUniqueConstraintError } from '../cards/index.js';

import { countWatchlistEntries, extendPdfExportCutoffForNewEntries } from './pdfExportCutoff.js';
import { problem, serializeWatchlistEntry } from './serialization.js';
import type { WatchlistEntriesRouteDeps, WatchlistEntryRow } from './types.js';

// One submitted card id's independent add-by-reference outcome (story
// 45), mirroring `bulkCreateRoute.ts`'s own `BulkWatchlistEntryOutcome`
// but for `POST /cards/watchlist-entries/bulk` - `cardId` echoes which
// submitted id each outcome corresponds to, since (unlike the other bulk
// endpoint) there's no created entry to read it from when `status` is
// `failed`.
type BulkAddCardsToWatchlistOutcome =
  | { cardId: string; status: 'added'; entry: ReturnType<typeof serializeWatchlistEntry> }
  | { cardId: string; status: 'failed'; problem: ReturnType<typeof problem> };

// Story 45's "Add to What I'm Looking For" Card List row action and its
// bulk variant: both add a card to the shared watchlist by reference
// (rather than creating a standalone entry).
export function registerWatchlistEntryReferenceRoutes(
  router: Router,
  deps: WatchlistEntriesRouteDeps,
): void {
  const { database } = deps;

  // Story 45's "Add to What I'm Looking For" Card List row action: creates
  // a new entry referencing the path card, or returns the existing entry
  // unchanged if this exact card is already on the list - an exact-match
  // check on `cardId` (enforced by the table's own unique index), not a
  // name/set/number heuristic, so this never creates a duplicate
  // reference.
  router.post('/cards/:cardId/watchlist-entry', (request, response) => {
    const { cardId } = request.params;
    const card = database.select().from(cards).where(eq(cards.id, cardId)).get();
    if (!card) {
      response
        .status(404)
        .type('application/problem+json')
        .json(problem(404, 'Not Found', `No card exists with id "${cardId}".`));
      return;
    }

    const existing = database
      .select()
      .from(watchlistEntries)
      .where(eq(watchlistEntries.cardId, cardId))
      .get();
    if (existing) {
      response.status(200).json(serializeWatchlistEntry(existing, card));
      return;
    }

    const previousTotalEntryCount = countWatchlistEntries(database);
    const now = new Date().toISOString();
    const entry: WatchlistEntryRow = {
      id: randomUUID(),
      cardId,
      // Story 52: newly created entries are always appended at the end of
      // the persisted drag order.
      sortOrder: previousTotalEntryCount,
      name: null,
      setName: null,
      localNumber: null,
      source: null,
      providerCardId: null,
      providerSetId: null,
      variation: null,
      imageAssetId: null,
      priceCents: null,
      isManualPrice: DEFAULT_CARD_IS_MANUAL_PRICE,
      priceUpdatedAt: null,
      createdAt: now,
      updatedAt: now,
    };

    try {
      database.insert(watchlistEntries).values(entry).run();
    } catch (error) {
      if (isUniqueConstraintError(error)) {
        // Lost a concurrent race to reference the same card; return the
        // winner's entry instead of failing.
        const winner = database
          .select()
          .from(watchlistEntries)
          .where(eq(watchlistEntries.cardId, cardId))
          .get();
        if (winner) {
          response.status(200).json(serializeWatchlistEntry(winner, card));
          return;
        }
      }
      throw error;
    }

    extendPdfExportCutoffForNewEntries(database, previousTotalEntryCount, 1);
    response.status(200).json(serializeWatchlistEntry(entry, card));
  });

  // Story 45's bulk variant of the row action above: adds every submitted
  // card id to the list by reference, each independently and
  // idempotently (a card id already listed is a no-op, its existing entry
  // returned unchanged, matching the single-card endpoint's own
  // behavior). One id that doesn't identify a card fails only that item -
  // the response preserves the request's own `cardIds` order regardless
  // of which items succeeded or failed.
  router.post('/cards/watchlist-entries/bulk', (request, response) => {
    const { cardIds } = request.body as { cardIds: string[] };

    // Story 52: entries newly created within this batch are appended at
    // the end of the persisted drag order in their submitted-array order;
    // `nextSortOrder` tracks the running end-of-list position across the
    // loop, and `newlyCreatedCount` (distinct from the outcome count,
    // since an already-listed card's outcome is also `status: 'added'`)
    // tracks how many actually inserted a new row, for extending the PDF
    // export cutoff afterward.
    const initialTotalEntryCount = countWatchlistEntries(database);
    let nextSortOrder = initialTotalEntryCount;
    let newlyCreatedCount = 0;

    const outcomes: BulkAddCardsToWatchlistOutcome[] = cardIds.map((cardId) => {
      const card = database.select().from(cards).where(eq(cards.id, cardId)).get();
      if (!card) {
        return {
          cardId,
          status: 'failed',
          problem: problem(404, 'Not Found', `No card exists with id "${cardId}".`),
        };
      }

      const existing = database
        .select()
        .from(watchlistEntries)
        .where(eq(watchlistEntries.cardId, cardId))
        .get();
      if (existing) {
        return { cardId, status: 'added', entry: serializeWatchlistEntry(existing, card) };
      }

      const now = new Date().toISOString();
      const entry: WatchlistEntryRow = {
        id: randomUUID(),
        cardId,
        sortOrder: nextSortOrder,
        name: null,
        setName: null,
        localNumber: null,
        source: null,
        providerCardId: null,
        providerSetId: null,
        variation: null,
        imageAssetId: null,
        priceCents: null,
        isManualPrice: DEFAULT_CARD_IS_MANUAL_PRICE,
        priceUpdatedAt: null,
        createdAt: now,
        updatedAt: now,
      };

      try {
        database.insert(watchlistEntries).values(entry).run();
      } catch (error) {
        if (isUniqueConstraintError(error)) {
          // Lost a race - either to another id in this same batch
          // resolving to the same card, or a concurrent request - to
          // reference this card; return the winner's entry instead of
          // failing this item, matching the single-card endpoint's own
          // race handling.
          const winner = database
            .select()
            .from(watchlistEntries)
            .where(eq(watchlistEntries.cardId, cardId))
            .get();
          if (winner) {
            return { cardId, status: 'added', entry: serializeWatchlistEntry(winner, card) };
          }
        }
        throw error;
      }

      nextSortOrder += 1;
      newlyCreatedCount += 1;
      return { cardId, status: 'added', entry: serializeWatchlistEntry(entry, card) };
    });

    extendPdfExportCutoffForNewEntries(database, initialTotalEntryCount, newlyCreatedCount);

    const responseStatus = outcomes.some((outcome) => outcome.status === 'failed') ? 207 : 201;
    response.status(responseStatus).json(outcomes);
  });
}
