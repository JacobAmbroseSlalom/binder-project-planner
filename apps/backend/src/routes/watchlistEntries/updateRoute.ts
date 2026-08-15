import { existsSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';

import {
  CARD_VARIATION_MAX_LENGTH,
  CUSTOM_CARD_NAME_MAX_LENGTH,
  CUSTOM_CARD_NUMBER_MAX_LENGTH,
  CUSTOM_CARD_SET_MAX_LENGTH,
} from '@binder-project-planner/shared';
import { eq } from 'drizzle-orm';
import type { Router } from 'express';

import { cardImageAssets, cards, watchlistEntries } from '../../database/schema.js';
import { toCents } from '../../finance/currency.js';
import {
  removeTemporaryUploads,
  resolveCustomImageAsset,
  UnsupportedImageFormatError,
  type ResolvedImageAsset,
} from '../cards/index.js';

import { problem, serializeWatchlistEntry } from './serialization.js';
import type { UpdateWatchlistEntryRequestBody, WatchlistEntriesRouteDeps } from './types.js';

// Story 45's standalone-entry edit endpoint (`multipart/form-data`),
// mirroring `PATCH /cards/{cardId}/details`. Only valid for a standalone
// entry - a referenced entry's fields are instead edited through its own
// card via the existing card endpoints, since they write through to the
// same underlying `Card` row.
export function registerUpdateWatchlistEntryRoute(
  router: Router,
  deps: WatchlistEntriesRouteDeps,
): void {
  const { database, imagesDirectory } = deps;

  router.patch('/watchlist-entries/:watchlistEntryId', (request, response) => {
    const { watchlistEntryId } = request.params;
    const uploadedFiles = Array.isArray(request.files) ? request.files : undefined;

    const existing = database
      .select()
      .from(watchlistEntries)
      .where(eq(watchlistEntries.id, watchlistEntryId))
      .get();
    if (!existing) {
      if (uploadedFiles) removeTemporaryUploads(uploadedFiles);
      response
        .status(404)
        .type('application/problem+json')
        .json(problem(404, 'Not Found', `No entry exists with id "${watchlistEntryId}".`));
      return;
    }
    if (existing.cardId !== null) {
      if (uploadedFiles) removeTemporaryUploads(uploadedFiles);
      response
        .status(400)
        .type('application/problem+json')
        .json(
          problem(
            400,
            'Bad Request',
            'Referenced entries are edited through their card, not this endpoint.',
          ),
        );
      return;
    }

    if (!uploadedFiles) {
      response
        .status(400)
        .type('application/problem+json')
        .json(problem(400, 'Bad Request', 'This endpoint requires a multipart/form-data body.'));
      return;
    }

    const body = request.body as UpdateWatchlistEntryRequestBody;
    const name = body.name.trim();
    if (!name) {
      removeTemporaryUploads(uploadedFiles);
      response
        .status(400)
        .type('application/problem+json')
        .json(problem(400, 'Bad Request', 'name is required.'));
      return;
    }
    if (name.length > CUSTOM_CARD_NAME_MAX_LENGTH) {
      removeTemporaryUploads(uploadedFiles);
      response
        .status(400)
        .type('application/problem+json')
        .json(
          problem(
            400,
            'Bad Request',
            `name must be ${CUSTOM_CARD_NAME_MAX_LENGTH} characters or fewer.`,
          ),
        );
      return;
    }

    const setName = body.setName?.trim() || null;
    const localNumber = body.localNumber?.trim() || null;
    const variation = body.variation?.trim() || null;

    if (setName && setName.length > CUSTOM_CARD_SET_MAX_LENGTH) {
      removeTemporaryUploads(uploadedFiles);
      response
        .status(400)
        .type('application/problem+json')
        .json(
          problem(
            400,
            'Bad Request',
            `setName must be ${CUSTOM_CARD_SET_MAX_LENGTH} characters or fewer.`,
          ),
        );
      return;
    }
    if (localNumber && localNumber.length > CUSTOM_CARD_NUMBER_MAX_LENGTH) {
      removeTemporaryUploads(uploadedFiles);
      response
        .status(400)
        .type('application/problem+json')
        .json(
          problem(
            400,
            'Bad Request',
            `localNumber must be ${CUSTOM_CARD_NUMBER_MAX_LENGTH} characters or fewer.`,
          ),
        );
      return;
    }
    if (variation && variation.length > CARD_VARIATION_MAX_LENGTH) {
      removeTemporaryUploads(uploadedFiles);
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

    let asset: ResolvedImageAsset | null = null;
    const uploadedFile = uploadedFiles.find((file) => file.fieldname === 'image');
    if (uploadedFile) {
      try {
        asset = resolveCustomImageAsset(database, imagesDirectory, uploadedFile);
      } catch (error) {
        if (error instanceof UnsupportedImageFormatError) {
          response
            .status(415)
            .type('application/problem+json')
            .json(problem(415, 'Unsupported Media Type', error.message));
          return;
        }
        throw error;
      }
    }

    const priceCents = body.price === undefined ? null : toCents(body.price);
    const priceChanged = priceCents !== existing.priceCents;
    const now = new Date().toISOString();
    const isManualPrice = priceChanged ? true : existing.isManualPrice;
    const priceUpdatedAt = priceChanged ? now : existing.priceUpdatedAt;

    const updateValues = {
      name,
      setName,
      localNumber,
      variation,
      priceCents,
      isManualPrice,
      priceUpdatedAt,
      updatedAt: now,
      ...(asset ? { imageAssetId: asset.assetId } : {}),
    };

    // Mirrors `PATCH /cards/{cardId}/details`'s orphan-cleanup pattern:
    // only relevant when a new image replaces (rather than reuses, via
    // digest dedupe) the entry's previous asset. Image assets are shared
    // globally by digest across both `cards` and `watchlist_entries`, so
    // the "still referenced" check below covers both tables, not just
    // this one.
    const previousImageAssetId = existing.imageAssetId;
    const orphanedFilePath = database.transaction((tx) => {
      tx.update(watchlistEntries)
        .set(updateValues)
        .where(eq(watchlistEntries.id, watchlistEntryId))
        .run();

      if (!asset || !previousImageAssetId || asset.assetId === previousImageAssetId) return null;

      const stillReferencedByCard = tx
        .select({ id: cards.id })
        .from(cards)
        .where(eq(cards.imageAssetId, previousImageAssetId))
        .get();
      const stillReferencedByEntry = tx
        .select({ id: watchlistEntries.id })
        .from(watchlistEntries)
        .where(eq(watchlistEntries.imageAssetId, previousImageAssetId))
        .get();
      if (stillReferencedByCard || stillReferencedByEntry) return null;

      const oldAsset = tx
        .select({ storageFilename: cardImageAssets.storageFilename })
        .from(cardImageAssets)
        .where(eq(cardImageAssets.id, previousImageAssetId))
        .get();
      tx.delete(cardImageAssets).where(eq(cardImageAssets.id, previousImageAssetId)).run();
      return oldAsset ? join(imagesDirectory, oldAsset.storageFilename) : null;
    });

    if (orphanedFilePath && existsSync(orphanedFilePath)) {
      try {
        unlinkSync(orphanedFilePath);
      } catch (error) {
        request.log.error(
          { err: error, path: orphanedFilePath },
          'Failed to delete an orphaned watchlist-entry image file after an entry edit.',
        );
      }
    }

    response.status(200).json(serializeWatchlistEntry({ ...existing, ...updateValues }, null));
  });
}
