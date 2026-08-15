import { randomUUID } from 'node:crypto';
import { createReadStream, existsSync, unlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { WATCHLIST_PDF_MAX_ENTRIES } from '@binder-project-planner/shared';
import { inArray } from 'drizzle-orm';
import type { Router } from 'express';

import { cardImageAssets, cards, watchlistEntries } from '../../database/schema.js';
import { fromCents } from '../../finance/currency.js';
import { generateWatchlistPdf } from '../../pdf/watchlistPdf.js';

import { problem } from './serialization.js';
import type { WatchlistEntriesRouteDeps } from './types.js';

// Story 45's print/export PDF endpoint: renders the request's submitted
// entry ids, in the exact order submitted (the client already resolved
// the list's current search/filter and manual-drag-or-column-sort order
// into that id order), as a fixed 2-page US Letter portrait PDF -
// mirroring `exports/cards-pdf`'s "client resolves order, backend never
// recomputes it" contract, but for a binder-less, global list. Read-only,
// so (like the other export routes) never restricted by any lock state.
export function registerWatchlistEntryExportPdfRoute(
  router: Router,
  deps: WatchlistEntriesRouteDeps,
): void {
  const { database, imagesDirectory } = deps;

  router.post('/watchlist-entries/exports/pdf', async (request, response, next) => {
    const { watchlistEntryIds: requestedEntryIds } = request.body as {
      watchlistEntryIds: string[];
    };

    if (requestedEntryIds.length === 0) {
      response
        .status(400)
        .type('application/problem+json')
        .json(problem(400, 'Bad Request', 'watchlistEntryIds must include at least one entry id.'));
      return;
    }

    // The frontend table already only ever sends the first
    // `WATCHLIST_PDF_MAX_ENTRIES` (the most page 1's fixed layout can fit
    // without a row running off the page - see `watchlistPdf.ts`), but the
    // route re-enforces the same cap server-side rather than trusting the
    // client, silently truncating a longer request instead of rejecting it
    // outright.
    const watchlistEntryIds = requestedEntryIds.slice(0, WATCHLIST_PDF_MAX_ENTRIES);

    // One transactionally consistent snapshot read, matching
    // `exports/cards-pdf`'s own snapshot-then-validate pattern.
    const snapshot = database.transaction((tx) => {
      const entryRows = tx
        .select()
        .from(watchlistEntries)
        .where(inArray(watchlistEntries.id, watchlistEntryIds))
        .all();
      const entriesById = new Map(entryRows.map((entry) => [entry.id, entry]));

      const referencedCardIds = entryRows
        .map((entry) => entry.cardId)
        .filter((id): id is string => id !== null);
      const cardRows =
        referencedCardIds.length > 0
          ? tx.select().from(cards).where(inArray(cards.id, referencedCardIds)).all()
          : [];
      const cardsById = new Map(cardRows.map((card) => [card.id, card]));

      // Every entry's effective image asset id - its joined card's own
      // asset when referenced, or its own asset when standalone - resolved
      // in one extra query rather than one per entry.
      const imageAssetIds = entryRows
        .map((entry) => {
          const card = entry.cardId ? cardsById.get(entry.cardId) : undefined;
          return card ? card.imageAssetId : entry.imageAssetId;
        })
        .filter((id): id is string => id !== null);
      const imageAssetRows =
        imageAssetIds.length > 0
          ? tx
              .select()
              .from(cardImageAssets)
              .where(inArray(cardImageAssets.id, imageAssetIds))
              .all()
          : [];
      const imageAssetsById = new Map(imageAssetRows.map((asset) => [asset.id, asset]));

      return { entriesById, cardsById, imageAssetsById };
    });

    // Every submitted id must currently identify an entry, and the array
    // must be non-empty (checked above), matching `exports/cards-pdf`'s
    // identical `cardIds` validation.
    const unknownEntryId = watchlistEntryIds.find((id) => !snapshot.entriesById.has(id));
    if (unknownEntryId !== undefined) {
      response
        .status(400)
        .type('application/problem+json')
        .json(
          problem(
            400,
            'Bad Request',
            `Watchlist entry id "${unknownEntryId}" does not currently identify an entry.`,
          ),
        );
      return;
    }

    // Resolves each entry's effective (card-hydrated, or its own)
    // name/set/number/variation/price/image, in the exact submitted order -
    // mirroring `serializeWatchlistEntry`'s own card-hydration precedence.
    const pdfEntries = watchlistEntryIds.map((id) => {
      const entry = snapshot.entriesById.get(id)!;
      const card = entry.cardId ? snapshot.cardsById.get(entry.cardId) : undefined;
      const fields = card ?? entry;
      const imageAssetId = card ? card.imageAssetId : entry.imageAssetId;
      const imageAsset = imageAssetId ? snapshot.imageAssetsById.get(imageAssetId) : undefined;
      return {
        name: fields.name!,
        setName: fields.setName,
        localNumber: fields.localNumber,
        variation: fields.variation,
        price: fields.priceCents === null ? null : fromCents(fields.priceCents),
        // Every entry (standalone or referenced) always has an image asset
        // per the table's own schema, so this is only ever undefined if
        // local storage is already missing the file - `loadImageForEmbedding`
        // (inside `generateWatchlistPdf`) surfaces that as a PDF generation
        // failure below rather than this route guessing at a placeholder.
        imagePath: imageAsset ? join(imagesDirectory, imageAsset.storageFilename) : '',
      };
    });

    const tempFilePath = join(tmpdir(), `watchlist-pdf-export-${randomUUID()}.pdf`);

    try {
      await generateWatchlistPdf({ outputPath: tempFilePath, entries: pdfEntries });
    } catch (error) {
      if (existsSync(tempFilePath)) {
        try {
          unlinkSync(tempFilePath);
        } catch (cleanupError) {
          request.log.error(
            { err: cleanupError, path: tempFilePath },
            'Failed to remove a failed watchlist PDF export temporary file.',
          );
        }
      }
      next(error);
      return;
    }

    response
      .status(200)
      .type('application/pdf')
      .set('Content-Disposition', 'attachment; filename="whats-im-looking-for.pdf"');

    const readStream = createReadStream(tempFilePath);
    readStream.pipe(response);

    // Cleans up the temporary file once the response is done, matching
    // `exports/cards-pdf`'s identical cleanup above.
    response.once('close', () => {
      if (!existsSync(tempFilePath)) return;
      try {
        unlinkSync(tempFilePath);
      } catch (cleanupError) {
        request.log.error(
          { err: cleanupError, path: tempFilePath },
          'Failed to remove a completed watchlist PDF export temporary file.',
        );
      }
    });
  });
}
