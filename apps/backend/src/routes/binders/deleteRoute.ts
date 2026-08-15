import { existsSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';

import { eq } from 'drizzle-orm';
import type { Router } from 'express';

import { art, artImageAssets, binders, cardImageAssets, cards } from '../../database/schema.js';
import { lockedBinderConflictProblem } from '../../lockedBinderProblem.js';

import type { BindersRouteDeps } from './types.js';

// Story 21's binder-deletion endpoint: cascade-deletes every card, art,
// and dependent record the binder owns (the schema's `onDelete: 'cascade'`
// foreign keys) in one transaction, then - still within that same
// transaction - deletes any card/art image-asset record this binder's own
// cards/art referenced that no other card or art (in any binder) still
// references. Story 32: a locked binder can never be deleted; rejected
// with a stable locked-binder `409 Conflict` before the transaction below
// even starts.
export function registerDeleteBinderRoute(router: Router, deps: BindersRouteDeps): void {
  const { database, imagesDirectory } = deps;

  router.delete('/binders/:binderId', (request, response) => {
    const { binderId } = request.params;

    const existingBinder = database.select().from(binders).where(eq(binders.id, binderId)).get();
    if (existingBinder?.locked) {
      response.status(409).type('application/problem+json').json(lockedBinderConflictProblem());
      return;
    }

    const orphanedFilePaths = database.transaction((tx) => {
      const existing = tx
        .select({ id: binders.id })
        .from(binders)
        .where(eq(binders.id, binderId))
        .get();
      // Deleting an already-absent binder is still a successful no-op per
      // planning.md, matching every other delete endpoint in this app.
      if (!existing) return [];

      // Collected before the cascade delete below removes the rows that
      // reference them - deduplicated since multiple cards/art commonly
      // share one image asset (e.g. repeated TCGdex cards).
      const cardAssetIds = [
        ...new Set(
          tx
            .select({ imageAssetId: cards.imageAssetId })
            .from(cards)
            .where(eq(cards.binderId, binderId))
            .all()
            .map((row) => row.imageAssetId),
        ),
      ];
      const artAssetIds = [
        ...new Set(
          tx
            .select({ imageAssetId: art.imageAssetId })
            .from(art)
            .where(eq(art.binderId, binderId))
            .all()
            .map((row) => row.imageAssetId),
        ),
      ];

      // Cascade-deletes this binder's own cards, art, and other
      // binder-owned dependent records via the schema's foreign keys.
      tx.delete(binders).where(eq(binders.id, binderId)).run();

      const paths: string[] = [];

      // An asset is only cleaned up once no card anywhere (in any binder)
      // still references it - shared assets (e.g. a TCGdex card also
      // placed in another binder) are left alone.
      for (const assetId of cardAssetIds) {
        const stillReferenced = tx
          .select({ id: cards.id })
          .from(cards)
          .where(eq(cards.imageAssetId, assetId))
          .get();
        if (stillReferenced) continue;

        const asset = tx
          .select({ storageFilename: cardImageAssets.storageFilename })
          .from(cardImageAssets)
          .where(eq(cardImageAssets.id, assetId))
          .get();
        tx.delete(cardImageAssets).where(eq(cardImageAssets.id, assetId)).run();
        if (asset) paths.push(join(imagesDirectory, asset.storageFilename));
      }

      // Mirrors the loop above for art image assets, which may have up to
      // two files (the source upload and an orientation-normalized
      // derivative - see routes/art/imageAssets.ts).
      for (const assetId of artAssetIds) {
        const stillReferenced = tx
          .select({ id: art.id })
          .from(art)
          .where(eq(art.imageAssetId, assetId))
          .get();
        if (stillReferenced) continue;

        const asset = tx
          .select({
            storageFilename: artImageAssets.storageFilename,
            normalizedStorageFilename: artImageAssets.normalizedStorageFilename,
          })
          .from(artImageAssets)
          .where(eq(artImageAssets.id, assetId))
          .get();
        tx.delete(artImageAssets).where(eq(artImageAssets.id, assetId)).run();
        if (asset) {
          paths.push(join(imagesDirectory, asset.storageFilename));
          if (asset.normalizedStorageFilename) {
            paths.push(join(imagesDirectory, asset.normalizedStorageFilename));
          }
        }
      }

      return paths;
    });

    // Filesystem cleanup runs after the transaction commits (planning.md).
    // A failure here doesn't roll back or fail the already-completed
    // deletion - the now-unreferenced file (its asset row is already gone)
    // is left for the existing orphaned-image maintenance sweep
    // (routes/maintenance.ts) to find and remove on a later pass, which is
    // this app's existing "persisted as pending cleanup work and retried
    // by the backend" mechanism.
    for (const filePath of orphanedFilePaths) {
      if (existsSync(filePath)) {
        try {
          unlinkSync(filePath);
        } catch (error) {
          request.log.error(
            { err: error, path: filePath },
            'Failed to delete an orphaned image file after binder deletion.',
          );
        }
      }
    }

    response.status(204).end();
  });
}
