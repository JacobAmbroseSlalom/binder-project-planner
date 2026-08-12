# 37. Add a card list

**Status:** Done (2026-08-12 17:19 EDT)

#### Acceptance criteria

- The binder view/edit page has a "Card List" tab.
- The card list lists every card in the binder, including placed and unplaced cards.
- A progress tracker appears at the top of the card list.
- The progress tracker displays the number of acquired cards, the total number of cards, and the percentage acquired.
- The progress tracker includes every card in the binder and is not changed by card list search, sorting, or visibility controls.
- Changing a card's acquisition state immediately updates the progress tracker.
- The acquired-card percentage is also used as the binder's card-acquisition completion metric on the home page.
- When home-page completion metrics are visible, the card-acquisition percentage appears below the binder with its slot-completion metrics.
- Each card list entry displays the card and whether it is acquired or unacquired.
- The acquisition state of a card can be changed from its card list entry.
- Acquisition changes made from the card list are saved to the database through the backend.
- The card list has controls for sorting its cards.
- Selecting a sort option updates the order of the displayed card list entries.
- The card list has a search field for narrowing the displayed cards.
- Cards can be found by card name, set, number, or variation.
- Each sortable column (Name, Set, Number, Variation, and Acquisition) has its own filter control for narrowing the card list to specific values in that column.
- Each column's filter control is a dropdown containing a multi-select list of that column's distinct values, a Select All and Deselect All action, a search field for narrowing the listed values, and a reset action that restores that column's filter to showing every value.
- Changing any column's filter immediately updates the displayed card list entries.
- Columns with an active filter are summarized as pills in an "Applied filters" row below the search bar.
- A single control near the applied-filter pills resets sorting and every column's filter back to their defaults.
- Search, sorting, and column filters can be used together.
- Clearing search and column filters restores all card list entries while retaining the selected sort order.
- When no cards match the active search and filters, the card list displays an empty-results state.
- The Card List has an export action.
- Exporting creates a downloadable PDF card list that is suitable for printing.
- The export includes only cards matching the card list's active search and column filters.
- Exported cards appear in the card list's selected sort order.
- Each exported entry includes only the card's image and variation.
- The export action is unavailable when no cards match the active search and filters.
- Card List export remains available when the binder is locked.
- Acquisition changes use the shared save-status toast and restore the card's previous acquisition state if saving fails.

#### Technical requirements

- The Card List tab reuses the already-loaded `cards` array from
  `BinderRouteContext` (the same data driving the Edit Layout tab); search, sorting, and
  acquisition-visibility filtering are computed entirely client-side, with no dedicated
  fetch for the tab.
- Sort options are a fixed set, one per sortable column, plus one combined option: Name,
  Set, Number, Set + Number (combined, the default), and Acquisition status; a Price
  option is deferred until Story 38 defines the card-price shape.
- Name, Set, Number, Variation, and Acquisition each have a clickable column header
  that toggles that column's sort direction: selecting an unselected column sorts
  ascending; clicking the currently sorted column again flips between ascending and
  descending (a simple two-state toggle, not a third "unsorted" state). Clicking either
  the column's label or its sort icon toggles the same way.
- Every sortable column header always shows a sort-direction icon next to its label: a
  combined up/down arrow when that column isn't the active sort, a single up arrow
  when it's the active sort ascending, and a single down arrow when descending.
- Ascending order is Name A-Z, Set A-Z, Number lowest-to-highest, Variation A-Z, and
  Set + Number (Set A-Z, then Number within each set); Acquisition is the one
  exception, where ascending means Acquired first, then Unacquired (each column's
  descending direction reverses its own ascending order).
- A `null` `setName`, `localNumber`, or `variation` (possible for custom cards) always
  sorts last for that column, in both ascending and descending direction, rather than
  participating in the direction like an empty string.
- Ties within the active sort option fall back to `Card.createdAt` ascending as a stable
  secondary key, matching the existing deterministic unplaced-item ordering convention.
- The card list has a single search input; a card matches when the trimmed,
  case-insensitive query is a substring of any of its `name`, `setName`, `localNumber`,
  or `variation` (OR logic across fields).
- Each of the Name, Set, Number, Variation, and Acquisition columns has its own filter
  icon in its column header opening a dropdown containing: a multi-select list of that
  column's distinct values found among the binder's cards (for Acquisition, the two
  values are Acquired and Unacquired); a Select All and Deselect All action; a search
  input narrowing the listed values (most useful for Name/Set/Number/Variation, which
  can have many distinct values); and a Reset action restoring that column's filter to
  every value selected (no filtering).
- Every column's filter defaults to every value selected (no cards excluded).
  Deselecting a value hides only cards whose value in that column matches a deselected
  value; deselecting every value for a column shows the empty-results state.
- A `null` `setName`, `localNumber`, or `variation` (possible for custom cards) gets its
  own selectable filter entry labeled "(None)" alongside that column's real distinct
  values, so cards without a set, number, or variation can be explicitly filtered in or
  out.
- Active filters across different columns combine with AND logic (a card must match
  every column's current filter selection, in addition to the search query, to be
  displayed).
- Below the search bar, an "Applied filters" row summarizes every column with an
  active filter (fewer than every value selected) as its own pill, in
  Name/Set/Number/Variation/Acquisition order: each pill reads "<Column>: <value,
  value, ...>" listing every selected value by name when 3 or fewer are selected, or
  "<Column>: <N> Selected" once more than 3 are selected.
- The same row includes a single combined reset control, to the left of the applied-
  filter pills, that returns sorting to its default (Set + Number, ascending) and every
  column's filter to every value selected; it's visible only when the current sort
  isn't already that default or at least one column has an active filter. The row
  itself always renders at a fixed height, even with nothing to show, so the table
  below it never shifts as filters/sort are applied and cleared.
- Each card list entry's acquisition state is changed with the same icon-swap button
  used on the layout (Lucide `CircleCheck` when acquired, `Circle` when unacquired,
  Story 36), including its stable hit area, accessible label, and hover tooltip, rather
  than a separate card list-specific control.
- Selecting the card list's acquisition button reuses the existing `BinderRouteContext`
  acquisition mutation and optimistic-update/rollback behavior introduced by Story 36,
  rather than a second, card list-specific mutation path.
- `POST /binders/{binderId}/exports/cards-pdf` accepts JSON `{ "cardIds": string[] }`
  — the client's currently filtered and sorted card IDs, in that order — rather than
  the backend recomputing search, sort, or filter state; this mirrors the existing
  art-pdf export's `selectedArtIds` contract (Story 30).
- card list PDF pages use US Letter **landscape** dimensions (`11 x 8.5` inches), each
  reserving the existing `0.25` inch page-margin convention shared with the other PDF
  exports (Stories 29/30); each card renders at its real physical size (`2.5 x 3.5`
  inches), arranged in a grid sized to however many whole cards fit within those
  margins.
- A successful cards-PDF response uses `Content-Type: application/pdf` and
  `Content-Disposition: attachment` with the sanitized binder name followed by
  `-cards.pdf` as the download filename.
- card list PDF pages arrange entries in a grid of real `2.5 x 3.5` inch cells (4
  columns by 2 rows, 8 cards per page, at US Letter landscape with the `0.25` inch
  margins); the column/row count is derived from the page's usable space rather than
  a fixed count, so it recalculates if the page size or margins ever change.
- The Card List tab is fully interactive regardless of the binder's lock state:
  search, sorting, column filters, export, and acquisition changes are all available
  whether the binder is locked or unlocked, unlike the Edit Details and Edit Layout
  tabs, which become read-only while locked (Story 32).

#### Implementation progress

Tracked here so an interrupted session can resume from the right spot instead of
re-deriving what's already done.

- [x] OpenAPI contract: `POST /binders/{binderId}/exports/cards-pdf` request/response
      schema, regenerate `packages/api-contract/src/schema.d.ts`.
- [x] Backend: `apps/backend/src/pdf/cardsListPdf.ts` generator (landscape US
      Letter, real `2.5 x 3.5` inch card cells, 4x2 grid derived from page space, 8
      cards/page, image + variation only).
- [x] Backend: `POST /binders/:binderId/exports/cards-pdf` route in
      `apps/backend/src/routes/binders.ts` (validates `cardIds`, snapshot read, temp
      file + stream + cleanup, matching the `exports/art-pdf` pattern).
- [x] Frontend: `exportCardsListPdf` in `apps/frontend/src/lib/api/binders.ts`.
- [x] Frontend: enable the previously disabled "Card List"/`cardlist` placeholder
      tab in `BinderTabs.tsx`.
- [x] Frontend: `cardlist/page.tsx` + `_components/` skeleton (mirrors
      `financials/page.tsx`'s tab-module shape).
- [x] Frontend: progress tracker (acquired/total/percent, computed from the full
      `cards` array, unaffected by search/sort/filters).
- [x] Frontend: search input (name/setName/localNumber/variation substring match).
- [x] Frontend: sort (Name, Set, Number, Variation, Set + Number default,
      Acquisition; column header toggle; always-visible sort-direction icon;
      null-last ordering; `createdAt` tiebreaker).
- [x] Frontend: per-column filter dropdowns (multi-select, Select All/Deselect All,
      in-dropdown search, Reset, "(None)" entry for null Set/Number/Variation).
- [x] Frontend: "Applied filters" row (per-column pills, value list vs. "N Selected"
      past 3, combined reset-sort-and-filters control, fixed-height blank state).
- [x] Frontend: card list table wiring search + sort + filters together; empty-results
      state.
- [x] Frontend: acquisition toggle button reusing Story 36's
      `BinderRouteContext`/`CardTile` icon-swap mutation.
- [x] Frontend: export button (disabled when zero results) calling `exportCardsListPdf`
      with the currently filtered+sorted card ids.
- [x] Validate: Ui with user
- [x] Docs: reconcile `docs/api-endpoints.md`/`docs/data-types.md` (the `cards-pdf`
      endpoint entry already exists there ahead of this implementation - verify it
      still matches once built) and `docs/planning.md` if any new architectural
      decision comes up.
- [x] Validate: `pnpm typecheck` / `pnpm lint` / `pnpm build`, then `pnpm format`.
