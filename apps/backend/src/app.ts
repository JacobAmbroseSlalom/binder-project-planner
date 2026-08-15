import cors from 'cors';
import express, { type ErrorRequestHandler, type Express } from 'express';
import * as OpenApiValidator from 'express-openapi-validator';
import { sql } from 'drizzle-orm';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import pino from 'pino';
import { pinoHttp } from 'pino-http';

import type { DatabaseConnection } from './database/client.js';
import { openApiSpecificationPath } from './paths.js';
import { createArtRouter } from './routes/art/index.js';
import { createBindersRouter } from './routes/binders/index.js';
import { createCardsRouter } from './routes/cards/index.js';
import { createCostEntriesRouter } from './routes/costEntries.js';
import { createDataTransferRouter } from './routes/dataTransfer.js';
import { createFinanceSettingsRouter } from './routes/financeSettings.js';
import { createMaintenanceRouter } from './routes/maintenance.js';
import { createWatchlistEntriesRouter } from './routes/watchlistEntries/index.js';
import { createDigestDiskStorage } from './uploads/digestDiskStorage.js';

interface CreateAppOptions {
  database: DatabaseConnection['database'];
  frontendOrigin: string;
  // Where card/art image files are stored (story 11). Optional so existing
  // callers (e.g. tests) that don't exercise image storage don't need to
  // supply one; falls back to a throwaway directory under the OS temp dir.
  imagesDirectory?: string;
  // Story 38: optional pokemontcg.io API key, forwarded to the cards
  // router for price-fetch requests. Undefined works too (unauthenticated
  // requests), just at a much lower provider rate limit.
  pokemonTcgApiKey?: string;
}

interface HttpError extends Error {
  status?: number;
}

export function createApp({
  database,
  frontendOrigin,
  imagesDirectory = join(tmpdir(), 'binder-project-planner-images'),
  pokemonTcgApiKey,
}: CreateAppOptions): Express {
  const app = express();

  app.use(pinoHttp({ logger: pino({ enabled: process.env.NODE_ENV !== 'test' }) }));
  // `Content-Disposition` isn't one of the CORS-safelisted response headers
  // browsers expose to JS by default, so story 29's PDF export (whose
  // frontend `fetch` reads this header to recover the binder-name-derived
  // download filename) needs it explicitly exposed here - otherwise
  // `response.headers.get('Content-Disposition')` always returns null
  // cross-origin and the frontend silently falls back to a generic name.
  app.use(cors({ origin: frontendOrigin, exposedHeaders: ['Content-Disposition'] }));
  app.use(express.json());
  app.use(
    OpenApiValidator.middleware({
      apiSpec: openApiSpecificationPath,
      validateRequests: {
        // Body validation's ajv instance leaves `coerceTypes` off by
        // default (unlike the always-coerced query/path parameter
        // instance - see routes/cards/catalogSearchRoute.ts's
        // `includeTcgPocket` comment).
        // Story 12's multipart custom-card fields (e.g. `physicalPage`)
        // arrive as strings from the multipart form, so coercion needs to
        // be enabled here for them to validate against their `integer`
        // schema; it's a no-op for the JSON bodies used elsewhere, whose
        // values are already correctly typed.
        coerceTypes: true,
        allowUnknownQueryParameters: false,
      },
      validateResponses: true,
      // Enables express-openapi-validator's built-in multer integration
      // for any operation whose request body schema has a `format: binary`
      // property (story 12's `CreateCustomCardRequest.image`). A custom
      // disk-storage engine (rather than the default in-memory buffering)
      // streams the upload straight to a temporary file under
      // `imagesDirectory` while computing its SHA-256 digest, per the
      // story's "no application-level byte-size limit"/streaming
      // requirement.
      fileUploader: { storage: createDigestDiskStorage(imagesDirectory) },
    }),
  );

  app.get('/health', async (_request, response) => {
    try {
      await database.get(sql`select 1`);
      response.status(200).json({ status: 'ok', database: 'connected' });
    } catch {
      response.status(503).type('application/problem+json').json({
        type: 'about:blank',
        title: 'Service Unavailable',
        status: 503,
        detail: 'The database connection is unavailable.',
      });
    }
  });

  app.use(createBindersRouter(database, imagesDirectory));
  app.use(createCardsRouter(database, imagesDirectory, pokemonTcgApiKey));
  app.use(createArtRouter(database, imagesDirectory));
  app.use(createFinanceSettingsRouter(database));
  app.use(createCostEntriesRouter(database));
  app.use(createWatchlistEntriesRouter(database, imagesDirectory, pokemonTcgApiKey));
  app.use(createMaintenanceRouter(database, imagesDirectory));
  app.use(createDataTransferRouter(database, imagesDirectory));

  const errorHandler: ErrorRequestHandler = (error: HttpError, _request, response, _next) => {
    const status = error.status ?? 500;
    response
      .status(status)
      .type('application/problem+json')
      .json({
        type: 'about:blank',
        title: status === 500 ? 'Internal Server Error' : error.name,
        status,
        detail: error.message,
      });
  };
  app.use(errorHandler);

  return app;
}
