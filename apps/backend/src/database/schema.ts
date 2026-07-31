import { sql } from 'drizzle-orm';
import { check, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

export const appMetadata = sqliteTable('app_metadata', {
  key: text().primaryKey(),
  value: text().notNull(),
});

// A binder record (story 4: "Create a new binder"). Only the columns that
// story requires exist so far; later stories (e.g. 20-24) add preview page,
// lock state, notes, and dimension/style columns without needing to change
// this initial set.
export const binders = sqliteTable(
  'binders',
  {
    id: text().primaryKey(),
    name: text().notNull(),
    // Case-insensitively normalized copy of `name` (lowercased) used to
    // enforce uniqueness regardless of capitalization, per planning.md.
    normalizedName: text().notNull().unique(),
    width: integer().notNull(),
    height: integer().notNull(),
    pages: integer().notNull(),
    createdAt: text().notNull(),
    updatedAt: text().notNull(),
  },
  (table) => [
    // Belt-and-suspenders DB-level enforcement of the 100-character binder
    // name limit alongside the OpenAPI request schema and Zod form schema.
    check('binder_name_length', sql`length(${table.name}) <= 100`),
  ],
);
