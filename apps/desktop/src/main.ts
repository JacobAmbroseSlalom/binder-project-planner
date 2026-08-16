import {
  DEFAULT_BACKEND_HOST,
  DEFAULT_BACKEND_PORT,
  DEFAULT_FRONTEND_PORT,
} from '@binder-project-planner/shared';
import { app, BrowserWindow, dialog, ipcMain } from 'electron';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { resolveAppPaths } from './appPaths.js';
import { readDesktopSettings, writeDesktopSettings } from './desktopSettings.js';
import { findAvailablePort } from './ports.js';
import {
  startBackendProcess,
  type BackendProcessHandle,
  type StartupConfirmationDecision,
  type StartupConfirmationPrompt,
} from './processes/backendProcess.js';
import { startFrontendProcess, type FrontendProcessHandle } from './processes/frontendProcess.js';

const moduleDirectory = dirname(fileURLToPath(import.meta.url));

let mainWindow: BrowserWindow | undefined;
let backendHandle: BackendProcessHandle | undefined;
let frontendHandle: FrontendProcessHandle | undefined;
// Set once the backend's runtime port is known (see startApp) - read by the
// quit sequence below (story 53) to call the backend's own
// `/maintenance/prepare-shutdown` endpoint before falling back to killing
// its process directly.
let backendOrigin: string | undefined;
// Guards against `stopChildProcesses` running twice (once from
// `window-all-closed` -> `app.quit()`, and again from `before-quit` itself)
// and against `before-quit`'s own `app.quit()` re-entry below looping.
let isQuitting = false;

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
  registerDesktopSettingsIpcHandlers();

  // Closing the window fully quits the app (no system tray/background-running
  // mode); `before-quit` below actually performs the (async) cleanup, so this
  // just triggers that rather than duplicating it.
  app.on('window-all-closed', () => {
    app.quit();
  });

  // Story 53: cleanup (backup + WAL checkpoint via the backend's own
  // `/maintenance/prepare-shutdown` endpoint, falling back to killing the
  // child processes directly) is asynchronous, so the default synchronous
  // quit is deferred once via `preventDefault()` until that finishes, then
  // `app.quit()` is called again - `isQuitting` lets that second call
  // through instead of re-entering this same async cleanup.
  app.on('before-quit', (event) => {
    if (isQuitting) return;
    event.preventDefault();
    isQuitting = true;
    void stopChildProcesses().finally(() => app.quit());
  });
}

// Story 53: shows a native dialog explaining why launch needs confirmation
// (the configured data directory looks incomplete/mid-sync, or another
// machine's sync marker still looks recent) and lets the user choose to
// proceed as-is, start fresh (discarding any unreadable/partial database
// file), or quit instead of guessing at what's safe.
async function confirmStartup(
  prompt: StartupConfirmationPrompt,
): Promise<StartupConfirmationDecision> {
  const isOtherMachine = prompt.reason === 'other-machine-recent';
  const message = isOtherMachine
    ? 'Another computer may still be syncing this data.'
    : 'This data folder looks incomplete - it may still be downloading via your cloud-sync app.';
  const detail = isOtherMachine
    ? `"${prompt.otherMachine?.machineId}" opened this data folder recently ` +
      `(${prompt.otherMachine?.updatedAt}). Opening it here at the same time could cause ` +
      "the two computers to overwrite each other's changes once syncing catches up. " +
      "This can't be verified for certain - proceed only if you're sure it's finished syncing."
    : "A database file wasn't found, but this folder isn't empty either. If you just set up " +
      'cloud sync, it may still be downloading - waiting a bit and retrying is usually safest. ' +
      'Starting fresh discards any partial database file already here.';

  const { response } = await dialog.showMessageBox({
    type: 'warning',
    message,
    detail,
    buttons: isOtherMachine
      ? ['Wait and Quit', 'Proceed Anyway']
      : ['Wait and Quit', 'Retry', 'Start Fresh Anyway'],
    defaultId: 0,
    cancelId: 0,
  });

  if (response === 0) {
    app.quit();
    // `app.quit()` doesn't stop this function from continuing to run, so
    // this promise deliberately never resolves - the app is already
    // shutting down.
    return new Promise(() => {});
  }

  if (!isOtherMachine && response === 1) {
    // "Retry": re-launches the whole app rather than trying to loop this
    // one confirmation, since the backend process would need restarting
    // either way to re-evaluate the directory's state from scratch.
    app.relaunch();
    app.quit();
    return new Promise(() => {});
  }

  return { startFresh: !isOtherMachine };
}

// Story 53: IPC handlers backing the frontend's Settings page (only
// reachable there - see preload.cts's `__DESKTOP_SETTINGS__` bridge).
// Lets the user point `APP_DATA_DIRECTORY` at a cloud-sync client's folder
// instead of requiring manual environment variable setup.
function registerDesktopSettingsIpcHandlers(): void {
  ipcMain.handle('desktop-settings:get', () => {
    const defaultDataDirectory = app.getPath('userData');
    const settings = readDesktopSettings(defaultDataDirectory);
    return {
      dataDirectory: settings.dataDirectoryOverride ?? defaultDataDirectory,
      isOverridden: Boolean(settings.dataDirectoryOverride),
      defaultDataDirectory,
    };
  });

  ipcMain.handle('desktop-settings:choose-folder', async () => {
    if (!mainWindow) return null;
    const result = await dialog.showOpenDialog(mainWindow, { properties: ['openDirectory'] });
    return result.canceled ? null : (result.filePaths[0] ?? null);
  });

  // Persists the chosen override (or clears it, if `directory` is null),
  // then relaunches the app - the backend process's `APP_DATA_DIRECTORY` is
  // only ever read once at spawn time (see startApp), so a running session
  // can't just start using a new folder without restarting.
  ipcMain.handle('desktop-settings:set-override', (_event, directory: string | null) => {
    const userDataDirectory = app.getPath('userData');
    writeDesktopSettings(userDataDirectory, { dataDirectoryOverride: directory ?? undefined });
    app.relaunch();
    app.quit();
  });
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
  backendOrigin = `http://${DEFAULT_BACKEND_HOST}:${backendPort}`;
  const frontendOrigin = `http://localhost:${frontendPort}`;

  // Story 53: `localStateDirectory` is always Electron's fixed per-OS
  // user-data directory, regardless of any data-directory override below -
  // it's where backup snapshots land, and must never itself be inside a
  // folder a cloud-sync client manages. `applicationDataDirectory` is the
  // user-configurable one (defaulting to the same directory when no
  // override has been set via the Settings page).
  const localStateDirectory = app.getPath('userData');
  const desktopSettings = readDesktopSettings(localStateDirectory);
  const applicationDataDirectory = desktopSettings.dataDirectoryOverride ?? localStateDirectory;

  backendHandle = await startBackendProcess({
    backendDirectory: paths.backendDirectory,
    applicationDataDirectory,
    localStateDirectory,
    port: backendPort,
    frontendOrigin,
    confirmStartup,
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

// Story 53: calls the backend's `/maintenance/prepare-shutdown` endpoint
// (which backs up, WAL-checkpoints, closes, and exits the backend itself)
// and awaits its response before falling back to directly killing both
// child processes - a plain `ChildProcess.kill()` alone can't guarantee a
// catchable shutdown signal on Windows (see that endpoint's own comment),
// so this HTTP handshake is what actually makes the checkpoint reliable
// cross-platform; the direct `.stop()` calls below remain a defensive
// fallback in case the backend never responds (already crashed,
// unreachable, or timed out).
const SHUTDOWN_REQUEST_TIMEOUT_MS = 5_000;

async function stopChildProcesses(): Promise<void> {
  if (backendOrigin) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), SHUTDOWN_REQUEST_TIMEOUT_MS);
      await fetch(`${backendOrigin}/maintenance/prepare-shutdown`, {
        method: 'POST',
        signal: controller.signal,
      });
      clearTimeout(timeout);
    } catch {
      // Best-effort: an unreachable/unresponsive backend shouldn't block
      // the app from quitting - fall through to killing it directly.
    }
  }

  backendHandle?.stop();
  frontendHandle?.stop();
}

function handleStartupFailure(error: unknown): void {
  console.error('Failed to start Binder Project Planner:', error);
  void stopChildProcesses().finally(() => app.quit());
}
