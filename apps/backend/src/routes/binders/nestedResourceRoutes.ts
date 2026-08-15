import { eq } from 'drizzle-orm';
import type { Router } from 'express';

import { binders } from '../../database/schema.js';
import { listArtForBinder } from '../art/index.js';
import { listCardsForBinder } from '../cards/index.js';

import { notFoundProblem } from './serialization.js';
import type { BindersRouteDeps } from './types.js';

// Story 7 requires the shared binder context to load details, cards, and
// art in parallel; both card creation (story 11, routes/cards/) and art
// creation (story 25, routes/art/) exist as of this router. Grouped
// together since both are simple binder-existence-checked passthroughs to
// the sibling routers' own list functions.
export function registerBinderNestedResourceRoutes(router: Router, deps: BindersRouteDeps): void {
  const { database } = deps;

  router.get('/binders/:binderId/cards', (request, response) => {
    const { binderId } = request.params;
    const exists = database
      .select({ id: binders.id })
      .from(binders)
      .where(eq(binders.id, binderId))
      .get();

    if (!exists) {
      response.status(404).type('application/problem+json').json(notFoundProblem(binderId));
      return;
    }

    response.status(200).json(listCardsForBinder(database, binderId));
  });

  router.get('/binders/:binderId/art', (request, response) => {
    const { binderId } = request.params;
    const exists = database
      .select({ id: binders.id })
      .from(binders)
      .where(eq(binders.id, binderId))
      .get();

    if (!exists) {
      response.status(404).type('application/problem+json').json(notFoundProblem(binderId));
      return;
    }

    response.status(200).json(listArtForBinder(database, binderId));
  });
}
