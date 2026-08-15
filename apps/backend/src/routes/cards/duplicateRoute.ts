import { randomUUID } from 'node:crypto';

import { eq } from 'drizzle-orm';
import { type Router } from 'express';

import { binders, cards } from '../../database/schema.js';
import {
  findIdempotentOutcome,
  saveIdempotentOutcome,
} from '../../idempotency/mutationIdempotency.js';
import { lockedBinderConflictProblem } from '../../lockedBinderProblem.js';

import { problem, serializeCard } from './serialization.js';
import type { CardRow, CardsRouteDeps } from './types.js';

// Story 19's duplicate-card endpoint: creates a new, always-unplaced card
// copying every card-owned field from the source card and sharing its
// existing image asset (no new download/file is ever created for a
// duplicate) - mirrors `POST /art/{artId}/duplicate`'s (story 26)
// idempotency-key-aware pattern exactly, so a retried duplicate request
// after a dropped response replays the original outcome instead of
// creating a second copy.
export function registerDuplicateCardRoute(router: Router, deps: CardsRouteDeps): void {
  const { database } = deps;

  router.post('/cards/:cardId/duplicate', (request, response) => {
    const { cardId } = request.params;
    const idempotencyKey = request.header('Idempotency-Key');
    if (!idempotencyKey) {
      response
        .status(400)
        .type('application/problem+json')
        .json(problem(400, 'Bad Request', 'An Idempotency-Key header is required.'));
      return;
    }

    const replayed = findIdempotentOutcome(database, 'card-duplicate', idempotencyKey);
    if (replayed) {
      const replayedResponse = response.status(replayed.responseStatus);
      if (replayed.locationHeader) replayedResponse.location(replayed.locationHeader);
      replayedResponse.json(replayed.responseBody);
      return;
    }

    const source = database.select().from(cards).where(eq(cards.id, cardId)).get() as
      CardRow | undefined;
    if (!source) {
      response
        .status(404)
        .type('application/problem+json')
        .json(problem(404, 'Not Found', `No card exists with id "${cardId}".`));
      return;
    }

    // Story 32: duplicating a card is a restricted mutation too.
    const binderForDuplicate = database
      .select({ locked: binders.locked })
      .from(binders)
      .where(eq(binders.id, source.binderId))
      .get();
    if (binderForDuplicate?.locked) {
      response.status(409).type('application/problem+json').json(lockedBinderConflictProblem());
      return;
    }

    const now = new Date().toISOString();
    const duplicate: CardRow = {
      ...source,
      id: randomUUID(),
      // A duplicate always starts unplaced (planning.md), even if the
      // source is currently placed - the user places it explicitly.
      physicalPage: null,
      row: null,
      column: null,
      createdAt: now,
      updatedAt: now,
    };

    database.insert(cards).values(duplicate).run();

    const responseBody = serializeCard(duplicate);
    const locationHeader = `/cards/${duplicate.id}`;
    saveIdempotentOutcome(database, 'card-duplicate', idempotencyKey, {
      responseStatus: 201,
      responseBody,
      locationHeader,
    });

    response.status(201).location(locationHeader).json(responseBody);
  });
}
