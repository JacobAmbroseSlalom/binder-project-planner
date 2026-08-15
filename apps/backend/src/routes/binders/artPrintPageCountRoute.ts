import {
  ART_PRINT_ITEM_GAP_INCHES,
  ART_PRINT_PAGE_MARGIN_INCHES,
  ART_PRINT_TILE_OVERLAP_INCHES,
} from '@binder-project-planner/shared';
import { and, eq, isNotNull, sql } from 'drizzle-orm';
import type { Router } from 'express';

import { art, binders } from '../../database/schema.js';
import { computeArtPrintPacking } from '../../pdf/artPrintPdf.js';

import { fromHundredths, notFoundProblem } from './serialization.js';
import type { BinderRow, BindersRouteDeps } from './types.js';

// Story 34: returns only the computed page count for this binder's
// currently placed multi-slot art, reusing the exact same packing/tiling
// logic as story 30's print-art PDF export (routes/binders/exportRoutes.ts)
// rather than generating one - the Finances tab's Printing/Holographic
// Paper/time-cost calculations all depend on this number. Read-only and
// never restricted by lock state, matching the export routes.
//
// The page count is cached on the binder row (`cachedArtPrintPageCount`)
// alongside a lightweight signature - the placed-art row count, the max
// `updatedAt` across those rows, and the binder's own `updatedAt` - and
// only recomputed when that signature no longer matches what's cached,
// rather than invalidating the cache at every mutation site that could
// change placed-art footprints or binder dimensions.
export function registerArtPrintPageCountRoute(router: Router, deps: BindersRouteDeps): void {
  const { database } = deps;

  router.get('/binders/:binderId/art-print-page-count', (request, response) => {
    const { binderId } = request.params;

    const binderRow = database.select().from(binders).where(eq(binders.id, binderId)).get() as
      BinderRow | undefined;
    if (!binderRow) {
      response.status(404).type('application/problem+json').json(notFoundProblem(binderId));
      return;
    }

    const signature = database
      .select({
        placedArtCount: sql<number>`count(*)`,
        maxUpdatedAt: sql<string | null>`max(${art.updatedAt})`,
      })
      .from(art)
      .where(and(eq(art.binderId, binderId), isNotNull(art.physicalPage)))
      .get()!;

    const cacheMatches =
      binderRow.cachedArtPrintPageCount !== null &&
      binderRow.cachedArtPrintPlacedArtCount === signature.placedArtCount &&
      binderRow.cachedArtPrintMaxArtUpdatedAt === signature.maxUpdatedAt &&
      binderRow.cachedArtPrintBinderUpdatedAt === binderRow.updatedAt;

    if (cacheMatches) {
      response.status(200).json({ pageCount: binderRow.cachedArtPrintPageCount });
      return;
    }

    const placedArtRows = database
      .select({
        id: art.id,
        widthSlots: art.widthSlots,
        heightSlots: art.heightSlots,
      })
      .from(art)
      .where(and(eq(art.binderId, binderId), isNotNull(art.physicalPage)))
      .all();

    const { pageCount } = computeArtPrintPacking(
      placedArtRows.map((row) => ({
        id: row.id,
        physicalWidthCm:
          row.widthSlots * fromHundredths(binderRow.widthPerSlotHundredths) +
          fromHundredths(binderRow.widthBaseHundredths),
        physicalHeightCm:
          row.heightSlots * fromHundredths(binderRow.heightPerSlotHundredths) +
          fromHundredths(binderRow.heightBaseHundredths),
      })),
      {
        marginIn: ART_PRINT_PAGE_MARGIN_INCHES,
        gapIn: ART_PRINT_ITEM_GAP_INCHES,
        tileOverlapIn: ART_PRINT_TILE_OVERLAP_INCHES,
      },
    );

    database
      .update(binders)
      .set({
        cachedArtPrintPageCount: pageCount,
        cachedArtPrintPlacedArtCount: signature.placedArtCount,
        cachedArtPrintMaxArtUpdatedAt: signature.maxUpdatedAt,
        cachedArtPrintBinderUpdatedAt: binderRow.updatedAt,
      })
      .where(eq(binders.id, binderId))
      .run();

    response.status(200).json({ pageCount });
  });
}
