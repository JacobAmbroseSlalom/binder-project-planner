import { createReadStream, existsSync } from 'node:fs';
import { join } from 'node:path';

import { eq } from 'drizzle-orm';
import type { Router } from 'express';

import { cardImageAssets, watchlistEntries } from '../../database/schema.js';

import { problem } from './serialization.js';
import type { WatchlistEntriesRouteDeps } from './types.js';

// Story 45's standalone-entry image-streaming endpoint, mirroring
// `GET /cards/{cardId}/image`. A referenced entry has no own image
// asset (per the table's CHECK constraint), so the join below naturally
// excludes it - its `imageUrl` instead points at its card's own image
// endpoint.
export function registerWatchlistEntryImageRoute(
  router: Router,
  deps: WatchlistEntriesRouteDeps,
): void {
  const { database, imagesDirectory } = deps;

  router.get('/watchlist-entries/:watchlistEntryId/image', (request, response) => {
    const { watchlistEntryId } = request.params;
    const row = database
      .select({
        contentType: cardImageAssets.contentType,
        storageFilename: cardImageAssets.storageFilename,
      })
      .from(watchlistEntries)
      .innerJoin(cardImageAssets, eq(watchlistEntries.imageAssetId, cardImageAssets.id))
      .where(eq(watchlistEntries.id, watchlistEntryId))
      .get();

    if (!row) {
      response
        .status(404)
        .type('application/problem+json')
        .json(problem(404, 'Not Found', `No entry exists with id "${watchlistEntryId}".`));
      return;
    }

    const filePath = join(imagesDirectory, row.storageFilename);
    if (!existsSync(filePath)) {
      response
        .status(404)
        .type('application/problem+json')
        .json(problem(404, 'Not Found', 'The entry image file is missing from local storage.'));
      return;
    }

    response
      .status(200)
      .type(row.contentType)
      .set('Cache-Control', 'public, max-age=31536000, immutable');
    createReadStream(filePath).pipe(response);
  });
}
