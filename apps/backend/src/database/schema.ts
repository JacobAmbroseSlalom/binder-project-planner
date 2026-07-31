import { sqliteTable, text } from 'drizzle-orm/sqlite-core';

export const appMetadata = sqliteTable('app_metadata', {
  key: text().primaryKey(),
  value: text().notNull(),
});
