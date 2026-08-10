# 11. Select a card for a binder slot

**Status:** Done (2026-08-01 19:16 EDT)

**Update (2026-08-03):** Stories 17 and 18 refactor this story's single-card JSON
TCGdex-creation variant of `POST /binders/{binderId}/cards` into
`POST /binders/{binderId}/cards/bulk`, which becomes the sole TCGdex-card creation path
(including for a single selected card) once those stories are implemented. The
acceptance criteria and technical requirements below describe this story's originally
shipped behavior and remain historically accurate; the `POST /binders/{binderId}/cards`
bullet under Technical requirements is superseded by that later refactor.

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
