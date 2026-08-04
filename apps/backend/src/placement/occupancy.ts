import { and, eq, isNotNull } from 'drizzle-orm';

import type { DatabaseConnection } from '../database/client.js';
import { art, cards } from '../database/schema.js';

// One occupied cell on a binder's physical page, and what occupies it -
// used by story 26's move/placement validation to give a precise conflict
// reason (a card vs. another art item) rather than a generic "occupied"
// message.
export interface OccupiedCell {
  row: number;
  column: number;
  occupiedBy: 'card' | 'art';
  // The occupying card or art item's id, so a move that targets its own
  // current footprint can exclude itself (see `excludeCardId`/
  // `excludeArtId` below).
  occupantId: string;
}

// Computes every occupied cell (by a card or by placed multi-slot art) on
// one binder's physical page (story 26: "Every slot covered by placed
// multi-slot art is considered occupied"). Multi-slot art's footprint is
// derived from its saved top-left (row, column) anchor plus its
// widthSlots/heightSlots, matching the same derivation the frontend uses
// for display. `excludeCardId`/`excludeArtId` omit one item's own current
// footprint from the result - used when validating a move so an item
// dropped back onto (part of) its own current position isn't reported as
// a conflict with itself.
export function getOccupiedCells(
  database: DatabaseConnection['database'],
  binderId: string,
  physicalPage: number,
  options?: { excludeCardId?: string; excludeArtId?: string },
): OccupiedCell[] {
  const cellsByKey = new Map<string, OccupiedCell>();

  const cardRows = database
    .select()
    .from(cards)
    .where(and(eq(cards.binderId, binderId), eq(cards.physicalPage, physicalPage)))
    .all();
  for (const cardRow of cardRows) {
    if (options?.excludeCardId && cardRow.id === options.excludeCardId) continue;
    if (cardRow.row === null || cardRow.column === null) continue;
    cellsByKey.set(`${cardRow.row}-${cardRow.column}`, {
      row: cardRow.row,
      column: cardRow.column,
      occupiedBy: 'card',
      occupantId: cardRow.id,
    });
  }

  const artRows = database
    .select()
    .from(art)
    .where(and(eq(art.binderId, binderId), eq(art.physicalPage, physicalPage)))
    .all();
  for (const artRow of artRows) {
    if (options?.excludeArtId && artRow.id === options.excludeArtId) continue;
    if (artRow.row === null || artRow.column === null) continue;
    for (let r = artRow.row; r < artRow.row + artRow.heightSlots; r++) {
      for (let c = artRow.column; c < artRow.column + artRow.widthSlots; c++) {
        cellsByKey.set(`${r}-${c}`, {
          row: r,
          column: c,
          occupiedBy: 'art',
          occupantId: artRow.id,
        });
      }
    }
  }

  return [...cellsByKey.values()];
}

// Counts every occupied slot across a binder's entire layout (story 22:
// "Show binder completion metrics"). A slot is occupied when it holds a
// placed card or is covered by a placed multi-slot-art footprint; overlaps
// and unplaced items (null placement) never count. Unlike `getOccupied
// Cells`, which queries one physical page at a time, this issues a single
// query each for the binder's placed cards and placed art and dedupes
// across all physical pages in one pass, so building a binder summary
// doesn't fan out into one query per physical page.
export function countOccupiedSlots(
  database: DatabaseConnection['database'],
  binderId: string,
): number {
  // Distinct occupied cells, keyed by physical page + coordinate so the
  // same (row, column) on different pages is counted once per page, and
  // overlapping card/art coverage on one page is counted once.
  const occupied = new Set<string>();

  const placedCards = database
    .select({ physicalPage: cards.physicalPage, row: cards.row, column: cards.column })
    .from(cards)
    .where(and(eq(cards.binderId, binderId), isNotNull(cards.physicalPage)))
    .all();
  for (const card of placedCards) {
    // `isNotNull(physicalPage)` plus the all-or-none placement check
    // guarantees row/column are also non-null here, but guard anyway.
    if (card.physicalPage === null || card.row === null || card.column === null) continue;
    occupied.add(`${card.physicalPage}-${card.row}-${card.column}`);
  }

  const placedArt = database
    .select({
      physicalPage: art.physicalPage,
      row: art.row,
      column: art.column,
      widthSlots: art.widthSlots,
      heightSlots: art.heightSlots,
    })
    .from(art)
    .where(and(eq(art.binderId, binderId), isNotNull(art.physicalPage)))
    .all();
  for (const item of placedArt) {
    if (item.physicalPage === null || item.row === null || item.column === null) continue;
    for (let r = item.row; r < item.row + item.heightSlots; r++) {
      for (let c = item.column; c < item.column + item.widthSlots; c++) {
        occupied.add(`${item.physicalPage}-${r}-${c}`);
      }
    }
  }

  return occupied.size;
}

// Every (row, column) cell covered by one art item's footprint, anchored
// at its saved (or a proposed) top-left position - used both to compute an
// art item's own current coverage and to validate a proposed destination
// before it's saved.
export function getArtFootprintCells(
  anchor: { row: number; column: number },
  widthSlots: number,
  heightSlots: number,
): { row: number; column: number }[] {
  const cells: { row: number; column: number }[] = [];
  for (let r = anchor.row; r < anchor.row + heightSlots; r++) {
    for (let c = anchor.column; c < anchor.column + widthSlots; c++) {
      cells.push({ row: r, column: c });
    }
  }
  return cells;
}
