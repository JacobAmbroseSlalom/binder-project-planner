import { existsSync, unlinkSync } from 'node:fs';

import { SYNC_MARKER_REFRESH_INTERVAL_MS } from '@binder-project-planner/shared';
import express from 'express';

import { createApp } from './app.js';
import { config } from './config.js';
import { createDatabase } from './database/client.js';
import { createShutdownRouter, performGracefulShutdown } from './routes/shutdown.js';
import {
  createStartupRouter,
  type StartupConfirmDecision,
  type StartupStatus,
} from './routes/startup.js';
import { evaluateDirectoryState } from './sync/directoryState.js';
import { findRecentOtherMachineMarker, writeSyncMarker } from './sync/syncMarker.js';

// Story 53: "Sync data across laptops via cloud-sync folder". Before the
// database is opened, briefly runs a minimal, database-free Express app
// on the backend's normal port/host, exposing just `/startup/status`
// (reporting `status` below) and `/startup/confirm` (resolving this
// promise once the desktop app answers). Mounting the same two routes
// here as on the real application (see main() below) means a caller
// polling `/startup/status` never needs to know which phase - this
// temporary gate, or the real app - is currently listening on the port.
function waitForStartupConfirmation(status: StartupStatus): Promise<StartupConfirmDecision> {
  return new Promise((resolve) => {
    const gateApp = express();
    gateApp.use(express.json());

    const gateServer = gateApp.listen(config.port, config.host, () => {
      console.log(
        `Backend awaiting startup confirmation (${status.reason}) at ` +
          `http://${config.host}:${config.port}`,
      );
    });

    gateApp.use(
      createStartupRouter({
        getStatus: () => status,
        onConfirm: (decision) => {
          // Closes the temporary app first so the real app (started by
          // the caller once this promise resolves) can bind the same
          // port cleanly.
          gateServer.close(() => resolve(decision));
        },
      }),
    );
  });
}

// Shared by both the HTTP-based quit handshake (routes/shutdown.ts) and
// this file's own SIGINT/SIGTERM handling below - see
// `performGracefulShutdown`'s own comment for why.

async function main(): Promise<void> {
  // Evaluated before anything touches the database: a directory that
  // shows some trace of prior use (the sync marker, or partial/leftover
  // files) but no readable database file might just be a cloud-sync
  // client still catching up, so this - and a recent marker naming a
  // different machine - are surfaced for confirmation rather than either
  // silently initializing a fresh database over not-yet-synced data, or
  // failing outright.
  const directoryState = evaluateDirectoryState(
    config.applicationDataDirectory,
    config.databaseFile,
  );
  const otherMachineMarker = findRecentOtherMachineMarker(config.applicationDataDirectory);

  let startFresh = false;
  if (directoryState === 'incomplete' || otherMachineMarker) {
    const decision = await waitForStartupConfirmation({
      needsConfirmation: true,
      reason: directoryState === 'incomplete' ? 'incomplete-directory' : 'other-machine-recent',
      otherMachine: otherMachineMarker ?? undefined,
    });
    startFresh = decision.startFresh;
  }

  if (startFresh && directoryState !== 'ready' && existsSync(config.databaseFile)) {
    // The user chose to proceed anyway rather than wait/retry - discard
    // the unreadable/partial file so `createDatabase` below initializes a
    // genuinely fresh database instead of failing on (or misreading) it.
    unlinkSync(config.databaseFile);
  }

  const connection = createDatabase(config.databaseFile);

  // Written once immediately (so another machine's near-simultaneous
  // launch sees this one promptly) and refreshed periodically thereafter
  // so this marker keeps looking "recent" to another laptop for as long
  // as this instance stays open.
  writeSyncMarker(config.applicationDataDirectory);
  const markerRefreshInterval = setInterval(
    () => writeSyncMarker(config.applicationDataDirectory),
    SYNC_MARKER_REFRESH_INTERVAL_MS,
  );

  const app = createApp({
    database: connection.database,
    frontendOrigin: config.frontendOrigin,
    imagesDirectory: config.imagesDirectory,
    pokemonTcgApiKey: config.pokemonTcgApiKey,
  });
  // No confirmation is ever pending once the real app is up - see this
  // function's own comment above for why the same routes are mounted on
  // both apps regardless.
  app.use(
    createStartupRouter({ getStatus: () => ({ needsConfirmation: false }), onConfirm: () => {} }),
  );
  app.use(
    createShutdownRouter({
      connection,
      imagesDirectory: config.imagesDirectory,
      localStateDirectory: config.localStateDirectory,
    }),
  );

  const server = app.listen(config.port, config.host, () => {
    console.log(`Backend listening at http://${config.host}:${config.port}`);
  });

  function shutdown() {
    clearInterval(markerRefreshInterval);
    server.close(() => {
      performGracefulShutdown({
        connection,
        imagesDirectory: config.imagesDirectory,
        localStateDirectory: config.localStateDirectory,
      });
      process.exit(0);
    });
  }

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch((error) => {
  console.error('Failed to start the backend:', error);
  process.exit(1);
});
