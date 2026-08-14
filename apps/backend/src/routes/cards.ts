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
  DEFAULT_CARD_ACQUIRED,
  DEFAULT_CARD_IS_MANUAL_PRICE,
  POKEMONTCG_PRICE_FETCH_CONCURRENCY,
} from '@binder-project-planner/shared';
import { and, asc, desc, eq, inArray } from 'drizzle-orm';
import { Router, type Response } from 'express';

import type { DatabaseConnection } from '../database/client.js';
import { binders, cardImageAssets, cards } from '../database/schema.js';
import { fromCents, toCents } from '../finance/currency.js';
import { detectImageFormat } from '../images/imageFormat.js';
import {
  findIdempotentOutcome,
  saveIdempotentOutcome,
} from '../idempotency/mutationIdempotency.js';
import { translateEnglishNameToJapanese } from '../integrations/pokeapi.js';
import {
  createPriceFetchBatchCache,
  fetchCardPriceData,
  PokemonTcgAbortedError,
  type CardPriceFetchResult,
} from '../integrations/pokemontcg.js';
import { lockedBinderConflictProblem } from '../lockedBinderProblem.js';
import { getOccupiedCells } from '../placement/occupancy.js';
import {
  downloadCardImage,
  searchCardCatalog,
  TcgDexAbortedError,
  TcgDexProviderError,
  type CardSearchLanguage,
} from '../integrations/tcgdex.js';

import { mapWithConcurrencyLimit } from './concurrency.js';

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
  // Story 36: applied to every card in this bulk request, mirroring the
  // shared `variation` field above; omitted stores as
  // `DEFAULT_CARD_ACQUIRED` (unacquired).
  acquired?: boolean;
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
  // Story 36: unchecked by default on the modal's form (the multipart
  // field arrives as a string and is coerced to boolean by app.ts's
  // `coerceTypes: true` body validation); omitted entirely stores as
  // `DEFAULT_CARD_ACQUIRED` (unacquired), matching every other card-
  // creation path.
  acquired?: boolean;
  physicalPage?: number;
  row?: number;
  column?: number;
}

// The validated, OpenAPI-typed shape of `PATCH /cards/{cardId}/details`'s
// request body (story 49, `multipart/form-data`). `price`, when present,
// arrives pre-coerced to a number by the request-validation middleware
// (see app.ts's `coerceTypes` comment); omitting it clears the card's
// saved price. The optional replacement image file itself is read from
// `request.files` rather than this body.
interface UpdateCardDetailsRequestBody {
  name: string;
  setName?: string;
  localNumber?: string;
  variation?: string;
  price?: number;
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

// The validated, OpenAPI-typed shape of `PATCH /cards/{cardId}`'s
// acquisition-update request body (story 36): replaces the path card's
// `acquired` field instead of moving/swapping placement or updating its
// variation. The route handler below distinguishes all three body shapes
// by which of `updates`/`variation`/`acquired` is present.
interface UpdateCardAcquiredRequestBody {
  acquired: boolean;
}

// The validated, OpenAPI-typed shape of `PATCH /binders/{binderId}/cards/
// acquisition`'s request body (story 46): bulk-replaces `acquired` for
// every listed card in one request, rather than the client looping
// individual `PATCH /cards/{cardId}` requests - used by the Card List
// tab's (story 37) select-all/deselect-all header control.
interface UpdateCardsAcquisitionRequestBody {
  cardIds: string[];
  acquired: boolean;
}

// The validated, OpenAPI-typed shape of `POST /binders/{binderId}/cards/
// prices/fetch`'s request body (story 38): requests pokemontcg.io price
// data for exactly this set of card ids - the Card List's currently
// filtered/displayed cards, not every card in the binder.
interface CardPriceFetchRequestBody {
  cardIds: string[];
}

// One reviewed row of `PATCH /binders/{binderId}/cards/prices`'s request
// body (story 38): the new-price value the user is committing for one
// card, plus whether it was hand-edited (`isManualPrice`) - see this
// file's route handler comment for the provenance rules that determine
// this flag client-side.
interface CardPriceUpdate {
  cardId: string;
  price: number;
  isManualPrice: boolean;
}

interface UpdateCardPricesRequestBody {
  prices: CardPriceUpdate[];
}

// One submitted price update's independent outcome (story 38), mirroring
// `BulkCardOutcome`'s "created"/"failed" pattern - preserves the submitted
// array's order regardless of processing completion order.
type CardPriceUpdateOutcome =
  | { status: 'updated'; card: ReturnType<typeof serializeCard> }
  | { status: 'failed'; problem: ReturnType<typeof problem> };

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
  acquired: boolean;
  priceCents: number | null;
  isManualPrice: boolean;
  priceUpdatedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

function problem(status: number, title: string, detail: string) {
  return { type: 'about:blank', title, status, detail };
}

// Converts pokemontcg.io price-fetch results (internal, cents-based) into
// the OpenAPI `CardPriceFetchResult` response shape (decimal dollars),
// matching `serializeCard`'s own cents-to-dollars boundary conversion.
function serializeCardPriceFetchResults(results: CardPriceFetchResult[]) {
  return results.map((result) => ({
    cardId: result.cardId,
    tcgplayerUrl: result.tcgplayerUrl,
    variants: result.variants.map((variant) => ({
      variantKey: variant.variantKey,
      marketPrice: variant.marketPriceCents === null ? null : fromCents(variant.marketPriceCents),
      lowPrice: variant.lowPriceCents === null ? null : fromCents(variant.lowPriceCents),
    })),
  }));
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
    acquired: row.acquired,
    // Story 38: converts the internally-stored integer cents back to
    // decimal dollars at the API boundary (`finance/currency.ts`'s
    // convention); null (never fetched or entered) passes through as-is.
    price: row.priceCents === null ? null : fromCents(row.priceCents),
    isManualPrice: row.isManualPrice,
    priceUpdatedAt: row.priceUpdatedAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

// better-sqlite3 surfaces unique-constraint violations as a `SqliteError`
// with `.code === 'SQLITE_CONSTRAINT_UNIQUE'`; matches the pattern already
// used by routes/binders.ts. Exported for reuse by routes/watchlistEntries.ts
// (story 45), which shares this same image-asset dedupe pattern.
export function isUniqueConstraintError(error: unknown): boolean {
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
// Exported for reuse by routes/watchlistEntries.ts (story 45).
export class UnsupportedImageFormatError extends Error {
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
// rejected request never leaves an orphaned temporary file behind. Exported
// for reuse by routes/watchlistEntries.ts (story 45).
export function removeTemporaryUploads(files: Express.Multer.File[]): void {
  for (const file of files) {
    if (existsSync(file.path)) {
      unlinkSync(file.path);
    }
  }
}

// Exported for reuse by routes/watchlistEntries.ts (story 45).
export interface ResolvedImageAsset {
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
// Exported for reuse by routes/watchlistEntries.ts (story 45).
export async function resolveTcgDexImageAsset(
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
// Exported for reuse by routes/watchlistEntries.ts (story 45).
export function resolveCustomImageAsset(
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
  pokemonTcgApiKey: string | undefined,
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
      acquired: boolean;
      priceCents: null;
      isManualPrice: boolean;
      priceUpdatedAt: null;
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

    // Story 32: a locked binder rejects every card mutation, including
    // creating one.
    if (binder.locked) {
      if (uploadedFiles) removeTemporaryUploads(uploadedFiles);
      response.status(409).type('application/problem+json').json(lockedBinderConflictProblem());
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
    // Story 36: unchecked (omitted) defaults to unacquired, matching every
    // other card-creation path.
    const acquired = body.acquired ?? DEFAULT_CARD_ACQUIRED;

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
        acquired,
        // Story 38: every new card starts with no saved price regardless
        // of creation path, matching `DEFAULT_CARD_IS_MANUAL_PRICE`.
        priceCents: null,
        isManualPrice: DEFAULT_CARD_IS_MANUAL_PRICE,
        priceUpdatedAt: null,
        createdAt: now,
        updatedAt: now,
      },
      asset,
    );
  });

  // Story 49's Card List row edit action: replaces the path card's name,
  // set, number, variation, and price in one request, and optionally its
  // image - a dedicated multipart endpoint since it's the only card
  // mutation needing to replace the image alongside other fields;
  // `PATCH /cards/{cardId}` above stays exclusively JSON/move-swap/
  // variation/acquired, unchanged by this story. Applies identically to
  // every card regardless of `source` (`tcgdex` or `custom`) and never
  // touches `source`, `providerCardId`, or `providerSetId`.
  router.patch('/cards/:cardId/details', async (request, response) => {
    const { cardId } = request.params;
    const uploadedFiles = Array.isArray(request.files) ? request.files : undefined;

    const existing = database.select().from(cards).where(eq(cards.id, cardId)).get() as
      CardRow | undefined;
    if (!existing) {
      if (uploadedFiles) removeTemporaryUploads(uploadedFiles);
      response
        .status(404)
        .type('application/problem+json')
        .json(problem(404, 'Not Found', `No card exists with id "${cardId}".`));
      return;
    }

    // Story 32: editing a card's details is a restricted mutation too,
    // matching every other card-field edit in this file (variation, move/
    // swap, creation, deletion) - only the acquisition toggle is exempt.
    const binder = database
      .select({ locked: binders.locked })
      .from(binders)
      .where(eq(binders.id, existing.binderId))
      .get();
    if (binder?.locked) {
      if (uploadedFiles) removeTemporaryUploads(uploadedFiles);
      response.status(409).type('application/problem+json').json(lockedBinderConflictProblem());
      return;
    }

    if (!uploadedFiles) {
      // Never expected: the OpenAPI schema only documents a
      // `multipart/form-data` request body for this endpoint, so
      // express-openapi-validator already rejects any other content type
      // before this handler runs. Guarded defensively regardless.
      response
        .status(400)
        .type('application/problem+json')
        .json(problem(400, 'Bad Request', 'This endpoint requires a multipart/form-data body.'));
      return;
    }

    const body = request.body as UpdateCardDetailsRequestBody;

    // Required after trimming (mirrors custom-card creation's own rule);
    // the OpenAPI schema's `minLength: 1` only guards the raw untrimmed
    // value.
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

    // Optional fields: trimmed, blank stores as null (mirrors custom-card
    // creation's own rule) - applied identically regardless of the card's
    // `source`.
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

    // A new image is optional here (unlike creation, where it's required)
    // - omitted leaves the card's existing `imageAssetId` unchanged.
    let asset: ResolvedImageAsset | null = null;
    const uploadedFile = uploadedFiles.find((file) => file.fieldname === 'image');
    if (uploadedFile) {
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
    }

    // `price` is omitted (rather than sent as an empty value) to clear the
    // card's saved price entirely; a submitted price is already coerced to
    // a number by app.ts's `coerceTypes: true` body validation.
    // `isManualPrice`/`priceUpdatedAt` only change when the saved price
    // cents value actually changes (mirrors `PATCH /binders/{binderId}/
    // cards/prices`'s "Save all" provenance rule) - editing any other
    // field never touches them.
    const priceCents = body.price === undefined ? null : toCents(body.price);
    const priceChanged = priceCents !== existing.priceCents;
    const now = new Date().toISOString();
    const isManualPrice = priceChanged ? true : existing.isManualPrice;
    const priceUpdatedAt = priceChanged ? now : existing.priceUpdatedAt;

    const updateValues = {
      name,
      setName,
      localNumber,
      variation,
      priceCents,
      isManualPrice,
      priceUpdatedAt,
      updatedAt: now,
      ...(asset ? { imageAssetId: asset.assetId } : {}),
    };

    // Mirrors `DELETE /cards/:cardId`'s orphan-cleanup pattern below: only
    // relevant here when a new image was uploaded and it replaces (rather
    // than reuses, via digest dedupe) the card's previous asset - the
    // database update and the orphan check/cleanup happen in one
    // transaction so a concurrent request can never observe the old asset
    // row deleted while some other card still references it.
    const orphanedFilePath = database.transaction((tx) => {
      tx.update(cards).set(updateValues).where(eq(cards.id, cardId)).run();

      if (!asset || asset.assetId === existing.imageAssetId) return null;

      const stillReferenced = tx
        .select({ id: cards.id })
        .from(cards)
        .where(eq(cards.imageAssetId, existing.imageAssetId))
        .get();
      if (stillReferenced) return null;

      const oldAsset = tx
        .select({ storageFilename: cardImageAssets.storageFilename })
        .from(cardImageAssets)
        .where(eq(cardImageAssets.id, existing.imageAssetId))
        .get();
      tx.delete(cardImageAssets).where(eq(cardImageAssets.id, existing.imageAssetId)).run();
      return oldAsset ? join(imagesDirectory, oldAsset.storageFilename) : null;
    });

    if (orphanedFilePath && existsSync(orphanedFilePath)) {
      try {
        unlinkSync(orphanedFilePath);
      } catch (error) {
        // Mirrors `DELETE /cards/:cardId`'s own handling: a failed file
        // cleanup doesn't roll back the already-committed database update
        // or change the 200 response - just logged for maintenance to
        // find and retry later.
        request.log.error(
          { err: error, path: orphanedFilePath },
          'Failed to delete an orphaned card image file after a card details edit.',
        );
      }
    }

    response.status(200).json(serializeCard({ ...existing, ...updateValues }));
  });

  // Per-binder in-flight bulk-request guard (stories 17/18): the frontend
  // keeps its own Add Card/Add More buttons disabled while a batch is in
  // flight, but this in-memory set also rejects a genuinely overlapping
  // request (e.g. a second browser tab targeting the same binder) with
  // `409 Conflict` instead of racing two batches against the same binder.
  // Scoped to this router's module-level closure - fine for a local
  // single-process application with no horizontal scaling.
  const activeBulkRequestBinderIds = new Set<string>();

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

    // Story 32: a locked binder rejects a bulk card-creation request too.
    if (binder.locked) {
      response.status(409).type('application/problem+json').json(lockedBinderConflictProblem());
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
    // Story 36: applied to every card in this batch; omitted defaults to
    // unacquired.
    const acquired = body.acquired ?? DEFAULT_CARD_ACQUIRED;
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
            acquired,
            // Story 38: every new card starts with no saved price
            // regardless of creation path.
            priceCents: null,
            isManualPrice: DEFAULT_CARD_IS_MANUAL_PRICE,
            priceUpdatedAt: null,
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

  // Story 46's bulk acquisition-toggle endpoint: replaces `acquired` for
  // every card in `cardIds` in one request, powering the Card List tab's
  // (story 37) select-all/deselect-all header control instead of the
  // client looping individual `PATCH /cards/{cardId}` requests. Mirrors
  // that single-card endpoint's own acquisition branch in remaining
  // allowed while the binder is locked (see this file's other `acquired`
  // branch above) - deliberately the one binder-scoped mutation in this
  // router with no locked-binder check.
  router.patch('/binders/:binderId/cards/acquisition', (request, response) => {
    const { binderId } = request.params;
    const body = request.body as UpdateCardsAcquisitionRequestBody;

    const binder = database.select().from(binders).where(eq(binders.id, binderId)).get();
    if (!binder) {
      response
        .status(404)
        .type('application/problem+json')
        .json(problem(404, 'Not Found', `No binder exists with id "${binderId}".`));
      return;
    }

    const cardRows = database.select().from(cards).where(inArray(cards.id, body.cardIds)).all();
    const foundIds = new Set(cardRows.map((row) => row.id));
    const missingId = body.cardIds.find((id) => !foundIds.has(id));
    if (missingId) {
      response
        .status(404)
        .type('application/problem+json')
        .json(problem(404, 'Not Found', `No card exists with id "${missingId}".`));
      return;
    }

    // Every card must belong to the path binder - a request mixing card
    // ids from a different binder is rejected outright rather than only
    // updating the subset that matches, mirroring the move/swap endpoint's
    // own cross-binder rejection above.
    const foreignCard = cardRows.find((row) => row.binderId !== binderId);
    if (foreignCard) {
      response
        .status(400)
        .type('application/problem+json')
        .json(problem(400, 'Bad Request', 'Every cardId must belong to the path binder.'));
      return;
    }

    const updatedAt = new Date().toISOString();
    database
      .update(cards)
      .set({ acquired: body.acquired, updatedAt })
      .where(and(eq(cards.binderId, binderId), inArray(cards.id, body.cardIds)))
      .run();

    const updatedRows = cardRows.map((row) => ({ ...row, acquired: body.acquired, updatedAt }));
    response.status(200).json(updatedRows.map(serializeCard));
  });

  // Story 38's price-fetch endpoint: requests pokemontcg.io price data for
  // exactly the card ids the Card List's active search/sort/filter state
  // currently produces (not every card in the binder) - the frontend's
  // "Fetch card prices" button. Every listed card must belong to the path
  // binder. Purely a read: no card is mutated by this endpoint - fetched
  // prices are client-side review state until "Save all" calls the
  // sibling `PATCH /binders/{binderId}/cards/prices` endpoint below.
  router.post('/binders/:binderId/cards/prices/fetch', async (request, response) => {
    const { binderId } = request.params;
    const body = request.body as CardPriceFetchRequestBody;

    const binder = database.select().from(binders).where(eq(binders.id, binderId)).get();
    if (!binder) {
      response
        .status(404)
        .type('application/problem+json')
        .json(problem(404, 'Not Found', `No binder exists with id "${binderId}".`));
      return;
    }

    const cardRows = database
      .select()
      .from(cards)
      .where(inArray(cards.id, body.cardIds))
      .all() as CardRow[];
    const foundIds = new Set(cardRows.map((row) => row.id));
    const missingId = body.cardIds.find((id) => !foundIds.has(id));
    if (missingId) {
      response
        .status(404)
        .type('application/problem+json')
        .json(problem(404, 'Not Found', `No card exists with id "${missingId}".`));
      return;
    }

    const foreignCard = cardRows.find((row) => row.binderId !== binderId);
    if (foreignCard) {
      response
        .status(400)
        .type('application/problem+json')
        .json(problem(400, 'Bad Request', 'Every cardId must belong to the path binder.'));
      return;
    }

    // Propagates a disconnected/aborted client request to every in-flight
    // upstream pokemontcg.io lookup (planning.md's existing convention for
    // proxied provider requests).
    const controller = new AbortController();
    request.on('close', () => controller.abort());

    // Shared across every card in this request so two cards resolving to
    // the same pokemontcg.io card (e.g. a "normal" print and a "Reverse
    // Holo" print of the same physical card share one set + number)
    // trigger a single upstream price request instead of one each - see
    // `createPriceFetchBatchCache`'s own comment for why this is scoped to
    // one request rather than reused across requests.
    const priceFetchBatchCache = createPriceFetchBatchCache();

    try {
      const results = await mapWithConcurrencyLimit(
        cardRows,
        POKEMONTCG_PRICE_FETCH_CONCURRENCY,
        (row) =>
          fetchCardPriceData(
            {
              cardId: row.id,
              setName: row.setName,
              providerSetId: row.providerSetId,
              localNumber: row.localNumber,
            },
            pokemonTcgApiKey,
            controller.signal,
            priceFetchBatchCache,
          ),
      );
      response.status(200).json(serializeCardPriceFetchResults(results));
    } catch (error) {
      // The per-card lookup itself never throws for an individual provider
      // failure (see `fetchCardPriceData`'s own try/catch) - only a client
      // disconnect (`PokemonTcgAbortedError`) or a genuinely unexpected
      // error reaches here, both of which are request-level failures.
      if (error instanceof PokemonTcgAbortedError) return;
      throw error;
    }
  });

  // Story 38's "Save all" endpoint: commits every reviewed row's new price
  // in one request. Mirrors the bulk create-cards endpoint's (stories
  // 17/18) per-item independent outcome pattern - a failure on one card's
  // price rolls back only that card rather than the whole batch, since
  // each is applied as its own update.
  router.patch('/binders/:binderId/cards/prices', (request, response) => {
    const { binderId } = request.params;
    const body = request.body as UpdateCardPricesRequestBody;

    const binder = database.select().from(binders).where(eq(binders.id, binderId)).get();
    if (!binder) {
      response
        .status(404)
        .type('application/problem+json')
        .json(problem(404, 'Not Found', `No binder exists with id "${binderId}".`));
      return;
    }

    const requestedIds = body.prices.map((entry) => entry.cardId);
    const cardRows = database
      .select()
      .from(cards)
      .where(inArray(cards.id, requestedIds))
      .all() as CardRow[];
    const cardRowsById = new Map(cardRows.map((row) => [row.id, row]));

    const updatedAt = new Date().toISOString();
    const outcomes: CardPriceUpdateOutcome[] = body.prices.map((entry) => {
      const existing = cardRowsById.get(entry.cardId);
      if (!existing) {
        return {
          status: 'failed',
          problem: problem(404, 'Not Found', `No card exists with id "${entry.cardId}".`),
        };
      }
      if (existing.binderId !== binderId) {
        return {
          status: 'failed',
          problem: problem(400, 'Bad Request', 'Every cardId must belong to the path binder.'),
        };
      }

      const priceCents = toCents(entry.price);
      database
        .update(cards)
        .set({
          priceCents,
          isManualPrice: entry.isManualPrice,
          priceUpdatedAt: updatedAt,
          updatedAt,
        })
        .where(eq(cards.id, entry.cardId))
        .run();

      return {
        status: 'updated',
        card: serializeCard({
          ...existing,
          priceCents,
          isManualPrice: entry.isManualPrice,
          priceUpdatedAt: updatedAt,
          updatedAt,
        }),
      };
    });

    const responseStatus = outcomes.some((outcome) => outcome.status === 'failed') ? 207 : 200;
    response.status(responseStatus).json(outcomes);
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

    // Story 36: an acquisition-update request body has `acquired` (and no
    // `updates`) instead of a move/swap's `updates` array - the OpenAPI
    // `oneOf` request schema's third branch. Checked before the
    // variation-update branch below since neither shape has an `updates`
    // key; handled as its own simple last-write-wins branch for the same
    // reasons as the variation-update branch (no expected-position
    // comparison, no transaction needed).
    if (!('updates' in request.body) && 'acquired' in request.body) {
      const body = request.body as UpdateCardAcquiredRequestBody;
      const existing = database.select().from(cards).where(eq(cards.id, cardId)).get();
      if (!existing) {
        response
          .status(404)
          .type('application/problem+json')
          .json(problem(404, 'Not Found', `No card exists with id "${cardId}".`));
        return;
      }

      // Story 32/37: unlike every other mutation guarded by this file's
      // locked-binder checks, acquisition changes remain allowed while the
      // binder is locked - the Card List tab's (story 37) row toggle and
      // its bulk select-all/deselect-all control (story 46, `PATCH
      // /binders/{binderId}/cards/acquisition` below) are the two flows
      // that call this behavior, so there's deliberately no lock check
      // here.
      const updatedAt = new Date().toISOString();
      database
        .update(cards)
        .set({ acquired: body.acquired, updatedAt })
        .where(eq(cards.id, cardId))
        .run();

      response.status(200).json(serializeCard({ ...existing, acquired: body.acquired, updatedAt }));
      return;
    }

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

      // Story 32: editing a card's variation is a restricted mutation too.
      const binderForVariationEdit = database
        .select({ locked: binders.locked })
        .from(binders)
        .where(eq(binders.id, existing.binderId))
        .get();
      if (binderForVariationEdit?.locked) {
        response.status(409).type('application/problem+json').json(lockedBinderConflictProblem());
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

    // Story 32: moving/swapping cards is a restricted mutation too.
    if (binder.locked) {
      response.status(409).type('application/problem+json').json(lockedBinderConflictProblem());
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

    // Story 32: removing a card is a restricted mutation - checked before
    // the transaction below even starts. A card that doesn't exist has no
    // binder to check, so this falls through to the existing no-op delete.
    const cardForLockCheck = database
      .select({ binderId: cards.binderId })
      .from(cards)
      .where(eq(cards.id, cardId))
      .get();
    if (cardForLockCheck) {
      const binderForLockCheck = database
        .select({ locked: binders.locked })
        .from(binders)
        .where(eq(binders.id, cardForLockCheck.binderId))
        .get();
      if (binderForLockCheck?.locked) {
        response.status(409).type('application/problem+json').json(lockedBinderConflictProblem());
        return;
      }
    }

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

  // Story 19's duplicate-card endpoint: creates a new, always-unplaced
  // card copying every card-owned field from the source card and sharing
  // its existing image asset (no new download/file is ever created for a
  // duplicate) - mirrors `POST /art/{artId}/duplicate`'s (story 26)
  // idempotency-key-aware pattern exactly, so a retried duplicate request
  // after a dropped response replays the original outcome instead of
  // creating a second copy.
  router.post('/cards/:cardId/duplicate', (request, response) => {
    const { cardId } = request.params;
    const idempotencyKey = request.header('Idempotency-Key');
    if (!idempotencyKey) {
      response
        .status(400)
        .type('application/problem+json')
        .json(problem(400, 'Bad Request', 'An Idempotency-Key header is required.'));
      return;
    }

    const replayed = findIdempotentOutcome(database, 'card-duplicate', idempotencyKey);
    if (replayed) {
      const replayedResponse = response.status(replayed.responseStatus);
      if (replayed.locationHeader) replayedResponse.location(replayed.locationHeader);
      replayedResponse.json(replayed.responseBody);
      return;
    }

    const source = database.select().from(cards).where(eq(cards.id, cardId)).get() as
      CardRow | undefined;
    if (!source) {
      response
        .status(404)
        .type('application/problem+json')
        .json(problem(404, 'Not Found', `No card exists with id "${cardId}".`));
      return;
    }

    // Story 32: duplicating a card is a restricted mutation too.
    const binderForDuplicate = database
      .select({ locked: binders.locked })
      .from(binders)
      .where(eq(binders.id, source.binderId))
      .get();
    if (binderForDuplicate?.locked) {
      response.status(409).type('application/problem+json').json(lockedBinderConflictProblem());
      return;
    }

    const now = new Date().toISOString();
    const duplicate: CardRow = {
      ...source,
      id: randomUUID(),
      // A duplicate always starts unplaced (planning.md), even if the
      // source is currently placed - the user places it explicitly.
      physicalPage: null,
      row: null,
      column: null,
      createdAt: now,
      updatedAt: now,
    };

    database.insert(cards).values(duplicate).run();

    const responseBody = serializeCard(duplicate);
    const locationHeader = `/cards/${duplicate.id}`;
    saveIdempotentOutcome(database, 'card-duplicate', idempotencyKey, {
      responseStatus: 201,
      responseBody,
      locationHeader,
    });

    response.status(201).location(locationHeader).json(responseBody);
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

// Story 36: "Track card acquisition". Counts every card record (placed and
// unplaced) associated with the binder plus how many of them are acquired,
// for the home page's card-acquisition percentage metric. Multi-slot art
// lives in a separate `art` table entirely, so it's naturally excluded
// without any extra filtering here. Returns raw counts (rather than a
// pre-rounded percentage) so the client derives the rounded percentage and
// decides how to display a zero-card binder (`N/A`), matching story 22's
// existing slot-completion counts' own division of responsibility.
export function countCardAcquisition(
  database: DatabaseConnection['database'],
  binderId: string,
): { acquiredCards: number; totalCards: number } {
  const rows = database
    .select({ acquired: cards.acquired })
    .from(cards)
    .where(eq(cards.binderId, binderId))
    .all();

  return {
    acquiredCards: rows.filter((row) => row.acquired).length,
    totalCards: rows.length,
  };
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
