import { closeSync, existsSync, openSync, readSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

import { SYNC_MARKER_FILENAME } from '@binder-project-planner/shared';

// Story 53: "Sync data across laptops via cloud-sync folder". Whether the
// configured application data directory is a genuinely new setup, already
// has a readable database, or shows some trace of prior use without a
// readable database - the third case is what triggers this story's
// "looks incomplete or like it's mid-sync" launch warning.
export type DirectoryState = 'new' | 'ready' | 'incomplete';

// SQLite's fixed 16-byte file-header magic string
// (https://www.sqlite.org/fileformat2.html#the_database_header) - checked
// directly (rather than trying to open the file with better-sqlite3) so
// this stays a cheap, dependency-free filesystem check callable *before*
// the app decides whether it's safe to open the database at all.
const SQLITE_HEADER_MAGIC = 'SQLite format 3\u0000';

// Reads a database file's first 16 bytes without loading the rest of the
// (potentially large) file into memory, and checks them against SQLite's
// header magic. Deliberately tolerant of any read failure (missing file,
// permission error, or a cloud-sync client's file-listing entry whose
// bytes haven't actually finished downloading yet) - any of those simply
// means "not readable" rather than a hard error, since this check's whole
// purpose is telling that apart from a genuinely valid database.
function isDatabaseFileReadable(databaseFile: string): boolean {
  if (databaseFile === ':memory:') return true;
  if (!existsSync(databaseFile)) return false;

  let fileDescriptor: number | undefined;
  try {
    fileDescriptor = openSync(databaseFile, 'r');
    const header = Buffer.alloc(16);
    readSync(fileDescriptor, header, 0, 16, 0);
    return header.toString('utf8') === SQLITE_HEADER_MAGIC;
  } catch {
    return false;
  } finally {
    if (fileDescriptor !== undefined) closeSync(fileDescriptor);
  }
}

// Evaluates the configured data directory's state, called before opening
// the database (see server.ts) so the app can warn the user instead of
// silently either initializing a fresh database over not-yet-synced data,
// or failing outright while a cloud-sync client is still catching up.
export function evaluateDirectoryState(
  applicationDataDirectory: string,
  databaseFile: string,
): DirectoryState {
  if (isDatabaseFileReadable(databaseFile)) return 'ready';

  // No readable database file. A directory with no trace of prior use at
  // all (no marker file, and either it doesn't exist yet or is empty) is
  // treated as genuinely new; any other trace (the marker file, or
  // partial/leftover files) without a readable database is "incomplete".
  const hasAnyTrace =
    existsSync(join(applicationDataDirectory, SYNC_MARKER_FILENAME)) ||
    (existsSync(applicationDataDirectory) && readdirSync(applicationDataDirectory).length > 0);

  return hasAnyTrace ? 'incomplete' : 'new';
}
