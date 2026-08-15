import { Router } from 'express';

import type { DatabaseConnection } from '../../database/client.js';

import { registerBulkAcquisitionRoute } from './bulkAcquisitionRoute.js';
import { registerBulkCreateCardsRoute } from './bulkCreateRoute.js';
import { registerCardDetailsRoute } from './cardDetailsRoute.js';
import { registerCardCatalogSearchRoute } from './catalogSearchRoute.js';
import { registerCreateCardRoute } from './createCardRoute.js';
import { registerDeleteCardRoute } from './deleteRoute.js';
import { registerDuplicateCardRoute } from './duplicateRoute.js';
import { registerCardImageRoute } from './imageRoute.js';
import { registerCardMovementRoute } from './movementRoute.js';
import { registerCardPricingRoutes } from './pricingRoutes.js';
import type { CardsRouteDeps } from './types.js';

// Builds the cards-related Express router by composing each focused
// route-registration function below - split out of one large `cards.ts`
// file (story 48's "House cleaning") along a mix of route grouping (create/
// details/bulk-create/pricing/movement/lifecycle/image) and shared-helper
// grouping (types, serialization, image-asset resolution, placement
// validation). Each registration function shares the same `CardsRouteDeps`
// (`database`, `imagesDirectory`, `pokemonTcgApiKey`) rather than each
// route file re-deriving its own subset, so adding a new shared dependency
// later only touches `types.ts` and this file.
export function createCardsRouter(
  database: DatabaseConnection['database'],
  imagesDirectory: string,
  pokemonTcgApiKey: string | undefined,
): Router {
  const router = Router();
  const deps: CardsRouteDeps = { database, imagesDirectory, pokemonTcgApiKey };

  registerCardCatalogSearchRoute(router, deps);
  registerCreateCardRoute(router, deps);
  registerCardDetailsRoute(router, deps);
  registerBulkCreateCardsRoute(router, deps);
  registerBulkAcquisitionRoute(router, deps);
  registerCardPricingRoutes(router, deps);
  registerCardMovementRoute(router, deps);
  registerDeleteCardRoute(router, deps);
  registerDuplicateCardRoute(router, deps);
  registerCardImageRoute(router, deps);

  return router;
}

export {
  isUniqueConstraintError,
  removeTemporaryUploads,
  resolveCardCatalogImageAsset,
  resolveCustomImageAsset,
  UnsupportedImageFormatError,
  type ResolvedImageAsset,
} from './imageAssets.js';
export {
  countCardAcquisition,
  listCardsForBinder,
  listPlacedCardsForPreview,
} from './binderQueries.js';
