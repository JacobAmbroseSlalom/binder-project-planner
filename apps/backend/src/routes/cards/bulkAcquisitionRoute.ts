import { and, eq, inArray } from 'drizzle-orm';
import { type Router } from 'express';

import { binders, cards } from '../../database/schema.js';

import { problem, serializeCard } from './serialization.js';
import type { CardsRouteDeps, UpdateCardsAcquisitionRequestBody } from './types.js';

// Story 46's bulk acquisition-toggle endpoint: replaces `acquired` for
// every card in `cardIds` in one request, powering the Card List tab's
// (story 37) select-all/deselect-all header control instead of the
// client looping individual `PATCH /cards/{cardId}` requests. Mirrors
// that single-card endpoint's own acquisition branch in remaining
// allowed while the binder is locked (see `cardMovementRoute.ts`'s
// `acquired` branch) - deliberately the one binder-scoped mutation in
// this router with no locked-binder check.
export function registerBulkAcquisitionRoute(router: Router, deps: CardsRouteDeps): void {
  const { database } = deps;

  router.patch('/binders/:binderId/cards/acquisition', (request, response) => {
    const { binderId } = request.params;
    const body = request.body as UpdateCardsAcquisitionRequestBody;

    const binder = database.select().from(binders).where(eq(binders.id, binderId)).get();
    if (!binder) {
      response
        .status(404)
        .type('application/problem+json')
        .json(problem(404, 'Not Found', `No binder exists with id "${binderId}".`));
      return;
    }

    const cardRows = database.select().from(cards).where(inArray(cards.id, body.cardIds)).all();
    const foundIds = new Set(cardRows.map((row) => row.id));
    const missingId = body.cardIds.find((id) => !foundIds.has(id));
    if (missingId) {
      response
        .status(404)
        .type('application/problem+json')
        .json(problem(404, 'Not Found', `No card exists with id "${missingId}".`));
      return;
    }

    // Every card must belong to the path binder - a request mixing card
    // ids from a different binder is rejected outright rather than only
    // updating the subset that matches, mirroring the move/swap endpoint's
    // own cross-binder rejection.
    const foreignCard = cardRows.find((row) => row.binderId !== binderId);
    if (foreignCard) {
      response
        .status(400)
        .type('application/problem+json')
        .json(problem(400, 'Bad Request', 'Every cardId must belong to the path binder.'));
      return;
    }

    const updatedAt = new Date().toISOString();
    database
      .update(cards)
      .set({ acquired: body.acquired, updatedAt })
      .where(and(eq(cards.binderId, binderId), inArray(cards.id, body.cardIds)))
      .run();

    const updatedRows = cardRows.map((row) => ({ ...row, acquired: body.acquired, updatedAt }));
    response.status(200).json(updatedRows.map(serializeCard));
  });
}
