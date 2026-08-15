// A validated `#RRGGBB` hex color (case-insensitive input; OpenAPI's
// `pattern` already enforces this shape, this is a defense-in-depth
// re-check before normalizing to uppercase for storage).
export const HEX_COLOR_PATTERN = /^#[0-9A-Fa-f]{6}$/;

// Story 24's cross-field dimension/style validation, applied on both
// create and update: OpenAPI's schema already enforces each field's own
// range, but "base may be negative only when the one-slot formula stays
// positive" spans two fields and can't be expressed as a JSON Schema
// constraint, so it's re-checked here (and, belt-and-suspenders, by a
// database check constraint). Returns a Problem Details `detail` message
// describing the first violation found, or `null` when the combination is
// valid.
export function validateDimensionFields(fields: {
  widthPerSlot: number;
  widthBase: number;
  heightPerSlot: number;
  heightBase: number;
}): string | null {
  if (fields.widthPerSlot <= 0) {
    return 'widthPerSlot must be greater than zero.';
  }
  if (fields.heightPerSlot <= 0) {
    return 'heightPerSlot must be greater than zero.';
  }
  if (fields.widthPerSlot + fields.widthBase <= 0) {
    return 'The one-slot width (widthPerSlot + widthBase) must be greater than zero.';
  }
  if (fields.heightPerSlot + fields.heightBase <= 0) {
    return 'The one-slot height (heightPerSlot + heightBase) must be greater than zero.';
  }
  return null;
}

// better-sqlite3 throws a `SqliteError` with a `.code` of
// `SQLITE_CONSTRAINT_UNIQUE` (among other `SQLITE_CONSTRAINT_*` codes) when an
// insert violates a unique constraint. Checking the code (rather than
// select-then-insert) avoids a check-then-act race between concurrent
// requests for the same normalized binder name.
export function isUniqueConstraintError(error: unknown): boolean {
  return (
    error instanceof Error &&
    'code' in error &&
    (error as { code?: unknown }).code === 'SQLITE_CONSTRAINT_UNIQUE'
  );
}
