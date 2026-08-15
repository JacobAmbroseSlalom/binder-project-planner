import { randomUUID } from 'node:crypto';
import { unlinkSync } from 'node:fs';

import {
  CARD_VARIATION_MAX_LENGTH,
  CUSTOM_CARD_NAME_MAX_LENGTH,
  CUSTOM_CARD_NUMBER_MAX_LENGTH,
  CUSTOM_CARD_SET_MAX_LENGTH,
  DEFAULT_CARD_IS_MANUAL_PRICE,
} from '@binder-project-planner/shared';
import { eq } from 'drizzle-orm';
import type { Router } from 'express';

import { cardImageAssets, watchlistEntries } from '../../database/schema.js';
import {
  removeTemporaryUploads,
  resolveCustomImageAsset,
  UnsupportedImageFormatError,
  type ResolvedImageAsset,
} from '../cards/index.js';

import { countWatchlistEntries, extendPdfExportCutoffForNewEntries } from './pdfExportCutoff.js';
import { problem, serializeWatchlistEntry } from './serialization.js';
import type {
  CreateWatchlistEntryRequestBody,
  WatchlistEntriesRouteDeps,
  WatchlistEntryRow,
} from './types.js';

// Story 45's standalone manual-entry endpoint (`multipart/form-data`),
// mirroring `POST /binders/{binderId}/cards`'s custom-card branch minus
// placement and acquisition, which have no meaning for a binder-less
// entry.
export function registerCreateWatchlistEntryRoute(
  router: Router,
  deps: WatchlistEntriesRouteDeps,
): void {
  const { database, imagesDirectory } = deps;

  router.post('/watchlist-entries', (request, response) => {
    const uploadedFiles = Array.isArray(request.files) ? request.files : undefined;
    if (!uploadedFiles) {
      // Never expected: the OpenAPI schema only documents a
      // `multipart/form-data` request body, so express-openapi-validator
      // already rejects any other content type before this handler runs.
      response
        .status(400)
        .type('application/problem+json')
        .json(problem(400, 'Bad Request', 'This endpoint requires a multipart/form-data body.'));
      return;
    }

    const body = request.body as CreateWatchlistEntryRequestBody;
    const uploadedFile = uploadedFiles.find((file) => file.fieldname === 'image');
    if (!uploadedFile) {
      // Never expected: the OpenAPI schema requires `image`.
      removeTemporaryUploads(uploadedFiles);
      response
        .status(400)
        .type('application/problem+json')
        .json(problem(400, 'Bad Request', 'A standalone entry requires an image file.'));
      return;
    }

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

    let asset: ResolvedImageAsset;
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

    const previousTotalEntryCount = countWatchlistEntries(database);
    const now = new Date().toISOString();
    const entry: WatchlistEntryRow = {
      id: randomUUID(),
      cardId: null,
      sortOrder: previousTotalEntryCount,
      name,
      setName,
      localNumber,
      source: 'custom',
      providerCardId: null,
      providerSetId: null,
      variation,
      imageAssetId: asset.assetId,
      priceCents: null,
      isManualPrice: DEFAULT_CARD_IS_MANUAL_PRICE,
      priceUpdatedAt: null,
      createdAt: now,
      updatedAt: now,
    };

    try {
      database.insert(watchlistEntries).values(entry).run();
    } catch (error) {
      // The image asset row/file this request just created is otherwise
      // unreferenced once the insert fails, so it's removed rather than
      // left orphaned, mirroring `routes/cards/`'s own insert-failure
      // cleanup.
      if (asset.newlyCreatedFilePath) {
        unlinkSync(asset.newlyCreatedFilePath);
        database.delete(cardImageAssets).where(eq(cardImageAssets.id, asset.assetId)).run();
      }
      throw error;
    }

    extendPdfExportCutoffForNewEntries(database, previousTotalEntryCount, 1);
    response
      .status(201)
      .location(`/watchlist-entries/${entry.id}`)
      .json(serializeWatchlistEntry(entry, null));
  });
}
