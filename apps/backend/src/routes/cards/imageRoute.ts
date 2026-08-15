import { createReadStream, existsSync } from 'node:fs';
import { join } from 'node:path';

import { eq } from 'drizzle-orm';
import { type Router } from 'express';

import { cardImageAssets, cards } from '../../database/schema.js';

import { problem } from './serialization.js';
import type { CardsRouteDeps } from './types.js';

// Streams a card's stored image file, keyed by its own id - the frontend's
// sole image URL scheme for cards (`serializeCard`'s `imageUrl` field),
// never the provider's own image URL.
export function registerCardImageRoute(router: Router, deps: CardsRouteDeps): void {
  const { database, imagesDirectory } = deps;

  router.get('/cards/:cardId/image', (request, response) => {
    const { cardId } = request.params;
    const row = database
      .select({
        contentType: cardImageAssets.contentType,
        storageFilename: cardImageAssets.storageFilename,
      })
      .from(cards)
      .innerJoin(cardImageAssets, eq(cards.imageAssetId, cardImageAssets.id))
      .where(eq(cards.id, cardId))
      .get();

    if (!row) {
      response
        .status(404)
        .type('application/problem+json')
        .json(problem(404, 'Not Found', `No card exists with id "${cardId}".`));
      return;
    }

    const filePath = join(imagesDirectory, row.storageFilename);
    if (!existsSync(filePath)) {
      response
        .status(404)
        .type('application/problem+json')
        .json(problem(404, 'Not Found', 'The card image file is missing from local storage.'));
      return;
    }

    response
      .status(200)
      .type(row.contentType)
      .set('Cache-Control', 'public, max-age=31536000, immutable');
    createReadStream(filePath).pipe(response);
  });
}
