import { asc } from 'drizzle-orm';
import type { Router } from 'express';

import { watchlistEntries } from '../../database/schema.js';

import { loadCardsByIdForEntries } from './cardHydration.js';
import { computePdfExportCutoffCount } from './pdfExportCutoff.js';
import { serializeWatchlistEntry } from './serialization.js';
import type { WatchlistEntriesRouteDeps } from './types.js';

// Story 45's main list endpoint: every entry on the shared list, both
// standalone and referenced, hydrated from their joined card where
// applicable. Ordered by each entry's persisted `sortOrder` (story
// 52's drag-and-drop position) - the frontend applies its own active
// column sort on top of this, or falls back to this order when no
// column sort is active. The response also carries the persisted PDF
// export divider position alongside the entries, since it's one global
// value rather than a per-entry field.
export function registerWatchlistEntriesListRoute(
  router: Router,
  deps: WatchlistEntriesRouteDeps,
): void {
  const { database } = deps;

  router.get('/watchlist-entries', (_request, response) => {
    const entryRows = database
      .select()
      .from(watchlistEntries)
      .orderBy(asc(watchlistEntries.sortOrder))
      .all();
    const cardsById = loadCardsByIdForEntries(database, entryRows);

    response.status(200).json({
      entries: entryRows.map((entry) =>
        serializeWatchlistEntry(entry, entry.cardId ? (cardsById.get(entry.cardId) ?? null) : null),
      ),
      pdfExportCutoffCount: computePdfExportCutoffCount(database, entryRows.length),
    });
  });
}
