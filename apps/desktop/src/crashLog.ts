import { app, dialog } from 'electron';
import { appendFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

// Story 47/53 follow-up: packaged builds previously surfaced startup
// failures only via `console.error`, which is invisible in a packaged app -
// especially on Windows, where a GUI-subsystem executable has no attached
// console at all. A failed launch there previously looked like "nothing
// happens": the process would log to nowhere and quit. This module writes a
// plain-text crash log next to the app's other per-user data and shows a
// native error dialog, so a startup failure is always visible immediately
// and diagnosable afterward from the log file.
const LOG_FILENAME = 'main-process.log';

function crashLogPath(): string {
  const userDataDirectory = app.getPath('userData');
  mkdirSync(userDataDirectory, { recursive: true });
  return join(userDataDirectory, LOG_FILENAME);
}

function formatError(error: unknown): string {
  if (error instanceof Error) {
    return error.stack ?? error.message;
  }
  return String(error);
}

// Appends a single timestamped entry to the crash log. Best-effort: if the
// filesystem write itself fails (e.g. a read-only/full disk), swallow it
// rather than throwing from inside an error-reporting path.
export function appendCrashLog(message: string): void {
  try {
    appendFileSync(crashLogPath(), `[${new Date().toISOString()}] ${message}\n`);
  } catch {
    // Best-effort logging only.
  }
}

// Logs `error` (with `context` as a human-readable label) to the crash log
// and shows a native error dialog so the failure is visible right away, not
// just discoverable after the fact in the log file. Safe to call before
// `app.whenReady()` resolves - Electron explicitly supports calling
// `dialog.showErrorBox` that early to report early-startup failures.
export function reportFatalError(context: string, error: unknown): void {
  const details = formatError(error);
  let logPath = '(unavailable)';
  try {
    logPath = crashLogPath();
  } catch {
    // Fall through with the placeholder above if userData isn't resolvable.
  }
  appendCrashLog(`${context}: ${details}`);
  dialog.showErrorBox(
    'Binder Project Planner failed to start',
    `${context}\n\n${details}\n\nDetails were also written to:\n${logPath}`,
  );
}
