import { API_BASE_URL, fetchWithRetry } from './httpClient.js';
import { resolveSetId } from './setIdResolution.js';
import { PokemonTcgAbortedError } from './errors.js';
import type {
  CardPriceFetchResult,
  CardPriceLookupInput,
  CardPriceVariant,
  PriceFetchBatchCache,
} from './types.js';

interface RawTcgplayerPrice {
  market?: unknown;
  low?: unknown;
}

interface RawCardResponse {
  data?: {
    tcgplayer?: {
      url?: unknown;
      prices?: Record<string, RawTcgplayerPrice>;
    };
  };
}

// Fetches one pokemontcg.io card's TCGplayer price data by its combined
// `<setId>-<localNumber>` id, normalizing its `tcgplayer.prices` object
// (one entry per available print variant) into `CardPriceVariant`s. Prices
// are converted dollars-to-cents here (rounded), matching
// `finance/currency.ts`'s cents-storage convention for every other
// monetary value in the backend.
async function fetchCardVariants(
  pokemonTcgSetId: string,
  localNumber: string,
  apiKey: string | undefined,
  signal?: AbortSignal,
): Promise<{ variants: CardPriceVariant[]; tcgplayerUrl: string | null }> {
  // pokemontcg.io's own `tcgplayer.url` field is itself just
  // `https://prices.pokemontcg.io/tcgplayer/<setId>-<localNumber>` (their
  // mirror of the TCGplayer product page, not a link to tcgplayer.com
  // directly) - this same pattern can be reconstructed from the id we're
  // already looking the card up by, so a "View" link can still be shown
  // as a best guess whenever the actual response omits `tcgplayer.url`,
  // has no TCGplayer price data at all, or the card lookup itself 404s -
  // rather than falling back to `--` in any of those cases.
  const guessedTcgplayerUrl = `https://prices.pokemontcg.io/tcgplayer/${pokemonTcgSetId}-${localNumber}`;

  const response = await fetchWithRetry(
    `${API_BASE_URL}/cards/${encodeURIComponent(`${pokemonTcgSetId}-${localNumber}`)}`,
    apiKey,
    signal,
  );
  if (!response.ok) return { variants: [], tcgplayerUrl: guessedTcgplayerUrl };

  const body: RawCardResponse = await response.json();
  const tcgplayer = body.data?.tcgplayer;
  const tcgplayerUrl = typeof tcgplayer?.url === 'string' ? tcgplayer.url : guessedTcgplayerUrl;

  const prices = tcgplayer?.prices;
  if (!prices || typeof prices !== 'object') return { variants: [], tcgplayerUrl };

  const variants = Object.entries(prices).map(([variantKey, variantPrices]) => ({
    variantKey,
    marketPriceCents:
      typeof variantPrices?.market === 'number' ? Math.round(variantPrices.market * 100) : null,
    lowPriceCents:
      typeof variantPrices?.low === 'number' ? Math.round(variantPrices.low * 100) : null,
  }));

  return { variants, tcgplayerUrl };
}

// Creates a fresh, empty batch cache - callers create exactly one per
// price-fetch request (never reused across requests, unlike the set-id
// cache) since prices themselves change over time and shouldn't be cached
// beyond a single "Fetch card prices" click.
export function createPriceFetchBatchCache(): PriceFetchBatchCache {
  return new Map();
}

// Wraps `fetchCardVariants` with `batchCache` de-duplication: the first
// call for a given `<setId>-<localNumber>` key stores its (not yet
// resolved) promise in the cache immediately, so any other card in the
// same batch that resolves to the same key - even one already in flight -
// awaits that same promise instead of starting a second identical
// request. Falls back to an uncached call when no `batchCache` is passed,
// so existing single-card callers/tests are unaffected.
function getOrFetchCardVariants(
  pokemonTcgSetId: string,
  localNumber: string,
  apiKey: string | undefined,
  signal: AbortSignal | undefined,
  batchCache?: PriceFetchBatchCache,
): Promise<{ variants: CardPriceVariant[]; tcgplayerUrl: string | null }> {
  if (!batchCache) {
    return fetchCardVariants(pokemonTcgSetId, localNumber, apiKey, signal);
  }

  const cacheKey = `${pokemonTcgSetId}-${localNumber}`;
  const cached = batchCache.get(cacheKey);
  if (cached) return cached;

  const pending = fetchCardVariants(pokemonTcgSetId, localNumber, apiKey, signal);
  batchCache.set(cacheKey, pending);
  return pending;
}

// Looks up one card's pokemontcg.io price data end-to-end: resolves its
// set id, then fetches its variant prices by `<setId>-<localNumber>`. A
// card that can't be confidently matched (no local number, or no
// resolvable set) returns an empty `variants` array rather than throwing,
// per the story's "fails individually ... without blocking the rest of the
// batch" requirement - the caller (the route handler) is expected to run
// this once per card, itself bounded by
// `POKEMONTCG_PRICE_FETCH_CONCURRENCY`.
//
// Two app cards commonly share one pokemontcg.io card (e.g. a "normal"
// print and a "Reverse Holo" print of the same physical card are two
// separate rows here, differing only by `variation`, but both resolve to
// the same `<setId>-<localNumber>` id and the same `/cards/{id}` response,
// which already reports every print variant's price in one payload) - so
// callers fetching a batch of cards should share one `batchCache` across
// every `fetchCardPriceData` call in that batch (see
// `createPriceFetchBatchCache`) to collapse those into a single upstream
// request instead of repeating an identical one per card.
export async function fetchCardPriceData(
  input: CardPriceLookupInput,
  apiKey: string | undefined,
  signal?: AbortSignal,
  batchCache?: PriceFetchBatchCache,
): Promise<CardPriceFetchResult> {
  if (!input.localNumber) {
    return { cardId: input.cardId, variants: [], tcgplayerUrl: null };
  }

  // Tracked outside the try block so the catch handler below can still
  // infer a best-guess TCGplayer link when the set id itself resolved
  // successfully but the subsequent per-card price fetch failed.
  let setId: string | null = null;
  try {
    setId = await resolveSetId(input.providerSetId, input.setName, apiKey, signal);
    if (!setId) {
      return { cardId: input.cardId, variants: [], tcgplayerUrl: null };
    }

    const { variants, tcgplayerUrl } = await getOrFetchCardVariants(
      setId,
      input.localNumber,
      apiKey,
      signal,
      batchCache,
    );
    return { cardId: input.cardId, variants, tcgplayerUrl };
  } catch (error) {
    if (error instanceof PokemonTcgAbortedError) throw error;
    // Any other provider failure for this one card (timeout, 5xx after
    // retry, unexpected response shape) degrades to "no match" for price
    // data rather than failing the whole batch, but the TCGplayer link can
    // still be inferred whenever the set id was already resolved before
    // the failure.
    return {
      cardId: input.cardId,
      variants: [],
      tcgplayerUrl: setId
        ? `https://prices.pokemontcg.io/tcgplayer/${setId}-${input.localNumber}`
        : null,
    };
  }
}
