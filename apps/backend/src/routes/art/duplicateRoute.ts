import { randomUUID } from 'node:crypto';

import { eq } from 'drizzle-orm';
import type { Router } from 'express';

import { art, binders } from '../../database/schema.js';
import {
  findIdempotentOutcome,
  saveIdempotentOutcome,
} from '../../idempotency/mutationIdempotency.js';
import { lockedBinderConflictProblem } from '../../lockedBinderProblem.js';

import { problem, serializeArt } from './serialization.js';
import type { ArtRouteDeps, ArtRow } from './types.js';

// Story 26's duplicate-art endpoint: creates a new, always-unplaced art
// item sharing the source item's image asset and every editable property.
// Idempotency-key-aware (planning.md: "Each duplicate action uses a
// client-generated UUID idempotency key; retries reuse that key, and the
// backend retains and replays the outcome for the shared 24-hour
// mutation-idempotency period") so a client retrying a duplicate request
// after a dropped response never creates a second copy.
export function registerDuplicateArtRoute(router: Router, deps: ArtRouteDeps): void {
  const { database } = deps;

  router.post('/art/:artId/duplicate', (request, response) => {
    const { artId } = request.params;
    const idempotencyKey = request.header('Idempotency-Key');
    if (!idempotencyKey) {
      response
        .status(400)
        .type('application/problem+json')
        .json(problem(400, 'Bad Request', 'An Idempotency-Key header is required.'));
      return;
    }

    const replayed = findIdempotentOutcome(database, 'art-duplicate', idempotencyKey);
    if (replayed) {
      const replayedResponse = response.status(replayed.responseStatus);
      if (replayed.locationHeader) replayedResponse.location(replayed.locationHeader);
      replayedResponse.json(replayed.responseBody);
      return;
    }

    const source = database.select().from(art).where(eq(art.id, artId)).get() as ArtRow | undefined;
    if (!source) {
      response
        .status(404)
        .type('application/problem+json')
        .json(problem(404, 'Not Found', `No art exists with id "${artId}".`));
      return;
    }

    // Story 32: duplicating art is a restricted mutation too.
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
    const duplicate: ArtRow = {
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

    database.insert(art).values(duplicate).run();

    const responseBody = serializeArt(duplicate);
    const locationHeader = `/art/${duplicate.id}`;
    saveIdempotentOutcome(database, 'art-duplicate', idempotencyKey, {
      responseStatus: 201,
      responseBody,
      locationHeader,
    });

    response.status(201).location(locationHeader).json(responseBody);
  });
}
