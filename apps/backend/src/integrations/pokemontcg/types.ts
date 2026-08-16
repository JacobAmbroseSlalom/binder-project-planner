// One print variant's normalized pokemontcg.io price data for a single
// card (story 38). `marketPriceCents`/`lowPriceCents` are null when
// pokemontcg.io didn't report that figure for this variant. The
// TCGplayer product-page link is the same for every variant of one card
// (pokemontcg.io only exposes one `tcgplayer.url` per card, not per
// variant), so it lives on `CardPriceFetchResult` instead of repeating it
// per variant here.
export interface CardPriceVariant {
  variantKey: string;
  marketPriceCents: number | null;
  lowPriceCents: number | null;
}

// One card's identification, as already known by the app, used to resolve
// the matching pokemontcg.io card before requesting its price data.
// `cardId` is the app's own card id (not a provider id) - it's passed
// through unchanged so `fetchCardPriceData`'s per-card result correlates
// back to the card that requested it.
export interface CardPriceLookupInput {
  cardId: string;
  setName: string | null;
  providerSetId: string | null;
  localNumber: string | null;
}

// A card's normalized price-fetch outcome. An empty `variants` array means
// either the card couldn't be confidently matched to a pokemontcg.io card,
// or it matched but pokemontcg.io has no TCGplayer price data for it - both
// display identically on the frontend (`--` for market/lowest price and
// the price-change indicator), so no separate failure/status field is
// modeled here. `tcgplayerUrl` is still populated (a best-guess link) in
// both of those cases whenever a pokemontcg.io set id was resolved for
// this card, even though `variants` itself came back empty - only null
// when no set id could be resolved at all.
export interface CardPriceFetchResult {
  cardId: string;
  variants: CardPriceVariant[];
  tcgplayerUrl: string | null;
}

// One `fetchCardVariants` result, keyed by the exact `<setId>-<localNumber>`
// id it was fetched for. Shared across every `fetchCardPriceData` call in
// one batch (`createPriceFetchBatchCache`) so cards that resolve to the
// same pokemontcg.io card - most commonly two of the app's own cards
// differing only by print variation - trigger a single upstream request
// instead of one each.
export type PriceFetchBatchCache = Map<
  string,
  Promise<{ variants: CardPriceVariant[]; tcgplayerUrl: string | null }>
>;

// Story 43's normalized pokemontcg.io catalog card - the same shape as
// TCGdex's own `TcgDexCatalogCard` (name, setName, localNumber,
// providerCardId, providerSetId, imageUrl) so the frontend's search
// results grid, loading state, and no-results messaging work unchanged
// regardless of the selected provider.
export interface PokemonTcgCatalogCard {
  name: string;
  setName: string | null;
  localNumber: string | null;
  providerCardId: string;
  providerSetId: string;
  imageUrl: string;
}

export interface DownloadedPokemonTcgImage {
  sourceOrigin: string;
}
