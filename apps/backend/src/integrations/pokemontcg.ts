import {
  POKEMONTCG_REQUEST_TIMEOUT_MS,
  POKEMONTCG_RETRY_DELAY_MS,
  POKEMONTCG_SET_ID_CACHE_TTL_MS,
} from '@binder-project-planner/shared';

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

export class PokemonTcgProviderError extends Error {
  constructor(
    message: string,
    public readonly isTimeout = false,
  ) {
    super(message);
    this.name = 'PokemonTcgProviderError';
  }
}

// Thrown when the caller's own request was aborted (client disconnect),
// mirroring `TcgDexAbortedError` - distinguishes "the client gave up" from
// an actual provider failure.
export class PokemonTcgAbortedError extends Error {
  constructor() {
    super('The upstream pokemontcg.io request was aborted.');
    this.name = 'PokemonTcgAbortedError';
  }
}

const API_BASE_URL = 'https://api.pokemontcg.io/v2';

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

interface RawSetsResponse {
  data?: { id?: unknown; name?: unknown }[];
}

function isRetryableStatus(status: number): boolean {
  return status === 429 || status >= 500;
}

function parseRetryAfterMs(response: Response): number | null {
  const header = response.headers.get('retry-after');
  if (header === null) return null;

  const seconds = Number(header);
  if (Number.isFinite(seconds) && seconds >= 0) {
    return seconds * 1000;
  }

  const dateMs = Date.parse(header);
  if (!Number.isNaN(dateMs)) {
    return Math.max(0, dateMs - Date.now());
  }

  return null;
}

// Waits `delayMs`, rejecting early (without ever resolving) if `signal` is
// aborted first, mirroring tcgdex.ts's own `delay` helper.
function delay(delayMs: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(new PokemonTcgAbortedError());
      return;
    }

    const timer = setTimeout(resolve, delayMs);
    signal.addEventListener(
      'abort',
      () => {
        clearTimeout(timer);
        reject(new PokemonTcgAbortedError());
      },
      { once: true },
    );
  });
}

// Performs one `fetch` bounded by `POKEMONTCG_REQUEST_TIMEOUT_MS` and the
// caller's own abort signal, retrying exactly once after a network error,
// timeout, 429, or 5xx response (never for other 4xx responses, since a 404
// is a meaningful "no match" result rather than a transient failure) -
// mirrors tcgdex.ts's `fetchWithRetry`. Sends the optional API key as
// pokemontcg.io's documented `X-Api-Key` header; the provider works
// unauthenticated but enforces a much lower rate limit without one.
async function fetchWithRetry(
  url: string,
  apiKey: string | undefined,
  callerSignal: AbortSignal | undefined,
  attempt = 0,
): Promise<Response> {
  const timeoutController = new AbortController();
  const timeout = setTimeout(() => timeoutController.abort(), POKEMONTCG_REQUEST_TIMEOUT_MS);

  function abortListener() {
    timeoutController.abort();
  }
  callerSignal?.addEventListener('abort', abortListener);

  let response: Response;
  try {
    response = await fetch(url, {
      signal: timeoutController.signal,
      headers: apiKey ? { 'X-Api-Key': apiKey } : undefined,
    });
  } catch {
    clearTimeout(timeout);
    callerSignal?.removeEventListener('abort', abortListener);

    if (callerSignal?.aborted) {
      throw new PokemonTcgAbortedError();
    }

    const isTimeout = timeoutController.signal.aborted;
    if (attempt === 0) {
      await delay(POKEMONTCG_RETRY_DELAY_MS, callerSignal ?? new AbortController().signal);
      return fetchWithRetry(url, apiKey, callerSignal, attempt + 1);
    }

    throw new PokemonTcgProviderError(
      isTimeout ? 'The pokemontcg.io request timed out.' : 'The pokemontcg.io request failed.',
      isTimeout,
    );
  }
  clearTimeout(timeout);
  callerSignal?.removeEventListener('abort', abortListener);

  if (response.ok || response.status === 404) {
    return response;
  }

  if (attempt === 0 && isRetryableStatus(response.status)) {
    const retryAfterMs = parseRetryAfterMs(response) ?? POKEMONTCG_RETRY_DELAY_MS;
    await delay(retryAfterMs, callerSignal ?? new AbortController().signal);
    return fetchWithRetry(url, apiKey, callerSignal, attempt + 1);
  }

  throw new PokemonTcgProviderError(`pokemontcg.io responded with status ${response.status}.`);
}

interface SetIdCacheEntry {
  setId: string | null;
  expiresAt: number;
}

// Caches resolved set IDs (both hits and misses) by the same
// providerSetId/setName pair the card was looked up with, since sets are
// effectively immutable once printed - avoids repeating the same set
// lookup for every card sharing one set within a batch, and across
// requests for the lifetime of `POKEMONTCG_SET_ID_CACHE_TTL_MS`.
const setIdCache = new Map<string, SetIdCacheEntry>();

function getCachedSetId(key: string): string | null | undefined {
  const entry = setIdCache.get(key);
  if (!entry) return undefined;
  if (entry.expiresAt <= Date.now()) {
    setIdCache.delete(key);
    return undefined;
  }
  return entry.setId;
}

function setCachedSetId(key: string, setId: string | null): void {
  setIdCache.set(key, { setId, expiresAt: Date.now() + POKEMONTCG_SET_ID_CACHE_TTL_MS });
}

// Confirms `candidateSetId` (typically a TCGdex `providerSetId`) also
// identifies a real pokemontcg.io set, since the two providers often - but
// not always - share the same set-id convention (e.g. `base1`). Returns
// the confirmed id, or null if pokemontcg.io has no such set.
async function confirmSetId(
  candidateSetId: string,
  apiKey: string | undefined,
  signal?: AbortSignal,
): Promise<string | null> {
  const response = await fetchWithRetry(
    `${API_BASE_URL}/sets/${encodeURIComponent(candidateSetId)}`,
    apiKey,
    signal,
  );
  if (!response.ok) return null;

  const body: RawSetsResponse = await response.json();
  const id = (body as { data?: { id?: unknown } }).data?.id;
  return typeof id === 'string' ? id : null;
}

// Falls back to a name-based set search (pokemontcg.io's `q=name:"..."`
// query syntax) when a card has no `providerSetId` (custom cards) or its
// providerSetId doesn't directly match a pokemontcg.io set id. Prefers an
// exact case-insensitive name match; otherwise takes the first result,
// matching the story's "falling back to a name-based set search" wording.
async function searchSetIdByName(
  setName: string,
  apiKey: string | undefined,
  signal?: AbortSignal,
): Promise<string | null> {
  const response = await fetchWithRetry(
    `${API_BASE_URL}/sets?q=${encodeURIComponent(`name:"${setName}"`)}`,
    apiKey,
    signal,
  );
  if (!response.ok) return null;

  const body: RawSetsResponse = await response.json();
  const results = Array.isArray(body.data) ? body.data : [];
  if (results.length === 0) return null;

  const exactMatch = results.find(
    (result) =>
      typeof result.name === 'string' && result.name.toLowerCase() === setName.toLowerCase(),
  );
  const chosen = exactMatch ?? results[0];
  return typeof chosen?.id === 'string' ? chosen.id : null;
}

// Dedupes concurrent (not-yet-cached) `resolveSetId` lookups for the same
// providerSetId/setName key. Without this, two cards sharing one
// pokemontcg.io set - most commonly two print variations of the same
// physical card - looked up "concurrently" via `mapWithConcurrencyLimit`'s
// worker pool would each fire their own `/sets` lookup before either's
// result lands in `setIdCache` below, doubling upstream requests and,
// since pokemontcg.io rate-limits fairly aggressively, risking one of
// those two identical concurrent requests failing outright (observed in
// practice: of two variants of the same physical card, only one resolved
// successfully, leaving the other with no price data or TCGplayer link at
// all). Kept process-level (not scoped to one price-fetch batch, unlike
// `PriceFetchBatchCache` above) since the same race is possible across
// overlapping requests too, and an entry only lives here while its lookup
// is still pending - once settled, `setIdCache`'s TTL cache takes over for
// later, non-concurrent lookups.
const inFlightSetIdLookups = new Map<string, Promise<string | null>>();

// The actual uncached set-id resolution, per the story's technical
// requirements: try `providerSetId` directly first (when present),
// falling back to a name-based set search when no direct set-id mapping
// exists (including custom cards, which have no `providerSetId` at all).
// Split out from `resolveSetId` so the latter can wrap this call with the
// in-flight dedup above without an `await` sitting between its cache
// check and its cache write (which would reopen the same race this is
// meant to close).
async function resolveSetIdUncached(
  providerSetId: string | null,
  setName: string | null,
  apiKey: string | undefined,
  signal: AbortSignal | undefined,
  cacheKey: string,
): Promise<string | null> {
  let resolved: string | null = null;
  if (providerSetId) {
    resolved = await confirmSetId(providerSetId, apiKey, signal);
  }
  if (resolved === null && setName) {
    resolved = await searchSetIdByName(setName, apiKey, signal);
  }

  setCachedSetId(cacheKey, resolved);
  return resolved;
}

// Resolves a pokemontcg.io set id from the card's own provider set info,
// reusing an already-settled `setIdCache` entry, an already in-flight
// lookup for the same key (`inFlightSetIdLookups`), or else starting a
// fresh lookup - all decided synchronously (no `await` before either map
// is read or written), so concurrent callers can never race between the
// cache check and the cache/in-flight write.
async function resolveSetId(
  providerSetId: string | null,
  setName: string | null,
  apiKey: string | undefined,
  signal?: AbortSignal,
): Promise<string | null> {
  const cacheKey = `${providerSetId ?? ''}|${(setName ?? '').toLowerCase()}`;
  const cached = getCachedSetId(cacheKey);
  if (cached !== undefined) return cached;

  const inFlight = inFlightSetIdLookups.get(cacheKey);
  if (inFlight) return inFlight;

  const pending = resolveSetIdUncached(providerSetId, setName, apiKey, signal, cacheKey);
  inFlightSetIdLookups.set(cacheKey, pending);
  // Runs regardless of success/failure - a rejected lookup shouldn't get
  // stuck "in flight" forever, and a resolved one is already covered by
  // `setIdCache` from here on. `.finally()` returns its own new promise
  // that rejects too whenever `pending` does, separate from `pending`
  // itself - since that derived promise is never awaited or returned, an
  // unhandled `.catch()`-less rejection here would crash the process even
  // though every real caller already handles `pending`'s own rejection via
  // `fetchCardPriceData`'s try/catch - the trailing `.catch(() => {})`
  // silences that duplicate, otherwise-unobserved rejection.
  pending.finally(() => inFlightSetIdLookups.delete(cacheKey)).catch(() => {});
  return pending;
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

// One `fetchCardVariants` result, keyed by the exact `<setId>-<localNumber>`
// id it was fetched for. Shared across every `fetchCardPriceData` call in
// one batch (`createPriceFetchBatchCache` below) so cards that resolve to
// the same pokemontcg.io card - most commonly two of the app's own cards
// differing only by print variation - trigger a single upstream request
// instead of one each.
export type PriceFetchBatchCache = Map<
  string,
  Promise<{ variants: CardPriceVariant[]; tcgplayerUrl: string | null }>
>;

// Creates a fresh, empty batch cache - callers create exactly one per
// price-fetch request (never reused across requests, unlike `setIdCache`
// above) since prices themselves change over time and shouldn't be cached
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
