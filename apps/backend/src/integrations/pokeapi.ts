import { POKEAPI_REQUEST_TIMEOUT_MS } from '@binder-project-planner/shared';

// PokéAPI's species resource, used only to translate a candidate English
// Pokémon species name into its Japanese name before a `language=ja` card
// search (planning.md story 41). PokéAPI species names are lowercase,
// hyphen-separated slugs (e.g. `mr-mime`, `nidoran-f`); `translateNameSlug`
// below performs that lightweight normalization but otherwise requires an
// exact match - this is not general fuzzy/partial name matching.
const SPECIES_ENDPOINT = 'https://pokeapi.co/api/v2/pokemon-species';

// PokéAPI's `ja` locale (there's also `ja-Hrkt`, the same katakana text
// under a different language code) matches TCGdex's own Japanese card
// names, confirmed live: PokéAPI's `ja` name for Umbreon (`ブラッキー`)
// returns TCGdex `ja` search results for the same Pokémon.
const JAPANESE_LANGUAGE_CODE = 'ja';

interface PokeApiSpeciesName {
  language?: { name?: unknown } | null;
  name?: unknown;
}

interface PokeApiSpeciesResponse {
  names?: PokeApiSpeciesName[] | null;
}

// Successful lookups only - a cache miss (unknown species, or a lookup that
// hasn't been attempted yet) always triggers a fresh PokéAPI request rather
// than being remembered as a negative/permanent miss (planning.md: "a cache
// miss triggers a new PokéAPI request rather than being retained as a
// negative cache entry"), since species data added by later PokéAPI updates
// should become available without a backend restart.
const translationCache = new Map<string, string>();

// PokéAPI's species slugs are lowercase and hyphen-separated (confirmed
// live: a literal space in the path returns `400`, while a hyphen works) -
// this only normalizes whitespace into hyphens and lowercases the input; it
// does not attempt broader fuzzy matching.
function toSpeciesSlug(candidateName: string): string {
  return candidateName.trim().toLowerCase().replace(/\s+/g, '-');
}

// Bounds one PokéAPI request by `POKEAPI_REQUEST_TIMEOUT_MS` and the
// caller's own abort signal. Unlike the TCGdex integration, PokéAPI lookups
// are never retried (planning.md: a timeout or other failure is simply
// treated as a translation miss, not a search failure worth retrying).
async function fetchSpecies(slug: string, callerSignal?: AbortSignal): Promise<Response | null> {
  const timeoutController = new AbortController();
  const timeout = setTimeout(() => timeoutController.abort(), POKEAPI_REQUEST_TIMEOUT_MS);

  function abortListener() {
    timeoutController.abort();
  }
  callerSignal?.addEventListener('abort', abortListener);

  try {
    return await fetch(`${SPECIES_ENDPOINT}/${encodeURIComponent(slug)}`, {
      signal: timeoutController.signal,
    });
  } catch {
    // Covers both a timeout and any other network failure; both are
    // treated identically as "no translation available" by the caller.
    return null;
  } finally {
    clearTimeout(timeout);
    callerSignal?.removeEventListener('abort', abortListener);
  }
}

// Attempts to translate `candidateName` (the user's trimmed search query)
// from an English Pokémon species name into its Japanese name, for use as
// the actual TCGdex `ja` search query (planning.md story 41). Returns
// `null` when `candidateName` doesn't match a known species, or when the
// PokéAPI lookup itself fails or times out - either way, the caller falls
// back to searching TCGdex with the original entered query.
export async function translateEnglishNameToJapanese(
  candidateName: string,
  signal?: AbortSignal,
): Promise<string | null> {
  const slug = toSpeciesSlug(candidateName);
  if (slug.length === 0) return null;

  const cached = translationCache.get(slug);
  if (cached !== undefined) return cached;

  const response = await fetchSpecies(slug, signal);
  if (!response || !response.ok) return null;

  const body = (await response.json()) as PokeApiSpeciesResponse;
  const japaneseName = body.names?.find(
    (entry) => entry.language?.name === JAPANESE_LANGUAGE_CODE,
  )?.name;
  if (typeof japaneseName !== 'string') return null;

  translationCache.set(slug, japaneseName);
  return japaneseName;
}
