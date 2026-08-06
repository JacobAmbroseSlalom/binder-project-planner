# 31. Search and filter unplaced items

**Status:** Done (2026-08-04 11:12 EDT)

#### Acceptance criteria

- The unplaced cards section has a search field for narrowing the displayed cards by name, set, number, or variation.
- The unplaced art section has its own, independent search field for narrowing the displayed art by title or description.
- Clearing a section's search field restores all of that section's unplaced items.
- When a section's search has no matches, that section displays an empty-results state.

#### Technical requirements

- Search filtering runs client-side against the unplaced cards and unplaced art already loaded in the binder-scoped React context; changing either section's search field sends no backend request.
- Each section filters its own complete unplaced collection before passing matching items to its existing TanStack Virtual list, so virtualization affects rendering rather than search coverage.
- The trimmed search query uses case-insensitive substring matching against card name, set, number, and variation fields in the unplaced cards section, and art title and description fields in the unplaced art section.
- The client splits a nonblank query on whitespace; every search term must match at least one supported field on the same item, and different terms may match different fields.
- A blank or whitespace-only query applies no text filter.
- Each section's search text is local to the mounted layout tab and is not stored in route query parameters, binder context, browser storage, or the backend.
- Each layout-tab mount starts with both search fields blank; refreshes and navigation away from the layout reset both.
- Each search input's state updates on every keystroke, and the frontend uses React `useDeferredValue` for the query consumed by filtering so result rendering may lag briefly without delaying typing.
- The current input value remains visible while deferred results update; no debounce timer, minimum query length, loading indicator, or backend request is used.
- When a section's filtering produces no matches, that section displays `No matching items` and a Clear search action that empties its search field.
- Filtering and the empty-results state do not remove or disable either unplaced panel's existing add-card or add-art control.
