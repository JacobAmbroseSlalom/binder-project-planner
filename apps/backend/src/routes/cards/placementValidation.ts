import type { DatabaseConnection } from '../../database/client.js';
import { getOccupiedCells } from '../../placement/occupancy.js';

import type { CreateCustomCardRequestBody, NullablePlacement } from './types.js';

export function validatePlacement(
  placement: { physicalPage: number | null; row: number | null; column: number | null },
  binder: { width: number; height: number; pages: number },
): string | null {
  const { physicalPage, row, column } = placement;
  const maxPhysicalPage = binder.pages * 2;

  if (physicalPage === null || row === null || column === null) {
    return 'A card assignment must include a complete physical page, row, and column.';
  }
  if (physicalPage < 1 || physicalPage > maxPhysicalPage) {
    return `physicalPage must be between 1 and ${maxPhysicalPage}.`;
  }
  if (row < 1 || row > binder.height) {
    return `row must be between 1 and ${binder.height}.`;
  }
  if (column < 1 || column > binder.width) {
    return `column must be between 1 and ${binder.width}.`;
  }
  return null;
}

// Story 26: rejects a card placement that would land on a slot covered by
// placed multi-slot art (planning.md: "Cards and other multi-slot art
// cannot be placed in any slot occupied by multi-slot art"). A fully-null
// placement (the unplaced section) never conflicts, since it isn't a real
// slot.
export function findArtOccupancyConflict(
  database: DatabaseConnection['database'],
  binderId: string,
  placement: NullablePlacement,
): string | null {
  if (placement.physicalPage === null || placement.row === null || placement.column === null) {
    return null;
  }
  const occupied = getOccupiedCells(database, binderId, placement.physicalPage);
  const blocked = occupied.some(
    (cell) =>
      cell.row === placement.row && cell.column === placement.column && cell.occupiedBy === 'art',
  );
  return blocked ? 'The destination slot is occupied by multi-slot art.' : null;
}

// A relaxed variant of `validatePlacement` for custom-card requests (story
// 12): unlike TCGdex assignment (always fully placed from a real slot
// click), a custom card may be created unplaced by omitting all three
// placement fields from the multipart body (story 15's future
// unplaced-cards section). Supplying only some of the three is rejected as
// malformed input rather than silently treated as either state.
export function resolveCustomCardPlacement(
  body: CreateCustomCardRequestBody,
  binder: { width: number; height: number; pages: number },
):
  | { placement: { physicalPage: number | null; row: number | null; column: number | null } }
  | { error: string } {
  const { physicalPage, row, column } = body;
  const suppliedCount = [physicalPage, row, column].filter((value) => value !== undefined).length;

  if (suppliedCount === 0) {
    return { placement: { physicalPage: null, row: null, column: null } };
  }
  if (suppliedCount < 3) {
    return {
      error:
        'A card placement must include a complete physical page, row, and column, or none of them.',
    };
  }

  const placementError = validatePlacement(
    { physicalPage: physicalPage!, row: row!, column: column! },
    binder,
  );
  if (placementError) {
    return { error: placementError };
  }
  return { placement: { physicalPage: physicalPage!, row: row!, column: column! } };
}

// Validates a `PATCH /cards/{cardId}` update's `finalPlacement` (story 14).
// A fully-null triple (story 15's future unplaced section) is always valid;
// a fully-populated triple must fall within the binder's current bounds;
// anything mixed (some but not all 3 fields null) is malformed input. This
// mirrors `resolveCustomCardPlacement`'s all-or-none rule, but operates on
// an already-typed nullable triple rather than raw optional request-body
// fields.
export function validateMovePlacement(
  placement: NullablePlacement,
  binder: { width: number; height: number; pages: number },
): string | null {
  const { physicalPage, row, column } = placement;
  const suppliedCount = [physicalPage, row, column].filter((value) => value !== null).length;

  if (suppliedCount === 0) return null;
  if (suppliedCount < 3) {
    return 'A card placement must include a complete physical page, row, and column, or none of them.';
  }
  return validatePlacement({ physicalPage, row, column }, binder);
}

// Thrown from inside the move/swap transaction (story 14) when an update's
// expected placement no longer matches the card's persisted placement; the
// route handler maps this to a `409 Conflict` Problem Details response and
// the transaction rolls back automatically.
export class MoveConflictError extends Error {}
