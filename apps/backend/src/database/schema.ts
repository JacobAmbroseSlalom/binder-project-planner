import { sql } from 'drizzle-orm';
import { check, integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';

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
    // Belt-and-suspenders DB-level enforcement of the width/height maximum
    // (`BINDER_DIMENSION_MAX` in the shared defaults module) alongside the
    // OpenAPI request schema and Zod form schema. The minimum of 1 is
    // already guaranteed by the `integer().notNull()` columns above plus
    // OpenAPI/Zod validation, so only the upper bound needs a DB check.
    check('binder_dimension_max', sql`${table.width} <= 8 AND ${table.height} <= 8`),
  ],
);

// A shared, immutable local image asset (story 11: "Select a card for a
// binder slot"). Story 12 adds the SHA-256 digest and sanitized original
// filename columns its custom-upload dedupe/metadata requirements need;
// story 25's multi-slot art will add orientation-normalized derivative
// columns later without changing this set again.
export const cardImageAssets = sqliteTable(
  'card_image_assets',
  {
    id: text().primaryKey(),
    // Present (and, together, unique) only for TCGdex-sourced assets; used
    // to let concurrent assignments of the same provider card share one
    // asset instead of downloading duplicates. Left null for custom-upload
    // asset rows (story 12), deduplicated by SHA-256 digest instead.
    providerCardId: text(),
    providerSetId: text(),
    // Present (and, together, unique) only for custom-upload assets (story
    // 12); left null for TCGdex-sourced rows. Lets concurrent uploads of
    // identical image bytes share one asset/file instead of racing to
    // store duplicates - computed by the backend while streaming the
    // upload to temporary storage, never trusted from the client.
    sha256Digest: text(),
    // A sanitized copy of the uploaded file's original name (story 12),
    // retained as metadata only; every filesystem operation uses
    // `storageFilename` below instead. Left null for TCGdex-sourced rows.
    originalFilename: text(),
    // Backend-generated filename this asset's bytes are stored under in the
    // application data directory's images folder. Never exposed to the
    // frontend; `GET /cards/{cardId}/image` resolves it server-side.
    storageFilename: text().notNull(),
    // Detected (not provider/upload-claimed) MIME type and file extension,
    // used as the streamed response's Content-Type and for the storage
    // filename's extension respectively.
    contentType: text().notNull(),
    fileExtension: text().notNull(),
    createdAt: text().notNull(),
  },
  (table) => [
    // Lets concurrent assignments of the same TCGdex card reuse one shared
    // asset/file instead of racing to download and store duplicates. SQLite
    // unique indexes never treat two NULLs as equal, so this constraint is
    // inert for custom-upload asset rows (story 12) that leave
    // `providerCardId` null.
    uniqueIndex('card_image_assets_provider_card_id_unique').on(table.providerCardId),
    // Story 12's concurrent-upload dedupe constraint: inert for
    // TCGdex-sourced rows that leave `sha256Digest` null, for the same
    // NULL-never-equals-NULL reason as the index above.
    uniqueIndex('card_image_assets_sha256_digest_unique').on(table.sha256Digest),
  ],
);

// A binder-owned card (stories 11 and 12). Acquisition/pricing fields
// (stories 36/38) aren't modeled yet; only what TCGdex and custom card
// creation/placement need exists so far.
export const cards = sqliteTable(
  'cards',
  {
    id: text().primaryKey(),
    binderId: text()
      .notNull()
      .references(() => binders.id, { onDelete: 'cascade' }),
    name: text().notNull(),
    setName: text(),
    localNumber: text(),
    // 'tcgdex' (story 11) or 'custom' (story 12), enforced by the
    // `card_source_valid` check below rather than a native SQLite enum.
    source: text().notNull(),
    providerCardId: text(),
    providerSetId: text(),
    // Trimmed; blank stored as null; one value replaces the previous value.
    variation: text(),
    // Placement coordinates (see PlacementCoordinates in data-types.md):
    // either all three are populated (placed) or all three are null
    // (unplaced/story 15's unplaced-cards section) - enforced by the
    // `card_placement_all_or_none` check below.
    physicalPage: integer(),
    row: integer(),
    column: integer(),
    imageAssetId: text()
      .notNull()
      .references(() => cardImageAssets.id),
    createdAt: text().notNull(),
    updatedAt: text().notNull(),
  },
  (table) => [
    check(
      'card_placement_all_or_none',
      sql`(${table.physicalPage} IS NULL AND ${table.row} IS NULL AND ${table.column} IS NULL) OR (${table.physicalPage} IS NOT NULL AND ${table.row} IS NOT NULL AND ${table.column} IS NOT NULL)`,
    ),
    check('card_source_valid', sql`${table.source} IN ('tcgdex', 'custom')`),
    check(
      'card_tcgdex_identity_required',
      sql`(${table.source} != 'tcgdex') OR (${table.providerCardId} IS NOT NULL AND ${table.providerSetId} IS NOT NULL)`,
    ),
    check(
      'card_custom_identity_absent',
      sql`(${table.source} != 'custom') OR (${table.providerCardId} IS NULL AND ${table.providerSetId} IS NULL)`,
    ),
    // Enforces "at most one card at each binder, physical-page, row, and
    // column coordinate" (planning.md). Inert for unplaced cards: SQLite
    // never treats two NULLs as equal, so any row with a null coordinate
    // never conflicts with another row.
    uniqueIndex('cards_binder_placement_unique').on(
      table.binderId,
      table.physicalPage,
      table.row,
      table.column,
    ),
  ],
);
