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
// TCGdex namespaces its entire catalog by a `{lang}` path segment (story 41
// confirmed live: `/v2/ja/cards` returns cards with Japanese names/sets,
// distinct from `/v2/en/cards`), so both endpoints are functions of the
// requested `CardSearchLanguage` rather than fixed `en` URLs.
export type CardSearchLanguage = 'en' | 'ja';

function getCardSearchEndpoint(language: CardSearchLanguage): string {
  return `https://api.tcgdex.net/v2/${language}/cards`;
}

// TCGdex's bulk sets listing, used to resolve a search result's set name
// (see `getSetNamesById` below) since the brief card-search endpoint below
// never includes a `set` object per card. Also language-namespaced, since a
// `ja` search result's `setName` must be the Japanese set name, not English.
function getSetsEndpoint(language: CardSearchLanguage): string {
  return `https://api.tcgdex.net/v2/${language}/sets`;
}

// TCGdex's Pokémon TCG Pocket "serie" detail endpoint (story 41), which
// lists every set belonging to that serie in one request - used to filter
// Pocket cards out of search results by default (see
// `getTcgPocketSetIds`/`searchCardCatalog` below) without a per-set or
// per-card request. Confirmed live: TCGdex's regular `/cards` search
// already mixes Pocket-catalog cards (e.g. set `A1`) into its results, and
// the bulk `/sets` listing has no `serie` field to distinguish them, so
// this dedicated serie lookup is the only cheap way to identify them.
function getTcgPocketSeriesEndpoint(language: CardSearchLanguage): string {
  return `https://api.tcgdex.net/v2/${language}/series/tcgp`;
}

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
// avoids a per-search-result provider request. Keyed per language (story
// 41) since `en` and `ja` sets have entirely different id spaces and names.
// Not tied to any individual search's `AbortSignal` - concurrent searches
// share this fetch, so one search's cancellation must never abort it for
// the others. Cleared on failure so a later search retries the fetch
// instead of caching a permanently-empty map.
const setNamesByIdPromises = new Map<CardSearchLanguage, Promise<Map<string, string>>>();

function getSetNamesById(language: CardSearchLanguage): Promise<Map<string, string>> {
  let promise = setNamesByIdPromises.get(language);
  if (!promise) {
    promise = fetchWithRetry(getSetsEndpoint(language), undefined)
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
        setNamesByIdPromises.delete(language);
        throw error;
      });
    setNamesByIdPromises.set(language, promise);
  }
  return promise;
}

// Memoizes the one-time (per process) fetch of the Pokémon TCG Pocket
// serie's member set ids (story 41), mirroring `getSetNamesById` above -
// keyed per language, shared across concurrent searches (never tied to an
// individual search's `AbortSignal`), and cleared on failure so a later
// search retries instead of caching a permanently-empty set.
const tcgPocketSetIdsPromises = new Map<CardSearchLanguage, Promise<Set<string>>>();

function getTcgPocketSetIds(language: CardSearchLanguage): Promise<Set<string>> {
  let promise = tcgPocketSetIdsPromises.get(language);
  if (!promise) {
    promise = fetchWithRetry(getTcgPocketSeriesEndpoint(language), undefined)
      .then((response) => response.json())
      .then((body: unknown) => {
        const ids = new Set<string>();
        const sets = (body as { sets?: unknown } | null)?.sets;
        if (Array.isArray(sets)) {
          for (const entry of sets) {
            const id = (entry as { id?: unknown } | null)?.id;
            if (typeof id === 'string') ids.add(id);
          }
        }
        return ids;
      })
      .catch((error: unknown) => {
        tcgPocketSetIdsPromises.delete(language);
        throw error;
      });
    tcgPocketSetIdsPromises.set(language, promise);
  }
  return promise;
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
// keyed by the trimmed, case-normalized query together with the requested
// language and TCG Pocket inclusion (planning.md story 41: "cached results
// are never returned for a different toggle combination"; cache cleared on
// backend restart, which is inherent to this in-process `Map`).
export async function searchCardCatalog(
  trimmedQuery: string,
  language: CardSearchLanguage,
  includeTcgPocket: boolean,
  signal?: AbortSignal,
): Promise<TcgDexCatalogCard[]> {
  const cacheKey = `${language}:${includeTcgPocket}:${trimmedQuery.toLowerCase()}`;
  const cached = getCached(cacheKey);
  if (cached) return cached;

  // TCGdex's `name` and `set.name` filters only ever combine as AND, never
  // OR (confirmed live: `name=umbreon&set.name=Generations` returns no
  // results even though Umbreon exists in other sets) - there is no single
  // query parameter that matches either field. So `en` searches match the
  // query against both independently and merge the two result sets below.
  // `ja` searches skip the `set.name` query entirely (story 41): the query
  // is already, in practice, a PokéAPI-translated Pokémon species name
  // rather than free text, so a set-name match was never a meaningful
  // signal there, and set-name search in Japanese is out of scope.
  const searchEndpoint = getCardSearchEndpoint(language);
  const nameUrl = `${searchEndpoint}?name=${encodeURIComponent(trimmedQuery)}`;
  const setNameUrl = `${searchEndpoint}?set.name=${encodeURIComponent(trimmedQuery)}`;
  // Runs alongside the card search(es) rather than after them - both the
  // sets-name and TCG Pocket set-id lookups are independent of the search
  // query. A failure resolving set names degrades to an empty map (every
  // result's `setName` falls back to `null`); a failure resolving Pocket
  // set ids degrades to an empty set (nothing gets filtered out, so a
  // lookup failure never blocks the search - it only means the default
  // exclusion silently doesn't apply for this one request).
  const [nameResponse, setNameResponse, setNamesById, tcgPocketSetIds] = await Promise.all([
    fetchWithRetry(nameUrl, signal),
    language === 'en' ? fetchWithRetry(setNameUrl, signal) : Promise.resolve(null),
    getSetNamesById(language).catch(() => new Map<string, string>()),
    includeTcgPocket
      ? Promise.resolve(new Set<string>())
      : getTcgPocketSetIds(language).catch(() => new Set<string>()),
  ]);
  const nameBody: unknown = await nameResponse.json();
  const setNameBody: unknown = setNameResponse ? await setNameResponse.json() : [];

  if (!Array.isArray(nameBody) || !Array.isArray(setNameBody)) {
    throw new TcgDexProviderError('TCGdex returned an unexpected search response shape.');
  }

  // Merges the two independent queries: card-name matches first (in
  // TCGdex's own order), then set-name matches not already included,
  // deduplicated by the raw provider card id so a card whose name and set
  // both match the query isn't listed twice. `setNameBody` is always empty
  // for `ja` (see above), so this is effectively name-only there.
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
  // rather than breaking the whole search. TCGdex's regular card search
  // mixes Pokémon TCG Pocket cards into its results by default (confirmed
  // live), so Pocket cards are excluded here - after normalization, since
  // that's what gives each result its `providerSetId` - unless
  // `includeTcgPocket` is true (in which case `tcgPocketSetIds` is left
  // empty above and nothing is filtered).
  const results = combined
    .map((raw) => normalizeCard(raw as RawTcgDexCard, setNamesById))
    .filter((card): card is TcgDexCatalogCard => card !== null)
    .filter((card) => !tcgPocketSetIds.has(card.providerSetId));

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
