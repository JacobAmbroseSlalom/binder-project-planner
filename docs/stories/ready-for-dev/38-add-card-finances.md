# 38. Add card finances

**Status:** Not started

#### Acceptance criteria

- The Card List displays each card's saved price from the database, initially blank/`null` before any price has ever been fetched or manually entered.
- The Card List has a "Fetch card prices" button that requests updated pricing
  data from pokemontcg.io for the card list's currently filtered/displayed cards
  (not every card in the binder).
- Price refresh uses the shared loading component until all requested prices have either loaded or failed.
- After price fetching completes, the card list table expands to show, for each card: a variant selector (defaulting to the closest matching print variant found for that card), that variant's TCGplayer market price, that variant's TCGplayer lowest listed price, a link to the card's TCGplayer product page, an editable new-price input, and a price-change indicator.
- While this price-review state is active, the card list's search, sort, and column-filter controls are locked (disabled) until the review is saved or cancelled.
- Selecting a different variant in a card's dropdown updates that card's displayed market price, lowest price, and TCGplayer link to match the newly selected variant.
- Missing market price, lowest price, or link data displays as `--` rather than blank.
- The new-price input is automatically filled with the selected variant's market price; when the market price is unavailable, it's automatically filled with the card's currently saved price instead.
- Clicking the displayed market price, lowest price, or currently saved price fills the new-price input with that value.
- A manually entered price is saved with the card through the backend and identified as a manual price.
- A card's manually entered price is visually distinct (shown in the secondary color) from an API-derived price on the Card List and the "View Financials" tab.
- The price-change indicator compares the card's saved price to its new price: an increase shows a green upward indicator with the formatted increase amount (e.g. "▲ +$3.50"); a decrease shows a red downward indicator with the formatted decrease amount; no change shows a grey `--`.
- If a price cannot be fetched for a card, its market price, lowest price, and price-change indicator display as `--` while its currently saved price remains visible.
- A request-level price refresh failure removes the loading state and displays the provided error using the shared failed toast.
- The price-review state has both a "Save all" action, which commits every row's current new-price value at once, and a "Cancel" action, which discards the review state and returns the card list to its normal view without persisting anything.
- Fetched prices and manually entered new-price values are not persisted to the backend until the user selects "Save all".
- Attempting to navigate away while the price-review state has unsaved changes displays a confirmation modal that requires explicit confirmation before navigating away.
- The Card List's normal (non-expanded) table displays the date each card's price was last saved, alongside the saved price itself.
- The Card List displays totals at the top for all cards, unacquired cards, and cards matching the active card list search and filters, along with a count of cards missing a saved price within each of those groups.
- Changing a card's acquisition state or the active card list filters updates the applicable totals.
- The "View Financials" tab displays the totals for all cards, unacquired cards, and filtered cards, silently excluding cards without a saved price from the sum (no missing-price count shown on this tab).
- Fetched and manually entered price changes use the shared save-status toast and restore the previous saved price if saving fails.
- A card's default variant selection matches its saved `variation` string (case-insensitive substring match) against that card's available pokemontcg.io variant keys (e.g. containing "reverse" selects `reverseHolofoil`, "1st"/"first" selects `1stEditionHolofoil`, "holo" selects `holofoil`); it falls back to `normal` when nothing matches, then to the first available variant key if `normal` isn't present either.

#### Technical requirements

- Card pricing is sourced from the [pokemontcg.io](https://pokemontcg.io) API (v2),
  chosen over scraping TCGplayer directly to avoid TCGplayer's Terms of Service,
  anti-bot fragility, and headless-browser overhead that scraping their site would
  require.
- The canonical price field is `tcgplayer.prices.<variant>.market` from the
  pokemontcg.io card response; `tcgplayer.prices.<variant>.low` is the displayed
  "lowest listed price"; `tcgplayer.url` is the displayed TCGplayer product link.
  pokemontcg.io does not expose per-sale history, only these aggregate price points.
- A card's `tcgplayer.prices` object is keyed by print variant (e.g. `holofoil`,
  `normal`, `reverseHolofoil`, `1stEditionHolofoil`, `unlimitedHolofoil`); only the
  variant keys actually present for that card populate its variant dropdown.
- A lookup step converts the app's own card identification (name, set, and number, or
  the existing TCGdex `providerCardId`/`providerSetId` for TCGdex-sourced cards) into
  the matching pokemontcg.io card ID before requesting its price data.
- Fetching prices and editing new-price inputs is entirely client-side review state;
  nothing is sent to the backend until "Save all" is selected, which commits every
  row's current new-price value in one request.
- "Fetch card prices" requests pricing only for the card IDs currently produced by the
  card list's active search/sort/filter state (`CardListState`, Story 37) at the
  moment the button is selected, not every card in the binder.
- Entering the price-review state disables the card list's search input, sort column
  headers, reset-sort control, and every column's filter dropdown until the review is
  saved or cancelled, so the reviewed card set can't change out from under the pending
  new-price values.
- "Cancel" discards all client-side review state (fetched data, selected variants, and
  edited new-price values) without any backend request, and re-enables the card list's
  search/sort/filter controls.
- Each card gains a `priceUpdatedAt` timestamp, set whenever its saved price changes
  (whether from "Save all" or a manual edit), and displayed alongside the saved price
  in the card list's normal (non-expanded) view.
- The navigate-away confirmation covers both in-app navigation (a custom confirmation
  modal shown before switching tabs/routes) and closing or refreshing the browser tab
  (the browser's native `beforeunload` prompt, which cannot be custom-styled).
- "Save all" is a single `PATCH /binders/{binderId}/cards/prices` request accepting
  `{ "prices": [{ "cardId": string, "price": number, "isManualPrice": boolean }] }`
  for every reviewed row at once; the response reports a per-card success/failure
  outcome (mirroring Story 18's bulk-add per-item outcome pattern), so a failure on
  one card's price rolls back only that card rather than the whole batch.
- "Fetch card prices" calls a backend endpoint, `POST /binders/{binderId}/cards/prices/fetch`,
  accepting `{ "cardIds": string[] }`. The backend performs the pokemontcg.io card-ID
  lookup and request server-side and returns normalized per-card price data, keeping
  the external-provider dependency and lookup logic out of the frontend, consistent
  with how card-catalog search already proxies TCGdex (Story 11).
- The pokemontcg.io card-ID lookup is by set and local card number: pokemontcg.io card
  IDs follow the `<setId>-<number>` pattern (e.g. `base1-4`), so the backend resolves
  the pokemontcg.io `setId` from the card's provider set info (TCGdex `providerSetId`
  or set name), falling back to a name-based set search when no direct set-ID mapping
  exists, then combines it with the card's `localNumber`. A card the backend can't
  confidently match fails individually (its price shows as `--`) without blocking the
  rest of the batch's fetch.
- Each card gets three price fields: `price` (nullable decimal, the saved price),
  `isManualPrice` (boolean, default `false`), and `priceUpdatedAt` (nullable
  timestamp, set whenever `price` changes). `isManualPrice` tracks the provenance of
  each row's new-price value at the moment "Save all" is selected:
  - Auto-filled from the selected variant's market price or lowest price (whether by
    the initial auto-fill or by clicking that column's value), and left unedited,
    saves as `isManualPrice: false`.
  - Auto-filled by clicking the card's currently saved price, and left unedited,
    inherits that card's existing `isManualPrice` value rather than resetting it —
    so a previously manual price that's simply re-confirmed stays flagged as manual.
  - Hand-edited by the user to any other value saves as `isManualPrice: true`.
- Financial totals (all cards, unacquired cards, filtered cards) sum each card's saved
  `price`, excluding cards without a saved price from the sum. The Card List
  additionally shows a count of cards missing a price alongside each total; the "View
  Financials" tab shows only the summed totals, with no missing-price count.
