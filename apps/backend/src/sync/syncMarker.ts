import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { hostname } from 'node:os';
import { join } from 'node:path';

import {
  SYNC_MARKER_FILENAME,
  SYNC_MARKER_RECENT_THRESHOLD_MS,
} from '@binder-project-planner/shared';

// Story 53: "Sync data across laptops via cloud-sync folder". The marker
// file's shape: which machine last opened the app against this data
// directory, and when. `os.hostname()` is used as the machine identifier
// rather than a generated/persisted id - it's already stable per machine
// and needs no separate local file to track, and two laptops sharing an
// identical hostname is rare enough not to matter for this advisory-only
// check.
export interface SyncMarker {
  machineId: string;
  updatedAt: string;
}

function markerFilePath(applicationDataDirectory: string): string {
  return join(applicationDataDirectory, SYNC_MARKER_FILENAME);
}

// Reads the current marker, or `null` if it's missing or unreadable
// (malformed JSON is treated the same as missing - this check is advisory
// only, so failing open rather than throwing is the right default).
export function readSyncMarker(applicationDataDirectory: string): SyncMarker | null {
  const filePath = markerFilePath(applicationDataDirectory);
  if (!existsSync(filePath)) return null;

  try {
    const parsed = JSON.parse(readFileSync(filePath, 'utf8')) as Partial<SyncMarker>;
    if (typeof parsed.machineId !== 'string' || typeof parsed.updatedAt !== 'string') return null;
    return { machineId: parsed.machineId, updatedAt: parsed.updatedAt };
  } catch {
    return null;
  }
}

// Writes (or refreshes) the marker with this machine's identity and the
// current time - called once the database has opened successfully, and
// periodically thereafter while the app stays open (see server.ts).
export function writeSyncMarker(applicationDataDirectory: string): void {
  const marker: SyncMarker = { machineId: hostname(), updatedAt: new Date().toISOString() };
  writeFileSync(markerFilePath(applicationDataDirectory), JSON.stringify(marker, null, 2));
}

// Returns the existing marker only when it names a *different* machine
// and is newer than `SYNC_MARKER_RECENT_THRESHOLD_MS` - the signal this
// story uses to warn "this may still be syncing from that laptop" without
// blocking the user from proceeding anyway.
export function findRecentOtherMachineMarker(applicationDataDirectory: string): SyncMarker | null {
  const marker = readSyncMarker(applicationDataDirectory);
  if (!marker || marker.machineId === hostname()) return null;

  const updatedAtMs = Date.parse(marker.updatedAt);
  if (Number.isNaN(updatedAtMs)) return null;

  const isRecent = Date.now() - updatedAtMs < SYNC_MARKER_RECENT_THRESHOLD_MS;
  return isRecent ? marker : null;
}
