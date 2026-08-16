import Database from 'better-sqlite3';
import { drizzle, type BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { dirname, join } from 'node:path';
import { copyFileSync, existsSync, mkdirSync, readdirSync, unlinkSync } from 'node:fs';

import { migrationsDirectory } from '../paths.js';

// How many timestamped pre-migration backups to retain per database file
// (see `backupDatabaseFile` below) before pruning the oldest ones, so the
// backups directory doesn't grow without bound across many restarts.
const MAX_RETAINED_MIGRATION_BACKUPS = 10;

// Copies the database file into a sibling `migration-backups` directory,
// timestamped, immediately before migrations run. This is a safety net in
// case a future migration has an unanticipated destructive side effect
// (see the `foreign_keys` handling below for one such bug that already
// bit this project twice) - restoring is just copying the newest backup
// back over the live file. A no-op for `:memory:` databases and for the
// very first run (nothing to back up yet).
function backupDatabaseFile(databaseFile: string): void {
  if (databaseFile === ':memory:' || !existsSync(databaseFile)) {
    return;
  }

  const backupsDirectory = join(dirname(databaseFile), 'migration-backups');
  mkdirSync(backupsDirectory, { recursive: true });

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupFilename = `${timestamp}.sqlite`;
  copyFileSync(databaseFile, join(backupsDirectory, backupFilename));

  // Prunes oldest-first once over the retention limit; sorting filenames
  // works here because the ISO timestamp format sorts chronologically.
  const backups = readdirSync(backupsDirectory).sort();
  const excess = backups.length - MAX_RETAINED_MIGRATION_BACKUPS;
  for (const staleBackup of backups.slice(0, Math.max(excess, 0))) {
    unlinkSync(join(backupsDirectory, staleBackup));
  }
}

export interface DatabaseConnection {
  close: () => void;
  // Story 53: "Sync data across laptops via cloud-sync folder". Folds the
  // WAL journal's pending contents back into the main `.db` file and
  // empties the `-wal`/`-shm` side files, leaving a single, self-contained
  // database file safe for a cloud-sync client to pick up - called before
  // quitting (see server.ts's shutdown handling) rather than on every
  // write, so WAL's normal performance benefit during the rest of the
  // session is unaffected. A no-op for `:memory:` databases, which never
  // use WAL journal mode in the first place (see below).
  checkpoint: () => void;
  database: BetterSQLite3Database;
}

export function createDatabase(databaseFile: string): DatabaseConnection {
  if (databaseFile !== ':memory:') {
    mkdirSync(dirname(databaseFile), { recursive: true });
  }

  backupDatabaseFile(databaseFile);

  const sqlite = new Database(databaseFile);
  if (databaseFile !== ':memory:') {
    sqlite.pragma('journal_mode = WAL');
  }

  // Foreign key enforcement is deliberately left OFF for the duration of
  // `migrate()` below, then turned ON afterward for normal app operation.
  // Reasoning: drizzle-kit's generated "recreate table" migrations (used
  // whenever a column change can't be applied in place, e.g. adding a
  // NOT NULL column - see drizzle/0003_binder_dimension_max.sql and
  // drizzle/0005_binder_dimension_and_style_fields.sql) bracket themselves with
  // `PRAGMA foreign_keys=OFF` / `=ON`, but those statements are silently
  // ignored: SQLite refuses to toggle this pragma while a transaction is
  // open, and drizzle's migrator wraps every pending migration in one
  // `BEGIN`/`COMMIT`. Left ON, each migration's `DROP TABLE <parent>`
  // performs SQLite's documented implicit `DELETE FROM <parent>` before
  // dropping it, which fires any `ON DELETE CASCADE` action on tables that
  // reference it - e.g. `cards.binderId` - deleting every card in the
  // database as an unintended side effect of only touching the `binders`
  // table's shape. This exact bug deleted all cards twice (migrations
  // 0003 and 0005) before this fix; toggling the pragma here, outside any
  // transaction, actually takes effect for the migration's whole run.
  const database = drizzle(sqlite);
  sqlite.pragma('foreign_keys = OFF');
  migrate(database, { migrationsFolder: migrationsDirectory });
  sqlite.pragma('foreign_keys = ON');

  return {
    close: () => sqlite.close(),
    checkpoint: () => {
      if (databaseFile === ':memory:') return;
      // TRUNCATE mode checkpoints (folding the WAL into the main file)
      // *and* truncates the `-wal` file to zero bytes on success, unlike
      // the default PASSIVE mode's plain checkpoint - see
      // https://www.sqlite.org/pragma.html#pragma_wal_checkpoint.
      sqlite.pragma('wal_checkpoint(TRUNCATE)');
    },
    database,
  };
}
