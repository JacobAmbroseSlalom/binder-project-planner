import { randomUUID } from 'node:crypto';
import {
  closeSync,
  createReadStream,
  existsSync,
  mkdirSync,
  openSync,
  readSync,
  renameSync,
  unlinkSync,
} from 'node:fs';
import { join } from 'node:path';

import { CARD_SEARCH_MIN_QUERY_LENGTH } from '@binder-project-planner/shared';
import { eq } from 'drizzle-orm';
import { Router } from 'express';

import type { DatabaseConnection } from '../database/client.js';
import { binders, cardImageAssets, cards } from '../database/schema.js';
import { detectImageFormat } from '../images/imageFormat.js';
import { translateEnglishNameToJapanese } from '../integrations/pokeapi.js';
import {
  downloadCardImage,
  searchCardCatalog,
  TcgDexAbortedError,
  TcgDexProviderError,
  type CardSearchLanguage,
} from '../integrations/tcgdex.js';

// The validated, OpenAPI-typed shape of a TCGdex create-card request body
// (story 11). Custom-card creation (story 12) will add a second,
// multipart-parsed variant handled by the same route.
interface CreateCardRequestBody {
  name: string;
  setName: string | null;
  localNumber: string | null;
  providerCardId: string;
  providerSetId: string;
  imageUrl: string;
  variation?: string | null;
  placement: { physicalPage: number | null; row: number | null; column: number | null };
}

interface CardRow {
  id: string;
  binderId: string;
  name: string;
  setName: string | null;
  localNumber: string | null;
  source: string;
  providerCardId: string | null;
  providerSetId: string | null;
  variation: string | null;
  physicalPage: number | null;
  row: number | null;
  column: number | null;
  imageAssetId: string;
  createdAt: string;
  updatedAt: string;
}

function problem(status: number, title: string, detail: string) {
  return { type: 'about:blank', title, status, detail };
}

// Serializes a persisted card row as the OpenAPI `Card` response shape. The
// image URL is always the backend's own streaming endpoint, never the
// provider's - storage details and provider URLs are never exposed.
function serializeCard(row: CardRow) {
  return {
    id: row.id,
    binderId: row.binderId,
    name: row.name,
    setName: row.setName,
    localNumber: row.localNumber,
    source: row.source,
    providerCardId: row.providerCardId,
    providerSetId: row.providerSetId,
    variation: row.variation,
    placement: { physicalPage: row.physicalPage, row: row.row, column: row.column },
    imageUrl: `/cards/${row.id}/image`,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

// better-sqlite3 surfaces unique-constraint violations as a `SqliteError`
// with `.code === 'SQLITE_CONSTRAINT_UNIQUE'`; matches the pattern already
// used by routes/binders.ts.
function isUniqueConstraintError(error: unknown): boolean {
  return (
    error instanceof Error &&
    'code' in error &&
    (error as { code?: unknown }).code === 'SQLITE_CONSTRAINT_UNIQUE'
  );
}

// Reads the first `length` bytes of a file synchronously - just enough for
// magic-byte format detection - without loading the complete (potentially
// large) downloaded image into memory.
function readFileHeader(path: string, length: number): Buffer {
  const fd = openSync(path, 'r');
  try {
    const buffer = Buffer.alloc(length);
    const bytesRead = readSync(fd, buffer, 0, length, 0);
    return buffer.subarray(0, bytesRead);
  } finally {
    closeSync(fd);
  }
}

function validatePlacement(
  placement: CreateCardRequestBody['placement'],
  binder: { width: number; height: number; pages: number },
): string | null {
  const { physicalPage, row, column } = placement;
  const maxPhysicalPage = binder.pages * 2;

  if (physicalPage === null || row === null || column === null) {
    return 'A card assignment must include a complete physical page, row, and column.';
  }
  if (physicalPage < 1 || physicalPage > maxPhysicalPage) {
    return `physicalPage must be between 1 and ${maxPhysicalPage}.`;
  }
  if (row < 1 || row > binder.height) {
    return `row must be between 1 and ${binder.height}.`;
  }
  if (column < 1 || column > binder.width) {
    return `column must be between 1 and ${binder.width}.`;
  }
  return null;
}

interface ResolvedImageAsset {
  assetId: string;
  // Set only when this request downloaded and installed a brand-new file
  // for this asset (i.e. it wasn't already shared by another card), so a
  // subsequent card-insert failure knows it must remove both the row and
  // the file rather than leaving it as a still-referenced shared asset.
  newlyCreatedFilePath: string | null;
}

// Finds or creates the shared local image asset for a TCGdex card
// (planning.md: "TCGdex card instances with the same provider card ID share
// one local image-asset record and file"). Downloads only happen when no
// existing asset is found; a concurrent duplicate download that loses the
// database race is discarded in favor of the winner's asset.
async function resolveTcgDexImageAsset(
  database: DatabaseConnection['database'],
  imagesDirectory: string,
  body: CreateCardRequestBody,
  signal: AbortSignal,
): Promise<ResolvedImageAsset> {
  const existing = database
    .select()
    .from(cardImageAssets)
    .where(eq(cardImageAssets.providerCardId, body.providerCardId))
    .get();
  if (existing) {
    return { assetId: existing.id, newlyCreatedFilePath: null };
  }

  mkdirSync(imagesDirectory, { recursive: true });
  const tempPath = join(imagesDirectory, `${randomUUID()}.tmp`);
  await downloadCardImage(body.imageUrl, tempPath, signal);

  const format = detectImageFormat(readFileHeader(tempPath, 12));
  if (!format) {
    unlinkSync(tempPath);
    throw new TcgDexProviderError('The downloaded TCGdex image was not a supported format.');
  }

  const assetId = randomUUID();
  const storageFilename = `${assetId}.${format.fileExtension}`;
  const finalPath = join(imagesDirectory, storageFilename);
  renameSync(tempPath, finalPath);

  try {
    database
      .insert(cardImageAssets)
      .values({
        id: assetId,
        providerCardId: body.providerCardId,
        providerSetId: body.providerSetId,
        storageFilename,
        contentType: format.contentType,
        fileExtension: format.fileExtension,
        createdAt: new Date().toISOString(),
      })
      .run();
    return { assetId, newlyCreatedFilePath: finalPath };
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      // Lost a concurrent race to assign the same TCGdex card; discard our
      // own duplicate download and reuse the winner's asset.
      unlinkSync(finalPath);
      const winner = database
        .select()
        .from(cardImageAssets)
        .where(eq(cardImageAssets.providerCardId, body.providerCardId))
        .get();
      if (winner) {
        return { assetId: winner.id, newlyCreatedFilePath: null };
      }
    }
    unlinkSync(finalPath);
    throw error;
  }
}

export function createCardsRouter(
  database: DatabaseConnection['database'],
  imagesDirectory: string,
): Router {
  const router = Router();

  // Story 11's TCGdex search, proxied through the backend so the frontend
  // never calls TCGdex directly.
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

    // Defaults to English when omitted; the OpenAPI validator middleware
    // already rejects any value other than `en`/`ja` before this handler
    // runs, per the shared `CardSearchLanguage` enum (story 41).
    const language: CardSearchLanguage = request.query.language === 'ja' ? 'ja' : 'en';
    // Defaults to excluded (`false`) when omitted, per story 41. The OpenAPI
    // validator middleware's ajv instance is configured with `coerceTypes`
    // (confirmed by direct testing), so a `boolean`-schema query parameter
    // arrives here already coerced to an actual JS `boolean` at runtime -
    // not the literal string `'true'`/`'false'` Express's own `ParsedQs`
    // typing implies. Comparing against the runtime `true` (rather than the
    // string `'true'`) is what actually matches; the `unknown` cast exists
    // only because TypeScript's static `ParsedQs` value type doesn't know
    // about that coercion.
    const includeTcgPocket = (request.query.includeTcgPocket as unknown) === true;

    // Propagates a disconnected/aborted client request to the upstream
    // TCGdex request (planning.md).
    const controller = new AbortController();
    request.on('close', () => controller.abort());

    try {
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

      const results = await searchCardCatalog(
        searchQuery,
        language,
        includeTcgPocket,
        controller.signal,
      );
      response.status(200).json({ results, translationWarning });
    } catch (error) {
      if (error instanceof TcgDexAbortedError) return;
      if (error instanceof TcgDexProviderError) {
        response
          .status(error.isTimeout ? 504 : 502)
          .type('application/problem+json')
          .json(problem(error.isTimeout ? 504 : 502, 'Bad Gateway', error.message));
        return;
      }
      throw error;
    }
  });

  // Story 11's slot-assignment endpoint (TCGdex JSON variant only; story 12
  // adds a multipart custom-card variant to the same path/method).
  router.post('/binders/:binderId/cards', async (request, response) => {
    const { binderId } = request.params;
    const body = request.body as CreateCardRequestBody;

    const binder = database.select().from(binders).where(eq(binders.id, binderId)).get();
    if (!binder) {
      response
        .status(404)
        .type('application/problem+json')
        .json(problem(404, 'Not Found', `No binder exists with id "${binderId}".`));
      return;
    }

    const placementError = validatePlacement(body.placement, binder);
    if (placementError) {
      response
        .status(400)
        .type('application/problem+json')
        .json(problem(400, 'Bad Request', placementError));
      return;
    }

    // Blank variation input normalizes to null; a nonblank value is trimmed
    // (planning.md).
    const variation = body.variation?.trim() || null;

    const controller = new AbortController();
    request.on('close', () => controller.abort());

    let asset: ResolvedImageAsset;
    try {
      asset = await resolveTcgDexImageAsset(database, imagesDirectory, body, controller.signal);
    } catch (error) {
      if (error instanceof TcgDexAbortedError) return;
      if (error instanceof TcgDexProviderError) {
        response
          .status(error.isTimeout ? 504 : 502)
          .type('application/problem+json')
          .json(problem(error.isTimeout ? 504 : 502, 'Bad Gateway', error.message));
        return;
      }
      throw error;
    }

    const now = new Date().toISOString();
    const card = {
      id: randomUUID(),
      binderId,
      name: body.name,
      setName: body.setName,
      localNumber: body.localNumber,
      source: 'tcgdex' as const,
      providerCardId: body.providerCardId,
      providerSetId: body.providerSetId,
      variation,
      physicalPage: body.placement.physicalPage,
      row: body.placement.row,
      column: body.placement.column,
      imageAssetId: asset.assetId,
      createdAt: now,
      updatedAt: now,
    };

    try {
      database.insert(cards).values(card).run();
    } catch (error) {
      // The image asset row/file this request just created is otherwise
      // unreferenced once the card insert fails, so it's removed rather
      // than left orphaned (planning.md).
      if (asset.newlyCreatedFilePath) {
        unlinkSync(asset.newlyCreatedFilePath);
        database.delete(cardImageAssets).where(eq(cardImageAssets.id, asset.assetId)).run();
      }

      if (isUniqueConstraintError(error)) {
        response
          .status(409)
          .type('application/problem+json')
          .json(
            problem(
              409,
              'Conflict',
              'Another card already occupies that binder, physical page, row, and column.',
            ),
          );
        return;
      }
      throw error;
    }

    response.status(201).location(`/cards/${card.id}`).json(serializeCard(card));
  });

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

  return router;
}

// Replaces the placeholder `[]`-returning implementation in
// routes/binders.ts: returns every binder-owned card, placed and unplaced.
export function listCardsForBinder(database: DatabaseConnection['database'], binderId: string) {
  return database.select().from(cards).where(eq(cards.binderId, binderId)).all().map(serializeCard);
}
