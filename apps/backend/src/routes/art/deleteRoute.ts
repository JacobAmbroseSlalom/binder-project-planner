import { existsSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';

import { eq } from 'drizzle-orm';
import type { Router } from 'express';

import { art, artImageAssets, binders } from '../../database/schema.js';
import { lockedBinderConflictProblem } from '../../lockedBinderProblem.js';

import type { ArtRouteDeps } from './types.js';

// Story 26's art-removal endpoint, mirroring
// routes/cards/deleteRoute.ts's own `DELETE /cards/:cardId`: permanently
// deletes the identified art item, then - within the same transaction -
// deletes its image asset's row too if this was the final art item
// referencing it. Unlike a card's single image file, an art image asset
// may have up to two files (the source upload and an orientation-
// normalized derivative - see `resolveArtImageAsset`), so both are
// removed when orphaned.
export function registerDeleteArtRoute(router: Router, deps: ArtRouteDeps): void {
  const { database, imagesDirectory } = deps;

  router.delete('/art/:artId', (request, response) => {
    const { artId } = request.params;

    // Story 32: removing art is a restricted mutation - checked before
    // the transaction below even starts. Art that doesn't exist has no
    // binder to check, so this falls through to the existing no-op delete.
    const artForLockCheck = database
      .select({ binderId: art.binderId })
      .from(art)
      .where(eq(art.id, artId))
      .get();
    if (artForLockCheck) {
      const binderForLockCheck = database
        .select({ locked: binders.locked })
        .from(binders)
        .where(eq(binders.id, artForLockCheck.binderId))
        .get();
      if (binderForLockCheck?.locked) {
        response.status(409).type('application/problem+json').json(lockedBinderConflictProblem());
        return;
      }
    }

    const orphanedFilePaths = database.transaction((tx) => {
      const row = tx
        .select({ imageAssetId: art.imageAssetId })
        .from(art)
        .where(eq(art.id, artId))
        .get();
      // Deleting an already-absent art item is still a successful no-op,
      // matching routes/cards/deleteRoute.ts's own delete endpoint.
      if (!row) return null;

      tx.delete(art).where(eq(art.id, artId)).run();

      const stillReferenced = tx
        .select({ id: art.id })
        .from(art)
        .where(eq(art.imageAssetId, row.imageAssetId))
        .get();
      if (stillReferenced) return null;

      const asset = tx
        .select({
          storageFilename: artImageAssets.storageFilename,
          normalizedStorageFilename: artImageAssets.normalizedStorageFilename,
        })
        .from(artImageAssets)
        .where(eq(artImageAssets.id, row.imageAssetId))
        .get();
      tx.delete(artImageAssets).where(eq(artImageAssets.id, row.imageAssetId)).run();
      if (!asset) return null;

      const paths = [join(imagesDirectory, asset.storageFilename)];
      if (asset.normalizedStorageFilename) {
        paths.push(join(imagesDirectory, asset.normalizedStorageFilename));
      }
      return paths;
    });

    if (orphanedFilePaths) {
      for (const filePath of orphanedFilePaths) {
        if (existsSync(filePath)) {
          try {
            unlinkSync(filePath);
          } catch (error) {
            request.log.error(
              { err: error, path: filePath },
              'Failed to delete an orphaned art image file after art deletion.',
            );
          }
        }
      }
    }

    response.status(204).end();
  });
}
