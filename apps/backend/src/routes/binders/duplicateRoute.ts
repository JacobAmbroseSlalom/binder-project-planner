import { randomUUID } from 'node:crypto';

import {
  DEFAULT_BINDER_LOCKED,
  generateUniqueBinderCopyName,
} from '@binder-project-planner/shared';
import { eq } from 'drizzle-orm';
import type { Router } from 'express';

import { art, binders, cards } from '../../database/schema.js';
import {
  findIdempotentOutcome,
  saveIdempotentOutcome,
} from '../../idempotency/mutationIdempotency.js';

import { badRequestProblem, notFoundProblem } from './serialization.js';
import { buildBinderSummary } from './summary.js';
import type { BinderRow, BindersRouteDeps } from './types.js';

// Story 21's binder-duplication endpoint: deep-copies the binder itself
// plus every card and art record it owns into a brand-new binder, all in
// one database transaction so a failure partway through rolls back the
// complete copied graph without touching the source. Copied cards/art
// reference the source records' existing image assets rather than copying
// image files. Idempotency-key-aware (mirrors
// `POST /art/{artId}/duplicate`) so a client retrying a duplicate request
// after a dropped response never creates a second binder.
export function registerDuplicateBinderRoute(router: Router, deps: BindersRouteDeps): void {
  const { database } = deps;

  router.post('/binders/:binderId/duplicate', (request, response) => {
    const { binderId } = request.params;
    const idempotencyKey = request.header('Idempotency-Key');
    if (!idempotencyKey) {
      response
        .status(400)
        .type('application/problem+json')
        .json(badRequestProblem('An Idempotency-Key header is required.'));
      return;
    }

    const replayed = findIdempotentOutcome(database, 'binder-duplicate', idempotencyKey);
    if (replayed) {
      const replayedResponse = response.status(replayed.responseStatus);
      if (replayed.locationHeader) replayedResponse.location(replayed.locationHeader);
      replayedResponse.json(replayed.responseBody);
      return;
    }

    const source = database.select().from(binders).where(eq(binders.id, binderId)).get() as
      BinderRow | undefined;
    if (!source) {
      response.status(404).type('application/problem+json').json(notFoundProblem(binderId));
      return;
    }

    const newBinderId = randomUUID();
    const now = new Date().toISOString();

    const newBinderRow = database.transaction((tx) => {
      // Reads every existing normalized name once, up front, to compute
      // the unique copy name in-process. Node/better-sqlite3 run this
      // callback fully synchronously, so nothing else can insert a
      // colliding binder name between this read and the insert below.
      const existingNormalizedNames = new Set(
        tx
          .select({ normalizedName: binders.normalizedName })
          .from(binders)
          .all()
          .map((row) => row.normalizedName),
      );
      const uniqueName = generateUniqueBinderCopyName(existingNormalizedNames, source.name);

      const newBinder: BinderRow = {
        ...source,
        id: newBinderId,
        name: uniqueName,
        normalizedName: uniqueName.toLowerCase(),
        // Story 32: a duplicate never copies the source binder's lock
        // state - it's always created unlocked, even when duplicating a
        // currently locked binder.
        locked: DEFAULT_BINDER_LOCKED,
        createdAt: now,
        updatedAt: now,
      };
      tx.insert(binders).values(newBinder).run();

      const sourceCards = tx.select().from(cards).where(eq(cards.binderId, binderId)).all();
      for (const card of sourceCards) {
        tx.insert(cards)
          .values({
            ...card,
            id: randomUUID(),
            binderId: newBinderId,
            createdAt: now,
            updatedAt: now,
          })
          .run();
      }

      const sourceArt = tx.select().from(art).where(eq(art.binderId, binderId)).all();
      for (const artItem of sourceArt) {
        tx.insert(art)
          .values({
            ...artItem,
            id: randomUUID(),
            binderId: newBinderId,
            createdAt: now,
            updatedAt: now,
          })
          .run();
      }

      return newBinder;
    });

    const summary = buildBinderSummary(database, newBinderRow);
    const locationHeader = `/binders/${newBinderId}`;
    saveIdempotentOutcome(database, 'binder-duplicate', idempotencyKey, {
      responseStatus: 201,
      responseBody: summary,
      locationHeader,
    });

    response.status(201).location(locationHeader).json(summary);
  });
}
