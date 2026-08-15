import type { NullablePlacement } from './types.js';

// A validated `#RRGGBB` hex color (case-insensitive input, uppercased for
// storage), mirroring routes/binders/validation.ts's own `HEX_COLOR_PATTERN`.
export const HEX_COLOR_PATTERN = /^#[0-9A-Fa-f]{6}$/;

// Validates a `PATCH /art/{artId}` movement's `finalPlacement` (story 26),
// mirroring routes/cards/placementValidation.ts's `validateMovePlacement`
// but additionally checking that the art's whole footprint (not just its
// top-left anchor) fits within the binder's current bounds.
export function validateArtPlacement(
  placement: NullablePlacement,
  widthSlots: number,
  heightSlots: number,
  binder: { width: number; height: number; pages: number },
): string | null {
  const { physicalPage, row, column } = placement;
  const suppliedCount = [physicalPage, row, column].filter((value) => value !== null).length;
  if (suppliedCount === 0) return null;
  if (suppliedCount < 3) {
    return 'An art placement must include a complete physical page, row, and column, or none of them.';
  }

  const maxPhysicalPage = binder.pages * 2;
  if (physicalPage! < 1 || physicalPage! > maxPhysicalPage) {
    return `physicalPage must be between 1 and ${maxPhysicalPage}.`;
  }
  if (row! < 1 || row! + heightSlots - 1 > binder.height) {
    return `The art's ${heightSlots}-row footprint must fit within the binder's ${binder.height}-row height.`;
  }
  if (column! < 1 || column! + widthSlots - 1 > binder.width) {
    return `The art's ${widthSlots}-column footprint must fit within the binder's ${binder.width}-column width.`;
  }
  return null;
}

// better-sqlite3 surfaces unique-constraint violations as a `SqliteError`
// with `.code === 'SQLITE_CONSTRAINT_UNIQUE'`; mirrors
// routes/cards/imageAssets.ts's own helper.
export function isUniqueConstraintError(error: unknown): boolean {
  return (
    error instanceof Error &&
    'code' in error &&
    (error as { code?: unknown }).code === 'SQLITE_CONSTRAINT_UNIQUE'
  );
}
