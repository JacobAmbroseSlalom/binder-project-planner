import { Router } from 'express';

import type { DatabaseConnection } from '../../database/client.js';

import { registerArtPrintPageCountRoute } from './artPrintPageCountRoute.js';
import { registerCreateBinderRoute } from './createRoute.js';
import { registerDeleteBinderRoute } from './deleteRoute.js';
import { registerBinderDetailRoutes } from './detailRoutes.js';
import { registerDuplicateBinderRoute } from './duplicateRoute.js';
import { registerBinderExportRoutes } from './exportRoutes.js';
import { registerBinderListRoutes } from './listRoutes.js';
import { registerBinderNestedResourceRoutes } from './nestedResourceRoutes.js';
import type { BindersRouteDeps } from './types.js';
import { registerUpdateBinderRoute } from './updateRoute.js';

// Creates the router owning binder resources (story 48's "House cleaning"
// split of what was previously one 1900-line routes/binders.ts file into
// this focused-file `routes/binders/` folder, following the same
// flat-domain-folder convention as routes/cards/). Takes the raw database
// handle (rather than the whole `DatabaseConnection`) so it only depends on
// what it needs to run queries. `imagesDirectory` is used by the delete
// route to clean up now-orphaned card/art image files after a binder (and
// everything it owns) is removed, and by the PDF export routes to read
// stored card/art image files.
export function createBindersRouter(
  database: DatabaseConnection['database'],
  imagesDirectory: string,
): Router {
  const router = Router();
  const deps: BindersRouteDeps = { database, imagesDirectory };

  registerBinderListRoutes(router, deps);
  registerCreateBinderRoute(router, deps);
  registerBinderDetailRoutes(router, deps);
  registerUpdateBinderRoute(router, deps);
  registerDeleteBinderRoute(router, deps);
  registerDuplicateBinderRoute(router, deps);
  registerBinderExportRoutes(router, deps);
  registerArtPrintPageCountRoute(router, deps);
  registerBinderNestedResourceRoutes(router, deps);

  return router;
}
