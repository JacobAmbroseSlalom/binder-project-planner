import { sql } from 'drizzle-orm';
import { check, integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';

export const appMetadata = sqliteTable('app_metadata', {
  key: text().primaryKey(),
  value: text().notNull(),
});

// Story 34: "Add custom art finances". Shared, reusable "Binder" physical-
// cost entries - one of the binder's three cost-entry catalogs, each
// modeled as its own table (rather than one generic discriminated table)
// since their shapes differ. `width`/`height`/`pages` are stored but never
// shown to the user; they exist only so the Binder dropdown can filter to
// entries matching the current binder's own dimensions/page count.
// Supports create and edit only in this story - no delete (story 44 adds
// that later), so entries only ever accumulate.
export const binderCostEntries = sqliteTable(
  'binder_cost_entries',
  {
    id: text().primaryKey(),
    name: text().notNull(),
    priceCents: integer().notNull(),
    width: integer().notNull(),
    height: integer().notNull(),
    pages: integer().notNull(),
    createdAt: text().notNull(),
    updatedAt: text().notNull(),
  },
  (table) => [
    check('binder_cost_entry_name_length', sql`length(${table.name}) <= 100`),
    check('binder_cost_entry_price_positive', sql`${table.priceCents} > 0`),
    check(
      'binder_cost_entry_dimension_range',
      sql`${table.width} >= 1 AND ${table.width} <= 8 AND ${table.height} >= 1 AND ${table.height} <= 8`,
    ),
    check('binder_cost_entry_pages_positive', sql`${table.pages} > 0`),
  ],
);

// Story 34's "Printing" physical-cost catalog. Its cost is
// `pricePerPage * artPrintPageCount` (plus the shared error margin).
export const printingCostEntries = sqliteTable(
  'printing_cost_entries',
  {
    id: text().primaryKey(),
    name: text().notNull(),
    pricePerPageCents: integer().notNull(),
    createdAt: text().notNull(),
    updatedAt: text().notNull(),
  },
  (table) => [
    check('printing_cost_entry_name_length', sql`length(${table.name}) <= 100`),
    check('printing_cost_entry_price_per_page_positive', sql`${table.pricePerPageCents} > 0`),
  ],
);

// Story 34's "Holographic Paper" physical-cost catalog. Its cost is
// `(price / pagesIncluded) * artPrintPageCount` (plus the shared error
// margin).
export const holographicPaperCostEntries = sqliteTable(
  'holographic_paper_cost_entries',
  {
    id: text().primaryKey(),
    name: text().notNull(),
    priceCents: integer().notNull(),
    pagesIncluded: integer().notNull(),
    createdAt: text().notNull(),
    updatedAt: text().notNull(),
  },
  (table) => [
    check('holographic_paper_cost_entry_name_length', sql`length(${table.name}) <= 100`),
    check('holographic_paper_cost_entry_price_positive', sql`${table.priceCents} > 0`),
    check('holographic_paper_cost_entry_pages_included_positive', sql`${table.pagesIncluded} > 0`),
  ],
);

// Story 34's global, single-row `financeSettings` singleton: wage-per-hour,
// the shared error-margin percentage, and each of the 5 fixed time-cost
// categories' own rate basis (`referenceMinutes`/`referencePages`, e.g.
// "25 minutes to do 8 pages"). The 5 categories are a fixed enum baked
// into these columns (not a user-manageable list) - adding, renaming, or
// removing one requires a future code change and migration. `id` is
// always the fixed literal `'singleton'`; the seed row inserting it lives
// in this table's own migration rather than the shared `defaults.ts`,
// since these are one-time seed values for a singleton row rather than
// fallback values referenced by application code at runtime (an
// intentional, story-scoped exception to `defaults.ts` centralization -
// see coding-conventions.instructions.md).
//
// `printingReferencePages` is nullable (amended after story 34 shipped):
// Printing is a one-time cost for the whole binder that doesn't scale
// with page count, so its rate basis is just a flat `referenceMinutes`
// value with `referencePages` always null - unlike the other 4
// categories, which still divide `referenceMinutes` by `referencePages`
// and multiply by the binder's page count.
//
// `salesTaxPercent` (added after story 34 shipped): a single shared sales
// tax percentage applied to the "Total (excl. Cards)" sticky-totals
// figure to produce the "With Tax" stat. Seeded to Georgia's flat state
// sales tax rate (4%) as this app's default, editable the same way as
// `errorMarginPercent`.
export const financeSettings = sqliteTable(
  'finance_settings',
  {
    id: text().primaryKey(),
    wagePerHourCents: integer().notNull(),
    errorMarginPercent: integer().notNull(),
    salesTaxPercent: integer().notNull(),
    designingReferenceMinutes: integer().notNull(),
    designingReferencePages: integer().notNull(),
    printingReferenceMinutes: integer().notNull(),
    printingReferencePages: integer(),
    applyingHolographicPaperReferenceMinutes: integer().notNull(),
    applyingHolographicPaperReferencePages: integer().notNull(),
    cuttingReferenceMinutes: integer().notNull(),
    cuttingReferencePages: integer().notNull(),
    placingReferenceMinutes: integer().notNull(),
    placingReferencePages: integer().notNull(),
    updatedAt: text().notNull(),
  },
  (table) => [
    check('finance_settings_singleton_id', sql`${table.id} = 'singleton'`),
    check('finance_settings_wage_per_hour_non_negative', sql`${table.wagePerHourCents} >= 0`),
    check(
      'finance_settings_error_margin_range',
      sql`${table.errorMarginPercent} >= 0 AND ${table.errorMarginPercent} <= 100`,
    ),
    check(
      'finance_settings_sales_tax_range',
      sql`${table.salesTaxPercent} >= 0 AND ${table.salesTaxPercent} <= 100`,
    ),
    check(
      'finance_settings_designing_rate_basis',
      sql`${table.designingReferenceMinutes} >= 0 AND ${table.designingReferencePages} > 0`,
    ),
    check(
      'finance_settings_printing_rate_basis',
      sql`${table.printingReferenceMinutes} >= 0 AND (${table.printingReferencePages} IS NULL OR ${table.printingReferencePages} > 0)`,
    ),
    check(
      'finance_settings_applying_holographic_paper_rate_basis',
      sql`${table.applyingHolographicPaperReferenceMinutes} >= 0 AND ${table.applyingHolographicPaperReferencePages} > 0`,
    ),
    check(
      'finance_settings_cutting_rate_basis',
      sql`${table.cuttingReferenceMinutes} >= 0 AND ${table.cuttingReferencePages} > 0`,
    ),
    check(
      'finance_settings_placing_rate_basis',
      sql`${table.placingReferenceMinutes} >= 0 AND ${table.placingReferencePages} > 0`,
    ),
  ],
);

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
    // Card/multi-slot-art dimension and style settings (story 24). REST
    // contracts expose these as decimal centimeters/percentages, but the
    // database stores them as integer hundredths (e.g. 6.85 cm -> `685`,
    // 38% -> `3800`, 0.25 cm -> `25`) to avoid floating-point drift, per
    // planning.md's "Technical requirements".
    widthPerSlotHundredths: integer().notNull(),
    widthBaseHundredths: integer().notNull(),
    heightPerSlotHundredths: integer().notNull(),
    heightBaseHundredths: integer().notNull(),
    // Six-digit uppercase `#RRGGBB` hex color; normalized to uppercase by
    // the backend before saving.
    borderColor: text().notNull(),
    // Percentage (CSS percentage semantics: relative to the frame's
    // width/height per axis).
    borderRadiusHundredths: integer().notNull(),
    // Physical centimeters (not a percentage or fixed pixel count) - the
    // frontend converts it to pixels at render time using the same
    // cm-to-px scale factor as the art's own image, so it stays
    // physically proportional to the art's actual size.
    borderWidthHundredths: integer().notNull(),
    // Story 20: one-based physical focal page the home-page preview
    // resolves to a spread (see `@binder-project-planner/shared`'s
    // `resolveSpread`). Bounded by `pages` (below), so its check
    // constraint must reference both columns.
    previewPhysicalPage: integer().notNull(),
    // Story 32: "Lock a binder". SQLite has no native boolean type, so
    // drizzle's `{ mode: 'boolean' }` stores it as an integer 0/1 and
    // converts to/from a real `boolean` at the application boundary.
    // Defaults to `false` (unlocked); blocks restricted details/layout/
    // card/art mutations while `true`.
    locked: integer({ mode: 'boolean' }).notNull().default(false),
    // Story 23: free-form Markdown-source notes for the binder. Nullable
    // (an exactly-empty notes string is normalized to null by the backend);
    // the 1,000,000-character limit is enforced at the OpenAPI/app layers
    // rather than a DB check constraint, matching the other nullable text
    // columns (e.g. `art.description`) and keeping this a simple in-place
    // ALTER migration rather than a table-recreate.
    notes: text(),
    // Story 34: "Add custom art finances". Nullable foreign keys to this
    // binder's currently selected shared physical-cost entries - null means
    // "none selected yet". Selecting one of these is never restricted by
    // `locked` (see routes/binders.ts's `isRestrictedFieldsOnlyUpdate`),
    // mirroring the acquisition/price carve-out story 32 documents for a
    // future story. No `onDelete` action is declared yet since this story's
    // catalogs support create/edit only (no delete) - story 44 will revisit
    // this when delete support is added.
    selectedBinderCostEntryId: text().references(() => binderCostEntries.id),
    selectedPrintingCostEntryId: text().references(() => printingCostEntries.id),
    selectedHolographicPaperCostEntryId: text().references(() => holographicPaperCostEntries.id),
    // Story 34's art-print page-count cache: `cachedArtPrintPageCount` is
    // the last-computed page count for this binder's currently placed
    // multi-slot art (same packing logic as story 30's print export).
    // The remaining 3 columns are the lightweight cache signature
    // `GET /binders/{binderId}/art-print-page-count` recomputes and
    // compares against on every call - a mismatch (placed-art count,
    // placed-art max `updatedAt`, or this binder's own `updatedAt` no
    // longer matching what was cached) means the count is stale and gets
    // recomputed/re-cached, rather than invalidating the cache at every
    // mutation site that could change placed-art footprints or binder
    // dimensions. All 4 columns start null (never yet computed); a null
    // `cachedArtPrintMaxArtUpdatedAt` still participates in the signature
    // comparison (it's what "no placed art" or "only art with no
    // updatedAt recorded" looks like, though every art row always has one).
    cachedArtPrintPageCount: integer(),
    cachedArtPrintPlacedArtCount: integer(),
    cachedArtPrintMaxArtUpdatedAt: text(),
    cachedArtPrintBinderUpdatedAt: text(),
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
    // Story 24: width/height-per-slot must be positive, and the one-slot
    // formula (`perSlot + base`) must stay positive even when its base is
    // negative - belt-and-suspenders alongside the application-level
    // cross-field validation in routes/binders.ts.
    check('binder_width_per_slot_positive', sql`${table.widthPerSlotHundredths} > 0`),
    check('binder_height_per_slot_positive', sql`${table.heightPerSlotHundredths} > 0`),
    check(
      'binder_width_one_slot_positive',
      sql`(${table.widthPerSlotHundredths} + ${table.widthBaseHundredths}) > 0`,
    ),
    check(
      'binder_height_one_slot_positive',
      sql`(${table.heightPerSlotHundredths} + ${table.heightBaseHundredths}) > 0`,
    ),
    // Border radius is a percentage from 0 to 100 inclusive (0 to 10000
    // hundredths); border width is a centimeters measurement with no fixed
    // upper bound, only a non-negative lower bound.
    check(
      'binder_border_radius_range',
      sql`${table.borderRadiusHundredths} >= 0 AND ${table.borderRadiusHundredths} <= 10000`,
    ),
    check('binder_border_width_range', sql`${table.borderWidthHundredths} >= 0`),
    // Six uppercase hex digits after the `#`; SQLite's GLOB uses UNIX
    // glob-style bracket character classes, which support ranges like
    // `[0-9A-F]`.
    check(
      'binder_border_color_format',
      sql`${table.borderColor} GLOB '#[0-9A-F][0-9A-F][0-9A-F][0-9A-F][0-9A-F][0-9A-F]'`,
    ),
    // Story 20: the preview page must be a valid physical page for this
    // binder's own stored page count (1 through pages * 2), belt-and-
    // suspenders alongside the application-level validation/auto-reset in
    // routes/binders.ts.
    check(
      'binder_preview_physical_page_range',
      sql`${table.previewPhysicalPage} >= 1 AND ${table.previewPhysicalPage} <= (${table.pages} * 2)`,
    ),
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
    // Story 36: "Track card acquisition". Defaults to `false` (unacquired)
    // for every new card, regardless of creation path (manual or TCGdex,
    // single or bulk) - mirrors `locked`'s SQLite-boolean-as-integer
    // storage convention above.
    acquired: integer({ mode: 'boolean' }).notNull().default(false),
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

// A shared, immutable local image asset for multi-slot art (story 25).
// Kept as its own table (rather than reusing `cardImageAssets`) for
// simplicity; the "reuse the global asset when identical bytes already
// belong to a custom card" cross-dedupe planning.md describes is a known,
// documented gap - art uploads only dedupe against other art uploads for
// now. `normalizedStorageFilename` is populated only when the uploaded
// JPEG's EXIF orientation required an auto-oriented derivative; when null,
// `storageFilename` itself is already correctly oriented and used
// directly by every renderer.
export const artImageAssets = sqliteTable('art_image_assets', {
  id: text().primaryKey(),
  sha256Digest: text().notNull().unique(),
  originalFilename: text(),
  storageFilename: text().notNull(),
  normalizedStorageFilename: text(),
  contentType: text().notNull(),
  fileExtension: text().notNull(),
  // The image's correctly-oriented pixel dimensions (after resolving EXIF
  // orientation, if any) - used by the frontend's print-resolution
  // quality-warning calculation (story 25).
  pixelWidth: integer().notNull(),
  pixelHeight: integer().notNull(),
  createdAt: text().notNull(),
});

// Binder-owned multi-slot art (story 25). Placement always starts null -
// story 25 only adds the unplaced-art section; placing art onto the
// layout is story 26's scope, per planning.md ("Placement and other
// interactions for multi-slot art on the binder layout will be defined in
// the next story").
export const art = sqliteTable(
  'art',
  {
    id: text().primaryKey(),
    binderId: text()
      .notNull()
      .references(() => binders.id, { onDelete: 'cascade' }),
    title: text().notNull(),
    description: text(),
    widthSlots: integer().notNull(),
    heightSlots: integer().notNull(),
    // Placement coordinates, mirroring `cards`' all-or-none triple (story
    // 26 will start populating these); enforced by
    // `art_placement_all_or_none` below.
    physicalPage: integer(),
    row: integer(),
    column: integer(),
    imageAssetId: text()
      .notNull()
      .references(() => artImageAssets.id),
    // One of 0/90/180/270; rotate-left/rotate-right change this by one
    // quarter turn with wraparound (story 25).
    imageRotationDegrees: integer().notNull().default(0),
    // Normalized focal point and independent scale multipliers relative to
    // the computed centered-cover fit, stored as integer ten-thousandths
    // per planning.md ("stored as integer ten-thousandths in the
    // database").
    focalXTenThousandths: integer().notNull(),
    focalYTenThousandths: integer().notNull(),
    scaleXTenThousandths: integer().notNull(),
    scaleYTenThousandths: integer().notNull(),
    // Nullable border style overrides: null means "use the binder's
    // current setting at render time"; a non-null value is this art
    // item's own custom override (planning.md). Radius is a percentage;
    // width is a physical centimeters measurement (see the binders table
    // above).
    borderColor: text(),
    borderRadiusHundredths: integer(),
    borderWidthHundredths: integer(),
    createdAt: text().notNull(),
    updatedAt: text().notNull(),
  },
  (table) => [
    check(
      'art_placement_all_or_none',
      sql`(${table.physicalPage} IS NULL AND ${table.row} IS NULL AND ${table.column} IS NULL) OR (${table.physicalPage} IS NOT NULL AND ${table.row} IS NOT NULL AND ${table.column} IS NOT NULL)`,
    ),
    check('art_width_slots_positive', sql`${table.widthSlots} > 0`),
    check('art_height_slots_positive', sql`${table.heightSlots} > 0`),
    check('art_rotation_valid', sql`${table.imageRotationDegrees} IN (0, 90, 180, 270)`),
    check(
      'art_scale_positive',
      sql`${table.scaleXTenThousandths} > 0 AND ${table.scaleYTenThousandths} > 0`,
    ),
    check(
      'art_border_color_format',
      sql`${table.borderColor} IS NULL OR ${table.borderColor} GLOB '#[0-9A-F][0-9A-F][0-9A-F][0-9A-F][0-9A-F][0-9A-F]'`,
    ),
    check(
      'art_border_radius_range',
      sql`${table.borderRadiusHundredths} IS NULL OR (${table.borderRadiusHundredths} >= 0 AND ${table.borderRadiusHundredths} <= 10000)`,
    ),
    check(
      'art_border_width_range',
      sql`${table.borderWidthHundredths} IS NULL OR ${table.borderWidthHundredths} >= 0`,
    ),
  ],
);

// A completed mutation's replayable outcome, keyed by a client-generated
// idempotency key (story 26: art duplication is the first mutation to use
// this; later stories reuse the same table for bulk card creation and
// binder/card duplication). `scope` namespaces the key so two different
// endpoints can't collide if a client ever reused a key across them by
// mistake. Retained for `MUTATION_IDEMPOTENCY_RETENTION_MS` (24 hours) and
// pruned opportunistically rather than by a background scheduler
// (planning.md).
export const mutationIdempotency = sqliteTable('mutation_idempotency', {
  key: text().primaryKey(),
  scope: text().notNull(),
  responseStatus: integer().notNull(),
  responseBody: text().notNull(),
  locationHeader: text(),
  createdAt: text().notNull(),
});
