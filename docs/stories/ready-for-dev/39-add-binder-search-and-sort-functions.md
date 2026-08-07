# 39. Add Binder Search and Sort functions

**Status:** Not started

#### Acceptance criteria

- The home page has a search box that filters the binder list to binders whose name
  contains the search text (case-insensitive substring match).
- The home page has a single sort toggle button that switches the binder list
  between two orderings: "Last Active" (newest first, the existing default ordering)
  and "Name" (A-Z). Selecting the button switches to the other ordering; selecting it
  again switches back.
- "Last Active" (newest first) is the default ordering shown before the toggle is used.
- A search with zero matching binders displays an empty-state message (e.g. "No
  binders match your search") distinct from the existing "no binders at all" empty
  state.
- The search text and selected sort ordering always reset to their defaults (blank
  search, "Last Active" newest-first) when the home page loads; neither is persisted
  across visits.
- The search box, sort toggle button, and the existing completion-metrics toggle
  (Story 22) sit together in the same control row at the top of the home page, in
  that order.

#### Technical requirements

- Search and sort operate entirely client-side over the binder list already returned
  by `GET /binders` (which already returns every binder unpaginated); no backend
  changes are required.
- Search text and sort selection are held in ordinary component state (not local
  storage or a route parameter) and are not restored across page loads or navigation
  away from and back to the home page.
- The sort toggle is a two-state control (not a dropdown or a separate
  ascending/descending pair); its two states are "Last Active" (the existing
  `updatedAt`-based descending order already returned by `GET /binders`) and "Name"
  (ascending, case-insensitive alphabetical).
- Sorting by "Name" is a client-side re-sort of the already-fetched binder list;
  it does not change the order `GET /binders` returns data in.
