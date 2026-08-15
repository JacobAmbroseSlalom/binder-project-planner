import { createReadStream, existsSync } from 'node:fs';
import { join } from 'node:path';

import { eq } from 'drizzle-orm';
import type { Router } from 'express';

import { art, artImageAssets } from '../../database/schema.js';

import { problem } from './serialization.js';
import type { ArtRouteDeps } from './types.js';

// Story 25's image-streaming endpoint. Serves the orientation-normalized
// derivative when one exists; falls back to the source bytes otherwise -
// both are already correctly oriented for rendering purposes.
export function registerArtImageRoute(router: Router, deps: ArtRouteDeps): void {
  const { database, imagesDirectory } = deps;

  router.get('/art/:artId/image', (request, response) => {
    const { artId } = request.params;

    const row = database
      .select({
        storageFilename: artImageAssets.storageFilename,
        normalizedStorageFilename: artImageAssets.normalizedStorageFilename,
        contentType: artImageAssets.contentType,
      })
      .from(art)
      .innerJoin(artImageAssets, eq(art.imageAssetId, artImageAssets.id))
      .where(eq(art.id, artId))
      .get();

    if (!row) {
      response
        .status(404)
        .type('application/problem+json')
        .json(problem(404, 'Not Found', `No art exists with id "${artId}".`));
      return;
    }

    const filename = row.normalizedStorageFilename ?? row.storageFilename;
    const filePath = join(imagesDirectory, filename);
    if (!existsSync(filePath)) {
      response
        .status(404)
        .type('application/problem+json')
        .json(problem(404, 'Not Found', 'The art image file is missing from local storage.'));
      return;
    }

    response
      .status(200)
      .type(row.contentType)
      .set('Cache-Control', 'public, max-age=31536000, immutable');
    createReadStream(filePath).pipe(response);
  });
}
