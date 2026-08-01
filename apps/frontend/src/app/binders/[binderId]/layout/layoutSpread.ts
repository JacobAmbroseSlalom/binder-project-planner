// Pure physical-page/spread math for the "Edit Layout" tab (story 8). Kept
// framework-free and colocated with the layout route so it has no
// dependency on React/Next.js.
//
// Terminology (see planning.md stories 8-9): a binder with `pages` stored
// pages has one-based physical pages numbered `1` through `2 * pages`
// (each stored page has a front and back). Physical pages are grouped into
// "displayed pages"/"spreads": the first spread shows only physical page 1
// (the binder's right side), the last spread shows only the final physical
// page (the binder's left side), and every spread in between shows an
// even left page paired with the following odd right page. That's why a
// binder with `pages` stored pages has `pages + 1` displayed spreads.

// One displayed spread: a `left` and/or `right` one-based physical page.
// The first spread has `left: null` (right side only) and the last spread
// has `right: null` (left side only); every other spread has both.
export interface BinderSpread {
  left: number | null;
  right: number | null;
}

// The highest valid one-based physical page for a binder with
// `storedPages` stored pages.
export function getMaxPhysicalPage(storedPages: number): number {
  return storedPages * 2;
}

// Resolves which spread a given physical page belongs to. `physicalPage` is
// expected to already be an integer within `[1, maxPhysicalPage]`;
// out-of-range input is clamped defensively to the nearest boundary spread
// rather than throwing.
export function resolveSpread(physicalPage: number, maxPhysicalPage: number): BinderSpread {
  if (physicalPage <= 1) return { left: null, right: 1 };
  if (physicalPage >= maxPhysicalPage) return { left: maxPhysicalPage, right: null };

  // Every intermediate spread pairs an even left page with the following
  // odd right page, so either physical page number in the pair resolves to
  // the same spread (story 8's "either page in a two-page spread displays
  // that spread").
  const left = physicalPage % 2 === 0 ? physicalPage : physicalPage - 1;
  return { left, right: left + 1 };
}

// The physical page the right/next arrow navigates to: the left page of
// the next spread, or the single last physical page at the binder's final
// boundary (story 9's technical requirement for the shared arrow controls).
export function getNextPhysicalPage(physicalPage: number, maxPhysicalPage: number): number {
  const spread = resolveSpread(physicalPage, maxPhysicalPage);
  if (spread.right === null) return physicalPage; // already the last spread; the right arrow is disabled here

  const nextLeft = spread.right + 1;
  return nextLeft >= maxPhysicalPage ? maxPhysicalPage : nextLeft;
}

// The physical page the left/previous arrow navigates to: the right page
// of the previous spread, or the single first physical page at the
// binder's starting boundary.
export function getPreviousPhysicalPage(physicalPage: number, maxPhysicalPage: number): number {
  const spread = resolveSpread(physicalPage, maxPhysicalPage);
  if (spread.left === null) return physicalPage; // already the first spread; the left arrow is disabled here

  const previousRight = spread.left - 1;
  return previousRight <= 1 ? 1 : previousRight;
}

// The human-readable label for a spread (story 9): a single-sided spread
// (the binder's first or last) reads as "Page N", and a two-sided spread
// reads as "Pages L–R" using its even left page and odd right page.
export function getSpreadLabel(spread: BinderSpread): string {
  if (spread.left === null) return `Page ${spread.right}`;
  if (spread.right === null) return `Page ${spread.left}`;
  return `Pages ${spread.left}\u2013${spread.right}`;
}

// The result of resolving the layout route's `page` query parameter.
export interface ResolvedPhysicalPage {
  // The physical page to display.
  physicalPage: number;
  // Set when the URL needs to be replaced with this physical page - either
  // because the raw query value was missing/malformed/out-of-range (falls
  // back to `1`), or because a retained focal page from a previous visit to
  // this tab needs to be restored. `undefined` means the URL already
  // matches what should be displayed and needs no change.
  replacementPage: number | undefined;
}

// Resolves the layout route's `page` query parameter (story 8):
// - A missing parameter with no retained focal page defaults to physical
//   page 1 without adding the parameter to the URL.
// - A missing parameter with a retained focal page (from a prior visit to
//   this tab during the current binder route mount) restores that page
//   into the URL.
// - A malformed, non-integer, or out-of-range value is replaced with `1`.
// - A valid value is used as-is, including either page of a two-page
//   spread, without rewriting it to its other page.
export function resolvePhysicalPageParam(
  rawPage: string | null,
  maxPhysicalPage: number,
  retainedFocalPage: number | null,
): ResolvedPhysicalPage {
  if (rawPage === null) {
    if (retainedFocalPage !== null) {
      return { physicalPage: retainedFocalPage, replacementPage: retainedFocalPage };
    }
    return { physicalPage: 1, replacementPage: undefined };
  }

  const parsed = Number(rawPage);
  // Round-tripping through `String()` rejects non-canonical numeric forms
  // (e.g. "1.0", "01", "1e0") in addition to `NaN` from non-numeric input.
  const isValidInteger = Number.isInteger(parsed) && String(parsed) === rawPage;
  const isInRange = isValidInteger && parsed >= 1 && parsed <= maxPhysicalPage;

  if (isInRange) {
    return { physicalPage: parsed, replacementPage: undefined };
  }

  return { physicalPage: 1, replacementPage: 1 };
}

// Parses and validates the direct page-number input's committed value
// (story 9): the HTML number input's raw string value must be a
// non-empty integer within `[1, maxPhysicalPage]`. Returns `null` for an
// empty, non-integer, or out-of-range value so the caller can reject the
// submission, show the shared failed toast, and reset the input rather
// than navigating.
export function parsePhysicalPageInput(rawValue: string, maxPhysicalPage: number): number | null {
  const trimmed = rawValue.trim();
  if (trimmed === '') return null;

  const parsed = Number(trimmed);
  // Round-tripping through `String()` rejects non-canonical numeric forms
  // (e.g. "1.5", "1e0") in addition to `NaN` from non-numeric input.
  const isValidInteger = Number.isInteger(parsed) && String(parsed) === trimmed;
  if (!isValidInteger || parsed < 1 || parsed > maxPhysicalPage) return null;

  return parsed;
}
