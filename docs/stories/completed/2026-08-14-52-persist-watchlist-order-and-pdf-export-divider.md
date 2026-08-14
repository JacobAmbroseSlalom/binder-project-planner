# 52. Persist What I'm Looking For order and add a movable PDF export divider

**Status:** Done (2026-08-14 18:11 EDT)

> **Note:** This story revises two decisions Story 45 ("What I'm looking for section")
> already confirmed and shipped:
>
> - Story 45: "The manually dragged order is never persisted to the backend — it
>   exists only in the current page load." This story reverses that — the order is now
>   saved server-side.
> - The later, already-shipped PDF export 40-entry cap (a fixed `WATCHLIST_PDF_MAX_ENTRIES`
>   constant, shown as a plain divider line with a hover title, added directly during
>   Story 45's own implementation) becomes a movable, persisted row instead of a fixed,
>   informational-only line.
>
> Story 45's file itself is left as-is (it's `Done`, and later stories keep citing its
> confirmed contracts) — this story's own file is the record of what changed and why.

#### Acceptance criteria

- The What I'm Looking For list's row order (drag-and-drop reordering) is saved to the
  backend, so it survives a page reload — replacing Story 45's client-only, "lost on
  reload" manual order.
- A PDF export divider is added to the list as an actual row (not just a hover-title
  cutoff line), displaying its own text directly in the row: "Only cards above this
  line are included in the PDF export."
- The divider defaults to right after the 40th entry, or after the last entry if the
  list has 40 or fewer entries.
- The divider can be dragged up or down among the entries, the same as reordering any
  other row. Moving it changes how many entries are included in the PDF export; it
  never adds, removes, or otherwise changes any entry itself.
- Entries can also be dragged across the divider (from below it to above it, or the
  reverse). If dragging an entry above the divider would put more than 40 entries
  above it, the divider automatically moves down by one position so no more than 40
  entries are ever above it.
- Only the entries currently above the divider are included when exporting the PDF.
- While a column sort or an active search/filter changes which entries are visible or
  their displayed order, dragging is disabled entirely (neither entries nor the
  divider can be moved) — mirrors Story 45's "selecting a column sort discards the
  manual order," but now extended to cover the search bar too, and disables dragging
  outright instead of just discarding the order afterward.
  - While filtered/sorted with more than 40 matching entries, a cutoff line is still
    shown after the 40th matching entry so the export's effect is visible, but this
    line is a plain, non-draggable indicator — not the same draggable divider above.

#### Technical requirements

- `WatchlistEntry` gains a `sortOrder` integer column. A drag-and-drop reorder
  renumbers every entry's `sortOrder` sequentially (`0..n-1`) in one request, rather
  than a gap-based/fractional scheme — this list is a personal collection, not
  expected to reach a size where full renumbering is a performance concern.
- The divider's position is stored separately from `WatchlistEntry.sortOrder` as a
  single global `pdfExportCutoffCount` value (how many entries currently sit above
  the divider), not as a row sharing the entries' own order space. Reading the list
  computes the divider's on-screen position by taking the entries in `sortOrder` and
  splitting after this many.
- `pdfExportCutoffCount` is stored as a row in the existing `appMetadata` key/value
  table (this is that table's first real use — it was defined but previously unread
  and unwritten by any route).
- Reordering (moving an entry or the divider) is a single `PATCH /watchlist-entries/order`
  request sending the complete new arrangement — `{ orderedEntryIds: string[],
pdfExportCutoffCount: number }` — on every drag-drop. The backend renumbers every
  entry's `sortOrder` to match and updates `pdfExportCutoffCount` in one transaction.
  At this list's realistic scale (a personal collection, not thousands of entries)
  a full-order replace on each drop is simpler than discrete move endpoints and has
  no meaningful performance cost.
- The `PATCH /watchlist-entries/order` request is rejected (400) if the client-sent
  `pdfExportCutoffCount` exceeds `WATCHLIST_PDF_MAX_ENTRIES` — dragging an entry above
  the line is expected to auto-adjust the divider down on the frontend before the
  request is ever sent, never to ask the backend to accept more than 40 above it.
- Deleting an entry (remove, or mark-acquired-and-remove) never decrements
  `pdfExportCutoffCount` to compensate — the stored count is left exactly as-is,
  so the same number of cards stay above the divider (and in the export) whenever
  that many entries still exist. It's only clamped down to the new, smaller
  `totalEntryCount` in the rare case removing an entry would otherwise leave the
  divider pointing past the end of the (now shorter) list.
- Adding a new entry appends it at the end of `sortOrder`. Whether it lands above or
  below the divider depends on the divider's current position: if the divider was
  already sitting at the true end of the list (`pdfExportCutoffCount ===
totalEntryCount`, i.e. every existing entry was above it) and adding one more entry
  wouldn't exceed `WATCHLIST_PDF_MAX_ENTRIES`, the new entry is inserted above the
  divider too (`pdfExportCutoffCount` increments by 1, keeping the divider trailing
  at the end). Otherwise — the user has manually moved the divider up so entries
  already exist below it, or the list is already at the 40-entry cap — the new entry
  is appended below the divider and `pdfExportCutoffCount` is left unchanged.
- While a column sort or an active search/filter is applied, the "not movable" cutoff
  line is computed purely on the frontend, independent of the persisted
  `pdfExportCutoffCount`: take the currently visible entries in their sorted/filtered
  order and, if there are more than `WATCHLIST_PDF_MAX_ENTRIES` of them, render a
  plain non-draggable line after the 40th visible one. It never reads or writes
  `pdfExportCutoffCount`. Exporting while filtered/sorted sends exactly those first
  40 visible entries (matching Story 45's existing "filtered entries only" export
  rule), not whichever entries happen to be above the persisted divider.
- `GET /watchlist-entries` gains a top-level `pdfExportCutoffCount` field alongside
  its existing `entries` array, and each entry gains its `sortOrder` field. When no
  column sort is active, entries are returned (and rendered) ordered by `sortOrder`
  ascending — replacing whatever implicit fallback ordering (e.g. `createdAt`) the
  route currently uses. The frontend derives the divider row's position by counting
  `pdfExportCutoffCount` entries down from the top of that list.
- `POST /watchlist-entries/exports/pdf`'s entry-id list now comes from one of two
  sources depending on view state: with no column sort or search/filter active, the
  frontend sends the first `pdfExportCutoffCount` entries in persisted `sortOrder`
  (replacing today's hardcoded `WATCHLIST_PDF_MAX_ENTRIES` slice); while sorted or
  filtered, it instead sends the first `min(WATCHLIST_PDF_MAX_ENTRIES, visibleCount)`
  currently-visible entries, per the filtered/sorted rule above. The backend route's
  existing server-side `WATCHLIST_PDF_MAX_ENTRIES` truncation stays as a defensive
  fallback either way.
- `PATCH /watchlist-entries/order` validates that `orderedEntryIds` is exactly a
  reordering of the full current entry-id set (same length, no duplicates, no unknown
  or missing ids) before applying it, returning a 400 problem response (matching this
  route file's existing `problem()` helper pattern) if it doesn't match.
