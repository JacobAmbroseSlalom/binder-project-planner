# 37. Add a card checklist

**Status:** Not started

#### Acceptance criteria

- The binder view/edit page has a "Card Checklist" tab.
- The checklist lists every card in the binder, including placed and unplaced cards.
- A progress tracker appears at the top of the checklist.
- The progress tracker displays the number of acquired cards, the total number of cards, and the percentage acquired.
- The progress tracker includes every card in the binder and is not changed by checklist search, sorting, or visibility controls.
- Changing a card's acquisition state immediately updates the progress tracker.
- The acquired-card percentage is also used as the binder's card-acquisition completion metric on the home page.
- When home-page completion metrics are visible, the card-acquisition percentage appears below the binder with its slot-completion metrics.
- Each checklist entry displays the card and whether it is acquired or unacquired.
- The acquisition state of a card can be changed from its checklist entry.
- Acquisition changes made from the checklist are saved to the database through the backend.
- The checklist has controls for sorting its cards.
- Selecting a sort option updates the order of the displayed checklist entries.
- The checklist has a search field for narrowing the displayed cards.
- Cards can be found by card name, set, number, or variation.
- Each sortable column (Name, Set, Number, and Acquisition) has its own filter control for narrowing the checklist to specific values in that column.
- Each column's filter control is a dropdown containing a multi-select list of that column's distinct values, a Select All and Deselect All action, a search field for narrowing the listed values, and a reset action that restores that column's filter to showing every value.
- Changing any column's filter immediately updates the displayed checklist entries.
- Search, sorting, and column filters can be used together.
- Clearing search and column filters restores all checklist entries while retaining the selected sort order.
- When no cards match the active search and filters, the checklist displays an empty-results state.
- The Card Checklist has an export action.
- Exporting creates a downloadable PDF checklist that is suitable for printing.
- The export includes only cards matching the checklist's active search and column filters.
- Exported cards appear in the checklist's selected sort order.
- Each exported entry includes only the card's image and variation.
- The export action is unavailable when no cards match the active search and filters.
- Card Checklist export remains available when the binder is locked.
- Acquisition changes use the shared save-status toast and restore the card's previous acquisition state if saving fails.

#### Technical requirements

- The Card Checklist tab reuses the already-loaded `cards` array from
  `BinderRouteContext` (the same data driving the Edit Layout tab); search, sorting, and
  acquisition-visibility filtering are computed entirely client-side, with no dedicated
  fetch for the tab.
- Sort options are a fixed set, one per sortable column, plus one combined option: Name,
  Set, Number, Set + Number (combined, the default), and Acquisition status; a Price
  option is deferred until Story 38 defines the card-price shape.
- Name, Set, Number, and Acquisition each have a clickable column header that toggles
  that column's sort direction: selecting an unselected column sorts ascending;
  clicking the currently sorted column again flips between ascending and descending
  (a simple two-state toggle, not a third "unsorted" state).
- A "Reset sort" button/link near the checklist controls returns sorting to the default
  Set + Number order; it is visible only when the current sort isn't already that
  default, since Set + Number has no single clickable column header of its own.
- Ascending order is Name A-Z, Set A-Z, Number lowest-to-highest, and Set + Number
  (Set A-Z, then Number within each set); Acquisition is the one exception, where
  ascending means Acquired first, then Unacquired (each column's descending direction
  reverses its own ascending order).
- A `null` `setName` or `localNumber` (possible for custom cards) always sorts last for
  that column, in both ascending and descending direction, rather than participating in
  the direction like an empty string.
- Ties within the active sort option fall back to `Card.createdAt` ascending as a stable
  secondary key, matching the existing deterministic unplaced-item ordering convention.
- The checklist has a single search input; a card matches when the trimmed,
  case-insensitive query is a substring of any of its `name`, `setName`, `localNumber`,
  or `variation` (OR logic across fields).
- Each of the Name, Set, Number, and Acquisition columns has its own filter icon in its
  column header opening a dropdown containing: a multi-select list of that column's
  distinct values found among the binder's cards (for Acquisition, the two values are
  Acquired and Unacquired); a Select All and Deselect All action; a search input
  narrowing the listed values (most useful for Name/Set/Number, which can have many
  distinct values); and a Reset action restoring that column's filter to every value
  selected (no filtering).
- Every column's filter defaults to every value selected (no cards excluded).
  Deselecting a value hides only cards whose value in that column matches a deselected
  value; deselecting every value for a column shows the empty-results state.
- A `null` `setName` or `localNumber` (possible for custom cards) gets its own
  selectable filter entry labeled "(None)" alongside that column's real distinct
  values, so cards without a set or number can be explicitly filtered in or out.
- Active filters across different columns combine with AND logic (a card must match
  every column's current filter selection, in addition to the search query, to be
  displayed).
- Each checklist entry's acquisition state is changed with the same icon-swap button
  used on the layout (Lucide `CircleCheck` when acquired, `Circle` when unacquired,
  Story 36), including its stable hit area, accessible label, and hover tooltip, rather
  than a separate checklist-specific control.
- Selecting the checklist's acquisition button reuses the existing `BinderRouteContext`
  acquisition mutation and optimistic-update/rollback behavior introduced by Story 36,
  rather than a second, checklist-specific mutation path.
- `POST /binders/{binderId}/exports/cards-pdf` accepts JSON `{ "cardIds": string[] }`
  — the client's currently filtered and sorted card IDs, in that order — rather than
  the backend recomputing search, sort, or filter state; this mirrors the existing
  art-pdf export's `selectedArtIds` contract (Story 30).
- Checklist PDF pages use US Letter **portrait** dimensions (`8.5 x 11` inches), each
  reserving the existing `0.25` inch page-margin convention shared with the other PDF
  exports (Stories 29/30); cards are arranged in a fixed-size grid sized to fit the
  page within those margins.
- A successful cards-PDF response uses `Content-Type: application/pdf` and
  `Content-Disposition: attachment` with the sanitized binder name followed by
  `-cards.pdf` as the download filename.
- Checklist PDF pages arrange entries in a fixed 4-column by 6-row grid (24 cards per
  page), sized to fit within the page's `0.25` inch margins; no scaling/packing
  algorithm (unlike the art-print PDF) is needed since every entry uses the same fixed
  cell size.
- The Card Checklist tab is fully interactive regardless of the binder's lock state:
  search, sorting, column filters, export, and acquisition changes are all available
  whether the binder is locked or unlocked, unlike the Edit Details and Edit Layout
  tabs, which become read-only while locked (Story 32).
