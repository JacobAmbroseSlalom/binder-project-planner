import { WATCHLIST_PDF_MAX_ENTRIES } from '@binder-project-planner/shared';
import { eq } from 'drizzle-orm';
import type { Router } from 'express';

import { appMetadata, watchlistEntries } from '../../database/schema.js';

import { PDF_EXPORT_CUTOFF_COUNT_METADATA_KEY } from './pdfExportCutoff.js';
import { problem } from './serialization.js';
import type { UpdateWatchlistEntryOrderRequestBody, WatchlistEntriesRouteDeps } from './types.js';

// Story 52's single reorder endpoint: replaces every entry's persisted
// `sortOrder` from the submitted array's own order (renumbered 0..n-1)
// and updates the persisted PDF export divider position, together in
// one transaction - covers both a plain entry drag (only
// `orderedEntryIds` changes) and a divider drag (only
// `pdfExportCutoffCount` changes) with a single request shape, since the
// frontend always has both values in hand after any drag-end.
export function registerWatchlistEntryOrderRoute(
  router: Router,
  deps: WatchlistEntriesRouteDeps,
): void {
  const { database } = deps;

  router.patch('/watchlist-entries/order', (request, response) => {
    const body = request.body as UpdateWatchlistEntryOrderRequestBody;
    const { orderedEntryIds, pdfExportCutoffCount } = body;

    const existingIds = database
      .select({ id: watchlistEntries.id })
      .from(watchlistEntries)
      .all()
      .map((row) => row.id);
    const existingIdSet = new Set(existingIds);
    const orderedIdSet = new Set(orderedEntryIds);

    // `orderedEntryIds` must be exactly a reordering of every current
    // entry id - same length, no duplicates, no unknown/missing ids -
    // otherwise this request can't be a valid full-order replacement.
    const isExactReordering =
      orderedEntryIds.length === existingIds.length &&
      orderedIdSet.size === orderedEntryIds.length &&
      orderedEntryIds.every((id) => existingIdSet.has(id));
    if (!isExactReordering) {
      response
        .status(400)
        .type('application/problem+json')
        .json(
          problem(
            400,
            'Bad Request',
            'orderedEntryIds must contain every current watchlist entry id exactly once.',
          ),
        );
      return;
    }

    const maxPdfExportCutoffCount = Math.min(WATCHLIST_PDF_MAX_ENTRIES, orderedEntryIds.length);
    if (
      !Number.isInteger(pdfExportCutoffCount) ||
      pdfExportCutoffCount < 0 ||
      pdfExportCutoffCount > maxPdfExportCutoffCount
    ) {
      response
        .status(400)
        .type('application/problem+json')
        .json(
          problem(
            400,
            'Bad Request',
            `pdfExportCutoffCount must be an integer between 0 and ${maxPdfExportCutoffCount}.`,
          ),
        );
      return;
    }

    database.transaction((tx) => {
      orderedEntryIds.forEach((id, index) => {
        tx.update(watchlistEntries)
          .set({ sortOrder: index })
          .where(eq(watchlistEntries.id, id))
          .run();
      });

      // Inlined rather than reusing `writePdfExportCutoffCount` - that
      // helper always runs against the router's own top-level `database`,
      // never this callback's `tx`, so the read-then-write below stays
      // inside this same transaction instead.
      const existingMetadataRow = tx
        .select({ key: appMetadata.key })
        .from(appMetadata)
        .where(eq(appMetadata.key, PDF_EXPORT_CUTOFF_COUNT_METADATA_KEY))
        .get();
      if (existingMetadataRow) {
        tx.update(appMetadata)
          .set({ value: String(pdfExportCutoffCount) })
          .where(eq(appMetadata.key, PDF_EXPORT_CUTOFF_COUNT_METADATA_KEY))
          .run();
      } else {
        tx.insert(appMetadata)
          .values({
            key: PDF_EXPORT_CUTOFF_COUNT_METADATA_KEY,
            value: String(pdfExportCutoffCount),
          })
          .run();
      }
    });

    response.status(200).json({ pdfExportCutoffCount });
  });
}
