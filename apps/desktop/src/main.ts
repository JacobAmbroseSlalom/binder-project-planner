import {
  DEFAULT_BACKEND_HOST,
  DEFAULT_BACKEND_PORT,
  DEFAULT_FRONTEND_PORT,
} from '@binder-project-planner/shared';
import { app, BrowserWindow } from 'electron';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { resolveAppPaths } from './appPaths.js';
import { findAvailablePort } from './ports.js';
import { startBackendProcess, type BackendProcessHandle } from './processes/backendProcess.js';
import { startFrontendProcess, type FrontendProcessHandle } from './processes/frontendProcess.js';

const moduleDirectory = dirname(fileURLToPath(import.meta.url));

let mainWindow: BrowserWindow | undefined;
let backendHandle: BackendProcessHandle | undefined;
let frontendHandle: FrontendProcessHandle | undefined;

// Story 47: "Package and export the application as an executable". Electron's
// built-in single-instance lock prevents two copies of the app from ever
// running at once, which would otherwise let two backend processes contend
// for the same SQLite database file. The *first* instance keeps the lock and
// registers the 'second-instance' handler below; every later launch attempt
// fails to acquire it and quits immediately instead of starting a second copy.
const gotSingleInstanceLock = app.requestSingleInstanceLock();

if (!gotSingleInstanceLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) {
        mainWindow.restore();
      }
      mainWindow.focus();
    }
  });

  app.whenReady().then(startApp).catch(handleStartupFailure);

  // Closing the window fully quits the app (no system tray/background-running
  // mode) - stopping both bundled child processes here ensures neither is
  // left orphaned in the background.
  app.on('window-all-closed', () => {
    stopChildProcesses();
    app.quit();
  });

  app.on('before-quit', stopChildProcesses);
}

async function startApp(): Promise<void> {
  const paths = resolveAppPaths(moduleDirectory);

  // Each bundled server tries its existing fixed default port first and
  // automatically falls back to another available one instead of failing to
  // start if something else already holds it.
  const [backendPort, frontendPort] = await Promise.all([
    findAvailablePort(DEFAULT_BACKEND_PORT),
    findAvailablePort(DEFAULT_FRONTEND_PORT),
  ]);
  const backendOrigin = `http://${DEFAULT_BACKEND_HOST}:${backendPort}`;
  const frontendOrigin = `http://localhost:${frontendPort}`;

  backendHandle = await startBackendProcess({
    backendDirectory: paths.backendDirectory,
    applicationDataDirectory: app.getPath('userData'),
    port: backendPort,
    frontendOrigin,
  });

  frontendHandle = await startFrontendProcess({
    frontendDirectory: paths.frontendDirectory,
    port: frontendPort,
  });

  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    title: 'Binder Project Planner',
    webPreferences: {
      preload: paths.preloadScript,
      // Passes the backend's actual runtime origin (only known now, after
      // it picked a port above) through to preload.ts, which reads it back
      // out of its own `process.argv` and exposes it to the renderer.
      additionalArguments: [`--backend-url=${backendOrigin}`],
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  await mainWindow.loadURL(frontendOrigin);
}

function stopChildProcesses(): void {
  backendHandle?.stop();
  frontendHandle?.stop();
}

function handleStartupFailure(error: unknown): void {
  console.error('Failed to start Binder Project Planner:', error);
  stopChildProcesses();
  app.quit();
}
