import { POKEMONTCG_SET_ID_CACHE_TTL_MS } from '@binder-project-planner/shared';

import { API_BASE_URL, fetchWithRetry } from './httpClient.js';

interface RawSetsResponse {
  data?: { id?: unknown; name?: unknown }[];
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
// all). Kept process-level (not scoped to one price-fetch batch) since the
// same race is possible across overlapping requests too, and an entry
// only lives here while its lookup is still pending - once settled,
// `setIdCache`'s TTL cache takes over for later, non-concurrent lookups.
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
export async function resolveSetId(
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
