import { Router } from 'express';

import type { DatabaseConnection } from '../../database/client.js';

import { registerBulkCreateWatchlistEntriesRoute } from './bulkCreateRoute.js';
import { registerCreateWatchlistEntryRoute } from './createRoute.js';
import { registerDeleteWatchlistEntryRoute } from './deleteRoute.js';
import { registerWatchlistEntryExportPdfRoute } from './exportPdfRoute.js';
import { registerWatchlistEntryImageRoute } from './imageRoute.js';
import { registerWatchlistEntriesListRoute } from './listRoute.js';
import { registerMarkWatchlistEntryAcquiredRoute } from './markAcquiredRoute.js';
import { registerWatchlistEntryOrderRoute } from './orderRoute.js';
import { registerWatchlistEntryPricingRoutes } from './pricingRoutes.js';
import { registerWatchlistEntryReferenceRoutes } from './referenceRoutes.js';
import type { WatchlistEntriesRouteDeps } from './types.js';
import { registerUpdateWatchlistEntryRoute } from './updateRoute.js';

// Builds the watchlist-entries-related Express router by composing each
// focused route-registration function below - split out of one large
// `watchlistEntries.ts` file (story 48's "House cleaning") along the same
// route-grouping / shared-helper-grouping mix used for `routes/cards/` and
// `routes/binders/`. Each registration function shares the same
// `WatchlistEntriesRouteDeps` (`database`, `imagesDirectory`,
// `pokemonTcgApiKey`) rather than each route file re-deriving its own
// subset, so adding a new shared dependency later only touches `types.ts`
// and this file.
export function createWatchlistEntriesRouter(
  database: DatabaseConnection['database'],
  imagesDirectory: string,
  pokemonTcgApiKey: string | undefined,
): Router {
  const router = Router();
  const deps: WatchlistEntriesRouteDeps = { database, imagesDirectory, pokemonTcgApiKey };

  registerWatchlistEntriesListRoute(router, deps);
  registerWatchlistEntryOrderRoute(router, deps);
  registerWatchlistEntryReferenceRoutes(router, deps);
  registerCreateWatchlistEntryRoute(router, deps);
  registerBulkCreateWatchlistEntriesRoute(router, deps);
  registerUpdateWatchlistEntryRoute(router, deps);
  registerDeleteWatchlistEntryRoute(router, deps);
  registerMarkWatchlistEntryAcquiredRoute(router, deps);
  registerWatchlistEntryImageRoute(router, deps);
  registerWatchlistEntryExportPdfRoute(router, deps);
  registerWatchlistEntryPricingRoutes(router, deps);

  return router;
}
