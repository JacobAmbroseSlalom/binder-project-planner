import {
  CARD_SEARCH_CACHE_MAX_ENTRIES,
  CARD_SEARCH_CACHE_TTL_MS,
  TCGDEX_REQUEST_TIMEOUT_MS,
  TCGDEX_RETRY_DELAY_MS,
} from '@binder-project-planner/shared';
import { createWriteStream } from 'node:fs';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';

// The normalized TCGdex catalog card shape returned by
// `GET /card-catalog/search` and accepted (unmodified) as the JSON source
// for TCGdex card creation (planning.md story 11; see data-types.md's
// `TcgDexCatalogCard`). `imageUrl` is the provider's image location, used
// server-side to download the card's image - it is never the URL the
// frontend ultimately displays (that's the backend's own
// `/cards/{cardId}/image`).
export interface TcgDexCatalogCard {
  name: string;
  setName: string | null;
  localNumber: string | null;
  providerCardId: string;
  providerSetId: string;
  imageUrl: string;
}

export class TcgDexProviderError extends Error {
  // `true` for failures that should surface as a Problem Details timeout
  // response distinct from a generic upstream failure.
  constructor(
    message: string,
    public readonly isTimeout = false,
  ) {
    super(message);
    this.name = 'TcgDexProviderError';
  }
}

// Thrown when the caller's own request was aborted (client disconnect or
// AbortController cancellation) so route handlers can distinguish "the
// client gave up" from an actual provider failure.
export class TcgDexAbortedError extends Error {
  constructor() {
    super('The upstream TCGdex request was aborted.');
    this.name = 'TcgDexAbortedError';
  }
}

// TCGdex's actual REST API host (`api.tcgdex.net`), not the `tcgdex.dev`
// documentation site - that host serves HTML, not JSON, and was the cause
// of a production "Unexpected token '<' ... is not valid JSON" failure.
const CARD_SEARCH_ENDPOINT = 'https://api.tcgdex.net/v2/en/cards';
// TCGdex's bulk sets listing, used to resolve a search result's set name
// (see `getSetNamesById` below) since the brief card-search endpoint below
// never includes a `set` object per card.
const SETS_ENDPOINT = 'https://api.tcgdex.net/v2/en/sets';

// Only image bytes fetched from these hosts are ever downloaded and
// installed locally (planning.md: "accepts image downloads only from
// approved TCGdex image origins"). TCGdex serves card artwork from its
// dedicated assets CDN, distinct from the `api.tcgdex.net` REST API host
// used for search.
const APPROVED_IMAGE_ORIGINS = new Set(['assets.tcgdex.net', 'api.tcgdex.net']);

// TCGdex's card-search endpoint only ever returns this "brief" shape (id,
// localId, name, image) - it never includes the card's `set`, unlike the
// single-card detail endpoint. Fetching each result's full detail just to
// read its set name would mean one extra provider request per search
// result, so the set id is instead derived from `id` itself (see
// `deriveProviderSetId`) and resolved to a name through the bulk sets
// listing cached by `getSetNamesById`.
interface RawTcgDexCard {
  id?: unknown;
  localId?: unknown;
  name?: unknown;
  image?: unknown;
}

// A TCGdex card id is always `${setId}-${localId}` (e.g. `hgss3-10`, set
// `hgss3`, local number `10`); this recovers the set id half without an
// extra per-card request. Falls back to the substring before the last `-`
// if the id doesn't end with the expected `-localId` suffix, and to an
// empty string if there's no separator at all.
function deriveProviderSetId(id: string, localId: string): string {
  const suffix = `-${localId}`;
  if (id.endsWith(suffix)) {
    return id.slice(0, id.length - suffix.length);
  }

  const separatorIndex = id.lastIndexOf('-');
  return separatorIndex === -1 ? '' : id.slice(0, separatorIndex);
}

// Maps one raw TCGdex API card into the app's normalized contract. TCGdex's
// `image` field is a base path without a resolution/extension suffix; the
// high-quality PNG rendition is requested by appending `/high.png`, per
// TCGdex's documented image-URL convention.
function normalizeCard(
  raw: RawTcgDexCard,
  setNamesById: Map<string, string>,
): TcgDexCatalogCard | null {
  if (typeof raw.id !== 'string' || typeof raw.name !== 'string' || typeof raw.image !== 'string') {
    return null;
  }

  const localNumber = typeof raw.localId === 'string' ? raw.localId : null;
  const providerSetId = localNumber !== null ? deriveProviderSetId(raw.id, localNumber) : '';

  return {
    name: raw.name,
    setName: setNamesById.get(providerSetId) ?? null,
    localNumber,
    providerCardId: raw.id,
    providerSetId,
    imageUrl: `${raw.image}/high.png`,
  };
}

// Memoizes the one-time (per process) fetch of TCGdex's complete sets list
// into a `providerSetId -> setName` map, since sets change rarely and this
// avoids a per-search-result provider request. Not tied to any individual
// search's `AbortSignal` - concurrent searches share this fetch, so one
// search's cancellation must never abort it for the others. Cleared on
// failure so a later search retries the fetch instead of caching a
// permanently-empty map.
let setNamesByIdPromise: Promise<Map<string, string>> | null = null;

function getSetNamesById(): Promise<Map<string, string>> {
  if (!setNamesByIdPromise) {
    setNamesByIdPromise = fetchWithRetry(SETS_ENDPOINT, undefined)
      .then((response) => response.json())
      .then((body: unknown) => {
        const map = new Map<string, string>();
        if (Array.isArray(body)) {
          for (const entry of body) {
            const id = (entry as { id?: unknown } | null)?.id;
            const name = (entry as { name?: unknown } | null)?.name;
            if (typeof id === 'string' && typeof name === 'string') {
              map.set(id, name);
            }
          }
        }
        return map;
      })
      .catch((error: unknown) => {
        setNamesByIdPromise = null;
        throw error;
      });
  }
  return setNamesByIdPromise;
}

// A parsed `Retry-After` header value in milliseconds, or `null` if the
// header is absent or not a valid non-negative delay (planning.md: "A retry
// honors a valid provider Retry-After header or otherwise waits
// TCGDEX_RETRY_DELAY_MS").
function parseRetryAfterMs(response: Response): number | null {
  const header = response.headers.get('retry-after');
  if (header === null) return null;

  const seconds = Number(header);
  if (Number.isFinite(seconds) && seconds >= 0) {
    return seconds * 1000;
  }

  // `Retry-After` may also be an HTTP date rather than a delta-seconds
  // value.
  const dateMs = Date.parse(header);
  if (!Number.isNaN(dateMs)) {
    return Math.max(0, dateMs - Date.now());
  }

  return null;
}

function isRetryableStatus(status: number): boolean {
  return status === 429 || status >= 500;
}

// Waits `delayMs`, rejecting early (without ever resolving) if `signal` is
// aborted first - satisfies "client-request cancellation aborts the retry
// delay and any retry attempt".
function delay(delayMs: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(new TcgDexAbortedError());
      return;
    }

    const timer = setTimeout(resolve, delayMs);
    signal.addEventListener(
      'abort',
      () => {
        clearTimeout(timer);
        reject(new TcgDexAbortedError());
      },
      { once: true },
    );
  });
}

// Performs one `fetch` bounded by `TCGDEX_REQUEST_TIMEOUT_MS` and the
// caller's own abort signal, retrying exactly once after a network error,
// timeout, 429, or 5xx response (never for other 4xx responses). Shared by
// both search and image download since both requirements are identical.
async function fetchWithRetry(
  url: string,
  callerSignal: AbortSignal | undefined,
  attempt = 0,
): Promise<Response> {
  const timeoutController = new AbortController();
  const timeout = setTimeout(() => timeoutController.abort(), TCGDEX_REQUEST_TIMEOUT_MS);

  // Combines the caller's own cancellation with this attempt's timeout so
  // either one aborts the upstream request; the caller's signal also drives
  // the retry-delay abort below.
  function abortListener() {
    timeoutController.abort();
  }
  callerSignal?.addEventListener('abort', abortListener);

  let response: Response;
  try {
    response = await fetch(url, { signal: timeoutController.signal });
  } catch {
    clearTimeout(timeout);
    callerSignal?.removeEventListener('abort', abortListener);

    if (callerSignal?.aborted) {
      throw new TcgDexAbortedError();
    }

    const isTimeout = timeoutController.signal.aborted;
    if (attempt === 0) {
      await delay(TCGDEX_RETRY_DELAY_MS, callerSignal ?? new AbortController().signal);
      return fetchWithRetry(url, callerSignal, attempt + 1);
    }

    throw new TcgDexProviderError(
      isTimeout ? 'The TCGdex request timed out.' : 'The TCGdex request failed.',
      isTimeout,
    );
  }
  clearTimeout(timeout);
  callerSignal?.removeEventListener('abort', abortListener);

  if (response.ok) {
    return response;
  }

  if (attempt === 0 && isRetryableStatus(response.status)) {
    const retryAfterMs = parseRetryAfterMs(response) ?? TCGDEX_RETRY_DELAY_MS;
    await delay(retryAfterMs, callerSignal ?? new AbortController().signal);
    return fetchWithRetry(url, callerSignal, attempt + 1);
  }

  throw new TcgDexProviderError(`TCGdex responded with status ${response.status}.`);
}

// A least-recently-used cache entry: the normalized results plus the time
// they expire, per `CARD_SEARCH_CACHE_TTL_MS` (planning.md story 11).
interface CacheEntry {
  results: TcgDexCatalogCard[];
  expiresAt: number;
}

// `Map` iterates keys in insertion order, so re-inserting a key on every
// access (see `get` below) keeps the least-recently-used entry first for
// eviction - a plain, dependency-free LRU+TTL cache.
const searchCache = new Map<string, CacheEntry>();

function getCached(key: string): TcgDexCatalogCard[] | null {
  const entry = searchCache.get(key);
  if (!entry) return null;

  if (entry.expiresAt <= Date.now()) {
    searchCache.delete(key);
    return null;
  }

  // Refresh recency by reinserting.
  searchCache.delete(key);
  searchCache.set(key, entry);
  return entry.results;
}

function setCached(key: string, results: TcgDexCatalogCard[]): void {
  searchCache.delete(key);
  searchCache.set(key, { results, expiresAt: Date.now() + CARD_SEARCH_CACHE_TTL_MS });

  if (searchCache.size > CARD_SEARCH_CACHE_MAX_ENTRIES) {
    const oldestKey = searchCache.keys().next().value;
    if (oldestKey !== undefined) searchCache.delete(oldestKey);
  }
}

// Searches TCGdex for `trimmedQuery`, using the in-memory LRU/TTL cache
// keyed by the trimmed, case-normalized query (planning.md: cache cleared
// on backend restart, which is inherent to this in-process `Map`).
export async function searchCardCatalog(
  trimmedQuery: string,
  signal?: AbortSignal,
): Promise<TcgDexCatalogCard[]> {
  const cacheKey = trimmedQuery.toLowerCase();
  const cached = getCached(cacheKey);
  if (cached) return cached;

  // TCGdex's `name` and `set.name` filters only ever combine as AND, never
  // OR (confirmed live: `name=umbreon&set.name=Generations` returns no
  // results even though Umbreon exists in other sets) - there is no single
  // query parameter that matches either field. So the query is matched
  // against both independently, and the two result sets are merged below.
  const nameUrl = `${CARD_SEARCH_ENDPOINT}?name=${encodeURIComponent(trimmedQuery)}`;
  const setNameUrl = `${CARD_SEARCH_ENDPOINT}?set.name=${encodeURIComponent(trimmedQuery)}`;
  // Runs alongside the card searches rather than after them - the sets
  // lookup is independent of the search query. A failure resolving set
  // names degrades to an empty map (every result's `setName` falls back to
  // `null`) rather than failing the whole search over a secondary,
  // rarely-changing resource.
  const [nameResponse, setNameResponse, setNamesById] = await Promise.all([
    fetchWithRetry(nameUrl, signal),
    fetchWithRetry(setNameUrl, signal),
    getSetNamesById().catch(() => new Map<string, string>()),
  ]);
  const nameBody: unknown = await nameResponse.json();
  const setNameBody: unknown = await setNameResponse.json();

  if (!Array.isArray(nameBody) || !Array.isArray(setNameBody)) {
    throw new TcgDexProviderError('TCGdex returned an unexpected search response shape.');
  }

  // Merges the two independent queries: card-name matches first (in
  // TCGdex's own order), then set-name matches not already included,
  // deduplicated by the raw provider card id so a card whose name and set
  // both match the query isn't listed twice.
  const seenIds = new Set<string>();
  const combined: unknown[] = [];
  for (const raw of [...nameBody, ...setNameBody]) {
    const id = (raw as RawTcgDexCard)?.id;
    if (typeof id === 'string') {
      if (seenIds.has(id)) continue;
      seenIds.add(id);
    }
    combined.push(raw);
  }

  // Preserves the merged ordering above; unrecognized entries are dropped
  // rather than breaking the whole search.
  const results = combined
    .map((raw) => normalizeCard(raw as RawTcgDexCard, setNamesById))
    .filter((card): card is TcgDexCatalogCard => card !== null);

  setCached(cacheKey, results);
  return results;
}

export interface DownloadedImage {
  sourceOrigin: string;
}

// Downloads a card's image from TCGdex directly to `destinationPath`,
// enforcing the approved-origin allowlist before making any request.
// Streams the response body straight to disk rather than buffering the
// complete image in memory, since TCGdex image downloads have no
// application-level byte-size limit (planning.md). The caller is
// responsible for detecting the image format from the written file and
// removing it if validation or persistence subsequently fails.
export async function downloadCardImage(
  imageUrl: string,
  destinationPath: string,
  signal?: AbortSignal,
): Promise<DownloadedImage> {
  let origin: URL;
  try {
    origin = new URL(imageUrl);
  } catch {
    throw new TcgDexProviderError('TCGdex returned an invalid image URL.');
  }

  if (!APPROVED_IMAGE_ORIGINS.has(origin.hostname)) {
    throw new TcgDexProviderError(
      `Image origin "${origin.hostname}" is not an approved TCGdex host.`,
    );
  }

  const response = await fetchWithRetry(imageUrl, signal);
  if (!response.body) {
    throw new TcgDexProviderError('TCGdex returned an empty image response.');
  }

  await pipeline(Readable.fromWeb(response.body as never), createWriteStream(destinationPath));

  return { sourceOrigin: origin.hostname };
}
