import {
  DEFAULT_APPLICATION_DATA_DIRECTORY,
  DEFAULT_BACKEND_HOST,
  DEFAULT_BACKEND_PORT,
  DEFAULT_DATABASE_FILENAME,
  DEFAULT_FRONTEND_ORIGIN,
  DEFAULT_LOCAL_STATE_DIRECTORY,
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
  // Story 53: "Sync data across laptops via cloud-sync folder". A
  // separate, always-local directory for backup snapshots (and nothing
  // else) - deliberately independent of `applicationDataDirectory`, which
  // this story lets the user repoint at a cloud-sync client's folder. The
  // packaged desktop app passes Electron's fixed `app.getPath('userData')`
  // here; a plain (non-Electron) run falls back to a sibling directory of
  // the default data directory.
  localStateDirectory: resolve(
    process.cwd(),
    process.env.APP_LOCAL_STATE_DIRECTORY ?? DEFAULT_LOCAL_STATE_DIRECTORY,
  ),
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
