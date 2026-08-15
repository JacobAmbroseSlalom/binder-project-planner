import { and, asc, desc, eq, inArray } from 'drizzle-orm';

import type { DatabaseConnection } from '../../database/client.js';
import { art } from '../../database/schema.js';

import { fromHundredths, fromTenThousandths, serializeArt } from './serialization.js';
import type { ArtRow } from './types.js';

// Replaces the placeholder `[]`-returning implementation in
// routes/binders/: returns every binder-owned art item, placed and
// unplaced. Ordered by creation timestamp descending, then id ascending,
// matching listCardsForBinder's tie-breaking rule (story 25).
export function listArtForBinder(database: DatabaseConnection['database'], binderId: string) {
  return database
    .select()
    .from(art)
    .where(eq(art.binderId, binderId))
    .orderBy(desc(art.createdAt), asc(art.id))
    .all()
    .map(serializeArt);
}

// Story 20 ("Add a binder preview"): the multi-slot art placed within the
// binder list's embedded preview spread, narrowed to only the physical
// pages the resolved spread actually shows. Returns the minimal
// `BinderPreviewArt` placement/geometry/image shape rather than the
// complete `Art` row, deliberately excluding the art's own
// title/description/timestamps - the raw (still-nullable)
// borderColor/borderRadius/borderWidth overrides are passed through
// unresolved, same as `Art` itself, so the frontend resolves them against
// the binder's own style the same way it already does for the full layout.
export function listPlacedArtForPreview(
  database: DatabaseConnection['database'],
  binderId: string,
  physicalPages: number[],
) {
  if (physicalPages.length === 0) return [];

  return database
    .select()
    .from(art)
    .where(and(eq(art.binderId, binderId), inArray(art.physicalPage, physicalPages)))
    .all()
    .map((row) => {
      const typedRow = row as ArtRow;
      return {
        // `physicalPage`/`row`/`column` are guaranteed non-null here, same
        // reasoning as `listPlacedCardsForPreview`.
        physicalPage: typedRow.physicalPage as number,
        row: typedRow.row as number,
        column: typedRow.column as number,
        widthSlots: typedRow.widthSlots,
        heightSlots: typedRow.heightSlots,
        imageUrl: `/art/${typedRow.id}/image`,
        imageRotationDegrees: typedRow.imageRotationDegrees,
        focalX: fromTenThousandths(typedRow.focalXTenThousandths),
        focalY: fromTenThousandths(typedRow.focalYTenThousandths),
        scaleX: fromTenThousandths(typedRow.scaleXTenThousandths),
        scaleY: fromTenThousandths(typedRow.scaleYTenThousandths),
        borderColor: typedRow.borderColor,
        borderRadius:
          typedRow.borderRadiusHundredths === null
            ? null
            : fromHundredths(typedRow.borderRadiusHundredths),
        borderWidth:
          typedRow.borderWidthHundredths === null
            ? null
            : fromHundredths(typedRow.borderWidthHundredths),
      };
    });
}
