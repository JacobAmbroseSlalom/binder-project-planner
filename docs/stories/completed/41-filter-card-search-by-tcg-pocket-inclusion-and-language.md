# 41. Filter card search by TCG Pocket inclusion and language

**Status:** Done (2026-08-01 21:17 EDT)

#### Acceptance criteria

- The card-selection modal's search view has two additional toggles alongside the search bar.
- The first toggle includes or excludes Pokemon TCG Pocket cards from search results and defaults to off (excluded).
- The second toggle selects English or Japanese card data and defaults to English.
- When the language toggle is set to Japanese, an entered English query is automatically translated to its Japanese Pokemon species name using PokeAPI before searching TCGdex.
- If the query does not match a known English Pokemon species name, the original query is searched as entered and the modal displays a nonblocking warning stating that no Japanese translation was found for the query.
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
- Automatic translation applies only to `language=ja` searches and only translates the trimmed query as a candidate English Pokemon species name; it does not translate set names or other free text.
- The backend looks up the candidate name against PokeAPI's species data using a case-insensitive exact match and, when found, searches TCGdex using the returned Japanese name instead of the original query.
- The backend caches successful PokeAPI name-translation lookups in memory for the life of the process; a cache miss triggers a new PokeAPI request rather than being retained as a negative cache entry.
- Upstream PokeAPI lookups time out after `POKEAPI_REQUEST_TIMEOUT_MS`, which defaults to `10000` in the canonical shared defaults module.
- A PokeAPI lookup miss (`404`), timeout, or other request failure does not block or fail the search: TCGdex is still searched using the original entered query, and the search response includes a nonblocking translation-warning flag rather than a Problem Details error.
- The frontend displays the translation warning alongside successfully loaded results without invoking the shared failed toast or replacing the loading or empty-results behavior.
- `language=ja` searches match only against card name, not set name; the set-name search TCGdex issues for `language=en` is skipped entirely for Japanese (out of scope per product direction).
- TCG Pocket set membership is determined backend-side: TCGdex has no per-card or per-set field distinguishing Pocket cards in the existing bulk search/sets responses, and TCGdex's regular card search already mixes Pocket-catalog cards into its results by default (confirmed during development, e.g. searching "Bulbasaur" without the toggle returned Pocket sets like `A1` alongside standard-catalog matches). Filtering therefore requires a separate, one-time-per-process lookup rather than being derivable from data already fetched for the current query.
- The backend fetches the Pokemon TCG Pocket serie's member set ids via `GET /v2/{language}/series/tcgp` (TCGdex's `tcgp` serie detail endpoint, whose `sets[]` array lists every member set's id in one request) and caches the resulting id set in memory per language for the life of the process, mirroring the existing per-language set-name cache. A card is excluded from `includeTcgPocket=false` results when its `providerSetId` is a member of that cached set.
- A failure resolving the Pocket set-id list (upstream error, timeout, or unexpected shape) degrades to not filtering anything for that one request, rather than failing the search outright; the lookup is retried on a later request instead of being cached as permanently empty.
- A toggle change that triggers a backend search aborts any in-flight search before starting the new one, reusing the existing `AbortController` cancellation behavior; only the latest qualifying query-and-toggle combination may publish results.
- The backend search-response cache key (`CARD_SEARCH_CACHE_MAX_ENTRIES`, `CARD_SEARCH_CACHE_TTL_MS`) incorporates the trimmed, case-normalized query together with any toggle values that affect the backend request, so cached results are never returned for a different toggle combination.
- Add Card and Add More submissions (Stories 17 and 18) submit the checked subset of the current result set together with the toggle values that produced that result set; the backend applies the same per-card normalization regardless of toggle state.
- Changing the TCG Pocket toggle immediately re-searches the current trimmed query the same way the language toggle does, without waiting for `CARD_SEARCH_DEBOUNCE_MS`, so both toggles behave consistently per the "Changing either toggle updates the displayed results" acceptance criterion.
