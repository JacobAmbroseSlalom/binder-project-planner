import { eq } from 'drizzle-orm';
import type { Router } from 'express';

import { cards, watchlistEntries } from '../../database/schema.js';

import { problem } from './serialization.js';
import type { WatchlistEntriesRouteDeps } from './types.js';

// Story 45's "mark as acquired" action: only valid for a referenced
// entry - sets its card's `acquired` field and removes the entry in one
// transaction, so a partial failure can't leave one change applied
// without the other.
export function registerMarkWatchlistEntryAcquiredRoute(
  router: Router,
  deps: WatchlistEntriesRouteDeps,
): void {
  const { database } = deps;

  router.post('/watchlist-entries/:watchlistEntryId/mark-acquired', (request, response) => {
    const { watchlistEntryId } = request.params;
    const entry = database
      .select()
      .from(watchlistEntries)
      .where(eq(watchlistEntries.id, watchlistEntryId))
      .get();
    if (!entry) {
      response
        .status(404)
        .type('application/problem+json')
        .json(problem(404, 'Not Found', `No entry exists with id "${watchlistEntryId}".`));
      return;
    }
    if (entry.cardId === null) {
      response
        .status(400)
        .type('application/problem+json')
        .json(
          problem(400, 'Bad Request', 'This entry is standalone and has no card to mark acquired.'),
        );
      return;
    }

    const now = new Date().toISOString();
    database.transaction((tx) => {
      tx.update(cards)
        .set({ acquired: true, updatedAt: now })
        .where(eq(cards.id, entry.cardId!))
        .run();
      tx.delete(watchlistEntries).where(eq(watchlistEntries.id, watchlistEntryId)).run();
    });

    response.status(204).end();
  });
}
