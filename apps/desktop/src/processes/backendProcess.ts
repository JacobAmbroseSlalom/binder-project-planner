import { DEFAULT_BACKEND_HOST } from '@binder-project-planner/shared';
import { type ChildProcess, spawn } from 'node:child_process';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';

export interface BackendProcessHandle {
  stop: () => void;
}

interface StartBackendProcessOptions {
  // The bundled backend's own directory (see appPaths.ts) - its
  // `dist/server.js` is spawned as a plain Node child process, exactly like
  // the `pnpm --filter backend start` dev script would run it.
  backendDirectory: string;
  // The packaged app's per-OS user-data directory (`app.getPath('userData')`),
  // passed through as `APP_DATA_DIRECTORY` so the backend stores its SQLite
  // database and images there instead of its `cwd`-relative dev default -
  // see apps/backend/src/config.ts, which already resolves this env var as
  // an absolute path unchanged.
  applicationDataDirectory: string;
  port: number;
  frontendOrigin: string;
}

// How long to keep polling the backend's `/health` endpoint before giving up
// and surfacing a startup failure, and how often to poll while waiting.
const HEALTH_CHECK_TIMEOUT_MS = 15_000;
const HEALTH_CHECK_INTERVAL_MS = 200;

// Spawns the bundled Express backend as a local child process (story 47)
// and resolves once it reports itself healthy, so the main process doesn't
// point the `BrowserWindow` at the frontend until its API is actually up.
export async function startBackendProcess({
  backendDirectory,
  applicationDataDirectory,
  port,
  frontendOrigin,
}: StartBackendProcessOptions): Promise<BackendProcessHandle> {
  const serverEntryPoint = join(backendDirectory, 'dist', 'server.js');

  const child = spawn(process.execPath, [serverEntryPoint], {
    cwd: backendDirectory,
    env: {
      ...process.env,
      // Forces Electron's own binary to run as a plain Node.js process
      // instead of relaunching the Electron app itself. Unpacked dev builds
      // of Electron happen to run a script-path argument as Node without
      // this, but a packaged, branded app always launches itself as the
      // Electron app regardless of argv - without this, the "child" is
      // really just a second app instance that immediately loses the
      // single-instance lock (see main.ts) and quits with exit code 0.
      ELECTRON_RUN_AS_NODE: '1',
      APP_DATA_DIRECTORY: applicationDataDirectory,
      HOST: DEFAULT_BACKEND_HOST,
      PORT: String(port),
      FRONTEND_ORIGIN: frontendOrigin,
    },
    stdio: 'inherit',
  });

  await waitForHealthCheck(child, `http://${DEFAULT_BACKEND_HOST}:${port}/health`);

  return {
    stop: () => stopChildProcess(child),
  };
}

async function waitForHealthCheck(child: ChildProcess, url: string): Promise<void> {
  const deadline = Date.now() + HEALTH_CHECK_TIMEOUT_MS;

  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      throw new Error(`Backend process exited early with code ${child.exitCode}.`);
    }

    try {
      const response = await fetch(url);
      if (response.ok) {
        return;
      }
    } catch {
      // The backend isn't accepting connections yet; keep polling until the
      // deadline above.
    }

    await delay(HEALTH_CHECK_INTERVAL_MS);
  }

  throw new Error(`Backend did not become healthy within ${HEALTH_CHECK_TIMEOUT_MS}ms.`);
}

// Closing the app's window fully quits it (story 47's "no system tray/
// background-running mode" requirement) - `kill()` here is what actually
// terminates this child process as part of that shutdown, leaving nothing
// orphaned in the background.
function stopChildProcess(child: ChildProcess): void {
  if (child.exitCode === null && child.signalCode === null) {
    child.kill();
  }
}
