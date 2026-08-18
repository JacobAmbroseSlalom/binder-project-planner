import { type ChildProcess, spawn } from 'node:child_process';
import { connect } from 'node:net';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';

import { appendCrashLog, captureChildOutput } from '../crashLog.js';

export interface FrontendProcessHandle {
  stop: () => void;
}

interface StartFrontendProcessOptions {
  // The bundled frontend's own directory (see appPaths.ts), containing its
  // production `.next` build output and `node_modules` - its `next start`
  // CLI entry point is invoked directly by path (rather than via the
  // `node_modules/.bin/next` shim) so this doesn't depend on that symlink
  // surviving packaging.
  frontendDirectory: string;
  port: number;
}

const READY_CHECK_TIMEOUT_MS = 20_000;
const READY_CHECK_INTERVAL_MS = 200;

// Spawns the bundled Next.js production server (`next start`) as a local
// child process (story 47) and resolves once it's accepting connections, so
// the `BrowserWindow` isn't pointed at it too early.
export async function startFrontendProcess({
  frontendDirectory,
  port,
}: StartFrontendProcessOptions): Promise<FrontendProcessHandle> {
  const nextCliEntryPoint = join(frontendDirectory, 'node_modules', 'next', 'dist', 'bin', 'next');

  const child = spawn(
    process.execPath,
    [nextCliEntryPoint, 'start', '-p', String(port), '-H', '127.0.0.1'],
    {
      cwd: frontendDirectory,
      env: {
        ...process.env,
        // See the matching comment in backendProcess.ts: without this, a
        // packaged, branded app's executable always relaunches itself as
        // the Electron app rather than running this script as plain Node.
        ELECTRON_RUN_AS_NODE: '1',
        PORT: String(port),
      },
      // 'pipe' (rather than the previous 'inherit') lets captureChildOutput
      // below capture the frontend's stdout/stderr - a packaged app has no
      // attached console for 'inherit' to usefully point at.
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  );

  const getRecentOutput = captureChildOutput(child, 'frontend');

  // See the matching comment in backendProcess.ts: without this listener, a
  // failed spawn crashes the whole main process silently via an unhandled
  // 'error' event instead of surfacing as a clear startup failure below.
  let spawnError: Error | undefined;
  child.on('error', (error) => {
    spawnError = error;
    appendCrashLog(`Frontend process error: ${error.stack ?? error.message}`);
  });

  await waitForPortOpen(child, '127.0.0.1', port, () => spawnError, getRecentOutput);

  return {
    stop: () => stopChildProcess(child),
  };
}

function waitForPortOpen(
  child: ChildProcess,
  host: string,
  port: number,
  getSpawnError: () => Error | undefined,
  getRecentOutput: () => string,
): Promise<void> {
  const deadline = Date.now() + READY_CHECK_TIMEOUT_MS;

  return new Promise((resolvePromise, reject) => {
    const attempt = () => {
      if (child.exitCode !== null) {
        const recentOutput = getRecentOutput().trim();
        const outputSuffix = recentOutput ? `\n\nRecent frontend output:\n${recentOutput}` : '';
        reject(
          new Error(`Frontend process exited early with code ${child.exitCode}.${outputSuffix}`),
        );
        return;
      }

      const spawnError = getSpawnError();
      if (spawnError) {
        reject(new Error(`Frontend process failed to start: ${spawnError.message}`));
        return;
      }

      const socket = connect({ host, port }, () => {
        socket.end();
        resolvePromise();
      });

      socket.on('error', () => {
        socket.destroy();
        if (Date.now() >= deadline) {
          reject(
            new Error(
              `Frontend did not start listening on port ${port} within ${READY_CHECK_TIMEOUT_MS}ms.`,
            ),
          );
          return;
        }
        delay(READY_CHECK_INTERVAL_MS).then(attempt);
      });
    };

    attempt();
  });
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
