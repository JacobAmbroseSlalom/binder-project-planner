import { existsSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';

import { eq } from 'drizzle-orm';
import { type Router } from 'express';

import { binders, cardImageAssets, cards } from '../../database/schema.js';
import { lockedBinderConflictProblem } from '../../lockedBinderProblem.js';

import type { CardsRouteDeps } from './types.js';

// Story 13's card-removal endpoint: permanently deletes the identified
// card, then - within the same transaction - deletes its image asset's
// row too if this was the final card referencing it (planning.md: "If
// deletion removes the final card reference to an image asset, the
// backend immediately deletes the image-asset record"). The actual file
// removal happens after the transaction commits (below), since filesystem
// operations aren't part of the SQLite transaction and its failure must
// not roll back the already-committed database deletion.
export function registerDeleteCardRoute(router: Router, deps: CardsRouteDeps): void {
  const { database, imagesDirectory } = deps;

  router.delete('/cards/:cardId', (request, response) => {
    const { cardId } = request.params;

    // Story 32: removing a card is a restricted mutation - checked before
    // the transaction below even starts. A card that doesn't exist has no
    // binder to check, so this falls through to the existing no-op delete.
    const cardForLockCheck = database
      .select({ binderId: cards.binderId })
      .from(cards)
      .where(eq(cards.id, cardId))
      .get();
    if (cardForLockCheck) {
      const binderForLockCheck = database
        .select({ locked: binders.locked })
        .from(binders)
        .where(eq(binders.id, cardForLockCheck.binderId))
        .get();
      if (binderForLockCheck?.locked) {
        response.status(409).type('application/problem+json').json(lockedBinderConflictProblem());
        return;
      }
    }

    const orphanedFilePath = database.transaction((tx) => {
      const card = tx
        .select({ imageAssetId: cards.imageAssetId })
        .from(cards)
        .where(eq(cards.id, cardId))
        .get();
      // Deleting an already-absent card is still a successful no-op per
      // planning.md, so there's nothing left to do once the row doesn't
      // exist.
      if (!card) return null;

      tx.delete(cards).where(eq(cards.id, cardId)).run();

      const stillReferenced = tx
        .select({ id: cards.id })
        .from(cards)
        .where(eq(cards.imageAssetId, card.imageAssetId))
        .get();
      if (stillReferenced) return null;

      const asset = tx
        .select({ storageFilename: cardImageAssets.storageFilename })
        .from(cardImageAssets)
        .where(eq(cardImageAssets.id, card.imageAssetId))
        .get();
      tx.delete(cardImageAssets).where(eq(cardImageAssets.id, card.imageAssetId)).run();
      return asset ? join(imagesDirectory, asset.storageFilename) : null;
    });

    if (orphanedFilePath && existsSync(orphanedFilePath)) {
      try {
        unlinkSync(orphanedFilePath);
      } catch (error) {
        // Planning.md: a failed file cleanup doesn't roll back the already
        // committed database deletion or change the 204 response - just
        // logged for maintenance to find and retry later.
        request.log.error(
          { err: error, path: orphanedFilePath },
          'Failed to delete an orphaned card image file after card deletion.',
        );
      }
    }

    response.status(204).end();
  });
}
