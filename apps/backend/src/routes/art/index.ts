import { Router } from 'express';

import type { DatabaseConnection } from '../../database/client.js';

import { registerCreateArtRoute } from './createRoute.js';
import { registerDeleteArtRoute } from './deleteRoute.js';
import { registerDuplicateArtRoute } from './duplicateRoute.js';
import { registerArtImageRoute } from './imageRoute.js';
import type { ArtRouteDeps } from './types.js';
import { registerUpdateArtRoute } from './updateRoute.js';

// `routes/art.ts` grew past the project's 600-line split threshold
// (coding-conventions.instructions.md), so it's split the same way
// `routes/cards/`, `routes/binders/`, and `routes/watchlistEntries/`
// already were: one file per route (or small logical route-group), plus
// shared `types.ts`/`serialization.ts`/`validation.ts`/`imageAssets.ts`
// helper files. `listArtForBinder`/`listPlacedArtForPreview` move to
// `binderQueries.ts` and are re-exported here since they're also imported
// directly by `routes/binders/` files.
export function createArtRouter(
  database: DatabaseConnection['database'],
  imagesDirectory: string,
): Router {
  const router = Router();
  const deps: ArtRouteDeps = { database, imagesDirectory };

  registerCreateArtRoute(router, deps);
  registerUpdateArtRoute(router, deps);
  registerDeleteArtRoute(router, deps);
  registerDuplicateArtRoute(router, deps);
  registerArtImageRoute(router, deps);

  return router;
}

export { listArtForBinder, listPlacedArtForPreview } from './binderQueries.js';
