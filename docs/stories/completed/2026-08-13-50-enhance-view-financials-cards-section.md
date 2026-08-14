# 50. Enhance the View Financials Cards section

**Status:** Done (2026-08-13 22:03 EDT)

#### Acceptance criteria

- The Cards section's two totals ("All cards total" and "Unacquired cards total") are
  shown as label-over-bold-value stat blocks (matching the sticky totals bar's stat
  layout above this section) instead of today's plain inline sentences, giving this
  section the same visual weight as the Physical costs and Time-based costs sections
  beside it.
- Each of those two totals additionally shows the count of cards in that group (e.g.
  "200 cards" / "150 cards") alongside its dollar total.
- Each of those two totals additionally shows a missing-price count for that group
  (e.g. "12 missing prices"), matching the Card List tab's own totals row - revising
  story 38's original decision to omit this count on the Financials tab.
- The section shows the oldest `priceUpdatedAt` date among every card that currently
  has a saved price (i.e. the least-recently-refreshed priced card) as a "Prices
  oldest refresh" stat, so the user can judge how stale their total might be before
  trusting it. Cards that have never had a price (`price` and `priceUpdatedAt` both
  null) are excluded from this calculation entirely; if no card in the binder has ever
  had a price, this stat displays as `--`.
- The section shows a "Top 6 priced cards" list at the bottom of the section, below
  the totals: the 6 highest-priced cards across the whole binder (by saved `price`,
  highest first, regardless of acquisition status), each row showing that card's
  thumbnail, name, set, number, and price. Ties at the 6th-place cutoff are broken by
  name (alphabetical) for a stable, deterministic list. Cards without a saved price
  are never included in this list. If fewer than 6 cards have a saved price, the list
  simply shows however many do (no placeholder rows for the rest).
- The "Top N" count (6) is a named, adjustable default rather than hardcoded at each
  call site, per the project's centralized-defaults convention.

#### Technical requirements

- The 6-count above is added to `packages/shared/src/defaults.ts` as a new named
  constant (e.g. `DEFAULT_TOP_PRICED_CARDS_COUNT`), imported wherever the Cards
  section computes its top-priced list, rather than hardcoding `6` in the component.
- No new backend endpoint is needed: every figure this story adds (counts,
  missing-price counts, oldest refresh date, top-N list) is derivable client-side from
  the same already-loaded `cards` array `BinderRouteContext` already provides to the
  Financials tab - mirroring how `computeCardPriceTotal` already works today.
- New pure helper logic (e.g. `computeOldestPriceRefresh(cards)` and
  `computeTopPricedCards(cards, count)`) lives in `apps/frontend/src/shared/finance/`,
  alongside `computeCardPriceTotal.ts`, so both this section and any future tab
  needing the same figures can reuse it.
