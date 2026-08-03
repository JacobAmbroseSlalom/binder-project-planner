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
