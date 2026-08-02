# Project Planning — Card Binder Planner

This doc is the starting point for planning and tracking development. Update it as the
product direction and backlog evolve.

## Product vision

An app that helps collectors plan how to organize their trading/collectible cards into
binders — e.g. deciding page layouts, assigning cards to pages/slots, and tracking what's
been placed vs. still needs a home.

## Tech stack (planned)

- Frontend: React (Next.js)
- Frontend styling: Tailwind CSS
- Frontend virtualization: TanStack Virtual
- Frontend icons: Lucide React
- Frontend drag and drop: dnd-kit
- Frontend image editing: Konva with React Konva
- Backend: Node.js (Express)
- Backend image processing: Sharp
- Backend PDF generation: PDFKit
- Language: TypeScript
- Database: SQLite with Drizzle ORM.
- Authentication: None for the initial local single-user version.
- Hosting: Local machine for the initial version.

## Story backlog

Stories are listed below with their acceptance criteria (ACs). Technical decisions are
recorded in a separate "Technical requirements" subsection within each story as they are
defined.

Each story carries a `**Status:**` marker of `Not started`, `In progress`, or `Done`,
tracking implementation progress in place. This is independent from the
requirements-writing progress tracked in
[story-requirements-workflow.md](story-requirements-workflow.md); a story can have
complete acceptance criteria and technical requirements while still `Not started`.
Update the marker in place as work progresses instead of moving or duplicating the
story elsewhere. When a story becomes `Done`, append the completion date and time in
parentheses, e.g. `Done (2026-07-30 23:31 EDT)`.

### 1. Project setup

**Status:** Done (2026-07-30 21:30 EDT)

#### Acceptance criteria

- A frontend app (React with Next.js and TypeScript) is scaffolded and runs locally.
- A backend app (Node.js with Express and TypeScript) is scaffolded and runs locally.
- An initial database is created using the database technology selected for the project.
- The backend is configured to connect to the initial database successfully.
- A single root pnpm development command starts the frontend and backend in watch mode and reports both local URLs.
- The frontend can successfully make a request to the backend (e.g. a basic health-check endpoint).

#### Technical requirements

- The repository contains separate frontend and backend applications.
- The repository uses pnpm workspaces to manage frontend, backend, and shared tooling packages.
- Project setup pins the active Node.js LTS and current stable framework and tooling versions used at implementation time.
- The first usable version runs locally on a single user's machine.
- The initial local single-user version does not require authentication.
- Local development runs the frontend and backend natively through pnpm commands without requiring Docker.
- SQLite is used for the initial local database, with Drizzle ORM providing the typed schema and migrations.
- Application-managed images are stored in a local application data directory rather than as database blobs.
- The backend generates image filenames and stores each image's metadata and storage reference in the database.
- The frontend communicates with the backend through a REST JSON API.
- `GET /health` returns `200 OK` with an OpenAPI-documented JSON health response and provides the initial frontend-to-backend connectivity check.
- Image uploads use multipart HTTP requests to the backend.
- An OpenAPI specification is the source of truth for REST request and response contracts.
- Frontend and backend API types are generated from the OpenAPI specification.
- Jest is configured for frontend and backend unit and integration tests.
- Playwright is configured for end-to-end browser tests.
- ESLint and Prettier are configured and shared across the frontend and backend applications.
- The root workspace provides `pnpm format` to run Prettier and apply formatting across supported repository files, and `pnpm format:check` to verify formatting without modifying files.
- Prettier configuration and ignore rules are stored at the repository root and apply consistently to frontend, backend, shared packages, configuration, and documentation files.
- A GitHub Actions workflow runs dependency installation, generated OpenAPI contract verification, linting, formatting checks, type checking, Jest tests, application builds, and Playwright tests for each pull request.

### 2. Create styling documentation

**Status:** Done (2026-07-30 23:31 EDT)

- Styling documents are created for the frontend.
- The documents record the agreed visual and UI standards for the app.
- The documents are organized so developers can reference and update them as the app evolves.

### 3. Add reusable save-status feedback

**Status:** Done (2026-07-30 23:45 EDT)

#### Acceptance criteria

- A reusable toast component appears at the bottom of the page to communicate backend operation status.
- Concurrent backend mutations display independently updated toasts.
- A saving toast appears when an operation begins and remains visible until the operation succeeds or fails.
- When the operation succeeds, the saving toast is replaced by a green saved toast.
- Saved toasts dismiss automatically after 3 seconds.
- When the operation fails, the saving toast is replaced by a red failed toast that includes the provided error message.
- Failed toasts display the error detail provided by the backend.
- Failed toasts remain visible until the user dismisses them with an X.
- When a failed operation changed the visible interface before backend confirmation, the interface returns to its previous state.
- Stories that save, update, move, duplicate, delete, lock, or unlock data use this shared toast component.

#### Technical requirements

- The frontend toast component is custom-built (`apps/frontend/src/shared/feedback/`) rather than a third-party toast library (e.g. Sonner), consistent with the styling system's fully-custom interactive-component rule.
- Save-status announcements use ARIA live regions matching each status's urgency: `role="status"` for saving/saved, `role="alert"` for failed.
- Mutation status and optimistic rollback are managed with React state and the OpenAPI-generated REST client rather than a server-state library.
- Each concurrent backend mutation has its own operation identifier.
- The 3-second saved-toast duration is stored in the canonical application `defaults.ts` as `SAVED_TOAST_DURATION_MS`.
- Backend failures use the standard Problem Details JSON response format documented in the OpenAPI specification.
- Failed toasts use the Problem Details `detail` value and retain the response status and problem type for diagnostics.

### 4. Create a new binder

**Status:** Done (2026-07-31 17:15 EDT)

#### Acceptance criteria

- The home page has a button to create a new binder.
- Selecting the button navigates to the new binder page.
- The new binder page has fields for name, width, height, and pages.
- Binder name is required, has a maximum length of 100 characters after trimming, and must be unique regardless of capitalization.
- Width defaults to 3.
- Height defaults to 3.
- Pages defaults to 20.
- Width, height, and pages accept positive integers with a minimum value of 1.
- Width and height have a maximum value of 8; pages has no fixed maximum.
- Cancel and Create buttons appear at the bottom of the page.
- Cancel returns to the home page without creating a binder.
- Create is disabled while binder creation is in progress and is re-enabled if creation fails.
- Create saves the binder through the backend to a database.
- After the binder is saved, the user returns to the home page.
- Binder creation uses the shared save-status toast and remains on the completed form if saving fails.

#### Technical requirements

- The reusable binder-details form uses React Hook Form for client-side form state.
- The form uses React Hook Form's submission state to prevent repeated create requests while one is in progress.
- The form uses Zod schemas for client-side runtime validation and TypeScript type inference.
- The Zod schema trims the binder name and requires the result to contain between 1 and 100 characters.
- The Zod schema rejects non-integer width, height, or page values and values less than 1; width and height are additionally capped at `BINDER_DIMENSION_MAX`.
- The default width, height, and page count are defined in the canonical application `defaults.ts` rather than duplicated in the form.
- `BINDER_DIMENSION_MAX` (the width/height maximum) is defined in the canonical application `defaults.ts` and defaults to `8`; it is enforced by the frontend Zod schema, the OpenAPI request/response schemas, and a database check constraint.
- Binder-name uniqueness is enforced by the backend and database using a case-insensitive normalized value rather than relying only on client validation.
- The OpenAPI create-binder request schema and database field enforce the 100-character binder-name limit.
- A duplicate binder name returns HTTP `409 Conflict` using Problem Details and identifies the name field as conflicting.
- The backend generates a UUID for each binder and uses it as the binder identifier in the database, REST API, and full-data exports.
- Each binder stores backend-managed `createdAt` and `updatedAt` timestamps in UTC.
- `POST /binders` creates a binder from its normalized name, dimensions, and stored page count; it returns `201 Created`, a `Location` header for the new binder resource, and the complete persisted binder representation.
- The OpenAPI specification remains the source of truth for the backend request and response contract.
- Express uses maintained OpenAPI validation middleware to reject requests that do not match the documented schema before route logic runs.

### 5. List binders

**Status:** Done (2026-07-31 17:55 EDT)

#### Acceptance criteria

- The home page displays a list of binders.
- Binders are ordered with the most recently updated binder first.
- The binder list is retrieved from the backend.
- The home page uses the shared loading component while the binder list is being retrieved.
- The empty binder-list state is not displayed until loading completes successfully with no binders.
- If the binder list fails to load, the loading component is removed and the provided error is displayed using the shared failed toast.

#### Technical requirements

- The home page retrieves binders client-side using the OpenAPI-generated REST client.
- Binder-list data, loading state, and request errors are managed with React state rather than a server-state library.
- The initial binder-list endpoint returns all binders without pagination.
- The binder-list endpoint sorts by `updatedAt` descending and then by binder UUID to provide deterministic ordering.
- `GET /binders` returns `200 OK` with the complete initial binder-summary collection in its documented sort order.
- The client fetches the binder list when the home page is entered and updates or refetches it after create, copy, delete, lock, unlock, or full-data import operations.
- The OpenAPI contract defines a lightweight binder-summary response containing the binder UUID, name, dimensions, page count, lock state, and timestamps rather than the complete card and multi-slot-art graph.
- Later home-page preview and completion-metric stories extend the binder summary with only the additional data required by those features.

### 6. Add reusable loading feedback

**Status:** Done (2026-07-31 23:52 EDT)

#### Acceptance criteria

- A reusable loading component communicates when the app is waiting for data from the backend.
- The loading component uses a consistent inline spinner and context-specific loading text wherever it appears.
- The loading component remains visible until the request succeeds or fails.
- Loaded content replaces the loading component when the request succeeds.
- If the request fails, the loading component is removed and the provided error is displayed using the shared failed toast.
- Loading feedback prevents empty, incomplete, or stale content from being presented as the completed result.
- Future stories that retrieve data from the backend use this shared loading component.

#### Technical requirements

- The shared loading component renders an inline spinner and accepts an accessible status label describing the operation in progress.
- Loading announcements use the selected UI component library's default accessibility behavior.
- The loading indicator appears only when a request remains pending for 200 milliseconds.
- The 200-millisecond loading delay is stored in the canonical application `defaults.ts`.
- After appearing, the loading indicator remains visible for at least 300 milliseconds before loaded content replaces it.
- The 300-millisecond minimum display duration is stored in the canonical application `defaults.ts`.
- When a newer request for the same content starts, the client aborts the older request through `AbortController` when possible.
- Request state tracks the current operation so stale responses cannot replace data from a newer request.

### 7. Create the view/edit binder page

**Status:** Done (2026-08-01 01:35 EDT)

#### Acceptance criteria

- A view/edit binder page is created.
- Tabs appear at the top of the page.
- The tabs are labeled "Edit Details", "Edit Layout", and "View Financials".
- The new binder page and the "Edit Details" tab use the same reusable binder-details form component.
- Fields added to the reusable binder-details form appear on both the new binder page and the "Edit Details" tab.
- On the "Edit Details" tab, moving focus away from a changed field saves all currently valid changed fields.
- After a new binder is saved, the user is taken to its view/edit page with the "Edit Layout" tab selected.
- Selecting a binder from the home page list opens its view/edit page with the "Edit Layout" tab selected.
- Opening a binder uses the shared loading component until its details, cards, and multi-slot art are available or the request fails.
- Binder content is not displayed until its details, cards, and multi-slot art have all loaded successfully.
- Switching between a binder's tabs retains its already loaded details, cards, multi-slot art, and local updates without showing loading feedback or reloading the binder data.
- If the binder fails to load, the loading component is removed and the provided error is displayed using the shared failed toast.
- A failed binder load provides a retry action that reloads the details, cards, and multi-slot art.
- If the requested binder does not exist, the user is redirected to the home page and the provided error is displayed using the shared failed toast.

#### Technical requirements

- Binder tabs use nested Next.js routes so the selected tab is linkable and remains selected after a browser refresh.
- The tab routes are `/binders/[binderId]/details`, `/binders/[binderId]/layout`, `/binders/[binderId]/financials`, and, when implemented, `/binders/[binderId]/checklist`.
- The binder UUID is the `binderId` route parameter.
- A client-side React context scoped to the binder route loads and shares the binder details, cards, multi-slot art, loading state, and local updates across nested tabs.
- The binder context uses independent typed React state values and update functions rather than a reducer or external state library.
- Binder details, cards, and multi-slot art are retrieved through three parallel OpenAPI-documented REST requests.
- `GET /binders/{binderId}` returns `200 OK` with the binder details used by the details tab and shared binder context.
- `GET /binders/{binderId}/cards` returns `200 OK` with every binder-owned card, including placed and unplaced cards, without image bytes.
- `GET /binders/{binderId}/art` returns `200 OK` with every binder-owned multi-slot-art record, including placed and unplaced art, without image bytes.
- `PATCH /binders/{binderId}` accepts documented partial binder-detail updates and returns `200 OK` with the complete persisted binder representation.
- The binder context publishes the three responses only after all requests succeed, so consumers never receive a partially loaded binder graph.
- If any request fails, the context discards that load attempt; retry starts all three requests again.
- The binder route context is mounted above the nested tab routes and remains mounted while the user switches between them.
- Navigating between binder tabs does not refetch unchanged binder data or discard existing local binder updates while the binder route context remains mounted.
- A missing binder returns HTTP `404 Not Found` using Problem Details; the client replaces the invalid history entry with the home route and preserves the error for the shared failed toast.
- A malformed `binderId` is rejected as a request-validation Problem Details response before database lookup and uses the same redirect-home and failed-toast behavior.
- The shared binder-details form uses its React Hook Form dirty-field state to identify unsaved edits.
- A field blur sends one partial-update request containing all currently valid dirty fields; no request is sent while any included field is invalid.
- After a successful update, the submitted fields are marked clean using the values returned by the backend.
- After a failed update, the submitted fields remain dirty and retain the user's values for correction or retry.
- Edit Details update requests are serialized so only one save is in progress at a time.
- If another blur occurs while a save is in progress, the latest remaining dirty fields are queued into one follow-up save after the current request finishes.

### 8. Visualize a basic binder layout

**Status:** Done (2026-08-01 02:29 EDT)

#### Acceptance criteria

- The "Edit Layout" tab displays a visual representation of the binder.
- Each binder side displays a grid based on the binder's width and height.
- A 3-by-3 binder side displays 9 slots.
- The first displayed page shows only the right binder side. For a 3-by-3 binder, it displays 9 slots.
- Each intermediate displayed page shows both the left and right binder sides. For a 3-by-3 binder, it displays 18 slots.
- The last displayed page shows only the left binder side. For a 3-by-3 binder, it displays 9 slots.
- The number of displayed pages is one greater than the number of pages stored in the binder data. For example, a binder with 20 stored pages has 21 displayed pages.
- Left and right arrow controls navigate backward and forward through the displayed pages.
- The left arrow is disabled on the first displayed page.
- The right arrow is disabled on the last displayed page.
- A physical card slot is 6.35 cm wide by 9 cm high.
- Binder slots and displayed cards preserve the corresponding 6.35:9 width-to-height ratio.
- The on-screen dimensions may scale responsively and do not need to equal the physical size.
- The initial binder layout editor supports desktop viewports at least 1024 CSS pixels wide.
- Returning to Edit Layout after selecting another binder tab restores the physical page or spread that was visible before leaving the layout.

#### Technical requirements

- Binder sides and slots render as semantic HTML elements arranged with CSS Grid rather than canvas or SVG.
- Each binder-side grid uses the binder width for its CSS Grid column count and the binder height for its row count.
- Slot sizing uses the CSS `aspect-ratio` property to preserve the configured width-to-height ratio responsively.
- Each complete binder-side grid scales to fit its available layout area without internal scrolling, including when large dimensions make individual slots very small.
- The canonical placement coordinates are physical page, row, and column; no separate side or flattened slot-number field is stored.
- Physical page, row, and column are one-based in the database and OpenAPI contracts.
- The backend validates that a placement's physical page is between 1 and twice the binder's stored page count and that its row and column exist within the binder's current dimensions.
- Automated layout tests cover supported viewport widths of 1024 CSS pixels and wider; narrow-screen reflow is deferred.
- Viewports narrower than 1024 CSS pixels still render the editor without a blocking notice, but their layout is not guaranteed or covered by the initial acceptance tests.
- The current spread is represented by a one-based physical page number in the layout route's `page` query parameter so refreshes and copied URLs retain the displayed spread.
- The binder route context retains the most recent valid layout focal physical page while another binder tab is active; returning to Edit Layout restores that value in the layout route's `page` query parameter without requesting binder data again.
- The retained focal page is route-local UI state rather than persisted binder data; a newly opened binder layout without a prior layout visit still defaults to physical page 1.
- The `page` query parameter retains the requested focal physical page: either page in a two-page spread displays that spread without rewriting the query parameter to its other page.
- When the `page` query parameter is absent, the layout displays physical page 1 without adding the parameter to the URL.
- A malformed, non-integer, or out-of-range `page` query value is replaced with `?page=1`, and the layout displays physical page 1.
- Arrow and direct-page navigation replace the current URL rather than adding each viewed spread to browser history.
- Only the active spread is mounted in the DOM; inactive spreads are not rendered or retained as hidden elements.

### 9. Jump directly to a binder page

**Status:** Done (2026-08-01 10:23 EDT)

#### Acceptance criteria

- The current physical page number or page-number range appears above the binder visualization.
- A page number input or selector appears alongside the previous and next arrows.
- Physical page numbers account for both sides represented by each stored binder page.
- A binder with 20 stored pages has physical page numbers 1 through 40.
- Physical page 1 is displayed by itself on the right side.
- Selecting the right arrow from physical page 1 displays the spread containing physical pages 2 and 3.
- Intermediate spreads are labeled with their even-numbered left page and odd-numbered right page, such as "Pages 4–5".
- The final physical page, page 40 in a 20-page binder, is displayed by itself on the left side.
- Entering either page number from an intermediate spread navigates to that complete spread.
- Entering page 5 displays physical pages 4 and 5 together.
- The page input only accepts physical page numbers that exist in the binder.
- Using the arrows updates the page input and current-page label, and entering a page updates the displayed binder spread.

#### Technical requirements

- Direct page navigation uses an HTML number input.
- The input commits navigation when the user presses Enter or the input loses focus, not on each keystroke.
- Submitting an empty, non-integer, or out-of-range value leaves the current spread unchanged and displays the validation failure through the shared failed toast.
- After an invalid submission, the input resets to the current focal physical page.
- Next-arrow navigation selects the left physical page of the next spread, and previous-arrow navigation selects the right physical page of the previous spread; the single first or last physical page is used at the binder boundaries.

### 10. Show Michi slot indicators

**Status:** Done (2026-08-01 12:14 EDT)

#### Acceptance criteria

- The "Edit Layout" tab has a toggle for showing Michi slot indicators.
- The toggle defaults to off.
- When the toggle is on, each intermediate layout view displays the left and right binder
  sides together as a spread so the Michi placements can be understood across both sides.
- The first layout view remains right-side-only and the last remains left-side-only when
  Michi indicators are on; indicators appear for the binder side that exists.
- A Michi indicator appears above each gap between paired columns whose slot openings
  face toward each other.
- Columns are numbered from left to right across the complete binder spread.
- On each binder side, columns are paired from the outside edge toward the binder spine.
- For an odd binder width, the column nearest the spine on each side is not paired.
- A 3-wide binder displays indicators between columns 1 and 2 and between columns 5 and 6.
- A 5-wide binder displays indicators between columns 1 and 2, 3 and 4, 7 and 8, and 9
  and 10.
- For an even binder width, every column is paired.
- A 4-wide binder displays indicators between columns 1 and 2, 3 and 4, 5 and 6, and 7
  and 8.
- Turning the toggle off hides all Michi indicators.

#### Technical requirements

- Michi-indicator visibility is represented by a query parameter on the layout route so it persists across refreshes and copied URLs.
- The presence of `michi=true` enables the indicators; the `michi` parameter is omitted when they are disabled.
- Any other `michi` value is treated as disabled and removed from the URL using history replacement.
- Toggling Michi indicators updates the query parameters using history replacement and preserves the current `page` parameter.
- A frontend pure function derives indicator gaps from the binder width and binder side at render time; Michi pair positions are not returned by the API or persisted.
- Unit tests cover the derived pair gaps for odd and even binder widths on left-only, right-only, and two-sided spreads.
- Indicator elements are noninteractive, excluded from the tab order, and hidden from the accessibility tree.

### 11. Select a card for a binder slot

**Status:** Done (2026-08-01 19:16 EDT)

#### Acceptance criteria

- Each unoccupied binder slot displays a + icon centered in the slot.
- Selecting a binder slot opens a card-selection modal for that slot.
- The modal includes a search bar that searches for cards using the TCGdex cards API (`https://tcgdex.dev/rest/cards`).
- Card searches use the shared loading component while waiting for the TCGdex API response.
- Previous search results are not presented as results for a new search while it is loading.
- If a card search fails, the loading component is removed and the provided error is displayed using the shared failed toast.
- Search results display the card images returned by the API.
- When a completed search returns no matching cards, the modal displays a message stating that no cards were found instead of an empty results area.
- Selecting a search result marks that card as the modal's current selection.
- Selecting Add Card adds the selected card to the binder slot that originally opened the modal.
- The selected card is saved through the backend to the database.
- The saved record identifies the binder, physical page, row, and column.
- The saved card data includes the card's name, local number, and set name.
- The saved record includes the selected card's image.
- The saved record includes the TCGdex card ID, set ID, and local card number.
- The saved record includes a source identifying TCGdex as the card-data provider.
- Card assignment uses the shared save-status toast and restores the slot to its previous state if saving fails.

#### Technical requirements

- The frontend searches TCGdex through the local Express REST API rather than calling the provider directly.
- The backend TCGdex integration maps provider responses and failures into the app's OpenAPI-documented contracts.
- TCGdex search runs automatically after a debounce interval when the trimmed query meets the configured minimum length.
- The debounce interval and minimum query length are exported from the canonical shared `defaults.ts`.
- `CARD_SEARCH_DEBOUNCE_MS` defaults to `300`.
- `CARD_SEARCH_MIN_QUERY_LENGTH` defaults to `4`.
- When the query falls below the minimum length, no new search runs and the most recent completed results remain visible.
- Changing the query aborts any in-flight search; only the latest qualifying query may publish results.
- The frontend uses `AbortController`, and the backend propagates a disconnected or aborted client request to the upstream TCGdex request.
- The backend returns all matches supplied by TCGdex without application-level pagination or truncation.
- Search results render in a virtualized grid that mounts only visible rows, and result images use lazy loading.
- The frontend uses `@tanstack/react-virtual` for the search-result grid virtualization.
- The no-results message renders in place of the virtualized grid only after a qualifying search completes successfully with an empty array; it is not shown before the first qualifying search or while a search is loading.
- The card selector is a custom React modal without a dialog-component dependency.
- The modal exposes dialog semantics and an accessible name, traps focus while open, closes on Escape, and restores focus to the binder slot that opened it.
- The modal also closes from its close control or a backdrop click, and closing aborts any in-flight TCGdex search.
- Each modal opening starts with an empty query and no search results; prior modal state is not retained.
- Assigning a TCGdex card causes the backend to download its image into the local application-data directory using a backend-generated filename.
- The database stores the local image storage reference and metadata rather than depending on the remote provider URL at display time.
- If image download, file installation, or database persistence fails, the assignment fails as a unit and the backend removes any temporary or newly created unreferenced image file.
- TCGdex card instances with the same provider card ID share one local image-asset record and file.
- A database uniqueness constraint on provider source and provider card ID prevents concurrent assignments from creating duplicate image assets.
- Selecting Add Card closes the modal and optimistically inserts the selected card into the binder context while the assignment request runs.
- The optimistic update retains the slot's previous state and restores it if the assignment request fails; a successful response replaces the optimistic value with the backend representation.
- A slot with a pending assignment is marked disabled and accepts no further slot actions until the request settles; pending assignments in different slots remain independent.
- The database enforces at most one card at each binder, physical-page, row, and column coordinate.
- Assigning into an occupied coordinate returns `409 Conflict` using Problem Details without changing the existing card; the client handles it through the standard optimistic rollback and failed toast.
- The assignment request contains the target physical page, row, and column plus the full normalized TCGdex search-result object; the backend does not refetch card details before saving.
- The backend validates the normalized card against the OpenAPI schema, assigns the TCGdex source server-side, and accepts image downloads only from approved TCGdex image origins.
- `POST /binders/{binderId}/cards` creates the binder-owned card and its initial placement.
- A successful assignment returns `201 Created`, a `Location` header for the new card resource, and the complete persisted card representation used to replace the optimistic client value.
- `GET /card-catalog/search` accepts a required `query` parameter and returns normalized TCGdex catalog cards.
- The backend trims the query and enforces `CARD_SEARCH_MIN_QUERY_LENGTH`; invalid queries receive a request-validation Problem Details response without calling TCGdex.
- The backend caches successful normalized TCGdex search responses in memory using the trimmed, case-normalized query as the cache key; the cache is cleared when the backend restarts.
- The search-cache TTL is exported from the canonical shared `defaults.ts`.
- `CARD_SEARCH_CACHE_TTL_MS` defaults to `300000` (5 minutes).
- The cache uses least-recently-used eviction and stores at most `CARD_SEARCH_CACHE_MAX_ENTRIES`, which defaults to `50` in the shared defaults module.
- Upstream TCGdex searches and image downloads time out after `TCGDEX_REQUEST_TIMEOUT_MS`, which defaults to `30000` in the shared defaults module.
- Provider timeouts are returned through the app's Problem Details error contract and remove the card-search loading state.
- The backend retries a TCGdex search or image download once after a network error, timeout, `429 Too Many Requests`, or provider `5xx` response; other provider `4xx` responses are not retried.
- A retry honors a valid provider `Retry-After` header or otherwise waits `TCGDEX_RETRY_DELAY_MS`, which defaults to `500` in the shared defaults module.
- Client-request cancellation aborts the retry delay and any retry attempt.
- Downloaded TCGdex images preserve validated JPEG, PNG, or WebP bytes without transcoding.
- The backend detects the image MIME type and file extension from the downloaded bytes rather than trusting the provider's response headers; unsupported content fails the assignment and is removed.
- TCGdex image downloads have no application-level byte-size limit and stream to a temporary file rather than buffering the complete response in memory.
- `GET /cards/{cardId}/image` resolves the card's shared image asset and streams its local file with the detected image `Content-Type`; storage IDs and filenames are not exposed to the frontend.
- A missing card, image-asset record, or local file returns `404 Not Found`.
- Card-image responses use long-lived `Cache-Control` immutable caching, and the persisted card representation supplies a different image URL whenever its underlying image asset changes.
- Card name, local number, and set name are persisted as separate fields; combined display labels are derived by the frontend rather than stored.
- Card source is a string enum shared by the database and OpenAPI schema, initially supporting `tcgdex` and `custom`.
- Provider card ID and provider set ID are required for `tcgdex` cards and absent for `custom` cards.
- The backend preserves TCGdex result ordering when normalizing, caching, and returning search results; the frontend does not re-sort them.
- The search query matches either the card name or the card's set name: TCGdex's `name` and `set.name` filters only combine as AND, so the backend queries both independently and merges the results, listing card-name matches first, then set-name matches not already included, deduplicated by provider card id.
- A TCGdex catalog card without a usable provider image (e.g. the "Celebrations Classic Collection" subset, which TCGdex has no image assets for at all) is excluded from search results rather than shown without an image, since the app requires an image for every saved card.

### 41. Filter card search by TCG Pocket inclusion and language

**Status:** Done (2026-08-01 21:17 EDT)

#### Acceptance criteria

- The card-selection modal's search view has two additional toggles alongside the search bar.
- The first toggle includes or excludes Pokémon TCG Pocket cards from search results and defaults to off (excluded).
- The second toggle selects English or Japanese card data and defaults to English.
- When the language toggle is set to Japanese, an entered English query is automatically translated to its Japanese Pokémon species name using PokéAPI before searching TCGdex.
- If the query does not match a known English Pokémon species name, the original query is searched as entered and the modal displays a nonblocking warning stating that no Japanese translation was found for the query.
- Changing either toggle updates the displayed results to reflect the new selection.
- When updating a toggle requires a new backend search, the shared loading component is used, previous results are not presented as results for the new search while it is loading, and a search failure removes the loading component and displays the provided error using the shared failed toast.
- Search results reflect only cards matching the current toggle selections.
- The first time the card-selection modal is opened in a binder visit, both toggles use their default values.
- Reopening the card-selection modal retains the toggle values last used, even though the existing empty-query, no-results reset still applies to the search itself.
- An Add More or Bulk Add session (Stories 17 and 18) retains the toggle values in effect when that session's searches were performed.

#### Technical requirements

- Toggle state is ephemeral React state that lives above the card-selection modal (e.g. in the binder route context) so it survives the modal closing and reopening; it is not persisted to the backend or browser storage and resets when the binder route context unmounts or the page reloads.
- `GET /card-catalog/search` accepts optional `includeTcgPocket` boolean and `language` (`en` or `ja`) query parameters; omitting either parameter behaves as `includeTcgPocket=false` and `language=en`.
- The default toggle values are exported from the canonical shared `defaults.ts` as `CARD_SEARCH_INCLUDE_TCG_POCKET_DEFAULT` (`false`) and `CARD_SEARCH_LANGUAGE_DEFAULT` (`"en"`).
- Changing the language toggle immediately re-searches the current trimmed query when it already meets `CARD_SEARCH_MIN_QUERY_LENGTH`, without waiting for `CARD_SEARCH_DEBOUNCE_MS`, since a language change requires different provider data; below the minimum length, no search runs and existing below-minimum behavior is unchanged.
- Automatic translation applies only to `language=ja` searches and only translates the trimmed query as a candidate English Pokémon species name; it does not translate set names or other free text.
- The backend looks up the candidate name against PokéAPI's species data using a case-insensitive exact match and, when found, searches TCGdex using the returned Japanese name instead of the original query.
- The backend caches successful PokéAPI name-translation lookups in memory for the life of the process; a cache miss triggers a new PokéAPI request rather than being retained as a negative cache entry.
- Upstream PokéAPI lookups time out after `POKEAPI_REQUEST_TIMEOUT_MS`, which defaults to `10000` in the canonical shared defaults module.
- A PokéAPI lookup miss (`404`), timeout, or other request failure does not block or fail the search: TCGdex is still searched using the original entered query, and the search response includes a nonblocking translation-warning flag rather than a Problem Details error.
- The frontend displays the translation warning alongside successfully loaded results without invoking the shared failed toast or replacing the loading or empty-results behavior.
- `language=ja` searches match only against card name, not set name; the set-name search TCGdex issues for `language=en` is skipped entirely for Japanese (out of scope per product direction).
- TCG Pocket set membership is determined backend-side: TCGdex has no per-card or per-set field distinguishing Pocket cards in the existing bulk search/sets responses, and TCGdex's regular card search already mixes Pocket-catalog cards into its results by default (confirmed during development, e.g. searching "Bulbasaur" without the toggle returned Pocket sets like `A1` alongside standard-catalog matches). Filtering therefore requires a separate, one-time-per-process lookup rather than being derivable from data already fetched for the current query.
- The backend fetches the Pokémon TCG Pocket serie's member set ids via `GET /v2/{language}/series/tcgp` (TCGdex's `tcgp` serie detail endpoint, whose `sets[]` array lists every member set's id in one request) and caches the resulting id set in memory per language for the life of the process, mirroring the existing per-language set-name cache. A card is excluded from `includeTcgPocket=false` results when its `providerSetId` is a member of that cached set.
- A failure resolving the Pocket set-id list (upstream error, timeout, or unexpected shape) degrades to not filtering anything for that one request, rather than failing the search outright; the lookup is retried on a later request instead of being cached as permanently empty.
- A toggle change that triggers a backend search aborts any in-flight search before starting the new one, reusing the existing `AbortController` cancellation behavior; only the latest qualifying query-and-toggle combination may publish results.
- The backend search-response cache key (`CARD_SEARCH_CACHE_MAX_ENTRIES`, `CARD_SEARCH_CACHE_TTL_MS`) incorporates the trimmed, case-normalized query together with any toggle values that affect the backend request, so cached results are never returned for a different toggle combination.
- Bulk Add (Story 18) submits its complete current result set together with the toggle values that produced it; the backend applies the same per-card normalization regardless of toggle state.
- Changing the TCG Pocket toggle immediately re-searches the current trimmed query the same way the language toggle does, without waiting for `CARD_SEARCH_DEBOUNCE_MS`, so both toggles behave consistently per the "Changing either toggle updates the displayed results" acceptance criterion.

### 12. Add a custom card manually

**Status:** Done (2026-08-01 22:41 EDT) - with one known gap: the "opened from the unplaced cards section" acceptance criterion isn't reachable through the UI yet because story 15 ("Manage unplaced cards") hasn't been built, so there's no unplaced-cards-section UI anywhere in the app to open the manual-entry modal from. The backend/contract/context layer fully supports a `null` placement end-to-end (an unplaced custom card can be created and optimistically tracked); only the frontend trigger for that specific entry point is still missing, pending story 15.

#### Acceptance criteria

- The card-selection modal has an option to add a custom card without selecting a TCGdex search result.
- The manual-entry option remains available when a TCGdex search returns no matches or fails.
- Selecting the manual-entry option displays fields for the card's name, set, number, and image.
- Name is required before a custom card can be added.
- An image is required before a custom card can be added.
- The custom card image can be uploaded from the user's computer.
- A custom card opened from an empty binder slot is added to the slot that originally opened the modal.
- A custom card opened from the unplaced cards section is added to that section.
- The custom card is saved through the backend to the database as a new, independent card entry.
- The saved record includes the entered name, set, number, and image.
- The saved record identifies the card as manually entered and does not assign TCGdex identity fields.
- Custom cards support the same later variation, acquisition, checklist, movement, duplication, and manual-pricing behavior as TCGdex cards.
- Adding a custom card uses the shared save-status toast and retains the entered fields for correction if saving fails.

#### Technical requirements

- Manual entry replaces the search content within the existing card-selection modal and provides a Back action that returns to the search view; it does not open a nested modal.
- Switching to manual entry preserves the current query and latest completed search results for the Back action; closing the modal still discards both views' state.
- The manual-entry form uses React Hook Form with a Zod schema.
- Custom card names are trimmed, required after trimming, and limited to 100 characters by the frontend schema, OpenAPI contract, and backend validation.
- Custom card set and number are optional trimmed strings; blank values are stored as `null`, set is limited to 100 characters, and number is limited to 50 characters across frontend and backend validation.
- The manual-entry form requires one image file before submission.
- Custom uploads accept JPEG, PNG, and WebP files; the file input's `accept` value advertises those formats, and the backend validates the file signature rather than trusting its name or multipart MIME type.
- An unsupported upload receives `415 Unsupported Media Type` using Problem Details and preserves the entered form fields for correction.
- Custom image uploads have no application-level byte-size limit, and the backend streams multipart file content to temporary storage rather than buffering the complete upload in memory.
- `POST /binders/{binderId}/cards` accepts a multipart form-data request for custom cards in addition to its JSON TCGdex-card request variant.
- The multipart fields contain the custom metadata and optional placement coordinates, the file part contains the required image, and the backend assigns the `custom` source server-side.
- The backend calculates a SHA-256 digest while streaming a custom upload, and custom cards with identical image bytes share one image-asset record and file.
- A database uniqueness constraint on the image digest prevents concurrent identical custom uploads from creating duplicate assets.
- Submitting a valid custom card closes the modal and optimistically adds it to the target slot or unplaced-card section using an object URL for the selected local image while the multipart request runs.
- The pending custom card is disabled until the request settles; success replaces it with the backend representation and revokes the object URL.
- Failure removes the optimistic card, reopens the manual-entry view with all text values and the selected `File` preserved, displays the shared failed toast, and revokes the object URL only when that preview is no longer used.
- An unplaced card remains a binder-owned card whose physical page, row, and column are all `null`.
- A database check constraint requires placement coordinates to be either all non-null or all null; sentinel coordinate values are not used.
- Placed and unplaced custom-card requests return the same `201 Created`, binder-card `Location` header, and complete persisted card representation as TCGdex card creation.
- Custom image assets retain a sanitized original upload filename as metadata, but the backend-generated storage filename is used for all filesystem operations.
- Multipart parsing is handled by `express-openapi-validator`'s built-in `fileUploader` option (multer under the hood, added as a new direct backend dependency alongside `@types/multer`) with a custom digest-computing disk `StorageEngine`, rather than its default in-memory buffering, to satisfy the no-byte-limit/streaming/digest-while-streaming requirements above in one pass.

### 13. Remove a card from a binder slot

**Status:** Done (2026-08-01 23:05 EDT)

#### Acceptance criteria

- Hovering over a card displays card actions over the card's top-right corner.
- The first action is an X button.
- Selecting the X removes the card from its binder slot on the page.
- Selecting the X deletes the binder-owned card record from the database through the backend.
- Card removal uses the shared save-status toast and restores the card to its slot if deletion fails.

#### Technical requirements

- The X action permanently deletes the binder-owned card record rather than clearing its coordinates or moving it to the unplaced-card section.
- Selecting X sends the delete request immediately without a confirmation dialog or undo delay.
- The client optimistically removes the card from the binder context, retains its previous list position and placement for rollback, and permits no further actions on that pending card.
- `DELETE /cards/{cardId}` permanently deletes the binder-owned card identified by its UUID.
- A successful deletion returns `204 No Content`.
- Deleting an already absent card also returns `204 No Content`; a malformed card UUID receives a request-validation Problem Details response.
- Card-owned variation, acquisition, checklist-association, manual-pricing, and other dependent records cascade-delete with the card in the same database transaction.
- If deletion removes the final card reference to an image asset, the backend immediately deletes the image-asset record and local file; assets with remaining card references are retained.
- Failure to delete an unreferenced local file does not roll back the committed database deletion or change the `204 No Content` response; the backend logs the orphaned path and cleanup error for maintenance.
- Card actions are revealed by pointer hover only in the initial desktop-supported version; keyboard and touch action disclosure is deferred.
- The X action is an icon-only HTML button with a stable hit area, an accessible delete label, and a tooltip naming the action.
- The frontend uses `lucide-react` for the X action and other familiar interface icons.

### 14. Move a card to a different binder slot

**Status:** Done (2026-08-01 23:39 EDT) - with one known gap: the "if the destination slot is occupied by multi-slot art, the card returns to its original slot" acceptance criterion isn't enforceable yet because story 25 ("Add multi-slot art") hasn't been built - there's no art table or route, and `listBinderArt` always returns `[]`. Every other acceptance criterion (drag/drop move, swap, transactional save, rollback on failure, shared save-status toast) is fully implemented end to end.

#### Acceptance criteria

- A card can be dragged from its current binder slot and dropped into a different slot.
- After the card is dropped into an empty slot, the binder layout displays it in the destination slot and clears its original slot.
- The card's new physical page, row, and column are saved to the database through the backend.
- If the destination slot contains another card, the two cards swap positions.
- Both card positions in a swap are saved together through the backend.
- If either position in a swap fails to save, neither saved position changes and both cards return to their original slots.
- If the destination slot is occupied by multi-slot art, the card returns to its original slot and its saved position does not change.
- Card movement and swapping use the shared save-status toast and restore all affected cards to their original slots if saving fails.

#### Technical requirements

- The frontend uses `@dnd-kit/core` for card dragging, application-defined slot collision detection, and the drag overlay.
- The dnd-kit pointer sensor uses a movement-distance activation constraint from `CARD_DRAG_ACTIVATION_DISTANCE_PX`, which defaults to `8` in the canonical shared `defaults.ts`.
- The initial movement workflow enables dnd-kit's pointer sensor only; keyboard and touch card movement are deferred.
- Card images set native HTML dragging to disabled so browser image dragging does not compete with dnd-kit.
- Collision detection selects a destination only when the pointer is within a binder slot's bounds.
- Dropping over a gap, control, or other non-slot region cancels the drag without changing client or persisted card positions.
- The drag overlay displays the card image at the rendered slot dimensions, and the source slot displays an empty placeholder while dragging.
- The binder context does not update card positions until a valid drop completes.
- The slot currently selected by collision detection uses one target-highlight style; the highlight does not distinguish moves, swaps, or multi-slot-art blocks.
- Card movement and swapping use `PATCH /cards/{cardId}` rather than a command-specific endpoint.
- The PATCH body contains a position update for the dragged card on a simple move and position updates for both affected card IDs on a swap; each update supplies the card's final physical page, row, and column.
- The path `cardId` must identify the dragged card included in the request body.
- Each position update also contains the card's expected current physical page, row, and column.
- The backend compares all expected positions and applies all final positions in one database transaction; any mismatch returns `409 Conflict` using Problem Details and changes no card positions.
- A successful movement PATCH returns `200 OK` with the complete persisted representation of every card updated by the move or swap.
- A valid drop optimistically applies every affected final position to the binder context and captures one pre-drop snapshot for the complete operation.
- Every card affected by a pending move or swap is disabled until the request settles; failure restores the complete snapshot, and success replaces optimistic cards with the returned representations.
- Move and swap requests are serialized within each binder; at most one movement request is in flight for a binder.
- While a movement request is in flight, all card dragging in that binder is disabled and new movement operations are not queued.
- The client uses loaded multi-slot-art coverage to cancel a blocked drop without sending a PATCH.
- The backend validates all submitted destination coordinates against current persisted multi-slot-art coverage; a blocked destination returns `409 Conflict` using Problem Details and applies no position changes.
- Dropping a card onto its source slot ends the drag without changing state, sending a request, or displaying a toast.
- Drag targets are limited to slots on the currently mounted spread; page controls and layout edges do not navigate while a drag is active.

### 15. Manage unplaced cards

**Status:** Done (2026-08-02 01:17 EDT) - with one known gap: the "dropping a card onto the unplaced art section redirects it to the unplaced cards section" acceptance criterion was added after this story shipped, before story 25's separate unplaced art section existed, and is not yet implemented.

#### Acceptance criteria

- An unplaced cards section appears on the left side of the "Edit Layout" tab.
- A card can be moved from a binder slot into the unplaced cards section.
- Moving a card into the unplaced cards section clears its binder slot and saves the card as unplaced in the database through the backend.
- An unplaced card can be moved into an empty or card-occupied binder slot.
- Moving an unplaced card into an empty slot removes it from the unplaced cards section and saves its physical page, row, and column in the database through the backend.
- Moving an unplaced card into a card-occupied slot places the dragged card in the slot and moves the prior occupant into the unplaced cards section.
- Dropping a placed or unplaced card onto the unplaced art section is still accepted and moves the card into the unplaced cards section instead of rejecting the drop.
- The unplaced cards section has an add button that opens the existing card-selection modal.
- Selecting a card from the modal adds it to the unplaced cards section and saves it to the database through the backend.
- Hovering over an unplaced card displays the existing card actions to its right, with the X as the first action.
- Selecting the X removes the unplaced card from the section and deletes it from the database through the backend.
- Adding, moving, and deleting unplaced cards use the shared save-status toast and restore their previous locations if an operation fails.

#### Technical requirements

- Unplaced cards are ordered by creation timestamp descending and then card UUID ascending as a deterministic tie-breaker.
- The binder cards API returns this order, and optimistic client updates preserve it.
- The unplaced section is an independently scrolling virtualized list implemented with `@tanstack/react-virtual`; only visible list items and its overscan are mounted.
- The panel fills the available viewport height below the layout toolbar and uses its own vertical scroll container; its height does not depend on the rendered binder spread.
- The complete unplaced panel is one dnd-kit drop target; dropping a placed card anywhere within its bounds clears the card's physical page, row, and column.
- The unplaced art section is also a valid dnd-kit drop target for a card drag; dropping a card there routes it through the same unplaced-cards move or swap logic as dropping within the unplaced cards section, rather than being rejected as an invalid target.
- Pointer position does not define list order; the moved card is inserted according to the section's newest-first ordering.
- Moves into and out of the unplaced section use `PATCH /cards/{cardId}` with nullable expected and final coordinate triples and inherit the movement API's concurrency, transaction, response, and rollback requirements.
- An unplaced-to-occupied swap submits both cards: the dragged card changes from all-null coordinates to the destination coordinates, and the prior occupant changes from those coordinates to all null.
- dnd-kit auto-scroll is disabled for the unplaced panel; its scroll position remains stationary during a drag.
- After a card is created, moved, or swapped into the unplaced section, the virtualizer scrolls that card into view at its derived ordered position.
- The panel add button opens the shared card-selection modal with an all-null placement target; TCGdex and custom creation reuse the established optimistic create-card contracts.
- The unplaced-card X action reuses `DELETE /cards/{cardId}` and the established immediate optimistic permanent-deletion and rollback behavior.
- When no unplaced cards exist, the panel renders its normal add button without a separate empty-state message.

### 16. Add card variations

**Status:** Not started

#### Acceptance criteria

- The add-card modal has a field for adding a variation to the selected card.
- The variation field allows the user to select "Reverse Holo", "Non-Holo", "1st Edition", or "Expansion Stamp".
- The variation field also allows the user to enter a custom value that is not in the suggested list.
- The selected or entered variation is saved with the card information in the database through the backend.
- Hovering over a card displays an edit action with the existing card actions to its right.
- Selecting the edit action opens a modal for editing the card's variation.
- Saving the edit updates the card's variation in the database through the backend.
- The "Edit Layout" tab has a toggle for showing or hiding card variations.
- Card variations are hidden by default.
- Turning the toggle on displays each card's variation on the binder layout.
- Turning the toggle off hides card variations on the binder layout.
- Adding or editing a variation uses the shared save-status toast and preserves the entered value for correction if saving fails.

#### Technical requirements

- Each card stores one nullable variation string; assigning another value replaces the existing variation.
- Variation entry uses an editable combobox that filters suggested values and accepts unmatched custom text in the same input.
- The immutable `CARD_VARIATION_SUGGESTIONS` tuple is exported from the canonical shared `defaults.ts` with `Reverse Holo`, `Non-Holo`, `1st Edition`, and `Expansion Stamp`.
- Variation text is trimmed, blank input is stored as `null`, and nonblank values are limited to 50 characters by the frontend schema, OpenAPI contract, and backend validation.
- The optional variation is included in the TCGdex JSON or custom multipart `POST /binders/{binderId}/cards` request so card creation and its initial variation persist atomically.
- The edit action opens the shared custom modal shell with only the editable variation combobox and Save and Cancel commands, prefilled from the card's current variation.
- Variation edits use `PATCH /cards/{cardId}` with a nullable `variation` field.
- A successful variation update returns `200 OK` with the complete persisted card representation.
- Saving closes the modal and optimistically updates the card's variation in the binder context while the shared save-status toast tracks the request.
- On success, the returned card replaces the optimistic value; on failure, the previous card is restored and the modal reopens with the attempted variation preserved.
- Variation updates use last-write-wins semantics and do not include an expected prior value or card timestamp.
- Variation-label visibility is enabled by `variations=true` on the layout route and defaults to hidden when the parameter is absent.
- Toggling variation labels updates the query using history replacement and preserves the current `page` and `michi` parameters.
- Any other `variations` value is treated as hidden and removed from the URL using history replacement.
- When visible, a variation label renders below its card slot without reducing or resizing the slot or card image.
- Each binder grid row reserves variation-label space below its slots, increasing the rendered binder side's height while preserving every slot's configured aspect ratio and dimensions.
- Variation labels remain on one line at the slot width, truncate overflow with an ellipsis, and expose the complete value in a hover tooltip.
- When variation labels are enabled, every slot reserves the same label-row height, including empty slots and cards without a variation, so grid rows remain aligned.

### 17. Add more cards

**Status:** Not started

#### Acceptance criteria

- The card-selection modal has Cancel, Add More, and Add Card buttons at the bottom.
- The modal does not have a quantity field; each add action creates exactly one card instance.
- Add Card adds the selected card and closes the modal.
- Add More adds the selected card, clears the current card search and selection, and keeps the modal open for another search.
- When the modal was opened from an empty binder slot, the first Add More submission targets that original slot.
- All later submissions in the same Add More session target the unplaced cards section, even if the first submission failed.
- When the modal was opened from the unplaced cards section, every added card is added to that section.
- Every added card is saved as a new, independent card entry in the database through the backend.
- Each added card retains the selected card's TCGdex identity fields and variation.
- Adding more cards uses the shared save-status toast, and cards that fail to save are not displayed in the slot or unplaced cards section.
- Card searches during an Add More session continue to use the shared loading component and failed toast.

#### Technical requirements

- Add More submits one card through the existing `POST /binders/{binderId}/cards` contract and disables Add More and Add Card while that request is pending.
- The modal retains the selected card, variation, query, and results until the request succeeds.
- After success, the modal clears the query, results, selected card, and variation and returns focus to the search input for the next card.
- After failure, the modal retains the current values for correction or retry and does not display the failed card in the binder context.
- Add Card closes the modal immediately and uses the established one-card optimistic create and rollback behavior.
- If Add Card fails, the modal reopens with the query, results, selected card, and variation from the failed submission preserved.
- A valid manual custom-card form also offers Add More and submits exactly one multipart create-card request.
- Custom Add More keeps the manual form and selected file while the request is pending; success clears the form, revokes its object URL, and returns to the search view, while failure retains the complete form for retry.
- Cancel, Escape, backdrop clicks, and the close control may dismiss the modal while an Add More request is pending; dismissal does not abort the create-card mutation.
- A dismissed pending request still adds the persisted card to the binder context on success and reports an error through the shared failed toast on failure.
- If a dismissed Add More request fails, the modal reopens automatically in its prior TCGdex-selection or custom-entry view with all submitted values preserved; success leaves the modal closed.
- The modal session marks its original slot target as consumed when the first Add More request is submitted, regardless of that request's outcome; retries and later submissions use all-null placement coordinates.
- Add Card and Add More are enabled only when a TCGdex result is selected or the custom-card form is valid, and both are disabled while a create-card request is pending.

### 18. Bulk add cards

**Status:** Not started

#### Acceptance criteria

- The card-selection modal has a Bulk Add option for adding every card that matches the current TCGdex search.
- A bulk-add search can be used to find groups such as every card in a set or every card for a particular Pokemon.
- Bulk Add includes the complete set of matching search results rather than only the results currently visible in the modal.
- The Bulk Add control displays the number of cards in the current result set.
- Selecting Bulk Add immediately adds the complete current result set without a separate confirmation step.
- Bulk Add is unavailable when the current search has no results.
- The bulk-add workflow has an optional variation field.
- The variation field supports the same suggested and custom values as adding an individual card.
- When a variation is provided, it is applied to every card created by the bulk addition.
- Every bulk-added card is added to the unplaced cards section, including when the card-selection modal was opened from a binder slot.
- Every bulk-added card is saved as a new, independent card entry in the database through the backend.
- Each bulk-added card retains its own TCGdex identity fields, image, and source.
- Bulk addition uses the shared save-status toast, and cards that fail to save are not displayed in the unplaced cards section.
- Bulk-add searches use the shared loading component and failed toast.

#### Technical requirements

- Bulk addition supports partial success: each matching card is persisted independently rather than in one all-or-nothing database transaction.
- Successful cards are added to the binder context and unplaced section, while failed cards are omitted.
- The bulk response contains an outcome for every submitted card so the client can reconcile successful and failed creations.
- `POST /binders/{binderId}/cards/bulk` accepts the complete array of normalized TCGdex search results and one optional shared variation.
- Every bulk-created card uses all-null placement coordinates regardless of where the card-selection modal was opened.
- The endpoint returns `201 Created` when every card succeeds and `207 Multi-Status` when one or more processed cards fail, including a processed batch in which every card fails.
- Request-wide validation or infrastructure failures that prevent per-card processing return the applicable Problem Details response instead of a bulk outcome array.
- Selecting Bulk Add submits immediately from the search view without replacing the modal content or opening a confirmation dialog.
- The submitted array comes from the complete latest search response in state rather than the rows currently mounted by the virtualized grid.
- Selecting Bulk Add closes the card-selection modal immediately and runs the bulk request in the background while one shared saving toast tracks the batch.
- The unplaced section is updated from successful per-card outcomes after the bulk response arrives.
- Complete success replaces the saving toast with the shared saved toast; partial or complete card-level failure replaces it with a persistent failed-style toast showing added and failed counts.
- The bulk failure toast includes an action that opens the shared custom modal shell with one entry per failed card, identified by card name, set, and local number and accompanied by its Problem Details message.
- The failure-details modal provides Retry All Failed, which resubmits only the failed normalized card payloads with the original shared variation to the same bulk endpoint.
- Cards that previously succeeded are not included in a retry request.
- Retry All Failed closes the details modal immediately and runs the retry in the background using the same saving toast, outcome summary, and failure-details behavior as the initial request.
- The backend processes at most `BULK_CARD_CREATE_CONCURRENCY` card creations concurrently, which defaults to `5` in the canonical shared `defaults.ts`.
- Bulk outcome entries preserve submitted TCGdex result order regardless of processing completion order.
- Every submitted array element creates an independent binder-owned card, including repeated TCGdex card IDs; repeated provider cards reuse their shared local image asset.
- Bulk Add is enabled only when the current qualifying query has completed successfully with at least one result and no newer search is pending.
- Retained results from an older query or a current query below the minimum length remain visible but are not eligible for Bulk Add.
- At most one bulk-add request may run for a binder; the frontend keeps Bulk Add disabled for that binder until the active request settles, including after the card selector is reopened.
- The backend rejects an overlapping bulk request for the same binder with `409 Conflict` using Problem Details.
- After the backend accepts a bulk request, client disconnection does not cancel in-flight or remaining card processing.
- If the client does not receive the outcome response, the next normal binder-card load reconciles the persisted bulk-created cards.
- Each logical bulk attempt includes a client-generated UUID idempotency key; transport retries reuse that key.
- The backend persists the key and complete outcome scoped to the binder and returns the stored outcome for a repeated key without creating additional cards.
- Retry All Failed is a new logical bulk attempt and uses a new idempotency key for its failed-card subset.
- Completed mutation idempotency outcomes are retained for `MUTATION_IDEMPOTENCY_RETENTION_MS`, which defaults to `86400000` (24 hours) in the canonical shared `defaults.ts`.
- The backend removes expired idempotency records opportunistically during startup and bulk-request handling rather than requiring a background scheduler.

### 19. Duplicate a card

**Status:** Not started

#### Acceptance criteria

- Hovering over a card displays a duplicate-card action with the existing card actions.
- Selecting the duplicate-card action creates a new, independent card entry in the database through the backend.
- The duplicated card is added to the unplaced cards section.
- The original card remains in its current location and is unchanged.
- Card duplication uses the shared save-status toast and does not display a duplicate if creation fails.

#### Technical requirements

- Duplication copies all card-owned data, including source and provider fields, custom metadata, variation, acquisition state, and saved pricing data.
- The duplicate receives a new backend-generated card UUID and UTC timestamps, belongs to the same binder, and has all-null placement coordinates.
- The duplicate references the original card's existing image asset rather than creating or copying an image file.
- `POST /cards/{cardId}/duplicate` reads the authoritative source card and creates its duplicate without accepting copied card fields from the client.
- A successful duplication returns `201 Created`, a `Location` header for the duplicate card, and its complete persisted representation.
- Selecting duplicate optimistically inserts an unplaced copy into the binder context with a client-generated temporary ID and the original card's image URL.
- The optimistic duplicate is disabled while saving; success replaces it with the returned card, while failure removes it and displays the shared failed toast.
- The unplaced virtualizer scrolls the optimistic duplicate into view using the established newly-added-card behavior.
- The source card's duplicate action remains available while prior duplicate requests are pending; each request has an independent temporary card, operation ID, toast, and rollback path.
- Each duplicate action includes a client-generated UUID idempotency key; retries of one action reuse its key, while separate actions use distinct keys.
- The backend persists each duplication outcome for the shared mutation idempotency-retention period and returns the same created card for a repeated key without duplicating it again.

### 20. Add a binder preview

**Status:** Not started

#### Acceptance criteria

- Each binder in the home page list displays a preview of one of its pages.
- The preview shows how the selected binder page and its cards appear in the binder layout.
- The reusable binder-details form on the new binder page and the "Edit Details" tab has a field for selecting which physical page is used by the preview.
- The preview physical page defaults to page 2.
- The selected preview page is saved with the binder through the backend.
- The home page list uses the binder's saved preview page when displaying the preview.
- Saving the preview page uses the shared save-status toast and restores the previous selection if saving fails.

#### Technical requirements

- Home-page previews render live as noninteractive React layouts rather than generated or stored bitmap images.
- The preview reuses the binder-side, slot, card, and multi-slot-art rendering primitives from the full layout while omitting editing controls, drag-and-drop registration, and card actions.
- Binder-summary data includes only the selected preview spread's placement and image information required by the miniature layout rather than the complete binder graph.
- The binder stores `previewPhysicalPage` as a one-based physical focal page and resolves it to the same single page or two-page spread as layout navigation.
- `DEFAULT_BINDER_PREVIEW_PHYSICAL_PAGE` defaults to `2` in the canonical shared `defaults.ts`.
- The reusable binder-details form uses an HTML number input and validates `previewPhysicalPage` as an integer from `1` through twice the form's current stored page count.
- Either page in a two-page spread is retained as the saved focal value rather than canonicalized to the other page.
- If reducing stored page count makes the saved preview page invalid, the frontend and backend reset `previewPhysicalPage` to `DEFAULT_BINDER_PREVIEW_PHYSICAL_PAGE` in the same binder update.
- The existing binder-list endpoint embeds each binder's selected preview-spread data in its binder summary; the home page does not issue separate preview requests.
- Embedded preview data contains only spread identity, placed card and multi-slot-art geometry, display metadata, and image URLs; image bytes and unrelated binder records are excluded.
- Every binder-list item uses the same stable preview-frame dimensions, defined by the frontend styling system rather than binder data.
- The complete selected single page or two-page spread scales proportionally to contain within the frame without cropping.
- Previews render slots, cards, and multi-slot art only; variation labels, Michi indicators, acquisition state, pending-operation feedback, and editing controls are omitted.
- A failed card or multi-slot-art image preserves its occupied preview geometry and renders a neutral missing-image placeholder; one failed image does not replace the complete preview.

### 21. Manage binders from the home page

**Status:** Not started

#### Acceptance criteria

- Hovering over a binder in the home page list displays delete, copy, and edit actions.
- The delete action is represented by an X.
- Selecting edit opens that binder's view/edit page with the "Edit Details" tab selected.
- Selecting copy creates a new binder in the database through the backend.
- Copying a binder creates new database entries for all entries belonging to the binder rather than references to the original entries.
- Selecting delete opens a confirmation modal.
- The delete confirmation modal has cancel and confirm delete actions.
- Selecting cancel closes the modal without deleting the binder.
- Selecting confirm delete deletes the binder from the database through the backend and removes it from the home page list.
- Binder copy and deletion use the shared save-status toast, and a binder remains in the list if deletion fails.

#### Technical requirements

- Binder copying creates new binder, card, multi-slot-art, and dependent database records while those new records reference the source records' existing immutable image assets and files.
- `POST /binders/{binderId}/duplicate` reads and deep-copies the authoritative binder graph without accepting copied binder data from the client.
- A successful copy returns `201 Created`, a `Location` header for the new binder, and its complete home-page binder summary.
- The backend names a copy by trying the source name plus ` Copy`, then ` Copy 2`, ` Copy 3`, and increasing integers until the case-insensitively normalized name is unique.
- The source-name portion is truncated as needed so the generated suffix fits within the 100-character binder-name limit.
- Selecting copy optimistically inserts a temporary binder summary using the first generated name available in the current client list and marks the temporary binder disabled while copying.
- Success replaces the temporary summary with the backend response and authoritative unique name; failure removes it and displays the shared failed toast.
- The new binder and every copied card, multi-slot-art, and dependent record are created in one database transaction; any record-copy failure rolls back the complete copied graph.
- Rollback does not modify the source binder or its shared image assets.
- Each binder-copy action includes a client-generated UUID idempotency key; retries of one action reuse its key, while separate copy actions use distinct keys.
- The backend persists the copied-binder outcome for the shared mutation idempotency-retention period and returns the same binder for a repeated key without copying it again.
- `DELETE /binders/{binderId}` permanently deletes the binder identified by its UUID.
- Deleting an existing or already absent binder returns `204 No Content`; a malformed binder UUID receives a request-validation Problem Details response.
- The delete confirmation uses the shared custom modal shell and identifies the binder by name.
- Confirm Delete closes the modal and optimistically removes the binder summary while retaining its prior list position for rollback.
- A `204 No Content` response finalizes removal; failure restores the binder summary and displays the shared failed toast.
- Binder deletion removes the binder and all binder-owned dependent records in one database transaction.
- Image assets shared with other binders remain intact; image metadata and local files are cleaned up only after their final card or art reference is removed.
- Filesystem cleanup runs after the database transaction commits; a file-deletion failure does not fail or reverse the binder deletion.
- Failed file deletions are persisted as pending cleanup work and retried by the backend, while the delete request still returns `204 No Content`.
- Deleting a locked binder is rejected with a `409 Conflict` Problem Details response identifying the locked-binder conflict; the client restores an optimistically removed binder.
- The home-page action menu omits Delete for binders known by the client to be locked; backend conflict enforcement protects stale clients and direct requests.

### 22. Show binder completion metrics

**Status:** Not started

#### Acceptance criteria

- The top of the home page binder list has a toggle for showing or hiding binder completion metrics.
- When the toggle is on, completion metrics appear below each binder in the list.
- Each binder displays its number of occupied slots and empty slots.
- A slot containing a card is counted as occupied.
- Every slot covered by placed multi-slot art is counted as occupied.
- Unplaced cards and multi-slot art do not count as occupied slots.
- Each binder displays a slot-completion percentage calculated as `(occupied slots / total binder slots) x 100`.
- Each binder also displays its card-acquisition percentage.
- When the toggle is off, the completion metrics are hidden.
- Completion metrics update when cards or multi-slot art are added, removed, moved, or when card acquisition changes.
- Loading binder completion metrics uses the shared loading component, and a failure removes the loading state and displays the provided error using the shared failed toast.

#### Technical requirements

- The binder-list endpoint includes completion metrics in every binder-summary response; the client does not make a separate metrics request.
- The metrics toggle controls presentation only, and switching it does not refetch the binder list.
- The backend calculates canonical completion aggregates from persisted binder dimensions, placements, multi-slot art, and card-acquisition data rather than returning the full binder graph for client-side calculation.
- Card-acquisition percentage is `acquired card records / all card records associated with the binder x 100`; both placed and unplaced cards count, and multi-slot art is excluded.
- When a binder has no card records, its card-acquisition percentage is `null` and the client displays `N/A`.
- The API exposes the underlying metric counts without storing rounded percentages; the client displays both percentages rounded to the nearest whole percent.
- The metrics visibility preference is persisted in browser local storage and restored on subsequent home-page visits; it is not stored by the backend.
- Completion metrics are visible before a local preference has been saved; this first-visit value is exported from the canonical shared `defaults.ts`.
- Each binder summary returns `totalSlots`, `occupiedSlots`, `emptySlots`, `acquiredCards`, and `totalCards`; the client derives slot-completion and card-acquisition percentages from those counts.

### 23. Add binder notes

**Status:** Not started

#### Acceptance criteria

- The binder view/edit page has a toggle for showing or hiding a notes section.
- The notes section appears below the binder layout and the unplaced cards and unplaced art sections, spanning the full width of the tab, when it is visible.
- The notes toggle defaults to on for an unlocked binder.
- The notes toggle and notes section are hidden while the binder is locked.
- The notes section contains a large text box for free-form notes and to-do items.
- The binder's saved notes are loaded from the database through the backend.
- The notes text box is editable when the binder is unlocked.
- Locking a binder does not delete or change its saved notes, and unlocking it makes them available again.
- When the notes text box loses focus after its contents change, the updated notes are saved to the database through the backend.
- Notes loading uses the shared loading component and displays the provided error using the shared failed toast if loading fails.
- Notes saving uses the shared save-status toast and preserves the entered text for correction if saving fails.

#### Technical requirements

- Notes are included in the existing binder-details response and shared binder context rather than loaded through a separate request.
- Notes are saved through the existing partial binder update endpoint.
- Binder notes are persisted as Markdown source text rather than rendered HTML.
- Unlocked binders display only the Markdown source textarea without a rendered preview.
- The frontend does not mount the notes toggle, textarea, or notes content for a locked binder; the persisted Markdown remains part of the binder data and is unchanged by locking or unlocking.
- Binder notes are limited to 1,000,000 characters by the frontend schema, OpenAPI contract, and backend validation.
- An exactly empty notes string is normalized to `null`; nonempty Markdown is preserved without trimming leading or trailing whitespace.
- Notes are visible for an unlocked binder when the route has no `notes` query parameter; `notes=false` hides the panel.
- Toggling notes visibility updates the query using history replacement and preserves all other route query parameters.
- Any `notes` value other than `false` is treated as visible and removed from the URL; locked binders remain hidden without rewriting the saved query state.
- Notes updates are serialized so only one notes save is in flight per binder; editing remains enabled while a save is pending.
- If the notes change again while saving, intermediate values are coalesced and the latest value is sent in one follow-up request after the active save settles.
- If an active notes save fails while a newer value is queued, the client reports that failure and still submits the latest queued value; a successful follow-up response becomes the saved binder state.

### 24. Configure card and multi-slot art dimensions

**Status:** Not started

#### Acceptance criteria

- The reusable binder-details form on the new binder page and the "Edit Details" tab has editable fields for the width per slot and width base values.
- Width per slot defaults to 6.85 cm and width base defaults to -0.5 cm.
- Displayed width is calculated as `(number of slots x width per slot) + width base`.
- With the default width values, widths of 1, 2, and 3 slots are 6.35 cm, 13.2 cm, and 20.05 cm.
- The reusable binder-details form has editable fields for the height per slot and height base values on both pages.
- Height per slot defaults to 9 cm and height base defaults to 0 cm.
- Displayed height is calculated as `(number of slots x height per slot) + height base`.
- With the default height values, heights of 1, 2, and 3 slots are 9 cm, 18 cm, and 27 cm.
- The reusable binder-details form has editable multi-slot art fields for border color, border radius, and border width on both pages.
- Border color defaults to `#FFCB05`.
- Border radius defaults to 38%.
- Border width defaults to 11%.
- The dimension and multi-slot art values are saved with the binder through the backend.
- TBD: Verify all supplied default values during implementation before finalizing them.
- Saving dimension and multi-slot art settings uses the shared save-status toast and preserves the entered values for correction if saving fails.

#### Technical requirements

- Dimension values accept centimeters to two decimal places, and border radius and width accept percentages to two decimal places.
- REST contracts expose decimal values in their documented human-readable units; the database stores centimeters as integer hundredths of a centimeter and percentages as integer hundredths of a percentage point to avoid floating-point drift.
- Width-per-slot and height-per-slot values must be greater than zero; base values may be negative only when the corresponding one-slot formula produces a result greater than zero.
- Border radius and border width must be between `0%` and `100%`, inclusive.
- Border color uses a color input paired with an editable text value, accepts only six-digit `#RRGGBB` hexadecimal colors, and normalizes hexadecimal letters to uppercase before saving.
- Border radius follows CSS percentage semantics: horizontal radii are relative to the frame width and vertical radii are relative to the frame height across editor, layout, preview, and print rendering.
- TBD: Define the physical or rendered dimension used as the basis for the border-width percentage before implementing multi-slot-art rendering or print export.
- The configured one-slot width and height define the binder's on-screen slot and card aspect ratio and are also the basis for multi-slot-art and print dimensions; the default formulas retain the initial `6.35:9` one-slot ratio.

### 25. Add multi-slot art

**Status:** Not started

#### Acceptance criteria

- An unplaced art section appears on the right side of the "Edit Layout" tab, separate from the unplaced cards section.
- The unplaced art section has an add-art button that opens a modal for creating multi-slot art.
- The modal allows the user to upload an image from the computer's files.
- The modal also accepts an image pasted from the clipboard with Cmd+V.
- The modal has fields for the multi-slot art's title and description.
- The modal has a grid selector whose columns and rows match the binder's width and height.
- A 4-by-4 binder displays a 4-by-4 selector containing 16 cells.
- Hovering over a cell highlights the rectangle from the top-left cell through the hovered cell.
- Selecting a cell sets the art's width and height in slots from that highlighted rectangle.
- Selecting row 1, column 2 creates art that is 2 slots wide and 1 slot high.
- With the default dimension settings, art that is 2 slots wide and 1 slot high measures 13.2 cm by 9 cm.
- The modal has fields for art-specific border color, border radius, and border width.
- Each art-specific border field can either use the binder's setting or define a custom value.
- When an art-specific field uses the binder's setting, its override is stored as null in the database so later binder-setting changes apply to the art.
- The modal displays an editable preview of the uploaded image inside a border frame sized from the selected slot dimensions and border settings.
- The border frame remains fixed while the image can be repositioned within it.
- The image can be resized while preserving its aspect ratio.
- The image can also be stretched or compressed horizontally and vertically when needed.
- Rotate-left and rotate-right controls rotate the image inside its fixed border frame in 90-degree increments.
- The preview reflects the image's position, scale, rotation, aspect-ratio adjustments, and border settings.
- The modal evaluates the uploaded image's pixel dimensions against the art's selected physical print dimensions using a documented minimum print-resolution threshold.
- Image quality is reevaluated when the uploaded image or selected slot dimensions change.
- When the image does not meet the minimum resolution for its physical print size, a warning appears in the modal.
- The warning explains that the image may appear blurry or pixelated when printed and displays the image's available resolution and the required resolution.
- The image-quality warning does not prevent the user from saving the multi-slot art.
- The title, description, original uploaded image, selected slot dimensions, image-editing specifications, and art-specific style overrides are saved through the backend.
- Outside the editor, the art renders with the saved positioning, scaling, rotation, aspect-ratio adjustments, and border settings.
- After it is added, the multi-slot art appears in the unplaced art section with an aspect ratio derived from its configured physical dimensions and scaled to fit the panel width.
- Placement and other interactions for multi-slot art on the binder layout will be defined in the next story.
- Image upload and multi-slot art creation use the shared save-status toast, and the modal retains its image and entered settings if either operation fails.

#### Technical requirements

- `POST /binders/{binderId}/art` uses one multipart request containing the image and normalized art metadata.
- Individual multi-slot-art records use `/art/{artId}` resource paths, with backend-generated UUIDs as `artId` values.
- Image installation, image-asset persistence, and art-record creation succeed as one logical operation; failure removes temporary files and any newly created unreferenced image file or metadata.
- The backend calculates a SHA-256 digest while streaming the upload and reuses the global immutable image asset when identical bytes already belong to multi-slot art or a custom card.
- A database uniqueness constraint on the image digest prevents concurrent identical uploads from creating duplicate assets.
- The image asset retains the exact uploaded source bytes; when JPEG EXIF orientation requires it, ingestion also creates an immutable orientation-normalized rendering derivative.
- The backend uses `sharp` to inspect pixel dimensions and generate auto-oriented rendering derivatives.
- The editor, layout, preview, and print renderers use normalized pixel orientation, while exports that require the original upload retain access to the source file.
- Source installation, derivative generation, and art-record creation participate in the same logical creation operation, and failure cleans up newly created unreferenced source and derivative files.
- File selection and clipboard paste accept JPEG, PNG, and WebP images; the backend detects and validates the file signature rather than trusting the filename or multipart MIME type.
- Unsupported image content receives `415 Unsupported Media Type` using Problem Details and leaves the modal state available for correction.
- Multi-slot-art uploads have no application-level byte-size limit and stream to temporary storage rather than being buffered completely in backend memory.
- Art titles are trimmed, required after trimming, and limited to 100 characters by the frontend schema, OpenAPI contract, and backend validation.
- Art descriptions are optional, limited to 10,000 characters, and stored as `null` when blank.
- New art initializes border color, radius, and width in Use Binder Setting mode, with each corresponding override persisted as `null`.
- Switching one field to a custom value affects only that nullable override; fields that remain `null` resolve against the binder's current settings at render time.
- The unplaced art section orders art by creation timestamp descending and then art UUID ascending, matching the unplaced cards section's tie-breaking rule, but is an independently rendered panel rather than a combined list with cards.
- Unplaced art preserves its configured physical aspect ratio and scales down to fit the panel width without horizontal scrolling; proportional sizing does not require an absolute shared scale with card thumbnails.
- The unplaced art section's virtualizer measures variable art-row heights after rendering rather than assuming the unplaced cards section's fixed card-row estimate.
- The image editor uses `konva` with `react-konva` for dragging and transform handles.
- The editor persists normalized focal X and Y coordinates plus independent horizontal and vertical scale multipliers relative to the computed centered-cover fit rather than a rendered canvas snapshot.
- Each art record also stores `imageRotationDegrees` as one of `0`, `90`, `180`, or `270`; rotate-left and rotate-right controls change it by one quarter turn with wraparound.
- Rotation applies only to the image within the fixed art frame and does not alter the frame's slot dimensions, border settings, or placement footprint.
- Layout, preview, and print renderers derive transformed image geometry from the same rotation, focal-point, and scale-multiplier contract at their respective output sizes.
- Normalized focal coordinates and scale multipliers are rounded to four decimal places in REST contracts and stored as integer ten-thousandths in the database; `imageRotationDegrees` is stored as its discrete integer value.
- The art frame clips image overflow, and editor constraints require the transformed image to cover the complete inner frame without transparent or background-colored gaps.
- A newly selected image starts unrotated and centered with an aspect-ratio-preserving `cover` fit that scales it just enough to fill the selected frame.
- Changing the selected slot width or height discards manual image transforms, resets `imageRotationDegrees` to `0`, and resets the image to a centered `cover` fit for the new frame.
- `MIN_ART_PRINT_RESOLUTION_PPI` defaults to `300` in the canonical shared `defaults.ts` and drives the nonblocking image-quality warning.
- The client calculates effective horizontal and vertical PPI from the source pixels used after cropping and scaling and the configured physical output dimensions.
- The quality warning appears when either effective axis is below the threshold and reports both effective axis values and the pixel dimensions required at the configured art size.
- The create-art modal starts without a selected slot width or height; the preview and Save action remain unavailable until the user selects a grid size and supplies an image.
- Pasting a supported image when one is already loaded opens a nested custom confirmation dialog above the art editor; confirming replaces the image, resets `imageRotationDegrees` to `0`, and resets its transform to centered cover, while cancelling retains the existing image and edits.
- While replacement confirmation is open, only the top dialog is interactive and owns the focus trap; closing it restores focus to the art editor.
- Clipboard image handling is active only while the art modal is open and does not intercept paste when focus is in the title or description control; those controls retain normal text-paste behavior.
- Submitting valid art closes the modal and optimistically inserts a disabled unplaced-art item using an object URL for the selected image.
- A successful `201 Created` response includes a `Location` header and the complete persisted art representation, which replaces the optimistic item and allows the object URL to be revoked.
- Failure removes the optimistic item, reopens the editor with the image, metadata, dimensions, rotation, transforms, and style choices preserved, and retains the object URL until that restored preview no longer needs it.

### 26. Move and manage multi-slot art

**Status:** Not started

#### Acceptance criteria

- Hovering over multi-slot art displays edit, delete, and duplicate actions comparable to the existing card actions.
- Selecting edit opens the same modal used to add multi-slot art, populated with the art's saved title, description, image, dimensions, positioning, scaling, rotation, aspect-ratio adjustments, and style overrides.
- Saving an edit updates the multi-slot art in the database through the backend.
- Selecting delete removes the multi-slot art from the layout or unplaced art section and deletes it from the database through the backend.
- Selecting duplicate creates a new, independent multi-slot art entry in the database through the backend and adds it to the unplaced art section.
- Multi-slot art can be moved from the unplaced art section into the binder layout.
- The art occupies a rectangular group of slots matching its saved width and height in slots.
- A placement succeeds only when every slot in the art's target area is unoccupied.
- If any slot in the target area is occupied, the placement is rejected and the art remains in the unplaced art section with no saved position change.
- Multi-slot art cannot swap positions with a card or another piece of multi-slot art.
- Any move involving multi-slot art is rejected if one or more slots in its target area are occupied, regardless of the occupying item type.
- After a successful placement, the art is removed from the unplaced art section and its binder position is saved through the backend.
- Every slot covered by placed multi-slot art is considered occupied.
- Cards and other multi-slot art cannot be placed in any slot occupied by multi-slot art.
- Multi-slot art can be moved from the binder layout back into the unplaced art section.
- Moving art back to the unplaced art section clears all slots it occupied and saves it as unplaced through the backend.
- Dropping placed or unplaced art onto the unplaced cards section is still accepted and moves the art into the unplaced art section instead of rejecting the drop.
- Editing, deleting, duplicating, and moving multi-slot art use the shared save-status toast and restore the art's previous state or location if an operation fails.

#### Technical requirements

- Placed art stores one-based physical page, row, and column coordinates for its top-left slot; all covered coordinates are derived from that anchor and the art's saved slot width and height.
- Unplaced art has all three placement coordinates set to `null`, and a database check constraint requires the coordinate triple to be either entirely present or entirely null.
- Art must fit within one physical binder side and cannot span physical pages; the backend validates every derived covered coordinate against the binder's current width and height.
- Art movement uses `PATCH /art/{artId}` with expected and final nullable coordinate triples.
- The backend compares the expected placement and validates every destination slot in one transaction; stale placement or occupied coverage returns `409 Conflict` using Problem Details and changes nothing.
- A successful movement returns `200 OK` with the complete persisted art representation.
- Card and art moves share one binder-scoped movement queue; at most one layout move is in flight for a binder, and all card and art dragging is disabled until it settles.
- The unplaced cards section is also a valid dnd-kit drop target for an art drag; dropping art there routes it through the same unplaced-art move logic as dropping within the unplaced art section, rather than being rejected as an invalid target.
- Art dragging records the relative footprint cell under the initial pointer; the hovered destination slot aligns with that cell, and the client derives the destination top-left anchor by subtracting the grabbed row and column offsets.
- For unplaced-art thumbnails, the initial pointer's normalized position within the thumbnail maps to the corresponding footprint cell before dragging begins.
- During an art drag, the client highlights every slot in the derived candidate footprint and uses distinct valid and blocked styles.
- Any out-of-bounds coordinate or slot occupied by a card or other art marks the complete candidate footprint as blocked.
- Dropping on a client-known blocked footprint cancels locally, restores the source presentation, and sends no request or toast; backend `409 Conflict` handling still protects against stale occupancy data.
- A valid drop optimistically applies the art's final placement in the binder context and captures its complete pre-move state for rollback.
- Success replaces the optimistic art with the returned representation; failure restores the snapshot and uses the shared failed toast.
- If an edit changes placed art so its current footprint would be out of bounds or overlap another item, Save opens a nested confirmation dialog offering Cancel or Save and Move to Unplaced.
- Confirming applies the art edits and clears all placement coordinates in one database transaction; cancellation returns to the populated editor without changing the art.
- All art edits use multipart `PATCH /art/{artId}` containing normalized metadata and an optional replacement image part.
- Metadata, transforms, style overrides, optional image replacement, and any confirmed placement clearing are validated and committed as one logical operation.
- A successful edit returns `200 OK` with the complete persisted art representation.
- Saving closes the editor and optimistically applies all submitted art fields and any confirmed unplacement in the binder context while disabling further actions on that art.
- Success replaces the optimistic art with the response; failure restores the previous art and reopens the editor with the complete attempted image, metadata, dimensions, rotation, transforms, and style choices preserved.
- Selecting Delete immediately and optimistically removes the art without a confirmation dialog, retaining its complete prior state and list position for rollback.
- `DELETE /art/{artId}` permanently deletes the art and returns `204 No Content` whether it existed or was already absent; malformed UUIDs receive request-validation Problem Details.
- Failure restores the art and all covered slots and displays the shared failed toast.
- Art deletion removes its image reference in the same database transaction; shared image assets remain while referenced by any card or other art.
- When the final reference is removed, source and derivative image metadata are deleted transactionally and physical file cleanup runs after commit.
- File-cleanup failure does not change the `204 No Content` response and is persisted as pending cleanup work for backend retry.
- Art duplication copies title, description, slot dimensions, rotation, transforms, and nullable style overrides into a new backend-generated art UUID with all-null placement coordinates.
- The duplicate references the source art's existing immutable source and normalized image assets rather than copying image files.
- `POST /art/{artId}/duplicate` reads the authoritative source art and returns `201 Created`, a `Location` header, and the complete unplaced duplicate representation.
- Each duplicate action uses a client-generated UUID idempotency key; retries reuse that key, and the backend retains and replays the outcome for the shared 24-hour mutation-idempotency period.
- Selecting Duplicate optimistically inserts a disabled unplaced copy with a client-generated temporary ID and the source art's existing image URL, ordered by the unplaced art section's established ordering rules.
- Success replaces the optimistic copy with the response; failure removes it and displays the shared failed toast.
- Art actions are revealed by pointer hover only in the initial desktop-supported version; keyboard and touch action disclosure remain deferred.
- Edit, Delete, and Duplicate use Lucide icons in stable icon-button hit areas with accessible labels and hover tooltips.
- `GET /art/{artId}/image` resolves and streams the art's normalized rendering image with its detected `Content-Type`; storage IDs, filenames, and paths are not exposed.
- Missing art, image metadata, or local rendering files return `404 Not Found` using Problem Details.
- Art image responses use long-lived immutable caching, and the persisted art representation supplies a different image URL whenever its underlying rendering asset changes.

### 27. Handle binder size and page-count changes

**Status:** Not started

#### Acceptance criteria

- Increasing the binder's width, height, or page count preserves all existing card and multi-slot art placements.
- Before reducing the binder's width, height, or page count, the app identifies every card and piece of multi-slot art whose placement would no longer exist or fit.
- Multi-slot art is affected if any slot in its occupied area falls outside the reduced binder layout.
- If no placed items are affected, the reduced binder details can be saved without a relocation confirmation.
- If placed items are affected, saving opens a confirmation modal that identifies how many cards and pieces of multi-slot art will be moved to the unplaced cards section or unplaced art section, respectively.
- Selecting cancel closes the confirmation modal without changing the binder or any item positions.
- Confirming the change moves every affected card to the unplaced cards section and every affected piece of multi-slot art to the unplaced art section.
- The binder detail changes and all affected item relocations are saved together through the backend.
- If any part of the update fails, the binder details and item positions remain unchanged.
- Binder size and page-count changes use the shared save-status toast.

#### Technical requirements

- Before a potentially reducing update, the client sends the proposed width, height, and stored page count to read-only `POST /binders/{binderId}/resize-preview`.
- The client calls resize preview only when width, height, or stored page count decreases; physical centimeter formulas and border settings do not affect slot coverage and use the normal details-save path.
- The dry run validates the proposed dimensions against current persisted placements and returns the affected card and art UUIDs plus separate counts without changing data.
- The final update recomputes affected items inside its database transaction rather than trusting the prior dry-run result.
- When the triggering blur includes other currently valid dirty binder fields, the final confirmed PATCH atomically saves the complete dirty-field set together with any required relocations.
- The existing binder partial-update request includes `moveAffectedItemsToUnplaced: true` only after the user confirms relocation.
- If the final update finds affected placements and relocation consent is false or absent, it returns `409 Conflict` Problem Details with current affected card and art counts and changes nothing.
- Confirmed relocation consent covers every card and art item affected when the final transaction runs, even when that set differs from the earlier preview; the backend clears all affected placements atomically with the binder update.
- After confirmation, the relocation modal remains open with its controls disabled while the final update runs; the client does not optimistically change binder dimensions or item placements.
- Success closes the modal and replaces binder and item state from the response; failure leaves the prior state intact, re-enables the modal, and displays the shared failed toast.
- A successful affecting resize returns `200 OK` with complete updated binder details and complete representations of every card and art item moved to unplaced, allowing direct binder-context reconciliation without refetching.
- If the new page count invalidates `previewPhysicalPage`, the same transaction resets it to `DEFAULT_BINDER_PREVIEW_PHYSICAL_PAGE` (`2`) and returns that value in the updated binder details.

### 28. Undo and redo layout movements

**Status:** Not started

#### Acceptance criteria

- The "Edit Layout" tab has undo and redo buttons.
- Each successful drag-and-drop movement of a card or multi-slot art is added to the layout movement history.
- A card swap is added to movement history as one action containing both cards' original and swapped positions.
- Movement history includes moves between binder slots and moves between the binder layout and the unplaced cards section or unplaced art section.
- Selecting undo returns every card or piece of multi-slot art affected by the most recent movement to its previous location and saves the restored positions through the backend.
- Undoing a card swap restores both cards to their original slots together.
- Selecting redo reapplies the most recently undone movement and saves all reapplied positions through the backend.
- Redoing a card swap reapplies both swapped card positions together.
- The undo button is disabled when there are no movements to undo.
- The redo button is disabled when there are no movements to redo.
- A rejected drag-and-drop attempt is not added to the movement history.
- Adding, editing, deleting, or duplicating cards and multi-slot art cannot be undone or redone with these controls.
- Undo and redo use the shared save-status toast and retain the current history position if saving fails.

#### Technical requirements

- Movement history is stored only in binder-scoped frontend React state and is not persisted by the backend or browser storage.
- History resets when the binder route context unmounts, the page refreshes, or binder data is fully reloaded.
- `LAYOUT_MOVEMENT_HISTORY_LIMIT` defaults to `50` in the canonical shared `defaults.ts`.
- Adding a movement when the undo stack is at the limit discards its oldest entry.
- A new successful drag after one or more undos clears the complete redo stack before adding the new movement to the undo stack.
- Undo and redo reuse the existing movement PATCH contracts: card moves and swaps use `PATCH /cards/{cardId}`, and art moves use `PATCH /art/{artId}`.
- An art movement history entry affects only one art record because art cannot swap with cards or other art; card-swap history entries retain both cards as one atomic PATCH operation.
- After a successful non-movement mutation modifies or deletes a card or art item, the client removes every undo or redo entry containing that item's UUID while preserving unrelated entries.
- Creating or duplicating an item does not prune existing entries because it does not modify their recorded items; binder width, height, or stored page-count changes clear both history stacks because coordinate validity changes globally.
- If an undo or redo returns `409 Conflict`, the client leaves the visible layout unchanged, discards only the failed action from the stack it was being applied from, preserves remaining history, and displays the shared failed toast.
- Undo and redo do not change visible item positions or transfer the action between history stacks until the movement PATCH succeeds.
- While an undo or redo request is pending, undo, redo, and all card and art dragging are disabled; success applies returned item representations and transfers the action to the opposite stack, while non-conflict failure leaves positions and stack ownership unchanged.
- After success, an action whose resulting placement is on a physical page updates the layout `page` query by history replacement to reveal that spread; an action whose result is unplaced keeps the current spread and scrolls the item into view in the unplaced panel.
- Card-swap history records the originally dragged card as its focal item, and that card's resulting placement determines post-undo or post-redo navigation.
- The initial story provides visible Undo and Redo icon buttons only; keyboard shortcuts are deferred.
- The buttons use Lucide icons, stable hit areas, accessible labels, and hover tooltips and reflect disabled history or pending-movement states.

### 29. Export a binder as a PDF

**Status:** Not started

#### Acceptance criteria

- The binder has a print-to-PDF button that generates a PDF of its layout.
- The print-to-PDF button remains available when the binder is locked.
- Each displayed binder page is rendered as one PDF page in binder-page order.
- First and last displayed pages retain their single-sided layouts in the PDF.
- Intermediate displayed pages retain their complete left-and-right spread on one PDF page.
- The binder layout is scaled to fit the PDF page and is not rendered at its physical size.
- For a 3-by-3 binder, all 18 slots in an intermediate spread appear together on one PDF page.
- Cards and multi-slot art appear in their assigned positions in the generated PDF.
- The generated PDF includes card variation labels when the layout's variation toggle is on and omits them when the toggle is off.
- When variation labels are included, each card with a saved variation displays that variation in the PDF.
- Generating the PDF uses the shared save-status toast, downloads the file when generation succeeds, and displays the provided error if generation fails.

#### Technical requirements

- The backend generates binder layout PDFs from authoritative persisted binder, card, art, transform, style, and local image data rather than from the browser DOM or binder context.
- The backend reads one transactionally consistent snapshot of the persisted binder graph when generation starts; changes committed afterward do not appear in that PDF and are not blocked by the export.
- The backend uses `pdfkit` for streamed PDF creation, vector clipping, and transformed local-image placement.
- Every binder-layout PDF page uses US Letter landscape dimensions (`11 x 8.5` inches), including the first and last single-sided views.
- Each PDF page reserves a `0.25`-inch margin on every edge and proportionally contains the complete single page or spread within the remaining area without cropping.
- Each PDF page includes the layout's physical page label, such as `Page 1` or `Pages 4-5`, above the scaled binder view within the page margins.
- The PDF renders complete binder-side and slot boundaries, including empty slots, along with placed cards and multi-slot art.
- Binder PDF generation accepts an `includeVariations` option; when true, variation labels render below cards using the layout's label-space behavior without resizing card images.
- The frontend sets `includeVariations` from the layout route's current `variations=true` toggle state; no separate export-options prompt is displayed.
- When the layout route omits `variations=true`, the frontend sends `includeVariations: false`.
- Acquisition indicators, Michi indicators, pending-operation feedback, and editing controls are omitted from binder-layout PDFs.
- `POST /binders/{binderId}/exports/pdf` accepts a JSON request body containing `includeVariations` and streams the generated binder-layout PDF in the response.
- The OpenAPI request schema defines `includeVariations` as an optional boolean with a default of `false`.
- A successful response uses `Content-Type: application/pdf` and `Content-Disposition: attachment` with the sanitized binder name followed by `.pdf` as the download filename.
- The backend finishes binder PDF generation in a request-scoped temporary file before sending response headers, then streams the completed file to the client without persisting it as application data.
- A generation failure before streaming returns the applicable Problem Details response and removes the temporary file without starting a download.
- A missing, unreadable, or unsupported local card or art image fails the complete export before download; the backend returns Problem Details rather than generating a PDF with an omitted item or placeholder.
- The backend removes the temporary PDF after the response completes or the client disconnects; cleanup failures are logged for maintenance and do not change a completed response.
- Binder lock state does not restrict the read-only PDF export endpoint.
- Selecting print-to-PDF displays one persistent generating toast and disables that binder's PDF export button until the request succeeds or fails.
- A successful response starts the browser download and replaces the generating toast with the shared saved toast; a failure replaces it with the shared persistent failed toast using the returned Problem Details `detail`.

### 30. Export multi-slot art for printing

**Status:** Not started

#### Acceptance criteria

- The binder has a print-art PDF button that generates a PDF containing all of its placed multi-slot art and no cards.
- Unplaced multi-slot art is not included in the PDF.
- When the binder has no placed multi-slot art, the print-art PDF button is disabled and its tooltip explains that placed art is required.
- The print-art PDF button remains available when the binder is locked and placed art exists.
- Generating the art PDF uses the shared save-status toast, downloads the file when generation succeeds, and displays the provided error if generation fails.
- PDF pages use a landscape orientation.
- Each piece of art is rendered at its configured physical dimensions rather than scaled to fit a binder view.
- The configured physical width and height measure the complete outside edge of the bordered art frame.
- A piece of art that cannot fit on one PDF page in either orientation is tiled across multiple pages at its configured physical dimensions rather than scaled down or omitted.
- Adjacent pages for one tiled piece repeat `0.25` inch of content to support trimming and alignment during assembly.
- Tiled pages do not add art titles, tile numbers, row or column labels, or other assembly text.
- Other art may be packed into unused regions of a tiled page when it fits at exact scale with the required spacing.
- With the default dimension settings, each slot occupied by art represents 6.35 cm of width and 9 cm of height, adjusted by the configured multi-slot dimension formulas.
- Each piece of art retains its saved image positioning, scaling, aspect-ratio adjustments, and border settings.
- The configured art border serves as the cutting reference; the PDF does not add crop marks or separate cut lines.
- White space separates each piece of art from other art and from the page edges.
- PDF pages reserve `0.25` inch at every edge and at least `0.25` inch between separate art pieces.
- Art edges are aligned where possible to make physical cutting easier.
- Art is arranged across PDF pages to reduce page count and unused space while preserving its physical dimensions and required spacing; a mathematically optimal arrangement is not required.
- Individual pieces of art may be rotated 90 degrees on the PDF page when doing so improves packing efficiency.
- Art may be reordered independently of its binder-page placement to improve packing efficiency.
- With the current default dimension settings, two default 2-by-2 pieces, four default 2-by-1 pieces, or eight default 1-by-1 pieces each fit together on one page with room to spare.
- When the art does not fit on one page, the remaining art is efficiently arranged on additional landscape pages.

#### Technical requirements

- The backend generates multi-slot-art print PDFs using PDFKit and authoritative persisted binder, art, transform, style, and local image data.
- PDFKit draws the resolved art border inward from the configured frame boundary, so border width does not increase the printed footprint used for packing or tiling.
- The backend reads one transactionally consistent snapshot of the persisted binder and placed-art graph when generation starts; changes committed afterward do not appear in that PDF and are not blocked by the export.
- The export query includes only art with non-null placement coordinates in the selected binder and renders each included art record exactly once; binder cards and unplaced art are excluded.
- If no placed art exists when the export request is processed, the backend returns a request-validation Problem Details response and does not generate a PDF.
- Every art-print PDF page uses US Letter landscape dimensions (`11 x 8.5` inches).
- `ART_PRINT_PAGE_MARGIN_INCHES` defaults to `0.1` and `ART_PRINT_ITEM_GAP_INCHES` defaults to `0.25` in the canonical shared `defaults.ts`.
- The packing algorithm treats the page margins as unavailable area and enforces the item gap between distinct art regions, including other art packed beside an oversized-art tile region.
- The packing algorithm may rotate a fully composed art frame by 90 degrees; the border, clipped transformed image, and physical width and height rotate together without distortion or rescaling.
- Placement coordinates determine whether art is included but do not determine print order; the packing result is deterministic for the same export snapshot and configuration.
- Packing uses a documented deterministic rectangle-packing heuristic that prioritizes fewer pages and then lower unused area; automated tests cover stable ordering, rotation, spacing, and page-boundary behavior.
- Art that exceeds the usable area of one page in both orientations is rendered at exact scale as a deterministic grid of page tiles whose combined content reconstructs the complete composed art frame.
- `ART_PRINT_TILE_OVERLAP_INCHES` defaults to `0.25` in the canonical shared `defaults.ts` and defines the repeated horizontal and vertical content overlap between adjacent tiles.
- Tile overlap duplicates content without changing the art's coordinate scale or configured physical dimensions.
- Oversized-art tile pages render no export-specific assembly labels or marks in their margins.
- A tiled art region participates in the same deterministic packing model as a normal art rectangle; remaining page regions may hold other art when all bounds and spacing constraints are satisfied.
- PDFKit renders only each art piece's configured border around its frame and does not draw export-specific crop marks or cutting guides.
- `POST /binders/{binderId}/exports/art-pdf` generates and returns the placed-art print PDF; its OpenAPI operation is distinct from the binder-layout PDF export.
- A successful response uses `Content-Type: application/pdf` and `Content-Disposition: attachment` with the sanitized binder name followed by `-art.pdf` as the download filename.
- Binder lock state does not restrict the read-only placed-art PDF export endpoint.
- The backend finishes art PDF generation in a request-scoped temporary file before sending response headers, then streams the completed file without persisting it as application data.
- A generation failure before streaming returns the applicable Problem Details response and removes the temporary file without starting a download.
- A missing, unreadable, or unsupported local image for any included art record fails the complete export before download; the backend returns Problem Details rather than skipping the art or rendering a placeholder.
- The backend removes the temporary PDF after the response completes or the client disconnects; cleanup failures are logged for maintenance and do not change a completed response.
- Selecting print-art PDF displays one persistent generating toast and disables that binder's art-export button until the request succeeds or fails.
- A successful response starts the browser download and replaces the generating toast with the shared saved toast; a failure replaces it with the shared persistent failed toast using the returned Problem Details `detail`.

### 31. Search and filter unplaced items

**Status:** Not started

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

### 32. Lock a binder

**Status:** Not started

#### Acceptance criteria

- Hovering over a binder in the home page list displays a lock or unlock action with the existing binder actions.
- Selecting the lock action locks the binder and saves its locked state through the backend.
- The action reflects whether the binder is currently locked or unlocked.
- Selecting the unlock action unlocks the binder and saves its unlocked state through the backend.
- A locked binder can still be opened and viewed.
- The "Edit Details" tab is read-only while the binder is locked.
- The "Edit Layout" tab is read-only while the binder is locked.
- Controls that add, remove, duplicate, edit variations, or move cards or multi-slot art are unavailable while the binder is locked.
- Card acquisition status can still be changed while the binder is locked.
- API-fetched and manually entered card prices can still be updated while the binder is locked.
- The delete X is hidden from the home page hover actions while the binder is locked.
- A locked binder cannot be deleted, and the backend rejects deletion requests for it.
- A locked binder can still be duplicated, and the new binder is created unlocked.
- The backend rejects changes to the details or layout of a locked binder.
- The backend accepts card acquisition and price updates for a locked binder.
- Unlocking the binder restores its editing controls and allows details and layout changes again.
- Locking and unlocking use the shared save-status toast and restore the previous lock state if the operation fails.

#### Technical requirements

- Lock and unlock use the existing partial binder update endpoint with a `locked` boolean field rather than dedicated command endpoints.
- Selecting Lock or Unlock sends the update immediately without a confirmation dialog; the opposite action remains available after a successful state change.
- Home-page Lock and Unlock actions are icon-only buttons using Lucide `Lock` and `LockOpen` icons, stable hit areas, accessible labels, and hover tooltips.
- The home-page binder row shows no persistent lock icon or text badge; its Lock or Unlock hover action is the lock-state indicator.
- The backend permits an update containing only the `locked` field regardless of the binder's current lock state, so a locked binder can be unlocked through the same contract.
- A successful lock-state update returns `200 OK` with the complete persisted binder representation.
- A successful lock-state update changes the binder's backend-managed `updatedAt` timestamp, so the existing newest-updated-first home-page ordering reflects lock and unlock operations.
- Lock-state updates use last-write-wins semantics: requests contain only the desired `locked` value and do not include an expected prior state, version, or timestamp.
- A transport retry resends the same desired `locked` value without a UUID idempotency key; desired-state lock updates are inherently idempotent.
- Binder duplication explicitly sets the new binder's `locked` value to `false` and never copies the source binder's lock state.
- A lock request does not cancel a details or layout mutation that the backend has already accepted; that mutation may complete, and restricted mutations accepted after the lock update commits are rejected.
- A restricted details, layout, card, or art mutation for a locked binder returns `409 Conflict` using a stable locked-binder Problem Details type; allowed acquisition, price, and lock-state updates are not rejected for that reason.
- After a restricted mutation receives the locked-binder conflict, the client completes that mutation's established rollback behavior, displays the shared failed toast, and reloads the complete binder graph to synchronize the lock state and read-only interface.
- `DEFAULT_BINDER_LOCKED` defaults to `false` in the canonical shared `defaults.ts`, and binder creation does not expose or accept a client-selected initial lock state.
- The database persists `locked` as a required boolean with a default of `false`, and binder-detail, binder-summary, and full-data-export contracts include that boolean without a nullable or inferred state.
- The Edit Details tab retains the reusable binder-details form while locked and disables every editable form control, including dimension, style, and preview-page controls; the saved values remain visible.
- The locked-binder behavior for notes remains the existing rule: the notes toggle and content are not mounted.
- A locked binder's view/edit page displays a compact persistent Lucide `Lock` icon followed by `Locked` near the page header or tab navigation rather than a full-width read-only banner.
- When the binder is locked, the layout does not render add, drag, edit, delete, duplicate, variation-edit, or movement controls for cards or art; the binder grid and its content remain viewable.
- While locked, the layout hides Undo and Redo but retains its binder-scoped movement-history stacks; unlocking restores those controls with any entries not pruned by the established history rules.
- Acquisition and price controls remain rendered and usable on the locked layout because their mutations are explicitly allowed.
- Locked binders retain layout page navigation and presentation-only controls, including Michi, variation-label, and acquisition-status visibility toggles, because they do not mutate persisted binder data.
- Selecting lock or unlock optimistically replaces the binder summary's lock state and disables every home-page action for that binder until the update settles; actions for other binders remain available.
- A successful response replaces the optimistic summary with the complete backend representation. A failure restores the prior summary and re-enables its actions while the shared failed toast reports the Problem Details `detail`.

### 33. Export and import all application data

**Status:** Not started

#### Acceptance criteria

- The application has actions for exporting and importing all application data.
- Exporting creates a single portable archive that can be moved to another application instance or data-storage location.
- The export archive includes all contents of the application database.
- The export archive includes every application-managed image file, including original images uploaded for custom cards and multi-slot art.
- The export preserves record identifiers and image references so imported records remain connected to the correct image files.
- The export includes a manifest identifying the archive format and data-schema version.
- Secrets and environment-specific configuration are not included in the export archive.
- Importing accepts an archive created by the application's full-data export.
- Before changing current data, the import validates the archive format, schema compatibility, database contents, required image files, and image references.
- An invalid or incomplete archive is rejected without changing the current database or image files.
- A valid import displays a confirmation that importing will add the archive's database contents and image files to the current application data.
- Cancelling the confirmation leaves all current data unchanged.
- Confirming the import adds every database record and image file from the archive without overwriting or deleting existing records or files.
- Existing application elements remain unchanged even when imported elements contain matching identifiers, names, or image filenames.
- Imported record identifiers are remapped when needed, and all relationships between imported records are updated to use the remapped identifiers.
- Imported image filenames or storage paths are remapped when needed, and imported records continue to reference the correct imported images.
- Imported elements are added as new elements rather than merged with equivalent existing elements.
- Database records and image files are added as one atomic operation.
- If any part of the import fails, no imported records or image files are added and all existing data remains unchanged.
- Locked binders and their complete data are included in exports and can be added through import without changing existing binders.
- Export and import use the shared loading component while processing and the shared save-status toast when the operation succeeds or fails.

#### Technical requirements

- TBD: Define the archive format, manifest schema, validation, identifier-remapping, transactional import, and user-interface contracts.

### 40. Add summary stats on Binder Layout Page

**Status:** Not started

#### Acceptance Criteria

- TODO: numbers and colors for binder slots used, cards and art (represented in slots) in unplaced section. Easy to identify if there are more cards than slots in the binder

#### Technical Requirements

### 34. Add custom art finances

**Status:** Not started

#### Acceptance criteria

- TBD: Define acceptance criteria.

#### Technical requirements

- TBD: Define technical requirements.

### 35. Add art production time statistics

**Status:** Not started

#### Acceptance criteria

- TBD: Define acceptance criteria.

#### Technical requirements

- TBD: Define technical requirements.

### 36. Track card acquisition

**Status:** Not started

#### Acceptance criteria

- Each card stores whether it has been acquired.
- Hovering over a card displays an acquisition action with the existing card actions.
- The acquisition action indicates whether the card is currently acquired or unacquired.
- Selecting the acquisition action changes the card between acquired and unacquired.
- The card's acquisition state is saved to the database through the backend.
- The "Edit Layout" tab has a toggle for showing or hiding card acquisition status.
- Turning the toggle on displays whether each card is acquired or unacquired.
- Turning the toggle off hides card acquisition status from the binder layout.
- Acquisition changes use the shared save-status toast and restore the card's previous acquisition state if saving fails.

#### Technical requirements

- TBD: Define the acquisition data model, API contract, locked-binder exception, optimistic-update, and display-toggle behavior.

### 37. Add a card checklist

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
- The checklist has controls for independently showing or hiding acquired cards and unacquired cards.
- Changing the acquisition visibility controls immediately updates the displayed checklist entries.
- The checklist has controls for sorting its cards.
- Selecting a sort option updates the order of the displayed checklist entries.
- The checklist has a search field for narrowing the displayed cards.
- Cards can be found by card name, set, number, or variation.
- Search, sorting, and acquisition visibility controls can be used together.
- Clearing search and acquisition visibility filters restores all checklist entries while retaining the selected sort order.
- When no cards match the active search and filters, the checklist displays an empty-results state.
- The Card Checklist has an export action.
- Exporting creates a downloadable PDF checklist that is suitable for printing.
- The export includes only cards matching the checklist's active search and acquisition visibility controls.
- Exported cards appear in the checklist's selected sort order.
- Each exported entry includes only the card's image and variation.
- The export action is unavailable when no cards match the active search and filters.
- Card Checklist export remains available when the binder is locked.
- Acquisition changes use the shared save-status toast and restore the card's previous acquisition state if saving fails.

#### Technical requirements

- TBD: Define the checklist route, client filtering and sorting, acquisition updates, PDF-export contract, and locked-binder behavior.

### 38. Add card finances

**Status:** Not started

#### Acceptance criteria

- A technical spike determines whether a suitable card-pricing API is available and can provide prices for the cards supported by the app.
- The spike documents the evaluated API, card-matching approach, price data available, usage limits, and any cards for which prices cannot be retrieved.
- Automated card pricing is implemented only if the spike confirms that a suitable API integration is possible.
- If the spike does not identify a suitable pricing API, card finances remain available in a manual-only pricing mode.
- Manual-only pricing continues to support checklist prices, financial totals, and manual price updates without displaying automated price-refresh controls.
- When a card is loaded, its latest available price is fetched from the pricing API.
- The fetched price and the time it was retrieved are saved with the card through the backend.
- The Card Checklist displays the saved price for each card.
- The Card Checklist displays totals at the top for all cards, unacquired cards, and cards matching the active checklist search and filters.
- Changing a card's acquisition state or the active checklist filters updates the applicable totals.
- The "View Financials" tab displays the totals for all cards, unacquired cards, and filtered cards.
- The Card Checklist has a button that fetches updated prices for its cards from the pricing API.
- Price refresh uses the shared loading component until all requested prices have either loaded or failed.
- After price fetching completes, an overview displays an old price, new price, and change amount for each card.
- The old-price column displays the card's currently saved price.
- The new-price column displays the price returned by the pricing API.
- The change column displays the difference between the old and new prices when both prices are available.
- If a price cannot be fetched for a card, its new price and change amount are blank while its old price remains visible.
- A request-level price refresh failure removes the loading state and displays the provided error using the shared failed toast.
- Fetched prices are not persisted until the price overview is available for review.
- TBD: During implementation, determine whether reviewed prices are persisted with an explicit save action or automatically after the overview is displayed.
- A card's price can be entered or edited manually.
- A manually entered price is saved with the card through the backend and is identified as a manual price.
- Manual prices are visually distinct from API-fetched prices on the Card Checklist and the "View Financials" tab.
- Automatically refreshing prices does not overwrite manually entered prices.
- Fetched and manually entered price changes use the shared save-status toast and restore the previous saved price if saving fails.

#### Technical requirements

- TBD: Define the pricing-provider spike, price data model, manual-pricing contract, refresh workflow, and financial-aggregation behavior.

### 39. Add Binder Search and Sort functions

**Status:** Not started

#### Acceptance criteria

- TBD: Define acceptance criteria.

#### Technical requirements

- TBD: Define technical requirements.

Add new stories as they come up, following the same format, starting with `**Status:**
Not started` under the heading.

## Definition of done (draft)

- Story's acceptance criteria are all met.
- No console errors/warnings introduced.
- Basic tests added/updated if a test setup exists.
- The story's `**Status:**` marker in the backlog above is updated to `Done`.

## Next steps

1. Define the core data model and how its pieces relate.
2. Decide on database and auth approach; record the decision here.
3. Scaffold the Next.js + Node project structure.
4. Add the first stories to the backlog above.
