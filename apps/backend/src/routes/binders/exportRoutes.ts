import { randomUUID } from 'node:crypto';
import { createReadStream, existsSync, unlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  ART_PRINT_ITEM_GAP_INCHES,
  ART_PRINT_PAGE_MARGIN_INCHES,
  ART_PRINT_TILE_OVERLAP_INCHES,
} from '@binder-project-planner/shared';
import { and, eq, isNotNull } from 'drizzle-orm';
import type { Router } from 'express';

import { art, artImageAssets, binders, cardImageAssets, cards } from '../../database/schema.js';
import { generateArtPrintPdf } from '../../pdf/artPrintPdf.js';
import { generateBinderLayoutPdf } from '../../pdf/binderLayoutPdf.js';
import { generateCardsListPdf } from '../../pdf/cardsListPdf.js';

import {
  badRequestProblem,
  fromHundredths,
  fromTenThousandths,
  notFoundProblem,
} from './serialization.js';
import type { BinderRow, BindersRouteDeps } from './types.js';

// Story 29's complete-layout PDF export, story 30's selected-art-only PDF
// export, and story 37's Card List PDF export - grouped together since all
// 3 share the identical "snapshot read inside a transaction, generate to a
// temp file, stream it, clean up on close" shape and are all read-only (so,
// unlike every mutating route above, none is ever restricted by binder
// lock state).
export function registerBinderExportRoutes(router: Router, deps: BindersRouteDeps): void {
  const { database, imagesDirectory } = deps;

  // Story 29: exports the binder's complete layout as a print-ready PDF.
  router.post('/binders/:binderId/exports/pdf', async (request, response, next) => {
    const { binderId } = request.params;
    const { includeVariations = false } = request.body as { includeVariations?: boolean };

    // One transactionally consistent snapshot read (planning.md: "changes
    // committed afterward do not appear in that PDF and are not blocked by
    // the export") - kept synchronous and short-lived, per this app's
    // existing transaction convention; the (potentially slow) PDF
    // generation itself happens afterward, outside the transaction, from
    // the already-fetched snapshot.
    const snapshot = database.transaction((tx) => {
      const binderRow = tx.select().from(binders).where(eq(binders.id, binderId)).get() as
        BinderRow | undefined;
      if (!binderRow) return null;

      const cardRows = tx
        .select({
          physicalPage: cards.physicalPage,
          row: cards.row,
          column: cards.column,
          variation: cards.variation,
          storageFilename: cardImageAssets.storageFilename,
        })
        .from(cards)
        .innerJoin(cardImageAssets, eq(cards.imageAssetId, cardImageAssets.id))
        .where(and(eq(cards.binderId, binderId), isNotNull(cards.physicalPage)))
        .all();

      const artRows = tx
        .select({
          physicalPage: art.physicalPage,
          row: art.row,
          column: art.column,
          widthSlots: art.widthSlots,
          heightSlots: art.heightSlots,
          imageRotationDegrees: art.imageRotationDegrees,
          focalXTenThousandths: art.focalXTenThousandths,
          focalYTenThousandths: art.focalYTenThousandths,
          scaleXTenThousandths: art.scaleXTenThousandths,
          scaleYTenThousandths: art.scaleYTenThousandths,
          borderColor: art.borderColor,
          borderRadiusHundredths: art.borderRadiusHundredths,
          borderWidthHundredths: art.borderWidthHundredths,
          storageFilename: artImageAssets.storageFilename,
          normalizedStorageFilename: artImageAssets.normalizedStorageFilename,
          pixelWidth: artImageAssets.pixelWidth,
          pixelHeight: artImageAssets.pixelHeight,
        })
        .from(art)
        .innerJoin(artImageAssets, eq(art.imageAssetId, artImageAssets.id))
        .where(and(eq(art.binderId, binderId), isNotNull(art.physicalPage)))
        .all();

      return { binderRow, cardRows, artRows };
    });

    if (!snapshot) {
      response.status(404).type('application/problem+json').json(notFoundProblem(binderId));
      return;
    }

    // A filesystem-safe download filename derived from the binder's name
    // (which otherwise allows any character): non-alphanumeric characters
    // (other than space/hyphen/underscore) become underscores, falling
    // back to a generic name for the unlikely case that strips everything.
    // " Binder" is appended (e.g. "Umbreon Binder.pdf") to distinguish this
    // full-layout export from the separate art-only export below, which
    // instead suffixes "-art".
    const sanitizedName =
      snapshot.binderRow.name.replace(/[^A-Za-z0-9 _-]/g, '_').trim() || 'binder';
    const downloadFilename = `${sanitizedName} Binder`;
    const tempFilePath = join(tmpdir(), `binder-pdf-export-${randomUUID()}.pdf`);

    try {
      await generateBinderLayoutPdf({
        outputPath: tempFilePath,
        binder: {
          name: snapshot.binderRow.name,
          width: snapshot.binderRow.width,
          height: snapshot.binderRow.height,
          pages: snapshot.binderRow.pages,
          widthPerSlot: fromHundredths(snapshot.binderRow.widthPerSlotHundredths),
          widthBase: fromHundredths(snapshot.binderRow.widthBaseHundredths),
          heightPerSlot: fromHundredths(snapshot.binderRow.heightPerSlotHundredths),
          heightBase: fromHundredths(snapshot.binderRow.heightBaseHundredths),
        },
        cards: snapshot.cardRows.map((row) => ({
          physicalPage: row.physicalPage as number,
          row: row.row as number,
          column: row.column as number,
          variation: row.variation,
          imagePath: join(imagesDirectory, row.storageFilename),
        })),
        art: snapshot.artRows.map((row) => ({
          physicalPage: row.physicalPage as number,
          row: row.row as number,
          column: row.column as number,
          widthSlots: row.widthSlots,
          heightSlots: row.heightSlots,
          imagePath: join(imagesDirectory, row.normalizedStorageFilename ?? row.storageFilename),
          naturalWidth: row.pixelWidth,
          naturalHeight: row.pixelHeight,
          imageRotationDegrees: row.imageRotationDegrees as 0 | 90 | 180 | 270,
          focalX: fromTenThousandths(row.focalXTenThousandths),
          focalY: fromTenThousandths(row.focalYTenThousandths),
          scaleX: fromTenThousandths(row.scaleXTenThousandths),
          scaleY: fromTenThousandths(row.scaleYTenThousandths),
          // A null override falls back to the binder's own current border
          // setting at render time, mirroring `ArtTile.tsx`'s own
          // `art.borderColor ?? binder.borderColor` resolution (see
          // schema.ts's comment on `art.borderColor`).
          borderColor: row.borderColor ?? snapshot.binderRow.borderColor,
          borderRadius: fromHundredths(
            row.borderRadiusHundredths ?? snapshot.binderRow.borderRadiusHundredths,
          ),
          borderWidth: fromHundredths(
            row.borderWidthHundredths ?? snapshot.binderRow.borderWidthHundredths,
          ),
        })),
        includeVariations,
      });
    } catch (error) {
      if (existsSync(tempFilePath)) {
        try {
          unlinkSync(tempFilePath);
        } catch (cleanupError) {
          request.log.error(
            { err: cleanupError, path: tempFilePath },
            'Failed to remove a failed PDF export temporary file.',
          );
        }
      }
      next(error);
      return;
    }

    response
      .status(200)
      .type('application/pdf')
      .set('Content-Disposition', `attachment; filename="${downloadFilename}.pdf"`);

    const readStream = createReadStream(tempFilePath);
    readStream.pipe(response);

    // Cleans up the temporary file once the response is done, whether it
    // completed normally or the client disconnected early - 'close' fires
    // in both cases (planning.md: "removes the temporary PDF after the
    // response completes or the client disconnects"). A cleanup failure
    // here is logged only; the already-sent response is unaffected.
    response.once('close', () => {
      if (!existsSync(tempFilePath)) return;
      try {
        unlinkSync(tempFilePath);
      } catch (cleanupError) {
        request.log.error(
          { err: cleanupError, path: tempFilePath },
          'Failed to remove a completed PDF export temporary file.',
        );
      }
    });
  });

  // Story 30: exports the request's selected, currently placed multi-slot
  // art as a print-ready PDF, packed across as many pages as needed - never
  // the fixed one-page-per-spread layout `exports/pdf` above uses, and
  // never including any card.
  router.post('/binders/:binderId/exports/art-pdf', async (request, response, next) => {
    const { binderId } = request.params;
    const { selectedArtIds } = request.body as { selectedArtIds: string[] };

    // One transactionally consistent snapshot read, matching `exports/pdf`
    // above - `placedArtRows` is every currently placed art item in this
    // binder (not just the selected ones), so the handler below can tell
    // apart "id doesn't exist at all"/"id exists but isn't placed" from "id
    // is placed but wasn't selected" when validating `selectedArtIds`.
    const snapshot = database.transaction((tx) => {
      const binderRow = tx.select().from(binders).where(eq(binders.id, binderId)).get() as
        BinderRow | undefined;
      if (!binderRow) return null;

      const placedArtRows = tx
        .select({
          id: art.id,
          widthSlots: art.widthSlots,
          heightSlots: art.heightSlots,
          imageRotationDegrees: art.imageRotationDegrees,
          focalXTenThousandths: art.focalXTenThousandths,
          focalYTenThousandths: art.focalYTenThousandths,
          scaleXTenThousandths: art.scaleXTenThousandths,
          scaleYTenThousandths: art.scaleYTenThousandths,
          borderColor: art.borderColor,
          borderRadiusHundredths: art.borderRadiusHundredths,
          borderWidthHundredths: art.borderWidthHundredths,
          storageFilename: artImageAssets.storageFilename,
          normalizedStorageFilename: artImageAssets.normalizedStorageFilename,
          pixelWidth: artImageAssets.pixelWidth,
          pixelHeight: artImageAssets.pixelHeight,
        })
        .from(art)
        .innerJoin(artImageAssets, eq(art.imageAssetId, artImageAssets.id))
        .where(and(eq(art.binderId, binderId), isNotNull(art.physicalPage)))
        .all();

      return { binderRow, placedArtRows };
    });

    if (!snapshot) {
      response.status(404).type('application/problem+json').json(notFoundProblem(binderId));
      return;
    }

    // Every submitted id must currently identify placed art in this binder
    // (planning.md: "a submitted UUID that is not currently placed art in
    // the binder, or an empty array, returns a request-validation Problem
    // Details response and does not generate a PDF").
    const placedArtById = new Map(snapshot.placedArtRows.map((row) => [row.id, row]));
    if (selectedArtIds.length === 0) {
      response
        .status(400)
        .type('application/problem+json')
        .json(badRequestProblem('selectedArtIds must include at least one placed art id.'));
      return;
    }
    const unknownArtId = selectedArtIds.find((id) => !placedArtById.has(id));
    if (unknownArtId !== undefined) {
      response
        .status(400)
        .type('application/problem+json')
        .json(
          badRequestProblem(
            `Art id "${unknownArtId}" does not currently identify placed art in this binder.`,
          ),
        );
      return;
    }

    const selectedArtRows = selectedArtIds.map((id) => placedArtById.get(id)!);

    const sanitizedName =
      snapshot.binderRow.name.replace(/[^A-Za-z0-9 _-]/g, '_').trim() || 'binder';
    const tempFilePath = join(tmpdir(), `art-pdf-export-${randomUUID()}.pdf`);

    try {
      await generateArtPrintPdf({
        outputPath: tempFilePath,
        art: selectedArtRows.map((row) => ({
          id: row.id,
          imagePath: join(imagesDirectory, row.normalizedStorageFilename ?? row.storageFilename),
          naturalWidth: row.pixelWidth,
          naturalHeight: row.pixelHeight,
          imageRotationDegrees: row.imageRotationDegrees as 0 | 90 | 180 | 270,
          focalX: fromTenThousandths(row.focalXTenThousandths),
          focalY: fromTenThousandths(row.focalYTenThousandths),
          scaleX: fromTenThousandths(row.scaleXTenThousandths),
          scaleY: fromTenThousandths(row.scaleYTenThousandths),
          // A null override falls back to the binder's own current border
          // setting at render time, matching `exports/pdf`'s identical
          // resolution above.
          borderColor: row.borderColor ?? snapshot.binderRow.borderColor,
          borderRadius: fromHundredths(
            row.borderRadiusHundredths ?? snapshot.binderRow.borderRadiusHundredths,
          ),
          borderWidth: fromHundredths(
            row.borderWidthHundredths ?? snapshot.binderRow.borderWidthHundredths,
          ),
          physicalWidthCm:
            row.widthSlots * fromHundredths(snapshot.binderRow.widthPerSlotHundredths) +
            fromHundredths(snapshot.binderRow.widthBaseHundredths),
          physicalHeightCm:
            row.heightSlots * fromHundredths(snapshot.binderRow.heightPerSlotHundredths) +
            fromHundredths(snapshot.binderRow.heightBaseHundredths),
        })),
        marginIn: ART_PRINT_PAGE_MARGIN_INCHES,
        gapIn: ART_PRINT_ITEM_GAP_INCHES,
        tileOverlapIn: ART_PRINT_TILE_OVERLAP_INCHES,
      });
    } catch (error) {
      if (existsSync(tempFilePath)) {
        try {
          unlinkSync(tempFilePath);
        } catch (cleanupError) {
          request.log.error(
            { err: cleanupError, path: tempFilePath },
            'Failed to remove a failed art PDF export temporary file.',
          );
        }
      }
      next(error);
      return;
    }

    response
      .status(200)
      .type('application/pdf')
      .set('Content-Disposition', `attachment; filename="${sanitizedName}-art.pdf"`);

    const readStream = createReadStream(tempFilePath);
    readStream.pipe(response);

    // Cleans up the temporary file once the response is done, matching
    // `exports/pdf`'s identical cleanup above.
    response.once('close', () => {
      if (!existsSync(tempFilePath)) return;
      try {
        unlinkSync(tempFilePath);
      } catch (cleanupError) {
        request.log.error(
          { err: cleanupError, path: tempFilePath },
          'Failed to remove a completed art PDF export temporary file.',
        );
      }
    });
  });

  // Story 37: exports the request's submitted card ids as a printable Card
  // List PDF, in the exact order submitted - the client (not this
  // route) already resolved the list's current search/sort/filter
  // state into that id order, mirroring `exports/art-pdf`'s
  // `selectedArtIds` contract above.
  router.post('/binders/:binderId/exports/cards-pdf', async (request, response, next) => {
    const { binderId } = request.params;
    const { cardIds } = request.body as { cardIds: string[] };

    // One transactionally consistent snapshot read, matching
    // `exports/art-pdf` above - `cardRows` is every one of this binder's
    // cards (placed and unplaced alike; the list includes both), so
    // the handler below can tell apart "id doesn't exist at all" from "id
    // exists but isn't in this binder" when validating `cardIds`.
    const snapshot = database.transaction((tx) => {
      const binderRow = tx.select().from(binders).where(eq(binders.id, binderId)).get() as
        BinderRow | undefined;
      if (!binderRow) return null;

      const cardRows = tx
        .select({
          id: cards.id,
          variation: cards.variation,
          storageFilename: cardImageAssets.storageFilename,
        })
        .from(cards)
        .innerJoin(cardImageAssets, eq(cards.imageAssetId, cardImageAssets.id))
        .where(eq(cards.binderId, binderId))
        .all();

      return { binderRow, cardRows };
    });

    if (!snapshot) {
      response.status(404).type('application/problem+json').json(notFoundProblem(binderId));
      return;
    }

    // Every submitted id must currently identify a card in this binder, and
    // the array must be non-empty, matching `exports/art-pdf`'s identical
    // validation above.
    const cardById = new Map(snapshot.cardRows.map((row) => [row.id, row]));
    if (cardIds.length === 0) {
      response
        .status(400)
        .type('application/problem+json')
        .json(badRequestProblem('cardIds must include at least one card id.'));
      return;
    }
    const unknownCardId = cardIds.find((id) => !cardById.has(id));
    if (unknownCardId !== undefined) {
      response
        .status(400)
        .type('application/problem+json')
        .json(
          badRequestProblem(`Card id "${unknownCardId}" does not identify a card in this binder.`),
        );
      return;
    }

    const selectedCardRows = cardIds.map((id) => cardById.get(id)!);

    const sanitizedName =
      snapshot.binderRow.name.replace(/[^A-Za-z0-9 _-]/g, '_').trim() || 'binder';
    const tempFilePath = join(tmpdir(), `cards-pdf-export-${randomUUID()}.pdf`);

    try {
      await generateCardsListPdf({
        outputPath: tempFilePath,
        cards: selectedCardRows.map((row) => ({
          variation: row.variation,
          imagePath: join(imagesDirectory, row.storageFilename),
        })),
      });
    } catch (error) {
      if (existsSync(tempFilePath)) {
        try {
          unlinkSync(tempFilePath);
        } catch (cleanupError) {
          request.log.error(
            { err: cleanupError, path: tempFilePath },
            'Failed to remove a failed cards PDF export temporary file.',
          );
        }
      }
      next(error);
      return;
    }

    response
      .status(200)
      .type('application/pdf')
      .set('Content-Disposition', `attachment; filename="${sanitizedName}-cards.pdf"`);

    const readStream = createReadStream(tempFilePath);
    readStream.pipe(response);

    // Cleans up the temporary file once the response is done, matching
    // `exports/art-pdf`'s identical cleanup above.
    response.once('close', () => {
      if (!existsSync(tempFilePath)) return;
      try {
        unlinkSync(tempFilePath);
      } catch (cleanupError) {
        request.log.error(
          { err: cleanupError, path: tempFilePath },
          'Failed to remove a completed cards PDF export temporary file.',
        );
      }
    });
  });
}
