import { Router } from 'express';

import type { DatabaseConnection } from '../database/client.js';
import { createBackupSnapshot } from '../sync/backupSnapshots.js';

export interface CreateShutdownRouterOptions {
  connection: DatabaseConnection;
  imagesDirectory: string;
  localStateDirectory: string;
}

// Story 53: "Sync data across laptops via cloud-sync folder". Writes a
// local backup snapshot, then checkpoints the WAL into the main database
// file so the data directory is left as a single sync-safe file, and
// finally closes the connection. Shared by the HTTP route below (the
// desktop app's quit sequence) and server.ts's own SIGINT/SIGTERM
// handling, so a plain `Ctrl+C` during local development leaves the data
// directory in exactly the same state as the desktop app's quit does.
export function performGracefulShutdown(options: CreateShutdownRouterOptions): void {
  const { connection, imagesDirectory, localStateDirectory } = options;

  try {
    createBackupSnapshot({ database: connection.database, imagesDirectory, localStateDirectory });
  } catch (error) {
    // Best-effort: a failed backup shouldn't prevent the app from being
    // able to shut down at all.
    console.error('Failed to write shutdown backup snapshot:', error);
  }

  connection.checkpoint();
  connection.close();
}

// A single endpoint the desktop app calls (and awaits) as part of its quit
// sequence instead of relying on `ChildProcess.kill()` alone - Node
// delivers that as a forceful `TerminateProcess()` call on Windows, which
// the child can't intercept to run any cleanup first, unlike POSIX's
// catchable SIGTERM. Runs `performGracefulShutdown` above, then exits the
// process once the response has been sent.
export function createShutdownRouter(options: CreateShutdownRouterOptions): Router {
  const router = Router();

  router.post('/maintenance/prepare-shutdown', (_request, response) => {
    response.status(200).json({ acknowledged: true });

    // Exiting only after the response has actually been flushed to the
    // socket (rather than immediately after `.json(...)` returns) gives
    // the desktop app's awaited HTTP request a chance to actually resolve
    // instead of racing the process's own exit.
    response.once('finish', () => {
      performGracefulShutdown(options);
      process.exit(0);
    });
  });

  return router;
}
