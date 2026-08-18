import { DEFAULT_BACKEND_HOST } from '@binder-project-planner/shared';
import { type ChildProcess, spawn } from 'node:child_process';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';

import { appendCrashLog, captureChildOutput } from '../crashLog.js';

export interface BackendProcessHandle {
  stop: () => void;
}

// Story 53: "Sync data across laptops via cloud-sync folder". Mirrors the
// backend's `StartupStatus`/`StartupConfirmationReason` shape
// (apps/backend/src/routes/startup.ts) - duplicated here rather than
// imported since the desktop app has no dependency on the backend's
// source, only its bundled `dist` output at runtime.
export type StartupConfirmationReason = 'incomplete-directory' | 'other-machine-recent';

export interface StartupConfirmationPrompt {
  reason: StartupConfirmationReason;
  otherMachine?: { machineId: string; updatedAt: string };
}

export interface StartupConfirmationDecision {
  startFresh: boolean;
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
  // an absolute path unchanged. Story 53 lets the user override this to a
  // cloud-sync client's folder via the Settings page instead.
  applicationDataDirectory: string;
  // Story 53: always Electron's fixed `app.getPath('userData')`, regardless
  // of any `applicationDataDirectory` override above - passed through as
  // `APP_LOCAL_STATE_DIRECTORY` so backup snapshots always land somewhere a
  // cloud-sync client can't touch, even when `applicationDataDirectory`
  // itself is pointed at one.
  localStateDirectory: string;
  port: number;
  frontendOrigin: string;
  // Story 53: called if the backend reports a pending launch-time
  // confirmation (an incomplete-looking data directory, or another
  // machine's sync marker still looking recent) - main.ts implements this
  // with a native `dialog.showMessageBox` prompt.
  confirmStartup: (prompt: StartupConfirmationPrompt) => Promise<StartupConfirmationDecision>;
}

// How long to keep polling the backend before giving up and surfacing a
// startup failure, and how often to poll while waiting. Story 53's
// launch-time confirmation prompt (which pauses polling while awaiting the
// user's answer) is exempt from this deadline - only the underlying HTTP
// polling loop is bounded by it.
const HEALTH_CHECK_TIMEOUT_MS = 15_000;
const HEALTH_CHECK_INTERVAL_MS = 200;

interface StartupStatusResponse {
  needsConfirmation: boolean;
  reason?: StartupConfirmationReason;
  otherMachine?: { machineId: string; updatedAt: string };
}

// Spawns the bundled Express backend as a local child process (story 47)
// and resolves once it reports itself healthy, so the main process doesn't
// point the `BrowserWindow` at the frontend until its API is actually up.
export async function startBackendProcess({
  backendDirectory,
  applicationDataDirectory,
  localStateDirectory,
  port,
  frontendOrigin,
  confirmStartup,
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
      APP_LOCAL_STATE_DIRECTORY: localStateDirectory,
      HOST: DEFAULT_BACKEND_HOST,
      PORT: String(port),
      FRONTEND_ORIGIN: frontendOrigin,
    },
    // 'pipe' (rather than the previous 'inherit') lets captureChildOutput
    // below capture the backend's stdout/stderr - a packaged app has no
    // attached console for 'inherit' to usefully point at, so a startup
    // crash's actual error message was previously never seen anywhere.
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  const getRecentOutput = captureChildOutput(child, 'backend');

  // Without this listener, a failed spawn (e.g. the entry point path doesn't
  // exist, or the OS refuses to launch it) emits an unhandled 'error' event -
  // Node re-throws that as an uncaught exception in this (Electron main)
  // process, which previously crashed the whole app silently. Recording it
  // here instead lets waitForBackendReady below surface it as a clear,
  // specific startup failure through the normal handleStartupFailure path.
  let spawnError: Error | undefined;
  child.on('error', (error) => {
    spawnError = error;
    appendCrashLog(`Backend process error: ${error.stack ?? error.message}`);
  });

  await waitForBackendReady(
    child,
    `http://${DEFAULT_BACKEND_HOST}:${port}`,
    confirmStartup,
    () => spawnError,
    getRecentOutput,
  );

  return {
    stop: () => stopChildProcess(child),
  };
}

// Story 53: polls `/startup/status` first (reachable both while a
// temporary pre-database "gate" process is up, per an incomplete-looking
// directory or a recent other-machine marker, and once the real
// application has taken over - see server.ts) and only checks `/health`
// once it reports no confirmation pending. A confirmation prompt is only
// ever shown once per launch (`hasPromptedForConfirmation`), even if the
// gate process's response is briefly seen again during its handoff to the
// real application.
async function waitForBackendReady(
  child: ChildProcess,
  backendUrl: string,
  confirmStartup: (prompt: StartupConfirmationPrompt) => Promise<StartupConfirmationDecision>,
  getSpawnError: () => Error | undefined,
  getRecentOutput: () => string,
): Promise<void> {
  const deadline = Date.now() + HEALTH_CHECK_TIMEOUT_MS;
  let hasPromptedForConfirmation = false;

  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      const recentOutput = getRecentOutput().trim();
      const outputSuffix = recentOutput ? `\n\nRecent backend output:\n${recentOutput}` : '';
      throw new Error(`Backend process exited early with code ${child.exitCode}.${outputSuffix}`);
    }

    const spawnError = getSpawnError();
    if (spawnError) {
      throw new Error(`Backend process failed to start: ${spawnError.message}`);
    }

    try {
      const statusResponse = await fetch(`${backendUrl}/startup/status`);
      if (statusResponse.ok) {
        const status = (await statusResponse.json()) as StartupStatusResponse;

        if (status.needsConfirmation) {
          if (!hasPromptedForConfirmation) {
            hasPromptedForConfirmation = true;
            const decision = await confirmStartup({
              reason: status.reason ?? 'incomplete-directory',
              otherMachine: status.otherMachine,
            });
            await fetch(`${backendUrl}/startup/confirm`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(decision),
            });
          }
          // Skip the health check below until a subsequent poll reports
          // `needsConfirmation: false` (the real application has taken
          // over the port).
          await delay(HEALTH_CHECK_INTERVAL_MS);
          continue;
        }

        const healthResponse = await fetch(`${backendUrl}/health`);
        if (healthResponse.ok) {
          return;
        }
      }
    } catch {
      // The backend isn't accepting connections yet (or is mid-handoff
      // between the temporary gate process and the real application);
      // keep polling until the deadline above.
    }

    await delay(HEALTH_CHECK_INTERVAL_MS);
  }

  throw new Error(`Backend did not become healthy within ${HEALTH_CHECK_TIMEOUT_MS}ms.`);
}

// Closing the app's window fully quits it (story 47's "no system tray/
// background-running mode" requirement) - `kill()` here is what actually
// terminates this child process as part of that shutdown, leaving nothing
// orphaned in the background. Story 53's quit sequence (main.ts) calls the
// backend's `/maintenance/prepare-shutdown` endpoint first and awaits it,
// so this normally only ever kills an already-exited process; it remains a
// defensive fallback in case that HTTP request never got a response (e.g.
// on Windows, where `kill()` alone can't guarantee a catchable shutdown
// signal - see that endpoint's own comment for why it exists at all).
function stopChildProcess(child: ChildProcess): void {
  if (child.exitCode === null && child.signalCode === null) {
    child.kill();
  }
}
