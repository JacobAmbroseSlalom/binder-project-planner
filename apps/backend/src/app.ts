import cors from 'cors';
import express, { type ErrorRequestHandler, type Express } from 'express';
import * as OpenApiValidator from 'express-openapi-validator';
import { sql } from 'drizzle-orm';
import pino from 'pino';
import { pinoHttp } from 'pino-http';

import type { DatabaseConnection } from './database/client.js';
import { openApiSpecificationPath } from './paths.js';

interface CreateAppOptions {
  database: DatabaseConnection['database'];
  frontendOrigin: string;
}

interface HttpError extends Error {
  status?: number;
}

export function createApp({ database, frontendOrigin }: CreateAppOptions): Express {
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
