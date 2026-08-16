import { Router } from 'express';

import type { DatabaseConnection } from '../../database/client.js';

import { registerBinderCostEntryRoutes } from './binderCostEntries.js';
import { registerHolographicPaperCostEntryRoutes } from './holographicPaperCostEntries.js';
import { registerPrintingCostEntryRoutes } from './printingCostEntries.js';
import type { CostEntriesRouteDeps } from './shared.js';

// Creates the router owning story 34's 3 shared physical-cost catalogs:
// `binderCostEntries`, `printingCostEntries`, and
// `holographicPaperCostEntries` (story 48's "House cleaning" split of what
// was previously one 615-line routes/costEntries.ts file into this
// focused-file `routes/costEntries/` folder, following the same
// flat-domain-folder convention as routes/binders/ and routes/cards/).
export function createCostEntriesRouter(database: DatabaseConnection['database']): Router {
  const router = Router();
  const deps: CostEntriesRouteDeps = { database };

  registerBinderCostEntryRoutes(router, deps);
  registerPrintingCostEntryRoutes(router, deps);
  registerHolographicPaperCostEntryRoutes(router, deps);

  return router;
}
