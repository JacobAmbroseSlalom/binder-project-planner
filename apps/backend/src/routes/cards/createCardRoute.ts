import { randomUUID } from 'node:crypto';

import {
  CARD_VARIATION_MAX_LENGTH,
  CUSTOM_CARD_NAME_MAX_LENGTH,
  CUSTOM_CARD_NUMBER_MAX_LENGTH,
  CUSTOM_CARD_SET_MAX_LENGTH,
  DEFAULT_CARD_ACQUIRED,
  DEFAULT_CARD_IS_MANUAL_PRICE,
} from '@binder-project-planner/shared';
import { eq } from 'drizzle-orm';
import { type Response, type Router } from 'express';
import { unlinkSync } from 'node:fs';

import { binders, cardImageAssets, cards } from '../../database/schema.js';
import { lockedBinderConflictProblem } from '../../lockedBinderProblem.js';

import {
  isUniqueConstraintError,
  removeTemporaryUploads,
  resolveCustomImageAsset,
  UnsupportedImageFormatError,
  type ResolvedImageAsset,
} from './imageAssets.js';
import { findArtOccupancyConflict, resolveCustomCardPlacement } from './placementValidation.js';
import { problem, serializeCard } from './serialization.js';
import type { CardsRouteDeps, CreateCustomCardRequestBody } from './types.js';

// Inserts a new card row and responds, sharing the "unique-placement
// conflict" (409) handling and unreferenced-asset cleanup between the
// provider-sourced (stories 11, 43) and custom-card (story 12) branches
// below - both return the same `201`/Location/serialized-card shape on
// success.
function insertCardAndRespond(
  database: CardsRouteDeps['database'],
  response: Response,
  card: {
    id: string;
    binderId: string;
    name: string;
    setName: string | null;
    localNumber: string | null;
    source: 'tcgdex' | 'pokemontcg' | 'custom';
    providerCardId: string | null;
    providerSetId: string | null;
    variation: string | null;
    physicalPage: number | null;
    row: number | null;
    column: number | null;
    imageAssetId: string;
    acquired: boolean;
    priceCents: null;
    isManualPrice: boolean;
    priceUpdatedAt: null;
    createdAt: string;
    updatedAt: string;
  },
  asset: ResolvedImageAsset,
): void {
  try {
    database.insert(cards).values(card).run();
  } catch (error) {
    // The image asset row/file this request just created is otherwise
    // unreferenced once the card insert fails, so it's removed rather
    // than left orphaned (planning.md).
    if (asset.newlyCreatedFilePath) {
      unlinkSync(asset.newlyCreatedFilePath);
      database.delete(cardImageAssets).where(eq(cardImageAssets.id, asset.assetId)).run();
    }

    if (isUniqueConstraintError(error)) {
      response
        .status(409)
        .type('application/problem+json')
        .json(
          problem(
            409,
            'Conflict',
            'Another card already occupies that binder, physical page, row, and column.',
          ),
        );
      return;
    }
    throw error;
  }

  response.status(201).location(`/cards/${card.id}`).json(serializeCard(card));
}

// Story 12's manual-entry endpoint (`multipart/form-data`, custom cards).
// TCGdex-card creation, including a single selected card, instead uses
// `POST /binders/{binderId}/cards/bulk` below (stories 11, 17, and 18) -
// this endpoint's single-card JSON TCGdex variant was removed when that
// bulk endpoint became the sole TCGdex-card creation path.
export function registerCreateCardRoute(router: Router, deps: CardsRouteDeps): void {
  const { database, imagesDirectory } = deps;

  router.post('/binders/:binderId/cards', async (request, response) => {
    const { binderId } = request.params;
    const uploadedFiles = Array.isArray(request.files) ? request.files : undefined;

    const binder = database.select().from(binders).where(eq(binders.id, binderId)).get();
    if (!binder) {
      if (uploadedFiles) removeTemporaryUploads(uploadedFiles);
      response
        .status(404)
        .type('application/problem+json')
        .json(problem(404, 'Not Found', `No binder exists with id "${binderId}".`));
      return;
    }

    // Story 32: a locked binder rejects every card mutation, including
    // creating one.
    if (binder.locked) {
      if (uploadedFiles) removeTemporaryUploads(uploadedFiles);
      response.status(409).type('application/problem+json').json(lockedBinderConflictProblem());
      return;
    }

    if (!uploadedFiles) {
      // Never expected: the OpenAPI schema only documents a
      // `multipart/form-data` request body for this endpoint now, so
      // express-openapi-validator already rejects any other content type
      // before this handler runs. Guarded defensively regardless.
      response
        .status(400)
        .type('application/problem+json')
        .json(problem(400, 'Bad Request', 'This endpoint requires a multipart/form-data body.'));
      return;
    }

    const body = request.body as CreateCustomCardRequestBody;
    const uploadedFile = uploadedFiles.find((file) => file.fieldname === 'image');
    if (!uploadedFile) {
      // Never expected: the OpenAPI schema requires `image`, so
      // express-openapi-validator already rejects a request missing it
      // before this handler runs. Guarded defensively regardless.
      removeTemporaryUploads(uploadedFiles);
      response
        .status(400)
        .type('application/problem+json')
        .json(problem(400, 'Bad Request', 'A custom card requires an image file.'));
      return;
    }

    const placementResult = resolveCustomCardPlacement(body, binder);
    if ('error' in placementResult) {
      removeTemporaryUploads(uploadedFiles);
      response
        .status(400)
        .type('application/problem+json')
        .json(problem(400, 'Bad Request', placementResult.error));
      return;
    }

    const artConflict = findArtOccupancyConflict(database, binderId, placementResult.placement);
    if (artConflict) {
      removeTemporaryUploads(uploadedFiles);
      response
        .status(409)
        .type('application/problem+json')
        .json(problem(409, 'Conflict', artConflict));
      return;
    }

    // Required after trimming (planning.md); the OpenAPI schema's
    // `minLength: 1` only guards the raw untrimmed value, so a
    // whitespace-only name still needs this check. The max-length check
    // below is a backend-validation belt-and-suspenders alongside the
    // OpenAPI schema's own `maxLength` (planning.md story 12).
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

    // Optional fields: trimmed, blank stores as null (planning.md).
    const setName = body.setName?.trim() || null;
    const localNumber = body.localNumber?.trim() || null;
    const variation = body.variation?.trim() || null;
    // Story 36: unchecked (omitted) defaults to unacquired, matching every
    // other card-creation path.
    const acquired = body.acquired ?? DEFAULT_CARD_ACQUIRED;

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

    const now = new Date().toISOString();
    insertCardAndRespond(
      database,
      response,
      {
        id: randomUUID(),
        binderId,
        name,
        setName,
        localNumber,
        source: 'custom',
        providerCardId: null,
        providerSetId: null,
        variation,
        physicalPage: placementResult.placement.physicalPage,
        row: placementResult.placement.row,
        column: placementResult.placement.column,
        imageAssetId: asset.assetId,
        acquired,
        // Story 38: every new card starts with no saved price regardless
        // of creation path, matching `DEFAULT_CARD_IS_MANUAL_PRICE`.
        priceCents: null,
        isManualPrice: DEFAULT_CARD_IS_MANUAL_PRICE,
        priceUpdatedAt: null,
        createdAt: now,
        updatedAt: now,
      },
      asset,
    );
  });
}
