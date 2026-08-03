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

import {
  BULK_CARD_CREATE_CONCURRENCY,
  CARD_SEARCH_MIN_QUERY_LENGTH,
  CARD_VARIATION_MAX_LENGTH,
  CUSTOM_CARD_NAME_MAX_LENGTH,
  CUSTOM_CARD_NUMBER_MAX_LENGTH,
  CUSTOM_CARD_SET_MAX_LENGTH,
} from '@binder-project-planner/shared';
import { and, asc, desc, eq, inArray } from 'drizzle-orm';
import { Router, type Response } from 'express';

import type { DatabaseConnection } from '../database/client.js';
import { binders, cardImageAssets, cards } from '../database/schema.js';
import { detectImageFormat } from '../images/imageFormat.js';
import {
  findIdempotentOutcome,
  saveIdempotentOutcome,
} from '../idempotency/mutationIdempotency.js';
import { translateEnglishNameToJapanese } from '../integrations/pokeapi.js';
import { getOccupiedCells } from '../placement/occupancy.js';
import {
  downloadCardImage,
  searchCardCatalog,
  TcgDexAbortedError,
  TcgDexProviderError,
  type CardSearchLanguage,
} from '../integrations/tcgdex.js';

// One normalized TCGdex catalog result within a bulk create-cards request
// (stories 17/18, `POST /binders/{binderId}/cards/bulk`) - the sole
// TCGdex-card creation path; there is no single-card JSON variant of
// `POST /binders/{binderId}/cards` anymore.
interface BulkCardItem {
  name: string;
  setName: string | null;
  localNumber: string | null;
  providerCardId: string;
  providerSetId: string;
  imageUrl: string;
}

// The validated, OpenAPI-typed shape of `POST /binders/{binderId}/cards/
// bulk`'s request body (stories 17/18): the checked selection, one shared
// optional variation applied to every created card, and one optional
// target placement applied only to the first array element.
interface BulkCreateCardsRequestBody {
  cards: BulkCardItem[];
  variation?: string | null;
  targetPlacement?: { physicalPage: number; row: number; column: number };
}

// The validated, OpenAPI-typed shape of a custom create-card request body
// (story 12, `multipart/form-data`). Placement fields are optional and
// arrive pre-coerced to numbers by the request-validation middleware (see
// app.ts's `coerceTypes` comment); the uploaded image file itself is read
// from `request.files` rather than this body.
interface CreateCustomCardRequestBody {
  name: string;
  setName?: string;
  localNumber?: string;
  variation?: string;
  physicalPage?: number;
  row?: number;
  column?: number;
}

// A nullable placement triple, as accepted by both `PlacementCoordinates`
// (an all-populated placed position or an all-null unplaced position -
// story 14/15).
interface NullablePlacement {
  physicalPage: number | null;
  row: number | null;
  column: number | null;
}

// One entry of the OpenAPI-typed `MoveCardsRequest` body (story 14): the
// affected card's currently expected placement and its final placement.
interface CardPositionUpdateBody {
  cardId: string;
  expectedPlacement: NullablePlacement;
  finalPlacement: NullablePlacement;
}

// The validated, OpenAPI-typed shape of `PATCH /cards/{cardId}`'s request
// body (story 14): one update for a simple move, two for a swap.
interface MoveCardsRequestBody {
  updates: CardPositionUpdateBody[];
}

// The validated, OpenAPI-typed shape of `PATCH /cards/{cardId}`'s
// variation-update request body (story 16): replaces the path card's
// variation instead of moving/swapping placement. The route handler below
// branches on which of these two shapes (this one, or
// `MoveCardsRequestBody` above) the request body actually is.
interface UpdateCardVariationRequestBody {
  variation: string | null;
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
  placement: { physicalPage: number | null; row: number | null; column: number | null },
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

// Story 26: rejects a card placement that would land on a slot covered by
// placed multi-slot art (planning.md: "Cards and other multi-slot art
// cannot be placed in any slot occupied by multi-slot art"). A fully-null
// placement (the unplaced section) never conflicts, since it isn't a real
// slot.
function findArtOccupancyConflict(
  database: DatabaseConnection['database'],
  binderId: string,
  placement: NullablePlacement,
): string | null {
  if (placement.physicalPage === null || placement.row === null || placement.column === null) {
    return null;
  }
  const occupied = getOccupiedCells(database, binderId, placement.physicalPage);
  const blocked = occupied.some(
    (cell) =>
      cell.row === placement.row && cell.column === placement.column && cell.occupiedBy === 'art',
  );
  return blocked ? 'The destination slot is occupied by multi-slot art.' : null;
}

// A relaxed variant of `validatePlacement` for custom-card requests (story
// 12): unlike TCGdex assignment (always fully placed from a real slot
// click), a custom card may be created unplaced by omitting all three
// placement fields from the multipart body (story 15's future
// unplaced-cards section). Supplying only some of the three is rejected as
// malformed input rather than silently treated as either state.
function resolveCustomCardPlacement(
  body: CreateCustomCardRequestBody,
  binder: { width: number; height: number; pages: number },
):
  | { placement: { physicalPage: number | null; row: number | null; column: number | null } }
  | { error: string } {
  const { physicalPage, row, column } = body;
  const suppliedCount = [physicalPage, row, column].filter((value) => value !== undefined).length;

  if (suppliedCount === 0) {
    return { placement: { physicalPage: null, row: null, column: null } };
  }
  if (suppliedCount < 3) {
    return {
      error:
        'A card placement must include a complete physical page, row, and column, or none of them.',
    };
  }

  const placementError = validatePlacement(
    { physicalPage: physicalPage!, row: row!, column: column! },
    binder,
  );
  if (placementError) {
    return { error: placementError };
  }
  return { placement: { physicalPage: physicalPage!, row: row!, column: column! } };
}

// Validates a `PATCH /cards/{cardId}` update's `finalPlacement` (story 14).
// A fully-null triple (story 15's future unplaced section) is always valid;
// a fully-populated triple must fall within the binder's current bounds;
// anything mixed (some but not all 3 fields null) is malformed input. This
// mirrors `resolveCustomCardPlacement`'s all-or-none rule, but operates on
// an already-typed nullable triple rather than raw optional request-body
// fields.
function validateMovePlacement(
  placement: NullablePlacement,
  binder: { width: number; height: number; pages: number },
): string | null {
  const { physicalPage, row, column } = placement;
  const suppliedCount = [physicalPage, row, column].filter((value) => value !== null).length;

  if (suppliedCount === 0) return null;
  if (suppliedCount < 3) {
    return 'A card placement must include a complete physical page, row, and column, or none of them.';
  }
  return validatePlacement({ physicalPage, row, column }, binder);
}

// Produces a filesystem/metadata-safe copy of an uploaded file's
// client-claimed original name (story 12): strips any directory components
// a malicious or unusual multipart request might include, then keeps only
// a conservative safe character set. This is retained purely as metadata -
// every actual filesystem operation uses the backend-generated
// `storageFilename` instead, never this value.
function sanitizeOriginalFilename(originalFilename: string): string {
  const basename = originalFilename.split(/[/\\]/).pop() ?? '';
  const sanitized = basename.replace(/[^a-zA-Z0-9 ._-]/g, '').trim();
  return sanitized.slice(0, 255) || 'upload';
}

// Thrown by `resolveCustomImageAsset` when the uploaded file's magic bytes
// don't match a supported image format; the route handler maps this to a
// `415 Unsupported Media Type` Problem Details response (story 12).
class UnsupportedImageFormatError extends Error {
  constructor() {
    super('The uploaded file is not a supported image format (JPEG, PNG, or WebP).');
    this.name = 'UnsupportedImageFormatError';
  }
}

// Thrown from inside the move/swap transaction (story 14) when an update's
// expected placement no longer matches the card's persisted placement; the
// route handler maps this to a `409 Conflict` Problem Details response and
// the transaction rolls back automatically.
class MoveConflictError extends Error {}

// Deletes any files multer already streamed to temporary storage for this
// request (story 12) - used on every custom-card validation failure that
// occurs before `resolveCustomImageAsset` takes ownership of the file, so a
// rejected request never leaves an orphaned temporary file behind.
function removeTemporaryUploads(files: Express.Multer.File[]): void {
  for (const file of files) {
    if (existsSync(file.path)) {
      unlinkSync(file.path);
    }
  }
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
// database race is discarded in favor of the winner's asset. Only the
// identity/image fields a TCGdex card's shared asset actually keys on are
// needed here (used by the bulk create-cards endpoint, stories 17/18).
async function resolveTcgDexImageAsset(
  database: DatabaseConnection['database'],
  imagesDirectory: string,
  body: { providerCardId: string; providerSetId: string; imageUrl: string },
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

// Finds or creates the shared local image asset for a custom-card upload
// (story 12), mirroring `resolveTcgDexImageAsset`'s dedupe/concurrent-race
// pattern but keyed by the SHA-256 digest `createDigestDiskStorage` already
// computed while streaming the upload to temporary storage, rather than a
// TCGdex provider card ID. `uploadedFile.path` is always consumed by this
// function - either deleted (a duplicate) or renamed into place - so the
// caller never needs to remove it itself once this function is called.
function resolveCustomImageAsset(
  database: DatabaseConnection['database'],
  imagesDirectory: string,
  uploadedFile: Express.Multer.File,
): ResolvedImageAsset {
  const digest = uploadedFile.sha256Digest;
  if (!digest) {
    // Never expected: `createDigestDiskStorage` always attaches a digest.
    // Guarded rather than asserted so a storage-engine regression surfaces
    // as a clear 500 instead of a confusing downstream failure.
    unlinkSync(uploadedFile.path);
    throw new Error('The uploaded file was not processed by the digest storage engine.');
  }

  const existing = database
    .select()
    .from(cardImageAssets)
    .where(eq(cardImageAssets.sha256Digest, digest))
    .get();
  if (existing) {
    // Another card (this request or an earlier one) already has identical
    // image bytes on file; this request's own copy is redundant.
    unlinkSync(uploadedFile.path);
    return { assetId: existing.id, newlyCreatedFilePath: null };
  }

  const format = detectImageFormat(readFileHeader(uploadedFile.path, 12));
  if (!format) {
    unlinkSync(uploadedFile.path);
    throw new UnsupportedImageFormatError();
  }

  const assetId = randomUUID();
  const storageFilename = `${assetId}.${format.fileExtension}`;
  const finalPath = join(imagesDirectory, storageFilename);
  renameSync(uploadedFile.path, finalPath);

  try {
    database
      .insert(cardImageAssets)
      .values({
        id: assetId,
        sha256Digest: digest,
        originalFilename: sanitizeOriginalFilename(uploadedFile.originalname),
        storageFilename,
        contentType: format.contentType,
        fileExtension: format.fileExtension,
        createdAt: new Date().toISOString(),
      })
      .run();
    return { assetId, newlyCreatedFilePath: finalPath };
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      // Lost a concurrent race to upload the same image bytes; discard our
      // own duplicate file and reuse the winner's asset.
      unlinkSync(finalPath);
      const winner = database
        .select()
        .from(cardImageAssets)
        .where(eq(cardImageAssets.sha256Digest, digest))
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

  // Inserts a new card row and responds, sharing the "unique-placement
  // conflict" (409) handling and unreferenced-asset cleanup between the
  // TCGdex (story 11) and custom-card (story 12) branches below - both
  // return the same `201`/Location/serialized-card shape on success.
  function insertCardAndRespond(
    response: Response,
    card: {
      id: string;
      binderId: string;
      name: string;
      setName: string | null;
      localNumber: string | null;
      source: 'tcgdex' | 'custom';
      providerCardId: string | null;
      providerSetId: string | null;
      variation: string | null;
      physicalPage: number | null;
      row: number | null;
      column: number | null;
      imageAssetId: string;
      createdAt: string;
      updatedAt: string;
    },
    asset: ResolvedImageAsset,
  ): void {
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
  }

  // Story 12's manual-entry endpoint (`multipart/form-data`, custom cards).
  // TCGdex-card creation, including a single selected card, instead uses
  // `POST /binders/{binderId}/cards/bulk` below (stories 11, 17, and 18) -
  // this endpoint's single-card JSON TCGdex variant was removed when that
  // bulk endpoint became the sole TCGdex-card creation path.
  router.post('/binders/:binderId/cards', async (request, response) => {
    const { binderId } = request.params;
    const uploadedFiles = Array.isArray(request.files) ? request.files : undefined;

    const binder = database.select().from(binders).where(eq(binders.id, binderId)).get();
    if (!binder) {
      if (uploadedFiles) removeTemporaryUploads(uploadedFiles);
      response
        .status(404)
        .type('application/problem+json')
        .json(problem(404, 'Not Found', `No binder exists with id "${binderId}".`));
      return;
    }

    if (!uploadedFiles) {
      // Never expected: the OpenAPI schema only documents a
      // `multipart/form-data` request body for this endpoint now, so
      // express-openapi-validator already rejects any other content type
      // before this handler runs. Guarded defensively regardless.
      response
        .status(400)
        .type('application/problem+json')
        .json(problem(400, 'Bad Request', 'This endpoint requires a multipart/form-data body.'));
      return;
    }

    const body = request.body as CreateCustomCardRequestBody;
    const uploadedFile = uploadedFiles.find((file) => file.fieldname === 'image');
    if (!uploadedFile) {
      // Never expected: the OpenAPI schema requires `image`, so
      // express-openapi-validator already rejects a request missing it
      // before this handler runs. Guarded defensively regardless.
      removeTemporaryUploads(uploadedFiles);
      response
        .status(400)
        .type('application/problem+json')
        .json(problem(400, 'Bad Request', 'A custom card requires an image file.'));
      return;
    }

    const placementResult = resolveCustomCardPlacement(body, binder);
    if ('error' in placementResult) {
      removeTemporaryUploads(uploadedFiles);
      response
        .status(400)
        .type('application/problem+json')
        .json(problem(400, 'Bad Request', placementResult.error));
      return;
    }

    const artConflict = findArtOccupancyConflict(database, binderId, placementResult.placement);
    if (artConflict) {
      removeTemporaryUploads(uploadedFiles);
      response
        .status(409)
        .type('application/problem+json')
        .json(problem(409, 'Conflict', artConflict));
      return;
    }

    // Required after trimming (planning.md); the OpenAPI schema's
    // `minLength: 1` only guards the raw untrimmed value, so a
    // whitespace-only name still needs this check. The max-length check
    // below is a backend-validation belt-and-suspenders alongside the
    // OpenAPI schema's own `maxLength` (planning.md story 12).
    const name = body.name.trim();
    if (!name) {
      removeTemporaryUploads(uploadedFiles);
      response
        .status(400)
        .type('application/problem+json')
        .json(problem(400, 'Bad Request', 'name is required.'));
      return;
    }
    if (name.length > CUSTOM_CARD_NAME_MAX_LENGTH) {
      removeTemporaryUploads(uploadedFiles);
      response
        .status(400)
        .type('application/problem+json')
        .json(
          problem(
            400,
            'Bad Request',
            `name must be ${CUSTOM_CARD_NAME_MAX_LENGTH} characters or fewer.`,
          ),
        );
      return;
    }

    // Optional fields: trimmed, blank stores as null (planning.md).
    const setName = body.setName?.trim() || null;
    const localNumber = body.localNumber?.trim() || null;
    const variation = body.variation?.trim() || null;

    if (setName && setName.length > CUSTOM_CARD_SET_MAX_LENGTH) {
      removeTemporaryUploads(uploadedFiles);
      response
        .status(400)
        .type('application/problem+json')
        .json(
          problem(
            400,
            'Bad Request',
            `setName must be ${CUSTOM_CARD_SET_MAX_LENGTH} characters or fewer.`,
          ),
        );
      return;
    }
    if (localNumber && localNumber.length > CUSTOM_CARD_NUMBER_MAX_LENGTH) {
      removeTemporaryUploads(uploadedFiles);
      response
        .status(400)
        .type('application/problem+json')
        .json(
          problem(
            400,
            'Bad Request',
            `localNumber must be ${CUSTOM_CARD_NUMBER_MAX_LENGTH} characters or fewer.`,
          ),
        );
      return;
    }
    if (variation && variation.length > CARD_VARIATION_MAX_LENGTH) {
      removeTemporaryUploads(uploadedFiles);
      response
        .status(400)
        .type('application/problem+json')
        .json(
          problem(
            400,
            'Bad Request',
            `variation must be ${CARD_VARIATION_MAX_LENGTH} characters or fewer.`,
          ),
        );
      return;
    }

    let asset: ResolvedImageAsset;
    try {
      asset = resolveCustomImageAsset(database, imagesDirectory, uploadedFile);
    } catch (error) {
      if (error instanceof UnsupportedImageFormatError) {
        response
          .status(415)
          .type('application/problem+json')
          .json(problem(415, 'Unsupported Media Type', error.message));
        return;
      }
      throw error;
    }

    const now = new Date().toISOString();
    insertCardAndRespond(
      response,
      {
        id: randomUUID(),
        binderId,
        name,
        setName,
        localNumber,
        source: 'custom',
        providerCardId: null,
        providerSetId: null,
        variation,
        physicalPage: placementResult.placement.physicalPage,
        row: placementResult.placement.row,
        column: placementResult.placement.column,
        imageAssetId: asset.assetId,
        createdAt: now,
        updatedAt: now,
      },
      asset,
    );
  });

  // Per-binder in-flight bulk-request guard (stories 17/18): the frontend
  // keeps its own Add Card/Add More buttons disabled while a batch is in
  // flight, but this in-memory set also rejects a genuinely overlapping
  // request (e.g. a second browser tab targeting the same binder) with
  // `409 Conflict` instead of racing two batches against the same binder.
  // Scoped to this router's module-level closure - fine for a local
  // single-process application with no horizontal scaling.
  const activeBulkRequestBinderIds = new Set<string>();

  // Runs `task` for every item in `items` with at most `limit` tasks in
  // flight at once, resolving with results in the same order as `items`
  // regardless of completion order (planning.md: "Bulk outcome entries
  // preserve submitted array order regardless of processing completion
  // order"). A small worker-pool loop over a shared index cursor rather
  // than an external concurrency-limiting dependency.
  async function mapWithConcurrencyLimit<T, R>(
    items: T[],
    limit: number,
    task: (item: T, index: number) => Promise<R>,
  ): Promise<R[]> {
    const results: R[] = new Array(items.length);
    let nextIndex = 0;

    async function worker(): Promise<void> {
      for (;;) {
        const index = nextIndex++;
        if (index >= items.length) return;
        results[index] = await task(items[index]!, index);
      }
    }

    await Promise.all(Array.from({ length: Math.min(limit, items.length) }, () => worker()));
    return results;
  }

  // One submitted card's independent creation outcome (stories 17/18),
  // matching the OpenAPI `BulkCardOutcome` schema.
  type BulkCardOutcome =
    | { status: 'created'; card: ReturnType<typeof serializeCard> }
    | { status: 'failed'; problem: ReturnType<typeof problem> };

  // Stories 17/18's bulk TCGdex-card creation endpoint - the sole
  // TCGdex-card creation path now that the single-card JSON variant of
  // `POST /binders/{binderId}/cards` above is removed. Each submitted card
  // is persisted independently (never one all-or-nothing transaction) so a
  // large selection's partial success is possible; `targetPlacement`, when
  // supplied, is attempted only for the first array element (used only
  // when the card-selection modal was opened from an empty binder slot) -
  // every other element, and the first element when no `targetPlacement`
  // was supplied, always uses all-null placement (the unplaced-cards
  // section). Idempotency-key-aware like `POST /art/{artId}/duplicate`
  // (story 26's pattern): a repeated key within the retention window
  // replays the stored outcome instead of creating additional cards.
  router.post('/binders/:binderId/cards/bulk', async (request, response) => {
    const { binderId } = request.params;

    const idempotencyKey = request.header('Idempotency-Key');
    if (!idempotencyKey) {
      response
        .status(400)
        .type('application/problem+json')
        .json(problem(400, 'Bad Request', 'An Idempotency-Key header is required.'));
      return;
    }

    const replayed = findIdempotentOutcome(database, 'bulk-create-cards', idempotencyKey);
    if (replayed) {
      response.status(replayed.responseStatus).json(replayed.responseBody);
      return;
    }

    const binder = database.select().from(binders).where(eq(binders.id, binderId)).get();
    if (!binder) {
      response
        .status(404)
        .type('application/problem+json')
        .json(problem(404, 'Not Found', `No binder exists with id "${binderId}".`));
      return;
    }

    const body = request.body as BulkCreateCardsRequestBody;

    if (body.targetPlacement) {
      const placementError = validatePlacement(body.targetPlacement, binder);
      if (placementError) {
        response
          .status(400)
          .type('application/problem+json')
          .json(problem(400, 'Bad Request', placementError));
        return;
      }
    }

    // Blank shared variation input normalizes to null; a nonblank value is
    // trimmed (planning.md), matching every other card-creation endpoint's
    // own variation handling.
    const variation = body.variation?.trim() || null;
    if (variation && variation.length > CARD_VARIATION_MAX_LENGTH) {
      response
        .status(400)
        .type('application/problem+json')
        .json(
          problem(
            400,
            'Bad Request',
            `variation must be ${CARD_VARIATION_MAX_LENGTH} characters or fewer.`,
          ),
        );
      return;
    }

    if (activeBulkRequestBinderIds.has(binderId)) {
      response
        .status(409)
        .type('application/problem+json')
        .json(
          problem(
            409,
            'Conflict',
            'Another bulk card-creation request is already running for this binder.',
          ),
        );
      return;
    }
    activeBulkRequestBinderIds.add(binderId);

    // Deliberately not tied to `request.on('close', ...)`: planning.md
    // requires that "after the backend accepts a bulk request, client
    // disconnection does not cancel in-flight or remaining card
    // processing" - unlike the single-card endpoints above, this batch
    // keeps running to completion (and its outcome stays idempotency-key
    // replayable) even if the client goes away. Each TCGdex request is
    // still bounded by its own TCGDEX_REQUEST_TIMEOUT_MS internally.
    const neverAbortedSignal = new AbortController().signal;

    try {
      const outcomes = await mapWithConcurrencyLimit(
        body.cards,
        BULK_CARD_CREATE_CONCURRENCY,
        async (item, index): Promise<BulkCardOutcome> => {
          // Only the first array element is attempted at the supplied
          // target placement; every other element - and the first when no
          // target placement was supplied - lands in the unplaced-cards
          // section (planning.md).
          const placement: NullablePlacement =
            index === 0 && body.targetPlacement
              ? body.targetPlacement
              : { physicalPage: null, row: null, column: null };

          if (placement.physicalPage !== null) {
            const artConflict = findArtOccupancyConflict(database, binderId, placement);
            if (artConflict) {
              return { status: 'failed', problem: problem(409, 'Conflict', artConflict) };
            }
          }

          let asset: ResolvedImageAsset;
          try {
            asset = await resolveTcgDexImageAsset(
              database,
              imagesDirectory,
              item,
              neverAbortedSignal,
            );
          } catch (error) {
            if (error instanceof TcgDexProviderError) {
              const status = error.isTimeout ? 504 : 502;
              return { status: 'failed', problem: problem(status, 'Bad Gateway', error.message) };
            }
            throw error;
          }

          const now = new Date().toISOString();
          const card = {
            id: randomUUID(),
            binderId,
            name: item.name,
            setName: item.setName,
            localNumber: item.localNumber,
            source: 'tcgdex' as const,
            providerCardId: item.providerCardId,
            providerSetId: item.providerSetId,
            variation,
            physicalPage: placement.physicalPage,
            row: placement.row,
            column: placement.column,
            imageAssetId: asset.assetId,
            createdAt: now,
            updatedAt: now,
          };

          try {
            database.insert(cards).values(card).run();
          } catch (error) {
            // The image asset row/file this card just created is otherwise
            // unreferenced once its insert fails, so it's removed rather
            // than left orphaned (planning.md), mirroring
            // `insertCardAndRespond`'s own cleanup.
            if (asset.newlyCreatedFilePath) {
              unlinkSync(asset.newlyCreatedFilePath);
              database.delete(cardImageAssets).where(eq(cardImageAssets.id, asset.assetId)).run();
            }
            if (isUniqueConstraintError(error)) {
              return {
                status: 'failed',
                problem: problem(
                  409,
                  'Conflict',
                  'Another card already occupies that binder, physical page, row, and column.',
                ),
              };
            }
            throw error;
          }

          return { status: 'created', card: serializeCard(card) };
        },
      );

      const responseStatus = outcomes.some((outcome) => outcome.status === 'failed') ? 207 : 201;

      saveIdempotentOutcome(database, 'bulk-create-cards', idempotencyKey, {
        responseStatus,
        responseBody: outcomes,
        locationHeader: null,
      });

      response.status(responseStatus).json(outcomes);
    } finally {
      activeBulkRequestBinderIds.delete(binderId);
    }
  });

  // Story 14's card move/swap endpoint (and story 16's variation-update
  // endpoint, which shares this same path/method): applies one update (a
  // simple move) or two updates (a swap) in a single transaction. Each
  // update's `expectedPlacement` is compared against the card's currently
  // persisted placement before anything changes, so a stale client can
  // never silently clobber a position another request already moved; any
  // mismatch throws `MoveConflictError`, rolling back the transaction and
  // mapping to `409 Conflict`. Every card is first nulled out and only then
  // set to its `finalPlacement` (rather than applying each update in one
  // pass) so a 2-card swap never trips the `cards_binder_placement_unique`
  // index by momentarily placing one card at a slot the other update's
  // card hasn't vacated yet - SQLite's unique index is checked per
  // statement, not deferred to commit. If a destination is still occupied
  // by a card that wasn't included in `updates` (a stale/incomplete
  // client request), that final `UPDATE` still trips the same unique
  // constraint, which is likewise caught and mapped to `409 Conflict`.
  router.patch('/cards/:cardId', (request, response) => {
    const { cardId } = request.params;

    // Story 16: a variation-update request body has `variation` (and no
    // `updates`) instead of a move/swap's `updates` array - the OpenAPI
    // `oneOf` request schema guarantees the body is exactly one of the two
    // shapes, so checking for `updates`' absence is enough to distinguish
    // them. Handled as an independent, simpler branch (no expected-position
    // comparison, no transaction, last-write-wins) rather than folding it
    // into the move/swap transaction below, since the two operations don't
    // share any of that logic.
    if (!('updates' in request.body)) {
      const body = request.body as UpdateCardVariationRequestBody;
      const existing = database.select().from(cards).where(eq(cards.id, cardId)).get();
      if (!existing) {
        response
          .status(404)
          .type('application/problem+json')
          .json(problem(404, 'Not Found', `No card exists with id "${cardId}".`));
        return;
      }

      // Blank input normalizes to null; a nonblank value is trimmed
      // (planning.md), mirroring card creation's own variation handling.
      const variation = body.variation?.trim() || null;
      if (variation && variation.length > CARD_VARIATION_MAX_LENGTH) {
        response
          .status(400)
          .type('application/problem+json')
          .json(
            problem(
              400,
              'Bad Request',
              `variation must be ${CARD_VARIATION_MAX_LENGTH} characters or fewer.`,
            ),
          );
        return;
      }

      const updatedAt = new Date().toISOString();
      database.update(cards).set({ variation, updatedAt }).where(eq(cards.id, cardId)).run();

      response.status(200).json(serializeCard({ ...existing, variation, updatedAt }));
      return;
    }

    const body = request.body as MoveCardsRequestBody;

    if (!body.updates.some((update) => update.cardId === cardId)) {
      response
        .status(400)
        .type('application/problem+json')
        .json(
          problem(
            400,
            'Bad Request',
            'The path cardId must identify one of the updates in the request body.',
          ),
        );
      return;
    }

    // Loaded up front (outside the transaction) so a missing card or a
    // cross-binder request can return a plain 404/400 without needing to
    // unwind a started transaction.
    const cardRows = new Map<string, CardRow>();
    for (const update of body.updates) {
      const row = database.select().from(cards).where(eq(cards.id, update.cardId)).get();
      if (!row) {
        response
          .status(404)
          .type('application/problem+json')
          .json(problem(404, 'Not Found', `No card exists with id "${update.cardId}".`));
        return;
      }
      cardRows.set(update.cardId, row);
    }

    const binderIds = new Set(Array.from(cardRows.values(), (row) => row.binderId));
    if (binderIds.size > 1) {
      response
        .status(400)
        .type('application/problem+json')
        .json(
          problem(
            400,
            'Bad Request',
            'All cards in one movement request must belong to the same binder.',
          ),
        );
      return;
    }

    const binder = database
      .select()
      .from(binders)
      .where(eq(binders.id, [...binderIds][0]!))
      .get();
    // Unreachable in practice - every card's `binderId` has a `NOT NULL
    // ... REFERENCES binders(id)` foreign key - but guarded defensively
    // rather than asserting `binder!` below.
    if (!binder) {
      response
        .status(404)
        .type('application/problem+json')
        .json(problem(404, 'Not Found', 'No binder exists for the given card(s).'));
      return;
    }

    for (const update of body.updates) {
      const placementError = validateMovePlacement(update.finalPlacement, binder);
      if (placementError) {
        response
          .status(400)
          .type('application/problem+json')
          .json(problem(400, 'Bad Request', placementError));
        return;
      }

      // Story 26: a card can never move onto a slot placed multi-slot art
      // covers, even if the destination isn't held by another card.
      const artConflict = findArtOccupancyConflict(database, binder.id, update.finalPlacement);
      if (artConflict) {
        response
          .status(409)
          .type('application/problem+json')
          .json(problem(409, 'Conflict', artConflict));
        return;
      }
    }

    try {
      const updatedRows = database.transaction((tx) => {
        for (const update of body.updates) {
          const current = cardRows.get(update.cardId)!;
          const { expectedPlacement } = update;
          if (
            current.physicalPage !== expectedPlacement.physicalPage ||
            current.row !== expectedPlacement.row ||
            current.column !== expectedPlacement.column
          ) {
            throw new MoveConflictError(
              `Card "${update.cardId}" no longer has its expected position.`,
            );
          }
        }

        // Pass 1: null out every affected card's placement so pass 2 can
        // never momentarily collide with another card in this same update
        // set (see the function-level comment above).
        for (const update of body.updates) {
          tx.update(cards)
            .set({ physicalPage: null, row: null, column: null })
            .where(eq(cards.id, update.cardId))
            .run();
        }

        const now = new Date().toISOString();
        for (const update of body.updates) {
          tx.update(cards)
            .set({
              physicalPage: update.finalPlacement.physicalPage,
              row: update.finalPlacement.row,
              column: update.finalPlacement.column,
              updatedAt: now,
            })
            .where(eq(cards.id, update.cardId))
            .run();
        }

        return body.updates.map((update) =>
          tx.select().from(cards).where(eq(cards.id, update.cardId)).get()!,
        );
      });

      response.status(200).json(updatedRows.map(serializeCard));
    } catch (error) {
      if (error instanceof MoveConflictError) {
        response
          .status(409)
          .type('application/problem+json')
          .json(problem(409, 'Conflict', error.message));
        return;
      }
      if (isUniqueConstraintError(error)) {
        response
          .status(409)
          .type('application/problem+json')
          .json(problem(409, 'Conflict', 'The destination slot is occupied.'));
        return;
      }
      throw error;
    }
  });

  // Story 13's card-removal endpoint: permanently deletes the identified
  // card, then - within the same transaction - deletes its image asset's
  // row too if this was the final card referencing it (planning.md: "If
  // deletion removes the final card reference to an image asset, the
  // backend immediately deletes the image-asset record"). The actual file
  // removal happens after the transaction commits (below), since
  // filesystem operations aren't part of the SQLite transaction and its
  // failure must not roll back the already-committed database deletion.
  router.delete('/cards/:cardId', (request, response) => {
    const { cardId } = request.params;

    const orphanedFilePath = database.transaction((tx) => {
      const card = tx
        .select({ imageAssetId: cards.imageAssetId })
        .from(cards)
        .where(eq(cards.id, cardId))
        .get();
      // Deleting an already-absent card is still a successful no-op per
      // planning.md, so there's nothing left to do once the row doesn't
      // exist.
      if (!card) return null;

      tx.delete(cards).where(eq(cards.id, cardId)).run();

      const stillReferenced = tx
        .select({ id: cards.id })
        .from(cards)
        .where(eq(cards.imageAssetId, card.imageAssetId))
        .get();
      if (stillReferenced) return null;

      const asset = tx
        .select({ storageFilename: cardImageAssets.storageFilename })
        .from(cardImageAssets)
        .where(eq(cardImageAssets.id, card.imageAssetId))
        .get();
      tx.delete(cardImageAssets).where(eq(cardImageAssets.id, card.imageAssetId)).run();
      return asset ? join(imagesDirectory, asset.storageFilename) : null;
    });

    if (orphanedFilePath && existsSync(orphanedFilePath)) {
      try {
        unlinkSync(orphanedFilePath);
      } catch (error) {
        // Planning.md: a failed file cleanup doesn't roll back the already
        // committed database deletion or change the 204 response - just
        // logged for maintenance to find and retry later.
        request.log.error(
          { err: error, path: orphanedFilePath },
          'Failed to delete an orphaned card image file after card deletion.',
        );
      }
    }

    response.status(204).end();
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
// Ordered by creation timestamp descending, then id ascending as a
// deterministic tie-breaker (story 15: "Unplaced cards are ordered by
// creation timestamp descending and then card UUID ascending"). This order
// is harmless for placed cards - the layout tab looks them up by
// (physicalPage, row, column) rather than list position - and gives the
// unplaced-cards panel its required newest-first order directly from this
// one shared endpoint.
export function listCardsForBinder(database: DatabaseConnection['database'], binderId: string) {
  return database
    .select()
    .from(cards)
    .where(eq(cards.binderId, binderId))
    .orderBy(desc(cards.createdAt), asc(cards.id))
    .all()
    .map(serializeCard);
}

// Story 20 ("Add a binder preview"): the cards placed within the binder
// list's embedded preview spread, narrowed to only the physical pages the
// resolved spread actually shows (a single page or a two-page spread).
// Returns the minimal `BinderPreviewCard` placement/image shape rather than
// the complete `Card` row - the preview data "contains only ... placed card
// and multi-slot-art geometry, display metadata, and image URLs" per
// planning.md's technical requirements, deliberately excluding the card's
// own name/set/variation/source/timestamps.
export function listPlacedCardsForPreview(
  database: DatabaseConnection['database'],
  binderId: string,
  physicalPages: number[],
) {
  if (physicalPages.length === 0) return [];

  return database
    .select({
      physicalPage: cards.physicalPage,
      row: cards.row,
      column: cards.column,
      id: cards.id,
    })
    .from(cards)
    .where(and(eq(cards.binderId, binderId), inArray(cards.physicalPage, physicalPages)))
    .all()
    .map((row) => ({
      // `physicalPage`/`row`/`column` are guaranteed non-null here: this
      // query only matches cards whose `physicalPage` is one of the
      // resolved spread's pages, and the `card_placement_all_or_none`-style
      // constraint (see schema.ts) guarantees row/column are set whenever
      // physicalPage is.
      physicalPage: row.physicalPage as number,
      row: row.row as number,
      column: row.column as number,
      imageUrl: `/cards/${row.id}/image`,
    }));
}
