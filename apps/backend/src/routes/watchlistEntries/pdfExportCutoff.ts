import { WATCHLIST_PDF_MAX_ENTRIES } from '@binder-project-planner/shared';
import { eq, sql } from 'drizzle-orm';

import type { DatabaseConnection } from '../../database/client.js';
import { appMetadata, watchlistEntries } from '../../database/schema.js';

// Story 52's key for the persisted "how many entries currently sit above
// the PDF export divider" value, stored as a single row in the generic
// `app_metadata` key/value table (its first real use) rather than a new
// dedicated singleton table, since it's just one global integer. Exported
// so `orderRoute.ts` can reuse it for its own inlined-in-transaction
// read/write (see that file's comment for why it doesn't call
// `writePdfExportCutoffCount` directly).
export const PDF_EXPORT_CUTOFF_COUNT_METADATA_KEY = 'watchlistPdfExportCutoffCount';

// The current total row count in `watchlist_entries`, used both to
// assign a newly created entry's `sortOrder` (always appended at the
// end) and as the upper bound when clamping the persisted PDF export
// cutoff (story 52).
export function countWatchlistEntries(database: DatabaseConnection['database']): number {
  const row = database
    .select({ count: sql<number>`count(*)` })
    .from(watchlistEntries)
    .get() as { count: number } | undefined;
  return row?.count ?? 0;
}

// Reads the persisted PDF export cutoff straight from `app_metadata`,
// or `null` if no value has ever been written yet (story 52) - the
// divider hasn't been dragged, so there's nothing to clamp/derive from
// other than the caller's own default.
function readStoredPdfExportCutoffCount(database: DatabaseConnection['database']): number | null {
  const row = database
    .select({ value: appMetadata.value })
    .from(appMetadata)
    .where(eq(appMetadata.key, PDF_EXPORT_CUTOFF_COUNT_METADATA_KEY))
    .get();
  return row ? Number.parseInt(row.value, 10) : null;
}

// Story 52's divider position: the persisted `pdfExportCutoffCount`
// (how many entries currently sit above the PDF export divider), read
// fresh on every request rather than cached. Defaults to
// `min(WATCHLIST_PDF_MAX_ENTRIES, totalEntryCount)` (the divider's
// documented starting position) when nothing has ever been explicitly
// persisted, and is always clamped to the list's *current* size and to
// `WATCHLIST_PDF_MAX_ENTRIES` so a stored value never points past the
// end of a list that has since shrunk, or exceeds the export's own hard
// cap.
export function computePdfExportCutoffCount(
  database: DatabaseConnection['database'],
  totalEntryCount: number,
): number {
  const stored = readStoredPdfExportCutoffCount(database);
  const effective = stored ?? Math.min(WATCHLIST_PDF_MAX_ENTRIES, totalEntryCount);
  return Math.min(effective, WATCHLIST_PDF_MAX_ENTRIES, totalEntryCount);
}

// Upserts the persisted PDF export cutoff (story 52). `app_metadata` is
// a plain key/value table with no prior read/write helpers in this
// codebase, so this is a plain select-then-insert-or-update rather than
// an ORM upsert helper, matching this file's existing style elsewhere.
export function writePdfExportCutoffCount(
  database: DatabaseConnection['database'],
  value: number,
): void {
  const existing = database
    .select({ key: appMetadata.key })
    .from(appMetadata)
    .where(eq(appMetadata.key, PDF_EXPORT_CUTOFF_COUNT_METADATA_KEY))
    .get();
  if (existing) {
    database
      .update(appMetadata)
      .set({ value: String(value) })
      .where(eq(appMetadata.key, PDF_EXPORT_CUTOFF_COUNT_METADATA_KEY))
      .run();
  } else {
    database
      .insert(appMetadata)
      .values({ key: PDF_EXPORT_CUTOFF_COUNT_METADATA_KEY, value: String(value) })
      .run();
  }
}

// Called right after inserting `createdCount` new entries (1 for the
// single-entry create endpoints, or however many succeeded for a bulk
// one), story 52. If the divider was already sitting at the true end of
// the list (no entries below it) and there's still room under
// `WATCHLIST_PDF_MAX_ENTRIES`, extends it to also cover as many of the
// newly appended entries as fit - otherwise (the user has moved the
// divider up, or the list is already at the cap) leaves it unchanged,
// so new entries land below it instead.
export function extendPdfExportCutoffForNewEntries(
  database: DatabaseConnection['database'],
  previousTotalEntryCount: number,
  createdCount: number,
): void {
  if (createdCount === 0) return;
  const previousCutoff = computePdfExportCutoffCount(database, previousTotalEntryCount);
  if (previousCutoff !== previousTotalEntryCount) return;
  const nextCutoff = Math.min(previousCutoff + createdCount, WATCHLIST_PDF_MAX_ENTRIES);
  if (nextCutoff !== previousCutoff) {
    writePdfExportCutoffCount(database, nextCutoff);
  }
}
