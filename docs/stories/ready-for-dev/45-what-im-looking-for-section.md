# 45. What I'm looking for section

**Status:** Not started

#### Acceptance criteria

- A new "What I'm Looking For" page exists outside the scope of any specific binder,
  linked from a persistent control in the top right of the app's header bar (visible
  on every page, alongside the existing home link).
- The page shows a table of cards the user is currently looking for (e.g. at card
  shows), independent of any one binder.
- An "Add card" button opens the existing add-card modal (the same one used from a
  binder's Card List). A card added this way is **not** linked to any binder.
- A binder's Card List gains a new per-row action, "Add to What I'm Looking For",
  that adds that card to the What I'm Looking For list.
  - If that exact binder card is already on the What I'm Looking For list, the action
    is a no-op (skipped) rather than creating a duplicate entry.
  - A card added this way is a **reference** to the original binder card, not a copy:
    editing it from the What I'm Looking For list (e.g. its price) updates the same
    underlying card, and is reflected back on that card's binder Card List, and vice
    versa.
- The table's columns match the Card List's columns, minus Acquisition, plus this
  list's own action buttons ("Remove" and "Mark as acquired & remove", both below) —
  no additional data columns.
- The page includes the same financial totals, search, column filtering, and "Fetch
  card prices" behavior as the Card List (Story 38), plus the same column-based
  sorting **or** the new manual drag-and-drop reordering described below.
- The page has a print/export action producing a downloadable PDF (see the dedicated
  PDF requirements below).
- Every entry has a "Remove from What I'm Looking For" action, removing it from this
  list only.
  - For a card added directly via "Add card" (not linked to any binder), removing it
    deletes that card entirely, since nothing else references it.
  - For a card referencing a binder card, removing it only removes the reference; the
    original card is untouched on its binder's Card List.
- An entry that references a binder card additionally has a "Mark as acquired &
  remove" action: it sets that card's `acquired` state to `true` on its binder (Story 36) and removes the entry from the What I'm Looking For list in one action. A card
  added directly via "Add card" (not linked to any binder) has no acquired state and
  so has no equivalent action.
- Rows can be manually reordered via drag and drop, top to bottom, to reflect which
  cards are most important to find first. Dragging a row immediately reorders the
  visible table itself (not a hidden ordering applied only at export time).
  - The manually dragged order is never persisted to the backend — it exists only in
    the current page load.
  - Selecting a column's sort control, or reloading the page, discards the manual
    order (reverting to that column's sort, or the default sort, respectively).
  - The manual order (when set) determines the PDF's card order; otherwise the PDF
    follows the table's active column sort.

##### PDF export

- Selecting print/export produces a 2-page, US Letter **portrait** PDF (breaking
  from the Card List/binder-layout exports' landscape convention, per explicit
  request).
- The PDF includes only the currently filtered/searched entries (matching the Card
  List PDF export's own convention, Story 37) — not necessarily every entry on the
  list.
- Page 1 shows every included card's image. Images scale down as needed so every
  card fits on this single page; cards may overlap, covering up to the bottom half of
  the card behind, when needed to fit them all.
- Page 2 repeats the same grid position as page 1, listing each card's name and price
  instead of its image, so the two pages can be read side by side or back to back.
- Both pages arrange cards left-to-right, then top-to-bottom, in the manually
  dragged order when one is set, or the table's active column sort otherwise.

#### Technical requirements

- A new `WatchlistEntry` table stores every What I'm Looking For entry, both kinds,
  in one place, so the page reads and orders one table rather than merging two:
  - `id` (UUID)
  - `cardId` (UUID, nullable, foreign key to `cards.id`) — populated only for an
    entry that references an existing binder card; `null` for a standalone entry.
  - Standalone-only fields, populated only when `cardId` is `null` (mirroring the
    subset of `Card`'s own fields that make sense with no binder/placement/
    acquisition): `name`, `setName`, `localNumber`, `source`, `providerCardId`,
    `providerSetId`, `variation`, an owned `ImageAsset` reference, `price`,
    `isManualPrice`, `priceUpdatedAt`.
  - `createdAt` / `updatedAt`.
- Reading the list hydrates each row differently depending on `cardId`: a referenced
  entry (`cardId` set) displays and edits the **joined `Card` row's own fields**
  directly (so a price/variation edit here writes through to that same `Card` row via
  its existing binder-scoped endpoints, immediately visible on that card's binder
  Card List too); a standalone entry (`cardId` null) displays and edits its own
  columns on `WatchlistEntry` directly, through new endpoints scoped to this table
  instead of a binder.
- "Add to What I'm Looking For" from a binder's Card List only creates a new
  `WatchlistEntry` row when no existing row already has that exact `cardId` — an
  exact-match check, not a name/set/number heuristic, since `cardId` is a direct
  foreign key.
- "Remove from What I'm Looking For" always just deletes the `WatchlistEntry` row: for
  a referenced entry, the underlying `Card` row (and its binder Card List entry) is
  never touched; for a standalone entry, this is a complete deletion since nothing
  else points to that row (including its own `ImageAsset`, cleaned up the same way an
  unreferenced card's image already is).
- "Mark as acquired & remove" is only offered when `cardId` is set: it updates that
  card's `acquired` field to `true` through the existing acquisition mutation (Story 36) and deletes the `WatchlistEntry` row, ideally as one request so a partial
  failure can't leave the entry removed without the card actually marked acquired (or
  vice versa).
- A persistent link to the What I'm Looking For page is added to the shared
  `AppHeader` component (`apps/frontend/src/shared/navigation/AppHeader.tsx`),
  positioned at the top right of the bar — the only other content currently in that
  bar is the home link (left) and the current page's title (centered), so this is a
  new right-aligned element rather than a change to either of those.
- The manual drag-and-drop reorder reuses the project's existing `@dnd-kit/core`
  dependency (already used elsewhere for placement/reordering) rather than a new
  drag library.
- Manual order is tracked as client-only component state: an ordered list of entry
  ids, present only after the user has actually dragged a row. While unset, the table
  displays and prints in the active column-sort order (the existing Card List
  behavior, Story 37). Once set, it persists across search/filter changes (a filtered
  view simply shows the subset of that order matching the active search/filters), but
  is discarded — reverting to the active column sort — the moment the user clicks any
  column's sort control, or on page reload (nothing is written to the backend).
- The exact PDF layout algorithm (e.g. a fixed shrink-and-overlap step size, or a
  best-fit search) for packing every included card onto page 1 is left to
  implementation; the only fixed constraints are 2 pages, US Letter portrait, every
  included card fits on page 1 (allowing overlap), and page 2 mirrors page 1's grid
  positions with name + price text instead of images.
- Dragging a row reorders the table's rendered rows immediately (the same
  drag-and-drop pattern as the existing unplaced-items panel), not just a hidden
  ordering applied only at PDF export time.
