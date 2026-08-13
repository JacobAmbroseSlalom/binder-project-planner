import {
  DEFAULT_APPLICATION_DATA_DIRECTORY,
  DEFAULT_BACKEND_HOST,
  DEFAULT_BACKEND_PORT,
  DEFAULT_DATABASE_FILENAME,
  DEFAULT_FRONTEND_ORIGIN,
} from '@binder-project-planner/shared';
import { resolve } from 'node:path';

import { getImagesDirectory } from './paths.js';

function readPort(value: string | undefined): number {
  if (value === undefined) {
    return DEFAULT_BACKEND_PORT;
  }

  const port = Number(value);
  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new Error(`PORT must be an integer between 1 and 65535; received "${value}".`);
  }

  return port;
}

const applicationDataDirectory = resolve(
  process.cwd(),
  process.env.APP_DATA_DIRECTORY ?? DEFAULT_APPLICATION_DATA_DIRECTORY,
);

export const config = {
  applicationDataDirectory,
  databaseFile:
    process.env.DATABASE_FILE ?? resolve(applicationDataDirectory, DEFAULT_DATABASE_FILENAME),
  imagesDirectory: getImagesDirectory(applicationDataDirectory),
  frontendOrigin: process.env.FRONTEND_ORIGIN ?? DEFAULT_FRONTEND_ORIGIN,
  host: process.env.HOST ?? DEFAULT_BACKEND_HOST,
  port: readPort(process.env.PORT),
  // Story 38: "Add card finances". Optional pokemontcg.io API key - the
  // provider works unauthenticated but enforces a much lower rate limit
  // without one, per its documentation. Left undefined (rather than
  // defaulted in `defaults.ts`, per the coding conventions' secrets rule)
  // when the environment variable isn't set.
  pokemonTcgApiKey: process.env.POKEMONTCG_API_KEY,
} as const;
