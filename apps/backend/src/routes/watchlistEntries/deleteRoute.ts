import { existsSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';

import { eq } from 'drizzle-orm';
import type { Router } from 'express';

import { cardImageAssets, cards, watchlistEntries } from '../../database/schema.js';

import type { WatchlistEntriesRouteDeps } from './types.js';

// Story 45's removal endpoint, handling both entry kinds. For a
// standalone entry, this is a complete deletion - nothing else
// references its row, so its owned image asset is also removed if this
// was its last reference (mirroring `DELETE /cards/{cardId}`). For a
// referenced entry, only this reference is removed; the underlying card
// is untouched. Deleting an already-absent entry also returns `204`.
export function registerDeleteWatchlistEntryRoute(
  router: Router,
  deps: WatchlistEntriesRouteDeps,
): void {
  const { database, imagesDirectory } = deps;

  router.delete('/watchlist-entries/:watchlistEntryId', (request, response) => {
    const { watchlistEntryId } = request.params;

    const orphanedFilePath = database.transaction((tx) => {
      const entry = tx
        .select({ cardId: watchlistEntries.cardId, imageAssetId: watchlistEntries.imageAssetId })
        .from(watchlistEntries)
        .where(eq(watchlistEntries.id, watchlistEntryId))
        .get();
      if (!entry) return null;

      tx.delete(watchlistEntries).where(eq(watchlistEntries.id, watchlistEntryId)).run();

      // A referenced entry has no own image asset to clean up (`cardId`
      // set implies `imageAssetId` null, per the table's own CHECK
      // constraint).
      if (entry.cardId !== null || !entry.imageAssetId) return null;

      const stillReferencedByCard = tx
        .select({ id: cards.id })
        .from(cards)
        .where(eq(cards.imageAssetId, entry.imageAssetId))
        .get();
      const stillReferencedByEntry = tx
        .select({ id: watchlistEntries.id })
        .from(watchlistEntries)
        .where(eq(watchlistEntries.imageAssetId, entry.imageAssetId))
        .get();
      if (stillReferencedByCard || stillReferencedByEntry) return null;

      const asset = tx
        .select({ storageFilename: cardImageAssets.storageFilename })
        .from(cardImageAssets)
        .where(eq(cardImageAssets.id, entry.imageAssetId))
        .get();
      tx.delete(cardImageAssets).where(eq(cardImageAssets.id, entry.imageAssetId)).run();
      return asset ? join(imagesDirectory, asset.storageFilename) : null;
    });

    if (orphanedFilePath && existsSync(orphanedFilePath)) {
      try {
        unlinkSync(orphanedFilePath);
      } catch (error) {
        request.log.error(
          { err: error, path: orphanedFilePath },
          'Failed to delete an orphaned watchlist-entry image file after entry deletion.',
        );
      }
    }

    response.status(204).end();
  });
}
