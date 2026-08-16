// Local-only value shapes for the Finances Preview page (story 54). Every
// value here starts out seeded from the real shared catalogs/settings on
// load, but nothing on this page is ever persisted back to the backend -
// selections, edits, and "+ Add new…" entries all live only in this page's
// own component state for the lifetime of the visit. These are deliberately
// slimmer than the real `BinderCostEntry`/`PrintingCostEntry`/
// `HolographicPaperCostEntry` API types (dropping `binderCount`/
// `createdAt`/`updatedAt`, which are meaningless for a page-local, possibly
// never-saved entry).

export interface PreviewBinderCostEntryOption {
  id: string;
  name: string;
  price: number;
  width: number;
  height: number;
  pages: number;
}

export interface PreviewPrintingCostEntryOption {
  id: string;
  name: string;
  pricePerPage: number;
}

export interface PreviewHolographicPaperCostEntryOption {
  id: string;
  name: string;
  price: number;
  pagesIncluded: number;
}

// One repeatable "Cards & Art" row: a cosmetic label plus a card count
// (kept as a string while editing, like the rest of this page's numeric
// fields, so an in-progress/invalid value doesn't get clobbered).
export interface CardCountRow {
  id: string;
  label: string;
  count: string;
}
