# 5. List binders

**Status:** Done (2026-07-31 17:55 EDT)

**Update (2026-08-04):** The list is now ordered by each binder's most recent _activity_ rather than only edits to its own details: `GET /binders` sorts by the newest of the binder's `updatedAt` and the newest `updatedAt` among its cards and art (descending), then by binder UUID. So adding, moving, or editing a card or art item floats its binder to the top. (A card/art deletion doesn't change any remaining row's timestamp, so it isn't reflected in the ordering.)

#### Acceptance criteria

- The home page displays a list of binders.
- Binders are ordered with the most recently active binder first (see the 2026-08-04 update above).
- The binder list is retrieved from the backend.
- The home page uses the shared loading component while the binder list is being retrieved.
- The empty binder-list state is not displayed until loading completes successfully with no binders.
- If the binder list fails to load, the loading component is removed and the provided error is displayed using the shared failed toast.

#### Technical requirements

- The home page retrieves binders client-side using the OpenAPI-generated REST client.
- Binder-list data, loading state, and request errors are managed with React state rather than a server-state library.
- The initial binder-list endpoint returns all binders without pagination.
- The binder-list endpoint sorts by effective last-activity descending - the newest of the binder's own `updatedAt` and the newest card/art `updatedAt` for that binder (computed via SQLite's variadic `max()` with correlated subqueries) - then by binder UUID for deterministic ordering.
- `GET /binders` returns `200 OK` with the complete initial binder-summary collection in its documented sort order.
- The client fetches the binder list when the home page is entered and updates or refetches it after create, copy, delete, lock, unlock, or full-data import operations.
- The OpenAPI contract defines a lightweight binder-summary response containing the binder UUID, name, dimensions, page count, lock state, and timestamps rather than the complete card and multi-slot-art graph.
- Later home-page preview and completion-metric stories extend the binder summary with only the additional data required by those features.
