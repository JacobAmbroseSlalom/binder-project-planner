import { createWriteStream } from 'node:fs';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';

import { fetchWithRetry } from './httpClient.js';
import { PokemonTcgProviderError } from './errors.js';
import type { DownloadedPokemonTcgImage } from './types.js';

// pokemontcg.io serves card artwork from this dedicated images CDN host -
// the only origin card-image downloads are ever accepted from, mirroring
// tcgdex.ts's own `APPROVED_IMAGE_ORIGINS` allowlist.
const APPROVED_IMAGE_ORIGINS = new Set(['images.pokemontcg.io']);

// Downloads a card's image from pokemontcg.io directly to
// `destinationPath`, enforcing the approved-origin allowlist before making
// any request - mirrors tcgdex.ts's own `downloadCardImage`. Streams the
// response body straight to disk rather than buffering the complete image
// in memory.
export async function downloadPokemonTcgCardImage(
  imageUrl: string,
  destinationPath: string,
  signal?: AbortSignal,
): Promise<DownloadedPokemonTcgImage> {
  let origin: URL;
  try {
    origin = new URL(imageUrl);
  } catch {
    throw new PokemonTcgProviderError('pokemontcg.io returned an invalid image URL.');
  }

  if (!APPROVED_IMAGE_ORIGINS.has(origin.hostname)) {
    throw new PokemonTcgProviderError(
      `Image origin "${origin.hostname}" is not an approved pokemontcg.io host.`,
    );
  }

  const response = await fetchWithRetry(imageUrl, undefined, signal);
  if (!response.body) {
    throw new PokemonTcgProviderError('pokemontcg.io returned an empty image response.');
  }

  await pipeline(Readable.fromWeb(response.body as never), createWriteStream(destinationPath));

  return { sourceOrigin: origin.hostname };
}
