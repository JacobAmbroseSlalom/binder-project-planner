import { and, asc, desc, eq, inArray } from 'drizzle-orm';

import type { DatabaseConnection } from '../../database/client.js';
import { cards } from '../../database/schema.js';

import { serializeCard } from './serialization.js';

// Replaces the placeholder `[]`-returning implementation previously in
// routes/binders.ts, now split into routes/binders/updateRoute.ts and
// routes/binders/summary.ts: returns every binder-owned card, placed and
// unplaced.
// Ordered by creation timestamp descending, then id ascending as a
// deterministic tie-breaker (story 15: "Unplaced cards are ordered by
// creation timestamp descending and then card UUID ascending"). This order
// is harmless for placed cards - the layout tab looks them up by
// (physicalPage, row, column) rather than list position - and gives the
// unplaced-cards panel its required newest-first order directly from this
// one shared endpoint.
export function listCardsForBinder(database: DatabaseConnection['database'], binderId: string) {
  return database
    .select()
    .from(cards)
    .where(eq(cards.binderId, binderId))
    .orderBy(desc(cards.createdAt), asc(cards.id))
    .all()
    .map(serializeCard);
}

// Story 36: "Track card acquisition". Counts every card record (placed and
// unplaced) associated with the binder plus how many of them are acquired,
// for the home page's card-acquisition percentage metric. Multi-slot art
// lives in a separate `art` table entirely, so it's naturally excluded
// without any extra filtering here. Returns raw counts (rather than a
// pre-rounded percentage) so the client derives the rounded percentage and
// decides how to display a zero-card binder (`N/A`), matching story 22's
// existing slot-completion counts' own division of responsibility.
export function countCardAcquisition(
  database: DatabaseConnection['database'],
  binderId: string,
): { acquiredCards: number; totalCards: number } {
  const rows = database
    .select({ acquired: cards.acquired })
    .from(cards)
    .where(eq(cards.binderId, binderId))
    .all();

  return {
    acquiredCards: rows.filter((row) => row.acquired).length,
    totalCards: rows.length,
  };
}

// Story 20 ("Add a binder preview"): the cards placed within the binder
// list's embedded preview spread, narrowed to only the physical pages the
// resolved spread actually shows (a single page or a two-page spread).
// Returns the minimal `BinderPreviewCard` placement/image shape rather than
// the complete `Card` row - the preview data "contains only ... placed card
// and multi-slot-art geometry, display metadata, and image URLs" per
// planning.md's technical requirements, deliberately excluding the card's
// own name/set/variation/source/timestamps.
export function listPlacedCardsForPreview(
  database: DatabaseConnection['database'],
  binderId: string,
  physicalPages: number[],
) {
  if (physicalPages.length === 0) return [];

  return database
    .select({
      physicalPage: cards.physicalPage,
      row: cards.row,
      column: cards.column,
      id: cards.id,
    })
    .from(cards)
    .where(and(eq(cards.binderId, binderId), inArray(cards.physicalPage, physicalPages)))
    .all()
    .map((row) => ({
      // `physicalPage`/`row`/`column` are guaranteed non-null here: this
      // query only matches cards whose `physicalPage` is one of the
      // resolved spread's pages, and the `card_placement_all_or_none`-style
      // constraint (see schema.ts) guarantees row/column are set whenever
      // physicalPage is.
      physicalPage: row.physicalPage as number,
      row: row.row as number,
      column: row.column as number,
      imageUrl: `/cards/${row.id}/image`,
    }));
}
