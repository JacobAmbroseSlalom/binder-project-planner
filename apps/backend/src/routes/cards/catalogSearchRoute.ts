import {
  CARD_SEARCH_MIN_QUERY_LENGTH,
  CARD_SEARCH_PROVIDER_DEFAULT,
} from '@binder-project-planner/shared';
import { type Router } from 'express';

import { translateEnglishNameToJapanese } from '../../integrations/pokeapi.js';
import {
  PokemonTcgAbortedError,
  PokemonTcgProviderError,
  searchPokemonTcgCardCatalog,
} from '../../integrations/pokemontcg/index.js';
import {
  searchCardCatalog,
  TcgDexAbortedError,
  TcgDexProviderError,
  type CardSearchLanguage,
} from '../../integrations/tcgdex.js';

import { problem } from './serialization.js';
import type { CardsRouteDeps } from './types.js';

// Story 11's TCGdex search (story 43 adds the pokemontcg.io alternative
// below), proxied through the backend so the frontend never calls either
// provider directly.
export function registerCardCatalogSearchRoute(router: Router, deps: CardsRouteDeps): void {
  const { pokemonTcgApiKey } = deps;

  router.get('/card-catalog/search', async (request, response) => {
    const rawQuery = request.query.query;
    const query = typeof rawQuery === 'string' ? rawQuery : '';
    const trimmedQuery = query.trim();

    if (trimmedQuery.length < CARD_SEARCH_MIN_QUERY_LENGTH) {
      response
        .status(400)
        .type('application/problem+json')
        .json(
          problem(
            400,
            'Bad Request',
            `query must be at least ${CARD_SEARCH_MIN_QUERY_LENGTH} characters after trimming.`,
          ),
        );
      return;
    }

    // Defaults to `pokemontcg` when omitted; the OpenAPI validator middleware
    // already rejects any value other than `tcgdex`/`pokemontcg` before
    // this handler runs, per the shared `CardSearchProvider` enum (story
    // 43). This is a source switch the user picks, not an automatic
    // fallback between the two.
    const provider: 'tcgdex' | 'pokemontcg' =
      request.query.provider === 'pokemontcg' ? 'pokemontcg' : CARD_SEARCH_PROVIDER_DEFAULT;
    // Defaults to English when omitted; the OpenAPI validator middleware
    // already rejects any value other than `en`/`ja` before this handler
    // runs, per the shared `CardSearchLanguage` enum (story 41). Only
    // meaningful for `provider=tcgdex`; accepted but ignored for
    // `provider=pokemontcg` (story 43), since pokemontcg.io's card data is
    // English-only.
    const language: CardSearchLanguage = request.query.language === 'ja' ? 'ja' : 'en';
    // Defaults to excluded (`false`) when omitted, per story 41. The OpenAPI
    // validator middleware's ajv instance is configured with `coerceTypes`
    // (confirmed by direct testing), so a `boolean`-schema query parameter
    // arrives here already coerced to an actual JS `boolean` at runtime -
    // not the literal string `'true'`/`'false'` Express's own `ParsedQs`
    // typing implies. Comparing against the runtime `true` (rather than the
    // string `'true'`) is what actually matches; the `unknown` cast exists
    // only because TypeScript's static `ParsedQs` value type doesn't know
    // about that coercion. Only meaningful for `provider=tcgdex`; ignored
    // for `provider=pokemontcg` (story 43), since pokemontcg.io has no TCG
    // Pocket-set concept.
    const includeTcgPocket = (request.query.includeTcgPocket as unknown) === true;

    // Propagates a disconnected/aborted client request to the upstream
    // provider request (planning.md).
    const controller = new AbortController();
    request.on('close', () => controller.abort());

    try {
      if (provider === 'pokemontcg') {
        // pokemontcg.io has no language/TCG Pocket concept (story 43), so
        // there's no translation attempt and `translationWarning` is
        // always `false` here.
        const rawResults = await searchPokemonTcgCardCatalog(
          trimmedQuery,
          pokemonTcgApiKey,
          controller.signal,
        );
        const results = rawResults.map((card) => ({ source: 'pokemontcg' as const, ...card }));
        response.status(200).json({ results, translationWarning: false });
        return;
      }

      // A `ja` search first attempts to translate the trimmed query as an
      // English Pokémon species name into its Japanese equivalent
      // (planning.md story 41). A translation miss - unknown species name,
      // free text, or a PokéAPI failure/timeout - doesn't fail the search:
      // TCGdex is still searched using the original entered query, and the
      // response's nonblocking `translationWarning` flag tells the client.
      let searchQuery = trimmedQuery;
      let translationWarning = false;
      if (language === 'ja') {
        const translatedName = await translateEnglishNameToJapanese(
          trimmedQuery,
          controller.signal,
        );
        if (translatedName) {
          searchQuery = translatedName;
        } else {
          translationWarning = true;
        }
      }

      const rawResults = await searchCardCatalog(
        searchQuery,
        language,
        includeTcgPocket,
        controller.signal,
      );
      const results = rawResults.map((card) => ({ source: 'tcgdex' as const, ...card }));
      response.status(200).json({ results, translationWarning });
    } catch (error) {
      if (error instanceof TcgDexAbortedError || error instanceof PokemonTcgAbortedError) return;
      if (error instanceof TcgDexProviderError || error instanceof PokemonTcgProviderError) {
        response
          .status(error.isTimeout ? 504 : 502)
          .type('application/problem+json')
          .json(problem(error.isTimeout ? 504 : 502, 'Bad Gateway', error.message));
        return;
      }
      throw error;
    }
  });
}
