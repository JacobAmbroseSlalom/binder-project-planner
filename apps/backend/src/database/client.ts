import Database from 'better-sqlite3';
import { drizzle, type BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { dirname } from 'node:path';
import { mkdirSync } from 'node:fs';

import { migrationsDirectory } from '../paths.js';

export interface DatabaseConnection {
  close: () => void;
  database: BetterSQLite3Database;
}

export function createDatabase(databaseFile: string): DatabaseConnection {
  if (databaseFile !== ':memory:') {
    mkdirSync(dirname(databaseFile), { recursive: true });
  }

  const sqlite = new Database(databaseFile);
  sqlite.pragma('foreign_keys = ON');
  if (databaseFile !== ':memory:') {
    sqlite.pragma('journal_mode = WAL');
  }

  const database = drizzle(sqlite);
  migrate(database, { migrationsFolder: migrationsDirectory });

  return {
    close: () => sqlite.close(),
    database,
  };
}
