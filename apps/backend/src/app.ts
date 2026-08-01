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
import { createBindersRouter } from './routes/binders.js';
import { createCardsRouter } from './routes/cards.js';

interface CreateAppOptions {
  database: DatabaseConnection['database'];
  frontendOrigin: string;
  // Where card/art image files are stored (story 11). Optional so existing
  // callers (e.g. tests) that don't exercise image storage don't need to
  // supply one; falls back to a throwaway directory under the OS temp dir.
  imagesDirectory?: string;
}

interface HttpError extends Error {
  status?: number;
}

export function createApp({
  database,
  frontendOrigin,
  imagesDirectory = join(tmpdir(), 'binder-project-planner-images'),
}: CreateAppOptions): Express {
  const app = express();

  app.use(pinoHttp({ logger: pino({ enabled: process.env.NODE_ENV !== 'test' }) }));
  app.use(cors({ origin: frontendOrigin }));
  app.use(express.json());
  app.use(
    OpenApiValidator.middleware({
      apiSpec: openApiSpecificationPath,
      validateRequests: true,
      validateResponses: true,
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

  app.use(createBindersRouter(database));
  app.use(createCardsRouter(database, imagesDirectory));

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
