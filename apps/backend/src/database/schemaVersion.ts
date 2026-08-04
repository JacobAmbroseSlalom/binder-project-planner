import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { migrationsDirectory } from '../paths.js';

// The shape of drizzle-kit's generated migration journal (only the fields
// this module reads).
interface MigrationJournal {
  entries: { idx: number; tag: string }[];
}

// The current database schema version: the tag of the newest applied
// drizzle migration (story 33). The full-data export writes this into its
// manifest, and import requires an exact match so an archive produced by a
// different schema version is rejected rather than mis-imported. Read from
// the migration journal (the source of truth for which migrations exist)
// rather than hard-coded so it advances automatically with each new
// migration.
export function getCurrentSchemaVersion(): string {
  const journalPath = join(migrationsDirectory, 'meta', '_journal.json');
  const journal = JSON.parse(readFileSync(journalPath, 'utf8')) as MigrationJournal;
  // Highest `idx` is the most recently generated migration.
  const newest = journal.entries.reduce((latest, entry) =>
    entry.idx > latest.idx ? entry : latest,
  );
  return newest.tag;
}
