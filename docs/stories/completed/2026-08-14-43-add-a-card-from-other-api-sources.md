# 43. Add a card from other API sources

**Status:** Done (2026-08-14 20:36 EDT)

#### Acceptance criteria

- Every existing TCGdex-only card search (the card-selection modal from Story 11, bulk
  add from Stories 17/18, and the watchlist's own TCGdex search from Story 45) gains a
  source dropdown letting the user pick which API to search: the Pokémon TCG API
  (pokemontcg.io, default) or TCGdex. This is a source switch the user picks, not an
  automatic fallback.
- Searching a Pokémon name (e.g. "Umbreon") while the Pokémon TCG API source is selected
  returns a set of matching cards with their images, mirroring the existing TCGdex
  search experience: the shared loading component while waiting, the failed-search
  toast on error, the no-results message when a completed search has zero matches, and
  the same virtualized result grid.
- The first time the card-selection modal is opened in a binder visit, the source
  dropdown defaults to the Pokémon TCG API. Reopening the modal retains the source last
  selected, even though the existing empty-query, no-results reset still applies to the
  search itself — mirroring Story 41's TCG Pocket-inclusion/language toggle persistence
  exactly.
- An Add More or Bulk Add session (Stories 17 and 18) retains the source in effect when
  that session's searches were performed, mirroring Story 41's same rule for its toggles.
- Story 41's TCG Pocket-inclusion and language toggles are hidden entirely (not merely
  disabled) whenever the Pokémon TCG API source is selected, since pokemontcg.io has no
  TCG Pocket-set concept and its card data is English-only. Their prior values are
  preserved underneath and restored if the user switches back to TCGdex.
- Custom-card manual entry (Story 12) is unchanged: it remains a distinct path
  (`source: "custom"`, no provider fields) from either search source.

#### Technical requirements

- Reuses the existing `apps/backend/src/integrations/pokemontcg.ts` integration (Story
  38, currently pricing-only) by adding a card-search capability against pokemontcg.io's
  `GET /v2/cards` endpoint, filtering by a `name:<query>` (or wildcard `name:<query>*`)
  Lucene-style query parameter. The exact query syntax needs confirmation via a live
  spike before implementation — consistent with Story 38's own "confirm during the
  actual spike" precedent for this same provider, since this environment has no live
  web access to verify pokemontcg.io's current documented behavior.
- The pokemontcg.io search response is normalized into the same shape TCGdex search
  results already use (name, set name, local number, image URL) so the frontend result
  grid, loading state, and no-results messaging work unchanged regardless of the
  selected source.
- The selected source is ephemeral React state living above the modal (e.g. the binder
  route context), exactly like Story 41's `includeTcgPocket`/`language` toggle state —
  not persisted to the backend or browser storage, and reset when the binder route
  context unmounts or the page reloads.
- The new `source` enum value is `pokemontcg`. Its `providerCardId` is pokemontcg.io's
  own card `id` field (e.g. `"xy1-1"`, which already encodes set + number) and its
  `providerSetId` is that card's `set.id` — directly reusing `Card`/`WatchlistEntry`'s
  existing two identity fields rather than adding new columns.
- `GET /card-catalog/search` gains an optional `provider` query parameter
  (`tcgdex` or `pokemontcg`), defaulting to `tcgdex`, reusing the same response envelope
  for both providers rather than adding a dedicated endpoint. `includeTcgPocket` and
  `language` are accepted only for `provider=tcgdex` and are ignored (not errors) when
  `provider=pokemontcg`, matching the hidden-toggle UI behavior above.
- Card search reuses the existing `POKEMONTCG_API_KEY` environment variable and
  optional-key/unauthenticated-fallback pattern already established in
  `pokemontcg.ts` (Story 38) — the key is sent via the same `X-Api-Key` header when
  present, and search still works, at pokemontcg.io's lower unauthenticated rate limit,
  if it's unset.
- No new creation endpoint: `POST /binders/{binderId}/cards/bulk` (and its watchlist
  equivalent, `POST /watchlist-entries/bulk`) accepts `source: "pokemontcg"` search
  results the same way it accepts `"tcgdex"` ones today. The backend downloads and
  dedupes the image the same way as TCGdex (by provider source + provider card ID,
  reusing the existing `ImageAsset` uniqueness constraint), just pointed at
  pokemontcg.io's image URL instead of TCGdex's.
