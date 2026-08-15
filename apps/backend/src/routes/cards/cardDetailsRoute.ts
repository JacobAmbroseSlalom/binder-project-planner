import { existsSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';

import {
  CARD_VARIATION_MAX_LENGTH,
  CUSTOM_CARD_NAME_MAX_LENGTH,
  CUSTOM_CARD_NUMBER_MAX_LENGTH,
  CUSTOM_CARD_SET_MAX_LENGTH,
} from '@binder-project-planner/shared';
import { eq } from 'drizzle-orm';
import { type Router } from 'express';

import { binders, cardImageAssets, cards } from '../../database/schema.js';
import { toCents } from '../../finance/currency.js';
import { lockedBinderConflictProblem } from '../../lockedBinderProblem.js';

import {
  removeTemporaryUploads,
  resolveCustomImageAsset,
  UnsupportedImageFormatError,
  type ResolvedImageAsset,
} from './imageAssets.js';
import { problem, serializeCard } from './serialization.js';
import type { CardRow, CardsRouteDeps, UpdateCardDetailsRequestBody } from './types.js';

// Story 49's Card List row edit action: replaces the path card's name,
// set, number, variation, and price in one request, and optionally its
// image - a dedicated multipart endpoint since it's the only card
// mutation needing to replace the image alongside other fields;
// `PATCH /cards/{cardId}` stays exclusively JSON/move-swap/variation/
// acquired, unchanged by this story. Applies identically to every card
// regardless of `source` (`tcgdex` or `custom`) and never touches
// `source`, `providerCardId`, or `providerSetId`.
export function registerCardDetailsRoute(router: Router, deps: CardsRouteDeps): void {
  const { database, imagesDirectory } = deps;

  router.patch('/cards/:cardId/details', async (request, response) => {
    const { cardId } = request.params;
    const uploadedFiles = Array.isArray(request.files) ? request.files : undefined;

    const existing = database.select().from(cards).where(eq(cards.id, cardId)).get() as
      CardRow | undefined;
    if (!existing) {
      if (uploadedFiles) removeTemporaryUploads(uploadedFiles);
      response
        .status(404)
        .type('application/problem+json')
        .json(problem(404, 'Not Found', `No card exists with id "${cardId}".`));
      return;
    }

    // Story 32: editing a card's details is a restricted mutation too,
    // matching every other card-field edit in this file (variation, move/
    // swap, creation, deletion) - only the acquisition toggle is exempt.
    const binder = database
      .select({ locked: binders.locked })
      .from(binders)
      .where(eq(binders.id, existing.binderId))
      .get();
    if (binder?.locked) {
      if (uploadedFiles) removeTemporaryUploads(uploadedFiles);
      response.status(409).type('application/problem+json').json(lockedBinderConflictProblem());
      return;
    }

    if (!uploadedFiles) {
      // Never expected: the OpenAPI schema only documents a
      // `multipart/form-data` request body for this endpoint, so
      // express-openapi-validator already rejects any other content type
      // before this handler runs. Guarded defensively regardless.
      response
        .status(400)
        .type('application/problem+json')
        .json(problem(400, 'Bad Request', 'This endpoint requires a multipart/form-data body.'));
      return;
    }

    const body = request.body as UpdateCardDetailsRequestBody;

    // Required after trimming (mirrors custom-card creation's own rule);
    // the OpenAPI schema's `minLength: 1` only guards the raw untrimmed
    // value.
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

    // Optional fields: trimmed, blank stores as null (mirrors custom-card
    // creation's own rule) - applied identically regardless of the card's
    // `source`.
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

    // A new image is optional here (unlike creation, where it's required)
    // - omitted leaves the card's existing `imageAssetId` unchanged.
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

    // `price` is omitted (rather than sent as an empty value) to clear the
    // card's saved price entirely; a submitted price is already coerced to
    // a number by app.ts's `coerceTypes: true` body validation.
    // `isManualPrice`/`priceUpdatedAt` only change when the saved price
    // cents value actually changes (mirrors `PATCH /binders/{binderId}/
    // cards/prices`'s "Save all" provenance rule) - editing any other
    // field never touches them.
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

    // Mirrors `DELETE /cards/:cardId`'s orphan-cleanup pattern: only
    // relevant here when a new image was uploaded and it replaces (rather
    // than reuses, via digest dedupe) the card's previous asset - the
    // database update and the orphan check/cleanup happen in one
    // transaction so a concurrent request can never observe the old asset
    // row deleted while some other card still references it.
    const orphanedFilePath = database.transaction((tx) => {
      tx.update(cards).set(updateValues).where(eq(cards.id, cardId)).run();

      if (!asset || asset.assetId === existing.imageAssetId) return null;

      const stillReferenced = tx
        .select({ id: cards.id })
        .from(cards)
        .where(eq(cards.imageAssetId, existing.imageAssetId))
        .get();
      if (stillReferenced) return null;

      const oldAsset = tx
        .select({ storageFilename: cardImageAssets.storageFilename })
        .from(cardImageAssets)
        .where(eq(cardImageAssets.id, existing.imageAssetId))
        .get();
      tx.delete(cardImageAssets).where(eq(cardImageAssets.id, existing.imageAssetId)).run();
      return oldAsset ? join(imagesDirectory, oldAsset.storageFilename) : null;
    });

    if (orphanedFilePath && existsSync(orphanedFilePath)) {
      try {
        unlinkSync(orphanedFilePath);
      } catch (error) {
        // Mirrors `DELETE /cards/:cardId`'s own handling: a failed file
        // cleanup doesn't roll back the already-committed database update
        // or change the 200 response - just logged for maintenance to
        // find and retry later.
        request.log.error(
          { err: error, path: orphanedFilePath },
          'Failed to delete an orphaned card image file after a card details edit.',
        );
      }
    }

    response.status(200).json(serializeCard({ ...existing, ...updateValues }));
  });
}
