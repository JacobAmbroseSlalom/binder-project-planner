import {
  CARD_SEARCH_CACHE_MAX_ENTRIES,
  CARD_SEARCH_CACHE_TTL_MS,
} from '@binder-project-planner/shared';

import { API_BASE_URL, fetchWithRetry } from './httpClient.js';
import { PokemonTcgProviderError } from './errors.js';
import type { PokemonTcgCatalogCard } from './types.js';

interface RawCardSearchResult {
  id?: unknown;
  name?: unknown;
  number?: unknown;
  set?: { id?: unknown; name?: unknown };
  images?: { large?: unknown; small?: unknown };
}

interface RawCardSearchResponse {
  data?: RawCardSearchResult[];
}

// Maps one raw pokemontcg.io search result into the app's normalized
// contract. Prefers the `large` image rendition, falling back to `small`
// when a card has no large image; a result with neither is dropped rather
// than surfaced with a broken image. Results missing `id`/`name` are
// dropped too, rather than breaking the whole search.
function normalizeSearchCard(raw: RawCardSearchResult): PokemonTcgCatalogCard | null {
  if (typeof raw.id !== 'string' || typeof raw.name !== 'string') return null;

  const imageUrl =
    typeof raw.images?.large === 'string'
      ? raw.images.large
      : typeof raw.images?.small === 'string'
        ? raw.images.small
        : null;
  if (!imageUrl) return null;

  return {
    name: raw.name,
    setName: typeof raw.set?.name === 'string' ? raw.set.name : null,
    localNumber: typeof raw.number === 'string' ? raw.number : null,
    providerCardId: raw.id,
    providerSetId: typeof raw.set?.id === 'string' ? raw.set.id : '',
    imageUrl,
  };
}

// A least-recently-used cache entry for card-search results, mirroring
// tcgdex.ts's own `CacheEntry`/`searchCache` pair - shares the same
// `CARD_SEARCH_CACHE_TTL_MS`/`CARD_SEARCH_CACHE_MAX_ENTRIES` defaults since
// both providers' search results have the same freshness/staleness
// tradeoffs, but is kept as its own `Map` so a cached TCGdex query and a
// cached pokemontcg.io query for the same text never collide.
interface SearchCacheEntry {
  results: PokemonTcgCatalogCard[];
  expiresAt: number;
}

const searchCache = new Map<string, SearchCacheEntry>();

function getCachedSearch(key: string): PokemonTcgCatalogCard[] | null {
  const entry = searchCache.get(key);
  if (!entry) return null;

  if (entry.expiresAt <= Date.now()) {
    searchCache.delete(key);
    return null;
  }

  searchCache.delete(key);
  searchCache.set(key, entry);
  return entry.results;
}

function setCachedSearch(key: string, results: PokemonTcgCatalogCard[]): void {
  searchCache.delete(key);
  searchCache.set(key, { results, expiresAt: Date.now() + CARD_SEARCH_CACHE_TTL_MS });

  if (searchCache.size > CARD_SEARCH_CACHE_MAX_ENTRIES) {
    const oldestKey = searchCache.keys().next().value;
    if (oldestKey !== undefined) searchCache.delete(oldestKey);
  }
}

// Searches pokemontcg.io for `trimmedQuery` (story 43), using the same
// in-memory LRU/TTL cache pattern as TCGdex search. Queries pokemontcg.io's
// Lucene-style `q` parameter with a `name:<query>*` wildcard-prefix match -
// this syntax is documented by pokemontcg.io, but (per the story's own
// technical requirements) hasn't been confirmed against a live request in
// this environment, since it has no outbound web access; verify this
// against the real API during manual QA before release.
export async function searchPokemonTcgCardCatalog(
  trimmedQuery: string,
  apiKey: string | undefined,
  signal?: AbortSignal,
): Promise<PokemonTcgCatalogCard[]> {
  const cacheKey = trimmedQuery.toLowerCase();
  const cached = getCachedSearch(cacheKey);
  if (cached) return cached;

  const searchUrl = `${API_BASE_URL}/cards?q=${encodeURIComponent(`name:${trimmedQuery}*`)}`;
  const response = await fetchWithRetry(searchUrl, apiKey, signal);
  if (!response.ok) {
    throw new PokemonTcgProviderError(`pokemontcg.io responded with status ${response.status}.`);
  }

  const body: RawCardSearchResponse = await response.json();
  const rawResults = Array.isArray(body.data) ? body.data : [];

  const results = rawResults
    .map((raw) => normalizeSearchCard(raw))
    .filter((card): card is PokemonTcgCatalogCard => card !== null);

  setCachedSearch(cacheKey, results);
  return results;
}
