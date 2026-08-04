// Pure physical-page/spread math shared by the frontend's "Edit Layout" tab
// (story 8) and the backend's binder-list preview embedding (story 20,
// "the binder stores previewPhysicalPage ... and resolves it to the same
// single page or two-page spread as layout navigation"). Kept
// framework-free so both apps can import it without pulling in Next.js or
// Express dependencies.
//
// Terminology (see docs/planning.md stories 8-9): a binder with `pages`
// stored pages has one-based physical pages numbered `1` through
// `2 * pages` (each stored page has a front and back). Physical pages are
// grouped into "displayed pages"/"spreads": the first spread shows only
// physical page 1 (the binder's right side), the last spread shows only
// the final physical page (the binder's left side), and every spread in
// between shows an even left page paired with the following odd right
// page.

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

// The total number of card slots a binder contains (story 22: "Show binder
// completion metrics"). Each of the binder's `2 * storedPages` physical
// pages is a `width * height` grid, so the total is
// `width * height * getMaxPhysicalPage(storedPages)`. Shared so the backend
// summary aggregation and any client-side display agree on one definition.
export function getTotalSlots(width: number, height: number, storedPages: number): number {
  return width * height * getMaxPhysicalPage(storedPages);
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

// The human-readable label for a spread (story 9): a single-sided spread
// (the binder's first or last) reads as "Page N", and a two-sided spread
// reads as "Pages L–R" using its even left page and odd right page. Story
// 29 (export a binder as a PDF) reuses this so each generated PDF page's
// label matches the layout tab's own labels exactly.
export function getSpreadLabel(spread: BinderSpread): string {
  if (spread.left === null) return `Page ${spread.right}`;
  if (spread.right === null) return `Page ${spread.left}`;
  return `Pages ${spread.left}\u2013${spread.right}`;
}

// Every displayed spread for a binder with `storedPages` stored pages, in
// display order (story 29: the PDF exporter renders one page per spread,
// front to back, and needs the complete list up front rather than walking
// physical pages one at a time like the interactive layout tab does).
export function listBinderSpreads(storedPages: number): BinderSpread[] {
  const maxPhysicalPage = getMaxPhysicalPage(storedPages);
  const spreads: BinderSpread[] = [];
  for (let physicalPage = 1; physicalPage <= maxPhysicalPage; physicalPage++) {
    const spread = resolveSpread(physicalPage, maxPhysicalPage);
    spreads.push(spread);
    // Advance past this spread's right page too when it has one so a
    // two-page spread isn't pushed twice for both of its physical pages.
    if (spread.right !== null) physicalPage = spread.right;
  }
  return spreads;
}
