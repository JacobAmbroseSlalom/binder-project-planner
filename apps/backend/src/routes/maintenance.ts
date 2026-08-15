import { existsSync, readdirSync, statSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';

import { eq, isNull } from 'drizzle-orm';
import { Router } from 'express';

import type { DatabaseConnection } from '../database/client.js';
import { art, artImageAssets, cardImageAssets, cards } from '../database/schema.js';

// Orphaned asset rows/files younger than this are skipped even though
// nothing currently references them - an image-asset row (and its file)
// is created before its owning `cards`/`art` row in routes/cards/ and
// routes/art/, so a request still in flight briefly looks exactly like
// an orphan; this guards against deleting one out from under it.
const MINIMUM_ORPHAN_AGE_MS = 5 * 60 * 1000;

function isOldEnough(createdAt: string): boolean {
  return Date.now() - new Date(createdAt).getTime() >= MINIMUM_ORPHAN_AGE_MS;
}

// Deletes a file if it still exists, returning whether it did - an
// asset's `normalizedStorageFilename` is nullable and, in an already
// inconsistent database, a referenced file could already be missing;
// either way this is a no-op rather than an error.
function removeFileIfPresent(imagesDirectory: string, filename: string): boolean {
  const filePath = join(imagesDirectory, filename);
  if (!existsSync(filePath)) return false;
  unlinkSync(filePath);
  return true;
}

// A local-operator-only maintenance router (no frontend hookup - see the
// README's "Maintenance" section for the `curl` command that invokes it).
// Two cleanup passes, in order:
//
// 1. Image-asset rows that no `cards`/`art` row actually references (via
//    `imageAssetId`) are deleted, along with their file(s). A plain "does
//    this filename appear in the asset tables" check isn't enough - a
//    since-fixed bug left asset rows behind whose owning card/art row was
//    never created (or was later deleted without cascading to its shared
//    asset), so the asset table itself still "knows about" a file nothing
//    uses anymore.
// 2. Any remaining file in `imagesDirectory` not referenced by a
//    surviving asset row is deleted too - catches filesystem stragglers
//    with no asset row at all, e.g. a `.tmp` upload fragment left behind
//    by a crashed request (see uploads/digestDiskStorage.ts).
export function createMaintenanceRouter(
  database: DatabaseConnection['database'],
  imagesDirectory: string,
): Router {
  const router = Router();

  router.delete('/maintenance/orphaned-images', (_request, response) => {
    const deletedFiles: string[] = [];
    let deletedAssetRecordCount = 0;

    const orphanedCardAssets = database
      .select({
        id: cardImageAssets.id,
        storageFilename: cardImageAssets.storageFilename,
        createdAt: cardImageAssets.createdAt,
      })
      .from(cardImageAssets)
      .leftJoin(cards, eq(cards.imageAssetId, cardImageAssets.id))
      .where(isNull(cards.id))
      .all()
      .filter((row) => isOldEnough(row.createdAt));

    for (const asset of orphanedCardAssets) {
      if (removeFileIfPresent(imagesDirectory, asset.storageFilename)) {
        deletedFiles.push(asset.storageFilename);
      }
      database.delete(cardImageAssets).where(eq(cardImageAssets.id, asset.id)).run();
      deletedAssetRecordCount += 1;
    }

    const orphanedArtAssets = database
      .select({
        id: artImageAssets.id,
        storageFilename: artImageAssets.storageFilename,
        normalizedStorageFilename: artImageAssets.normalizedStorageFilename,
        createdAt: artImageAssets.createdAt,
      })
      .from(artImageAssets)
      .leftJoin(art, eq(art.imageAssetId, artImageAssets.id))
      .where(isNull(art.id))
      .all()
      .filter((row) => isOldEnough(row.createdAt));

    for (const asset of orphanedArtAssets) {
      if (removeFileIfPresent(imagesDirectory, asset.storageFilename)) {
        deletedFiles.push(asset.storageFilename);
      }
      if (
        asset.normalizedStorageFilename &&
        removeFileIfPresent(imagesDirectory, asset.normalizedStorageFilename)
      ) {
        deletedFiles.push(asset.normalizedStorageFilename);
      }
      database.delete(artImageAssets).where(eq(artImageAssets.id, asset.id)).run();
      deletedAssetRecordCount += 1;
    }

    // Second pass: whatever's still referenced by a surviving asset row
    // (after the deletions above) is the final "keep" list; anything else
    // on disk has no asset row at all and is a plain filesystem straggler.
    const referencedFilenames = new Set<string>();
    for (const row of database
      .select({ storageFilename: cardImageAssets.storageFilename })
      .from(cardImageAssets)
      .all()) {
      referencedFilenames.add(row.storageFilename);
    }
    for (const row of database
      .select({
        storageFilename: artImageAssets.storageFilename,
        normalizedStorageFilename: artImageAssets.normalizedStorageFilename,
      })
      .from(artImageAssets)
      .all()) {
      referencedFilenames.add(row.storageFilename);
      if (row.normalizedStorageFilename) referencedFilenames.add(row.normalizedStorageFilename);
    }

    if (existsSync(imagesDirectory)) {
      const now = Date.now();
      for (const entry of readdirSync(imagesDirectory, { withFileTypes: true })) {
        if (!entry.isFile() || referencedFilenames.has(entry.name)) continue;

        const filePath = join(imagesDirectory, entry.name);
        if (now - statSync(filePath).mtimeMs < MINIMUM_ORPHAN_AGE_MS) continue;

        unlinkSync(filePath);
        deletedFiles.push(entry.name);
      }
    }

    response.status(200).json({
      deletedFileCount: deletedFiles.length,
      deletedFiles,
      deletedAssetRecordCount,
    });
  });

  return router;
}
