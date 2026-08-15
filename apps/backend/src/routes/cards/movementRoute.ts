import { CARD_VARIATION_MAX_LENGTH } from '@binder-project-planner/shared';
import { eq } from 'drizzle-orm';
import { type Router } from 'express';

import { binders, cards } from '../../database/schema.js';
import { lockedBinderConflictProblem } from '../../lockedBinderProblem.js';

import { isUniqueConstraintError } from './imageAssets.js';
import {
  findArtOccupancyConflict,
  MoveConflictError,
  validateMovePlacement,
} from './placementValidation.js';
import { problem, serializeCard } from './serialization.js';
import type {
  CardRow,
  CardsRouteDeps,
  MoveCardsRequestBody,
  UpdateCardAcquiredRequestBody,
  UpdateCardVariationRequestBody,
} from './types.js';

// Story 14's card move/swap endpoint (and story 16's variation-update
// endpoint, and story 36's acquisition-update endpoint, all of which share
// this same path/method): applies one update (a simple move) or two
// updates (a swap) in a single transaction for a move/swap request; the
// variation- and acquisition-update request bodies are each handled as
// their own simpler, independent branch instead. Move/swap: each update's
// `expectedPlacement` is compared against the card's currently persisted
// placement before anything changes, so a stale client can never silently
// clobber a position another request already moved; any mismatch throws
// `MoveConflictError`, rolling back the transaction and mapping to `409
// Conflict`. Every card is first nulled out and only then set to its
// `finalPlacement` (rather than applying each update in one pass) so a
// 2-card swap never trips the `cards_binder_placement_unique` index by
// momentarily placing one card at a slot the other update's card hasn't
// vacated yet - SQLite's unique index is checked per statement, not
// deferred to commit. If a destination is still occupied by a card that
// wasn't included in `updates` (a stale/incomplete client request), that
// final `UPDATE` still trips the same unique constraint, which is likewise
// caught and mapped to `409 Conflict`.
export function registerCardMovementRoute(router: Router, deps: CardsRouteDeps): void {
  const { database } = deps;

  router.patch('/cards/:cardId', (request, response) => {
    const { cardId } = request.params;

    // Story 36: an acquisition-update request body has `acquired` (and no
    // `updates`) instead of a move/swap's `updates` array - the OpenAPI
    // `oneOf` request schema's third branch. Checked before the
    // variation-update branch below since neither shape has an `updates`
    // key; handled as its own simple last-write-wins branch for the same
    // reasons as the variation-update branch (no expected-position
    // comparison, no transaction needed).
    if (!('updates' in request.body) && 'acquired' in request.body) {
      const body = request.body as UpdateCardAcquiredRequestBody;
      const existing = database.select().from(cards).where(eq(cards.id, cardId)).get();
      if (!existing) {
        response
          .status(404)
          .type('application/problem+json')
          .json(problem(404, 'Not Found', `No card exists with id "${cardId}".`));
        return;
      }

      // Story 32/37: unlike every other mutation guarded by this file's
      // locked-binder checks, acquisition changes remain allowed while the
      // binder is locked - the Card List tab's (story 37) row toggle and
      // its bulk select-all/deselect-all control (story 46, `PATCH
      // /binders/{binderId}/cards/acquisition`) are the two flows that
      // call this behavior, so there's deliberately no lock check here.
      const updatedAt = new Date().toISOString();
      database
        .update(cards)
        .set({ acquired: body.acquired, updatedAt })
        .where(eq(cards.id, cardId))
        .run();

      response.status(200).json(serializeCard({ ...existing, acquired: body.acquired, updatedAt }));
      return;
    }

    // Story 16: a variation-update request body has `variation` (and no
    // `updates`) instead of a move/swap's `updates` array - the OpenAPI
    // `oneOf` request schema guarantees the body is exactly one of the two
    // shapes, so checking for `updates`' absence is enough to distinguish
    // them. Handled as an independent, simpler branch (no expected-position
    // comparison, no transaction, last-write-wins) rather than folding it
    // into the move/swap transaction below, since the two operations don't
    // share any of that logic.
    if (!('updates' in request.body)) {
      const body = request.body as UpdateCardVariationRequestBody;
      const existing = database.select().from(cards).where(eq(cards.id, cardId)).get();
      if (!existing) {
        response
          .status(404)
          .type('application/problem+json')
          .json(problem(404, 'Not Found', `No card exists with id "${cardId}".`));
        return;
      }

      // Story 32: editing a card's variation is a restricted mutation too.
      const binderForVariationEdit = database
        .select({ locked: binders.locked })
        .from(binders)
        .where(eq(binders.id, existing.binderId))
        .get();
      if (binderForVariationEdit?.locked) {
        response.status(409).type('application/problem+json').json(lockedBinderConflictProblem());
        return;
      }

      // Blank input normalizes to null; a nonblank value is trimmed
      // (planning.md), mirroring card creation's own variation handling.
      const variation = body.variation?.trim() || null;
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

      const updatedAt = new Date().toISOString();
      database.update(cards).set({ variation, updatedAt }).where(eq(cards.id, cardId)).run();

      response.status(200).json(serializeCard({ ...existing, variation, updatedAt }));
      return;
    }

    const body = request.body as MoveCardsRequestBody;

    if (!body.updates.some((update) => update.cardId === cardId)) {
      response
        .status(400)
        .type('application/problem+json')
        .json(
          problem(
            400,
            'Bad Request',
            'The path cardId must identify one of the updates in the request body.',
          ),
        );
      return;
    }

    // Loaded up front (outside the transaction) so a missing card or a
    // cross-binder request can return a plain 404/400 without needing to
    // unwind a started transaction.
    const cardRows = new Map<string, CardRow>();
    for (const update of body.updates) {
      const row = database.select().from(cards).where(eq(cards.id, update.cardId)).get();
      if (!row) {
        response
          .status(404)
          .type('application/problem+json')
          .json(problem(404, 'Not Found', `No card exists with id "${update.cardId}".`));
        return;
      }
      cardRows.set(update.cardId, row);
    }

    const binderIds = new Set(Array.from(cardRows.values(), (row) => row.binderId));
    if (binderIds.size > 1) {
      response
        .status(400)
        .type('application/problem+json')
        .json(
          problem(
            400,
            'Bad Request',
            'All cards in one movement request must belong to the same binder.',
          ),
        );
      return;
    }

    const binder = database
      .select()
      .from(binders)
      .where(eq(binders.id, [...binderIds][0]!))
      .get();
    // Unreachable in practice - every card's `binderId` has a `NOT NULL
    // ... REFERENCES binders(id)` foreign key - but guarded defensively
    // rather than asserting `binder!` below.
    if (!binder) {
      response
        .status(404)
        .type('application/problem+json')
        .json(problem(404, 'Not Found', 'No binder exists for the given card(s).'));
      return;
    }

    // Story 32: moving/swapping cards is a restricted mutation too.
    if (binder.locked) {
      response.status(409).type('application/problem+json').json(lockedBinderConflictProblem());
      return;
    }

    for (const update of body.updates) {
      const placementError = validateMovePlacement(update.finalPlacement, binder);
      if (placementError) {
        response
          .status(400)
          .type('application/problem+json')
          .json(problem(400, 'Bad Request', placementError));
        return;
      }

      // Story 26: a card can never move onto a slot placed multi-slot art
      // covers, even if the destination isn't held by another card.
      const artConflict = findArtOccupancyConflict(database, binder.id, update.finalPlacement);
      if (artConflict) {
        response
          .status(409)
          .type('application/problem+json')
          .json(problem(409, 'Conflict', artConflict));
        return;
      }
    }

    try {
      const updatedRows = database.transaction((tx) => {
        for (const update of body.updates) {
          const current = cardRows.get(update.cardId)!;
          const { expectedPlacement } = update;
          if (
            current.physicalPage !== expectedPlacement.physicalPage ||
            current.row !== expectedPlacement.row ||
            current.column !== expectedPlacement.column
          ) {
            throw new MoveConflictError(
              `Card "${update.cardId}" no longer has its expected position.`,
            );
          }
        }

        // Pass 1: null out every affected card's placement so pass 2 can
        // never momentarily collide with another card in this same update
        // set (see the function-level comment above).
        for (const update of body.updates) {
          tx.update(cards)
            .set({ physicalPage: null, row: null, column: null })
            .where(eq(cards.id, update.cardId))
            .run();
        }

        const now = new Date().toISOString();
        for (const update of body.updates) {
          tx.update(cards)
            .set({
              physicalPage: update.finalPlacement.physicalPage,
              row: update.finalPlacement.row,
              column: update.finalPlacement.column,
              updatedAt: now,
            })
            .where(eq(cards.id, update.cardId))
            .run();
        }

        return body.updates.map((update) =>
          tx.select().from(cards).where(eq(cards.id, update.cardId)).get()!,
        );
      });

      response.status(200).json(updatedRows.map(serializeCard));
    } catch (error) {
      if (error instanceof MoveConflictError) {
        response
          .status(409)
          .type('application/problem+json')
          .json(problem(409, 'Conflict', error.message));
        return;
      }
      if (isUniqueConstraintError(error)) {
        response
          .status(409)
          .type('application/problem+json')
          .json(problem(409, 'Conflict', 'The destination slot is occupied.'));
        return;
      }
      throw error;
    }
  });
}
