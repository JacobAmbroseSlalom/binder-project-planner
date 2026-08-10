# 22. Show binder completion metrics

**Status:** Done (2026-08-03 22:43 EDT) - slot-completion metrics only; the card-acquisition percentage is deferred to story 36 (per the scope note below). `GET /binders` (and the shared binder-summary builder used by duplicate) now returns `totalSlots`, `occupiedSlots`, and `emptySlots`, computed from persisted dimensions/placements/placed art via a new binder-wide `countOccupiedSlots` helper and the shared `getTotalSlots`; the home page shows a localStorage-persisted "Show completion metrics" toggle (default visible via `DEFAULT_BINDER_COMPLETION_METRICS_VISIBLE`) and renders occupied/empty counts plus a client-derived slot-completion percentage below each binder, without refetching when toggled.

#### Acceptance criteria

- The top of the home page binder list has a toggle for showing or hiding binder completion metrics.
- When the toggle is on, completion metrics appear below each binder in the list.
- Each binder displays its number of occupied slots and empty slots.
- A slot containing a card is counted as occupied.
- Every slot covered by placed multi-slot art is counted as occupied.
- Unplaced cards and multi-slot art do not count as occupied slots.
- Each binder displays a slot-completion percentage calculated as `(occupied slots / total binder slots) x 100`.
- When the toggle is off, the completion metrics are hidden.
- Completion metrics update when cards or multi-slot art are added, removed, or moved.
- Loading binder completion metrics uses the shared loading component, and a failure removes the loading state and displays the provided error using the shared failed toast.

#### Technical requirements

- The binder-list endpoint includes completion metrics in every binder-summary response; the client does not make a separate metrics request.
- The metrics toggle controls presentation only, and switching it does not refetch the binder list.
- The backend calculates canonical completion aggregates from persisted binder dimensions, placements, and multi-slot art rather than returning the full binder graph for client-side calculation.
- The API exposes the underlying metric counts without storing rounded percentages; the client displays the slot-completion percentage rounded to the nearest whole percent.
- The metrics visibility preference is persisted in browser local storage and restored on subsequent home-page visits; it is not stored by the backend.
- Completion metrics are visible before a local preference has been saved; this first-visit value is exported from the canonical shared `defaults.ts`.
- Each binder summary returns `totalSlots`, `occupiedSlots`, and `emptySlots`; the client derives the slot-completion percentage from those counts.
- The card-acquisition completion metric is out of scope for this story and is added later by Story 36 ("Track card acquisition"), once cards store acquisition state; that story extends the binder-summary metrics and the home-page display with the acquisition percentage.
