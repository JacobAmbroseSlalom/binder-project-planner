import { eq } from 'drizzle-orm';
import type { Router } from 'express';

import { binders } from '../../database/schema.js';

import { notFoundProblem, serializeBinder } from './serialization.js';
import { findResizeAffectedPlacements } from './resizeHelpers.js';
import { listTagsForBinder } from './tagsHelpers.js';
import type { BindersRouteDeps, ResizePreviewRequestBody } from './types.js';

// Story 7's binder-details GET (backs the shared binder context and Edit
// Details tab) and story 27's read-only resize-preview dry run - grouped
// together since both are simple read-only lookups keyed on the path
// binder id, unlike the mutating routes below.
export function registerBinderDetailRoutes(router: Router, deps: BindersRouteDeps): void {
  const { database } = deps;

  router.get('/binders/:binderId', (request, response) => {
    const { binderId } = request.params;
    const row = database.select().from(binders).where(eq(binders.id, binderId)).get();

    if (!row) {
      response.status(404).type('application/problem+json').json(notFoundProblem(binderId));
      return;
    }

    response.status(200).json(serializeBinder(row, listTagsForBinder(database, binderId)));
  });

  // Story 27's read-only dry run: identifies currently placed card/art
  // records that would be invalid under the proposed dimensions/pages
  // without changing any persisted data.
  router.post('/binders/:binderId/resize-preview', (request, response) => {
    const { binderId } = request.params;
    const body = request.body as ResizePreviewRequestBody;

    const existing = database.select().from(binders).where(eq(binders.id, binderId)).get();
    if (!existing) {
      response.status(404).type('application/problem+json').json(notFoundProblem(binderId));
      return;
    }

    const affected = findResizeAffectedPlacements(database, binderId, {
      width: body.width,
      height: body.height,
      pages: body.pages,
    });

    response.status(200).json(affected);
  });
}
