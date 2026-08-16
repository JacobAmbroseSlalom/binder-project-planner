import { existsSync, mkdirSync, readdirSync, statSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';

import { MAX_RETAINED_BACKUP_SNAPSHOTS } from '@binder-project-planner/shared';

import type { DatabaseConnection } from '../database/client.js';
import { buildExportArchiveFile } from '../routes/dataTransfer.js';

// Story 53: "Sync data across laptops via cloud-sync folder". Backup
// snapshots reuse story 33's export archive format (via
// `buildExportArchiveFile`) rather than inventing a new one, and always
// land under the caller's `localStateDirectory` - never inside the
// (possibly cloud-synced) application data directory - so a bad sync or a
// "start fresh anyway" choice always has a same-machine, non-synced
// fallback to recover from.
const BACKUPS_SUBDIRECTORY = 'backups';
const BACKUP_FILENAME_PREFIX = 'backup-';

export interface CreateBackupSnapshotOptions {
  database: DatabaseConnection['database'];
  imagesDirectory: string;
  localStateDirectory: string;
}

function backupsDirectory(localStateDirectory: string): string {
  return join(localStateDirectory, BACKUPS_SUBDIRECTORY);
}

// Writes a timestamped export-archive snapshot into `localStateDirectory`,
// then prunes older snapshots beyond `MAX_RETAINED_BACKUP_SNAPSHOTS`.
// Called both right before the graceful-shutdown WAL checkpoint and
// before proceeding past either of the launch-time confirmation warnings
// (see server.ts) - both are moments where the data directory's contents
// are about to change in a way that's hard to undo if something's wrong.
export function createBackupSnapshot(options: CreateBackupSnapshotOptions): string {
  const { database, imagesDirectory, localStateDirectory } = options;
  const directory = backupsDirectory(localStateDirectory);
  mkdirSync(directory, { recursive: true });

  // Colons aren't valid in Windows filenames, so the timestamp is
  // sanitized the same way the existing `/exports/data` route already
  // sanitizes its own suggested download filename.
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const outputPath = join(directory, `${BACKUP_FILENAME_PREFIX}${timestamp}.zip`);
  buildExportArchiveFile(database, imagesDirectory, outputPath);

  pruneOldBackupSnapshots(localStateDirectory);
  return outputPath;
}

// Deletes the oldest backup snapshots beyond the retention limit, keeping
// disk usage bounded the same way `backupDatabaseFile`'s pre-migration
// backups already are (apps/backend/src/database/client.ts).
function pruneOldBackupSnapshots(localStateDirectory: string): void {
  const directory = backupsDirectory(localStateDirectory);
  if (!existsSync(directory)) return;

  const backups = readdirSync(directory)
    .filter((filename) => filename.startsWith(BACKUP_FILENAME_PREFIX) && filename.endsWith('.zip'))
    .map((filename) => {
      const filePath = join(directory, filename);
      return { filePath, mtimeMs: statSync(filePath).mtimeMs };
    })
    .sort((a, b) => b.mtimeMs - a.mtimeMs);

  for (const backup of backups.slice(MAX_RETAINED_BACKUP_SNAPSHOTS)) {
    unlinkSync(backup.filePath);
  }
}
