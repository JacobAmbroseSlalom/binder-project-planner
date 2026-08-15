import { randomUUID } from 'node:crypto';
import { unlinkSync } from 'node:fs';

import {
  BULK_CARD_CREATE_CONCURRENCY,
  CARD_VARIATION_MAX_LENGTH,
  DEFAULT_CARD_ACQUIRED,
  DEFAULT_CARD_IS_MANUAL_PRICE,
} from '@binder-project-planner/shared';
import { eq } from 'drizzle-orm';
import { type Router } from 'express';

import { binders, cardImageAssets, cards } from '../../database/schema.js';
import {
  findIdempotentOutcome,
  saveIdempotentOutcome,
} from '../../idempotency/mutationIdempotency.js';
import { PokemonTcgProviderError } from '../../integrations/pokemontcg.js';
import { TcgDexProviderError } from '../../integrations/tcgdex.js';
import { lockedBinderConflictProblem } from '../../lockedBinderProblem.js';

import { mapWithConcurrencyLimit } from '../concurrency.js';

import {
  isUniqueConstraintError,
  resolveCardCatalogImageAsset,
  type ResolvedImageAsset,
} from './imageAssets.js';
import { findArtOccupancyConflict, validatePlacement } from './placementValidation.js';
import { problem, serializeCard } from './serialization.js';
import type { BulkCreateCardsRequestBody, CardsRouteDeps, NullablePlacement } from './types.js';

// One submitted card's independent creation outcome (stories 17/18),
// matching the OpenAPI `BulkCardOutcome` schema.
type BulkCardOutcome =
  | { status: 'created'; card: ReturnType<typeof serializeCard> }
  | { status: 'failed'; problem: ReturnType<typeof problem> };

// Stories 17/18's bulk TCGdex-card creation endpoint - the sole
// TCGdex-card creation path now that the single-card JSON variant of
// `POST /binders/{binderId}/cards` is removed. Each submitted card is
// persisted independently (never one all-or-nothing transaction) so a
// large selection's partial success is possible; `targetPlacement`, when
// supplied, is attempted only for the first array element (used only
// when the card-selection modal was opened from an empty binder slot) -
// every other element, and the first element when no `targetPlacement`
// was supplied, always uses all-null placement (the unplaced-cards
// section). Idempotency-key-aware like `POST /art/{artId}/duplicate`
// (story 26's pattern): a repeated key within the retention window
// replays the stored outcome instead of creating additional cards.
export function registerBulkCreateCardsRoute(router: Router, deps: CardsRouteDeps): void {
  const { database, imagesDirectory } = deps;

  // Per-binder in-flight bulk-request guard (stories 17/18): the frontend
  // keeps its own Add Card/Add More buttons disabled while a batch is in
  // flight, but this in-memory set also rejects a genuinely overlapping
  // request (e.g. a second browser tab targeting the same binder) with
  // `409 Conflict` instead of racing two batches against the same binder.
  // Scoped to this function's own closure (recreated whenever the cards
  // router is created) - fine for a local single-process application with
  // no horizontal scaling.
  const activeBulkRequestBinderIds = new Set<string>();

  router.post('/binders/:binderId/cards/bulk', async (request, response) => {
    const { binderId } = request.params;

    const idempotencyKey = request.header('Idempotency-Key');
    if (!idempotencyKey) {
      response
        .status(400)
        .type('application/problem+json')
        .json(problem(400, 'Bad Request', 'An Idempotency-Key header is required.'));
      return;
    }

    const replayed = findIdempotentOutcome(database, 'bulk-create-cards', idempotencyKey);
    if (replayed) {
      response.status(replayed.responseStatus).json(replayed.responseBody);
      return;
    }

    const binder = database.select().from(binders).where(eq(binders.id, binderId)).get();
    if (!binder) {
      response
        .status(404)
        .type('application/problem+json')
        .json(problem(404, 'Not Found', `No binder exists with id "${binderId}".`));
      return;
    }

    // Story 32: a locked binder rejects a bulk card-creation request too.
    if (binder.locked) {
      response.status(409).type('application/problem+json').json(lockedBinderConflictProblem());
      return;
    }

    const body = request.body as BulkCreateCardsRequestBody;

    if (body.targetPlacement) {
      const placementError = validatePlacement(body.targetPlacement, binder);
      if (placementError) {
        response
          .status(400)
          .type('application/problem+json')
          .json(problem(400, 'Bad Request', placementError));
        return;
      }
    }

    // Blank shared variation input normalizes to null; a nonblank value is
    // trimmed (planning.md), matching every other card-creation endpoint's
    // own variation handling.
    const variation = body.variation?.trim() || null;
    // Story 36: applied to every card in this batch; omitted defaults to
    // unacquired.
    const acquired = body.acquired ?? DEFAULT_CARD_ACQUIRED;
    if (variation && variation.length > CARD_VARIATION_MAX_LENGTH) {
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

    if (activeBulkRequestBinderIds.has(binderId)) {
      response
        .status(409)
        .type('application/problem+json')
        .json(
          problem(
            409,
            'Conflict',
            'Another bulk card-creation request is already running for this binder.',
          ),
        );
      return;
    }
    activeBulkRequestBinderIds.add(binderId);

    // Deliberately not tied to `request.on('close', ...)`: planning.md
    // requires that "after the backend accepts a bulk request, client
    // disconnection does not cancel in-flight or remaining card
    // processing" - unlike the single-card endpoints, this batch keeps
    // running to completion (and its outcome stays idempotency-key
    // replayable) even if the client goes away. Each TCGdex request is
    // still bounded by its own TCGDEX_REQUEST_TIMEOUT_MS internally.
    const neverAbortedSignal = new AbortController().signal;

    try {
      const outcomes = await mapWithConcurrencyLimit(
        body.cards,
        BULK_CARD_CREATE_CONCURRENCY,
        async (item, index): Promise<BulkCardOutcome> => {
          // Only the first array element is attempted at the supplied
          // target placement; every other element - and the first when no
          // target placement was supplied - lands in the unplaced-cards
          // section (planning.md).
          const placement: NullablePlacement =
            index === 0 && body.targetPlacement
              ? body.targetPlacement
              : { physicalPage: null, row: null, column: null };

          if (placement.physicalPage !== null) {
            const artConflict = findArtOccupancyConflict(database, binderId, placement);
            if (artConflict) {
              return { status: 'failed', problem: problem(409, 'Conflict', artConflict) };
            }
          }

          let asset: ResolvedImageAsset;
          try {
            asset = await resolveCardCatalogImageAsset(
              database,
              imagesDirectory,
              item,
              neverAbortedSignal,
            );
          } catch (error) {
            if (error instanceof TcgDexProviderError || error instanceof PokemonTcgProviderError) {
              const status = error.isTimeout ? 504 : 502;
              return { status: 'failed', problem: problem(status, 'Bad Gateway', error.message) };
            }
            throw error;
          }

          const now = new Date().toISOString();
          const card = {
            id: randomUUID(),
            binderId,
            name: item.name,
            setName: item.setName,
            localNumber: item.localNumber,
            source: item.source,
            providerCardId: item.providerCardId,
            providerSetId: item.providerSetId,
            variation,
            physicalPage: placement.physicalPage,
            row: placement.row,
            column: placement.column,
            imageAssetId: asset.assetId,
            acquired,
            // Story 38: every new card starts with no saved price
            // regardless of creation path.
            priceCents: null,
            isManualPrice: DEFAULT_CARD_IS_MANUAL_PRICE,
            priceUpdatedAt: null,
            createdAt: now,
            updatedAt: now,
          };

          try {
            database.insert(cards).values(card).run();
          } catch (error) {
            // The image asset row/file this card just created is otherwise
            // unreferenced once its insert fails, so it's removed rather
            // than left orphaned (planning.md), mirroring
            // `insertCardAndRespond`'s own cleanup.
            if (asset.newlyCreatedFilePath) {
              unlinkSync(asset.newlyCreatedFilePath);
              database.delete(cardImageAssets).where(eq(cardImageAssets.id, asset.assetId)).run();
            }
            if (isUniqueConstraintError(error)) {
              return {
                status: 'failed',
                problem: problem(
                  409,
                  'Conflict',
                  'Another card already occupies that binder, physical page, row, and column.',
                ),
              };
            }
            throw error;
          }

          return { status: 'created', card: serializeCard(card) };
        },
      );

      const responseStatus = outcomes.some((outcome) => outcome.status === 'failed') ? 207 : 201;

      saveIdempotentOutcome(database, 'bulk-create-cards', idempotencyKey, {
        responseStatus,
        responseBody: outcomes,
        locationHeader: null,
      });

      response.status(responseStatus).json(outcomes);
    } finally {
      activeBulkRequestBinderIds.delete(binderId);
    }
  });
}
