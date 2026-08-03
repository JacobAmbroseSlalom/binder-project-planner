import { randomUUID } from 'node:crypto';
import {
  closeSync,
  createReadStream,
  existsSync,
  openSync,
  readSync,
  renameSync,
  unlinkSync,
} from 'node:fs';
import { join } from 'node:path';

import { ART_DESCRIPTION_MAX_LENGTH, ART_TITLE_MAX_LENGTH } from '@binder-project-planner/shared';
import { and, asc, desc, eq, inArray } from 'drizzle-orm';
import { Router } from 'express';
import sharp from 'sharp';

import type { DatabaseConnection } from '../database/client.js';
import { art, artImageAssets, binders } from '../database/schema.js';
import {
  findIdempotentOutcome,
  saveIdempotentOutcome,
} from '../idempotency/mutationIdempotency.js';
import { detectImageFormat } from '../images/imageFormat.js';
import { getArtFootprintCells, getOccupiedCells } from '../placement/occupancy.js';

// The validated, OpenAPI-typed shape of a create-art request body (story
// 25, `multipart/form-data`). Numeric fields arrive pre-coerced to numbers
// by the request-validation middleware (see app.ts's `coerceTypes`
// comment); the uploaded image file itself is read from `request.files`
// rather than this body.
interface CreateArtRequestBody {
  title: string;
  description?: string;
  widthSlots: number;
  heightSlots: number;
  imageRotationDegrees?: number;
  focalX?: number;
  focalY?: number;
  scaleX?: number;
  scaleY?: number;
  borderColor?: string | null;
  borderRadius?: number | null;
  borderWidth?: number | null;
}

// A nullable placement triple, mirroring routes/cards.ts's own shape - an
// all-populated placed position or an all-null unplaced position (story
// 26).
interface NullablePlacement {
  physicalPage: number | null;
  row: number | null;
  column: number | null;
}

// `PATCH /art/{artId}`'s `application/json` movement body (story 26): art
// never swaps (only cards can occupy each other's slot in a 2-card swap),
// so - unlike `MoveCardsRequest` - this is always exactly one
// expected/final placement pair for the one art item the path identifies.
interface MoveArtRequestBody {
  expectedPlacement: NullablePlacement;
  finalPlacement: NullablePlacement;
}

// `PATCH /art/{artId}`'s `multipart/form-data` edit body (story 26):
// mirrors `CreateArtRequestBody`'s metadata fields (the image itself stays
// optional - omitting it keeps the art's current image) plus a flag that
// confirms moving already-placed art to the unplaced section when the
// edited dimensions would otherwise leave it out of bounds or overlapping
// another item.
interface UpdateArtRequestBody {
  title: string;
  description?: string;
  widthSlots: number;
  heightSlots: number;
  imageRotationDegrees?: number;
  focalX?: number;
  focalY?: number;
  scaleX?: number;
  scaleY?: number;
  borderColor?: string | null;
  borderRadius?: number | null;
  borderWidth?: number | null;
  moveToUnplacedOnConflict?: boolean;
}

interface ArtRow {
  id: string;
  binderId: string;
  title: string;
  description: string | null;
  widthSlots: number;
  heightSlots: number;
  physicalPage: number | null;
  row: number | null;
  column: number | null;
  imageAssetId: string;
  imageRotationDegrees: number;
  focalXTenThousandths: number;
  focalYTenThousandths: number;
  scaleXTenThousandths: number;
  scaleYTenThousandths: number;
  borderColor: string | null;
  borderRadiusHundredths: number | null;
  borderWidthHundredths: number | null;
  createdAt: string;
  updatedAt: string;
}

function problem(status: number, title: string, detail: string) {
  return { type: 'about:blank', title, status, detail };
}

// A validated `#RRGGBB` hex color (case-insensitive input, uppercased for
// storage), mirroring routes/binders.ts's own `HEX_COLOR_PATTERN`.
const HEX_COLOR_PATTERN = /^#[0-9A-Fa-f]{6}$/;

// Story 25's normalized focal coordinates and scale multipliers are
// exposed as decimals (rounded to 4 places) but stored as integer
// ten-thousandths to avoid floating-point drift, mirroring story 24's
// hundredths convention for percentages.
function toTenThousandths(value: number): number {
  return Math.round(value * 10_000);
}

function fromTenThousandths(value: number): number {
  return value / 10_000;
}

function toHundredths(value: number): number {
  return Math.round(value * 100);
}

function fromHundredths(value: number): number {
  return value / 100;
}

// Serializes a persisted art row as the OpenAPI `Art` response shape. The
// image URL is always the backend's own streaming endpoint; storage
// details are never exposed.
function serializeArt(row: ArtRow) {
  return {
    id: row.id,
    binderId: row.binderId,
    title: row.title,
    description: row.description,
    widthSlots: row.widthSlots,
    heightSlots: row.heightSlots,
    placement: { physicalPage: row.physicalPage, row: row.row, column: row.column },
    imageUrl: `/art/${row.id}/image`,
    imageRotationDegrees: row.imageRotationDegrees,
    focalX: fromTenThousandths(row.focalXTenThousandths),
    focalY: fromTenThousandths(row.focalYTenThousandths),
    scaleX: fromTenThousandths(row.scaleXTenThousandths),
    scaleY: fromTenThousandths(row.scaleYTenThousandths),
    borderColor: row.borderColor,
    borderRadius:
      row.borderRadiusHundredths === null ? null : fromHundredths(row.borderRadiusHundredths),
    borderWidth:
      row.borderWidthHundredths === null ? null : fromHundredths(row.borderWidthHundredths),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

// Validates a `PATCH /art/{artId}` movement's `finalPlacement` (story 26),
// mirroring routes/cards.ts's `validateMovePlacement` but additionally
// checking that the art's whole footprint (not just its top-left anchor)
// fits within the binder's current bounds.
function validateArtPlacement(
  placement: NullablePlacement,
  widthSlots: number,
  heightSlots: number,
  binder: { width: number; height: number; pages: number },
): string | null {
  const { physicalPage, row, column } = placement;
  const suppliedCount = [physicalPage, row, column].filter((value) => value !== null).length;
  if (suppliedCount === 0) return null;
  if (suppliedCount < 3) {
    return 'An art placement must include a complete physical page, row, and column, or none of them.';
  }

  const maxPhysicalPage = binder.pages * 2;
  if (physicalPage! < 1 || physicalPage! > maxPhysicalPage) {
    return `physicalPage must be between 1 and ${maxPhysicalPage}.`;
  }
  if (row! < 1 || row! + heightSlots - 1 > binder.height) {
    return `The art's ${heightSlots}-row footprint must fit within the binder's ${binder.height}-row height.`;
  }
  if (column! < 1 || column! + widthSlots - 1 > binder.width) {
    return `The art's ${widthSlots}-column footprint must fit within the binder's ${binder.width}-column width.`;
  }
  return null;
}

// Thrown from inside the move transaction below (story 26) when an
// update's expected placement no longer matches the art's persisted
// placement, or the destination footprint is occupied; the route handler
// maps this to a `409 Conflict` Problem Details response and the
// transaction rolls back automatically.
class ArtMoveConflictError extends Error {}

// better-sqlite3 surfaces unique-constraint violations as a `SqliteError`
// with `.code === 'SQLITE_CONSTRAINT_UNIQUE'`; mirrors routes/cards.ts's
// own helper.
function isUniqueConstraintError(error: unknown): boolean {
  return (
    error instanceof Error &&
    'code' in error &&
    (error as { code?: unknown }).code === 'SQLITE_CONSTRAINT_UNIQUE'
  );
}

// Reads the first `length` bytes of a file synchronously - just enough for
// magic-byte format detection.
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

// Mirrors routes/cards.ts's own filename sanitizer.
function sanitizeOriginalFilename(originalFilename: string): string {
  const basename = originalFilename.split(/[/\\]/).pop() ?? '';
  const sanitized = basename.replace(/[^a-zA-Z0-9 ._-]/g, '').trim();
  return sanitized.slice(0, 255) || 'upload';
}

class UnsupportedImageFormatError extends Error {
  constructor() {
    super('The uploaded file is not a supported image format (JPEG, PNG, or WebP).');
    this.name = 'UnsupportedImageFormatError';
  }
}

// Deletes any files multer already streamed to temporary storage for this
// request - used on every validation failure that occurs before the image
// asset takes ownership of the file, so a rejected request never leaves an
// orphaned temporary file behind.
function removeTemporaryUploads(files: Express.Multer.File[]): void {
  for (const file of files) {
    if (existsSync(file.path)) {
      unlinkSync(file.path);
    }
  }
}

interface ResolvedArtImageAsset {
  assetId: string;
  // Set only when this request installed brand-new file(s) for this asset
  // (i.e. it wasn't already shared by another art item), so a subsequent
  // art-insert failure knows it must remove the row and file(s) rather
  // than leaving a still-referenced shared asset orphaned.
  newlyCreatedPaths: string[];
}

// Finds or creates the shared local image asset for an art upload (story
// 25), mirroring routes/cards.ts's `resolveCustomImageAsset` dedupe/
// concurrent-race pattern. Additionally uses `sharp` to inspect the
// correctly-oriented pixel dimensions and, when the source JPEG's EXIF
// orientation isn't already "normal", generate an immutable auto-oriented
// rendering derivative (planning.md) - every renderer serves that
// derivative when present and falls back to the source bytes otherwise.
// `uploadedFile.path` is always consumed by this function - either deleted
// (a duplicate) or renamed into place - so the caller never needs to
// remove it itself once this function is called.
async function resolveArtImageAsset(
  database: DatabaseConnection['database'],
  imagesDirectory: string,
  uploadedFile: Express.Multer.File,
): Promise<ResolvedArtImageAsset> {
  const digest = uploadedFile.sha256Digest;
  if (!digest) {
    // Never expected: `createDigestDiskStorage` always attaches a digest.
    unlinkSync(uploadedFile.path);
    throw new Error('The uploaded file was not processed by the digest storage engine.');
  }

  const existing = database
    .select()
    .from(artImageAssets)
    .where(eq(artImageAssets.sha256Digest, digest))
    .get();
  if (existing) {
    unlinkSync(uploadedFile.path);
    return { assetId: existing.id, newlyCreatedPaths: [] };
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
  const newlyCreatedPaths = [finalPath];

  // Inspects the raw pixel grid and EXIF orientation. Orientations 5-8
  // (the "sideways" rotations) swap the rendered width/height relative to
  // the raw grid; every other orientation (including the common "no tag
  // present" case, which sharp reports as `undefined`) is treated as
  // already normal.
  const metadata = await sharp(finalPath).metadata();
  const orientation = metadata.orientation ?? 1;
  const isSideways = orientation >= 5 && orientation <= 8;
  const pixelWidth = (isSideways ? metadata.height : metadata.width) ?? 0;
  const pixelHeight = (isSideways ? metadata.width : metadata.height) ?? 0;

  let normalizedStorageFilename: string | null = null;
  if (orientation !== 1) {
    normalizedStorageFilename = `${assetId}-normalized.${format.fileExtension}`;
    const normalizedPath = join(imagesDirectory, normalizedStorageFilename);
    // `.rotate()` with no arguments auto-rotates according to the source
    // EXIF orientation tag and strips it from the output, producing an
    // immutable, already-correctly-oriented derivative (planning.md).
    await sharp(finalPath).rotate().toFile(normalizedPath);
    newlyCreatedPaths.push(normalizedPath);
  }

  try {
    database
      .insert(artImageAssets)
      .values({
        id: assetId,
        sha256Digest: digest,
        originalFilename: sanitizeOriginalFilename(uploadedFile.originalname),
        storageFilename,
        normalizedStorageFilename,
        contentType: format.contentType,
        fileExtension: format.fileExtension,
        pixelWidth,
        pixelHeight,
        createdAt: new Date().toISOString(),
      })
      .run();
    return { assetId, newlyCreatedPaths };
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      // Lost a concurrent race to upload the same image bytes; discard our
      // own duplicate file(s) and reuse the winner's asset.
      for (const path of newlyCreatedPaths) unlinkSync(path);
      const winner = database
        .select()
        .from(artImageAssets)
        .where(eq(artImageAssets.sha256Digest, digest))
        .get();
      if (winner) {
        return { assetId: winner.id, newlyCreatedPaths: [] };
      }
    }
    for (const path of newlyCreatedPaths) unlinkSync(path);
    throw error;
  }
}

// Creates the router owning art resources. Takes the raw database handle
// plus the shared images directory (the same one used by card images -
// see paths.ts).
export function createArtRouter(
  database: DatabaseConnection['database'],
  imagesDirectory: string,
): Router {
  const router = Router();

  // Story 25's create-art endpoint. New art always starts unplaced (all-
  // null placement) - placing art on the layout is story 26's scope.
  router.post('/binders/:binderId/art', async (request, response) => {
    const { binderId } = request.params;
    const uploadedFiles = Array.isArray(request.files) ? request.files : undefined;
    const body = request.body as CreateArtRequestBody;

    const binder = database.select().from(binders).where(eq(binders.id, binderId)).get();
    if (!binder) {
      if (uploadedFiles) removeTemporaryUploads(uploadedFiles);
      response
        .status(404)
        .type('application/problem+json')
        .json(problem(404, 'Not Found', `No binder exists with id "${binderId}".`));
      return;
    }

    const uploadedFile = uploadedFiles?.find((file) => file.fieldname === 'image');
    if (!uploadedFile) {
      // Never expected: the OpenAPI schema requires `image`, so
      // express-openapi-validator already rejects a request missing it
      // before this handler runs. Guarded defensively regardless.
      if (uploadedFiles) removeTemporaryUploads(uploadedFiles);
      response
        .status(400)
        .type('application/problem+json')
        .json(problem(400, 'Bad Request', 'Multi-slot art requires an image file.'));
      return;
    }

    // Required after trimming (planning.md); the OpenAPI schema's
    // `minLength: 1` only guards the raw untrimmed value.
    const title = body.title.trim();
    if (!title) {
      removeTemporaryUploads(uploadedFiles!);
      response
        .status(400)
        .type('application/problem+json')
        .json(problem(400, 'Bad Request', 'title is required.'));
      return;
    }
    if (title.length > ART_TITLE_MAX_LENGTH) {
      removeTemporaryUploads(uploadedFiles!);
      response
        .status(400)
        .type('application/problem+json')
        .json(
          problem(400, 'Bad Request', `title must be ${ART_TITLE_MAX_LENGTH} characters or fewer.`),
        );
      return;
    }

    const description = body.description?.trim() || null;
    if (description && description.length > ART_DESCRIPTION_MAX_LENGTH) {
      removeTemporaryUploads(uploadedFiles!);
      response
        .status(400)
        .type('application/problem+json')
        .json(
          problem(
            400,
            'Bad Request',
            `description must be ${ART_DESCRIPTION_MAX_LENGTH} characters or fewer.`,
          ),
        );
      return;
    }

    if (body.widthSlots < 1 || body.widthSlots > binder.width) {
      removeTemporaryUploads(uploadedFiles!);
      response
        .status(400)
        .type('application/problem+json')
        .json(problem(400, 'Bad Request', `widthSlots must be between 1 and ${binder.width}.`));
      return;
    }
    if (body.heightSlots < 1 || body.heightSlots > binder.height) {
      removeTemporaryUploads(uploadedFiles!);
      response
        .status(400)
        .type('application/problem+json')
        .json(problem(400, 'Bad Request', `heightSlots must be between 1 and ${binder.height}.`));
      return;
    }

    const imageRotationDegrees = body.imageRotationDegrees ?? 0;
    if (![0, 90, 180, 270].includes(imageRotationDegrees)) {
      removeTemporaryUploads(uploadedFiles!);
      response
        .status(400)
        .type('application/problem+json')
        .json(
          problem(400, 'Bad Request', 'imageRotationDegrees must be one of 0, 90, 180, or 270.'),
        );
      return;
    }

    const focalX = body.focalX ?? 0.5;
    const focalY = body.focalY ?? 0.5;
    if (focalX < 0 || focalX > 1 || focalY < 0 || focalY > 1) {
      removeTemporaryUploads(uploadedFiles!);
      response
        .status(400)
        .type('application/problem+json')
        .json(problem(400, 'Bad Request', 'focalX and focalY must each be between 0 and 1.'));
      return;
    }

    const scaleX = body.scaleX ?? 1;
    const scaleY = body.scaleY ?? 1;
    if (scaleX <= 0 || scaleY <= 0) {
      removeTemporaryUploads(uploadedFiles!);
      response
        .status(400)
        .type('application/problem+json')
        .json(problem(400, 'Bad Request', 'scaleX and scaleY must each be greater than zero.'));
      return;
    }

    // Nullable border overrides: an omitted or explicitly-null value keeps
    // "use the binder's current setting" (stored as `null`); a supplied
    // value is validated the same way routes/binders.ts validates the
    // binder-level setting.
    const borderColor = body.borderColor ?? null;
    if (borderColor !== null && !HEX_COLOR_PATTERN.test(borderColor)) {
      removeTemporaryUploads(uploadedFiles!);
      response
        .status(400)
        .type('application/problem+json')
        .json(
          problem(400, 'Bad Request', 'borderColor must be a six-digit #RRGGBB hexadecimal color.'),
        );
      return;
    }
    const borderRadius = body.borderRadius ?? null;
    if (borderRadius !== null && (borderRadius < 0 || borderRadius > 100)) {
      removeTemporaryUploads(uploadedFiles!);
      response
        .status(400)
        .type('application/problem+json')
        .json(problem(400, 'Bad Request', 'borderRadius must be between 0 and 100.'));
      return;
    }
    const borderWidth = body.borderWidth ?? null;
    if (borderWidth !== null && borderWidth < 0) {
      removeTemporaryUploads(uploadedFiles!);
      response
        .status(400)
        .type('application/problem+json')
        .json(problem(400, 'Bad Request', 'borderWidth must be 0 or greater.'));
      return;
    }

    let asset: ResolvedArtImageAsset;
    try {
      asset = await resolveArtImageAsset(database, imagesDirectory, uploadedFile);
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
    const newArt: ArtRow = {
      id: randomUUID(),
      binderId,
      title,
      description,
      widthSlots: body.widthSlots,
      heightSlots: body.heightSlots,
      physicalPage: null,
      row: null,
      column: null,
      imageAssetId: asset.assetId,
      imageRotationDegrees,
      focalXTenThousandths: toTenThousandths(focalX),
      focalYTenThousandths: toTenThousandths(focalY),
      scaleXTenThousandths: toTenThousandths(scaleX),
      scaleYTenThousandths: toTenThousandths(scaleY),
      borderColor: borderColor ? borderColor.toUpperCase() : null,
      borderRadiusHundredths: borderRadius === null ? null : toHundredths(borderRadius),
      borderWidthHundredths: borderWidth === null ? null : toHundredths(borderWidth),
      createdAt: now,
      updatedAt: now,
    };

    try {
      database.insert(art).values(newArt).run();
    } catch (error) {
      // The image asset row/file(s) this request just created are
      // otherwise unreferenced once the art insert fails, so they're
      // removed rather than left orphaned (planning.md).
      if (asset.newlyCreatedPaths.length > 0) {
        for (const path of asset.newlyCreatedPaths) unlinkSync(path);
        database.delete(artImageAssets).where(eq(artImageAssets.id, asset.assetId)).run();
      }
      throw error;
    }

    response.status(201).location(`/art/${newArt.id}`).json(serializeArt(newArt));
  });

  // Story 26's combined move/edit endpoint: `application/json` requests
  // move placed or unplaced art to a new placement (or to the unplaced
  // section); `multipart/form-data` requests edit the art's own metadata,
  // transform, style overrides, and (optionally) its image - branching the
  // same way `POST /binders/:binderId/cards` already does, on whether
  // express-openapi-validator's multer integration populated
  // `request.files` (see app.ts's `fileUploader` comment).
  router.patch('/art/:artId', async (request, response) => {
    const { artId } = request.params;
    const uploadedFiles = Array.isArray(request.files) ? request.files : undefined;

    const existing = database.select().from(art).where(eq(art.id, artId)).get() as
      ArtRow | undefined;
    if (!existing) {
      if (uploadedFiles) removeTemporaryUploads(uploadedFiles);
      response
        .status(404)
        .type('application/problem+json')
        .json(problem(404, 'Not Found', `No art exists with id "${artId}".`));
      return;
    }

    const binder = database.select().from(binders).where(eq(binders.id, existing.binderId)).get();
    // Unreachable in practice - `art.binderId` has a `NOT NULL ...
    // REFERENCES binders(id)` foreign key - but guarded defensively rather
    // than asserting `binder!` below.
    if (!binder) {
      if (uploadedFiles) removeTemporaryUploads(uploadedFiles);
      response
        .status(404)
        .type('application/problem+json')
        .json(problem(404, 'Not Found', 'No binder exists for this art item.'));
      return;
    }

    if (!uploadedFiles) {
      // The movement branch. `expectedPlacement` guards against a stale
      // client silently clobbering a position another request already
      // moved this art to - same "compare before writing" pattern as
      // routes/cards.ts's own move endpoint.
      const body = request.body as MoveArtRequestBody;

      if (
        existing.physicalPage !== body.expectedPlacement.physicalPage ||
        existing.row !== body.expectedPlacement.row ||
        existing.column !== body.expectedPlacement.column
      ) {
        response
          .status(409)
          .type('application/problem+json')
          .json(problem(409, 'Conflict', 'The art no longer has its expected position.'));
        return;
      }

      const placementError = validateArtPlacement(
        body.finalPlacement,
        existing.widthSlots,
        existing.heightSlots,
        binder,
      );
      if (placementError) {
        response
          .status(400)
          .type('application/problem+json')
          .json(problem(400, 'Bad Request', placementError));
        return;
      }

      try {
        const updated = database.transaction((tx) => {
          if (body.finalPlacement.physicalPage !== null) {
            const footprint = getArtFootprintCells(
              { row: body.finalPlacement.row!, column: body.finalPlacement.column! },
              existing.widthSlots,
              existing.heightSlots,
            );
            const occupied = getOccupiedCells(
              tx as unknown as DatabaseConnection['database'],
              existing.binderId,
              body.finalPlacement.physicalPage,
              { excludeArtId: artId },
            );
            const blocked = footprint.some((cell) =>
              occupied.some(
                (occupant) => occupant.row === cell.row && occupant.column === cell.column,
              ),
            );
            if (blocked) {
              throw new ArtMoveConflictError(
                'One or more slots in the destination are already occupied.',
              );
            }
          }

          tx.update(art)
            .set({
              physicalPage: body.finalPlacement.physicalPage,
              row: body.finalPlacement.row,
              column: body.finalPlacement.column,
              updatedAt: new Date().toISOString(),
            })
            .where(eq(art.id, artId))
            .run();

          return tx.select().from(art).where(eq(art.id, artId)).get()! as ArtRow;
        });

        response.status(200).json(serializeArt(updated));
      } catch (error) {
        if (error instanceof ArtMoveConflictError) {
          response
            .status(409)
            .type('application/problem+json')
            .json(problem(409, 'Conflict', error.message));
          return;
        }
        throw error;
      }
      return;
    }

    // The edit branch. Mirrors the create endpoint's own metadata
    // validation exactly (see `POST /binders/:binderId/art` above), plus
    // the optional image replacement and the move-to-unplaced-on-conflict
    // flag story 26 adds.
    const body = request.body as UpdateArtRequestBody;

    const title = body.title.trim();
    if (!title) {
      removeTemporaryUploads(uploadedFiles);
      response
        .status(400)
        .type('application/problem+json')
        .json(problem(400, 'Bad Request', 'title is required.'));
      return;
    }
    if (title.length > ART_TITLE_MAX_LENGTH) {
      removeTemporaryUploads(uploadedFiles);
      response
        .status(400)
        .type('application/problem+json')
        .json(
          problem(400, 'Bad Request', `title must be ${ART_TITLE_MAX_LENGTH} characters or fewer.`),
        );
      return;
    }

    const description = body.description?.trim() || null;
    if (description && description.length > ART_DESCRIPTION_MAX_LENGTH) {
      removeTemporaryUploads(uploadedFiles);
      response
        .status(400)
        .type('application/problem+json')
        .json(
          problem(
            400,
            'Bad Request',
            `description must be ${ART_DESCRIPTION_MAX_LENGTH} characters or fewer.`,
          ),
        );
      return;
    }

    if (body.widthSlots < 1 || body.widthSlots > binder.width) {
      removeTemporaryUploads(uploadedFiles);
      response
        .status(400)
        .type('application/problem+json')
        .json(problem(400, 'Bad Request', `widthSlots must be between 1 and ${binder.width}.`));
      return;
    }
    if (body.heightSlots < 1 || body.heightSlots > binder.height) {
      removeTemporaryUploads(uploadedFiles);
      response
        .status(400)
        .type('application/problem+json')
        .json(problem(400, 'Bad Request', `heightSlots must be between 1 and ${binder.height}.`));
      return;
    }

    const imageRotationDegrees = body.imageRotationDegrees ?? 0;
    if (![0, 90, 180, 270].includes(imageRotationDegrees)) {
      removeTemporaryUploads(uploadedFiles);
      response
        .status(400)
        .type('application/problem+json')
        .json(
          problem(400, 'Bad Request', 'imageRotationDegrees must be one of 0, 90, 180, or 270.'),
        );
      return;
    }

    const focalX = body.focalX ?? 0.5;
    const focalY = body.focalY ?? 0.5;
    if (focalX < 0 || focalX > 1 || focalY < 0 || focalY > 1) {
      removeTemporaryUploads(uploadedFiles);
      response
        .status(400)
        .type('application/problem+json')
        .json(problem(400, 'Bad Request', 'focalX and focalY must each be between 0 and 1.'));
      return;
    }

    const scaleX = body.scaleX ?? 1;
    const scaleY = body.scaleY ?? 1;
    if (scaleX <= 0 || scaleY <= 0) {
      removeTemporaryUploads(uploadedFiles);
      response
        .status(400)
        .type('application/problem+json')
        .json(problem(400, 'Bad Request', 'scaleX and scaleY must each be greater than zero.'));
      return;
    }

    const borderColor = body.borderColor ?? null;
    if (borderColor !== null && !HEX_COLOR_PATTERN.test(borderColor)) {
      removeTemporaryUploads(uploadedFiles);
      response
        .status(400)
        .type('application/problem+json')
        .json(
          problem(400, 'Bad Request', 'borderColor must be a six-digit #RRGGBB hexadecimal color.'),
        );
      return;
    }
    const borderRadius = body.borderRadius ?? null;
    if (borderRadius !== null && (borderRadius < 0 || borderRadius > 100)) {
      removeTemporaryUploads(uploadedFiles);
      response
        .status(400)
        .type('application/problem+json')
        .json(problem(400, 'Bad Request', 'borderRadius must be between 0 and 100.'));
      return;
    }
    const borderWidth = body.borderWidth ?? null;
    if (borderWidth !== null && borderWidth < 0) {
      removeTemporaryUploads(uploadedFiles);
      response
        .status(400)
        .type('application/problem+json')
        .json(problem(400, 'Bad Request', 'borderWidth must be 0 or greater.'));
      return;
    }

    let newAsset: ResolvedArtImageAsset | null = null;
    const uploadedImageFile = uploadedFiles.find((file) => file.fieldname === 'image');
    if (uploadedImageFile) {
      try {
        newAsset = await resolveArtImageAsset(database, imagesDirectory, uploadedImageFile);
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

    // If this art is currently placed, re-validate its (unchanged) anchor
    // against the possibly-changed widthSlots/heightSlots - an edit that
    // grows the footprint can push it out of bounds or into another
    // item's space even though the anchor itself didn't move.
    let placementConflict = false;
    if (existing.physicalPage !== null) {
      const placementError = validateArtPlacement(
        { physicalPage: existing.physicalPage, row: existing.row, column: existing.column },
        body.widthSlots,
        body.heightSlots,
        binder,
      );
      if (placementError) {
        placementConflict = true;
      } else {
        const footprint = getArtFootprintCells(
          { row: existing.row!, column: existing.column! },
          body.widthSlots,
          body.heightSlots,
        );
        const occupied = getOccupiedCells(database, existing.binderId, existing.physicalPage, {
          excludeArtId: artId,
        });
        placementConflict = footprint.some((cell) =>
          occupied.some((occupant) => occupant.row === cell.row && occupant.column === cell.column),
        );
      }
    }

    if (placementConflict && !body.moveToUnplacedOnConflict) {
      // The newly-uploaded image (if any) is otherwise unreferenced once
      // this request is rejected, so it's removed rather than left
      // orphaned (planning.md).
      if (newAsset && newAsset.newlyCreatedPaths.length > 0) {
        for (const path of newAsset.newlyCreatedPaths) unlinkSync(path);
        database.delete(artImageAssets).where(eq(artImageAssets.id, newAsset.assetId)).run();
      }
      response
        .status(409)
        .type('application/problem+json')
        .json(
          problem(
            409,
            'Conflict',
            'Saving these changes would leave the art out of bounds or overlapping another item.',
          ),
        );
      return;
    }

    const now = new Date().toISOString();
    const updated = database.transaction((tx) => {
      tx.update(art)
        .set({
          title,
          description,
          widthSlots: body.widthSlots,
          heightSlots: body.heightSlots,
          imageRotationDegrees,
          focalXTenThousandths: toTenThousandths(focalX),
          focalYTenThousandths: toTenThousandths(focalY),
          scaleXTenThousandths: toTenThousandths(scaleX),
          scaleYTenThousandths: toTenThousandths(scaleY),
          borderColor: borderColor ? borderColor.toUpperCase() : null,
          borderRadiusHundredths: borderRadius === null ? null : toHundredths(borderRadius),
          borderWidthHundredths: borderWidth === null ? null : toHundredths(borderWidth),
          imageAssetId: newAsset ? newAsset.assetId : existing.imageAssetId,
          ...(placementConflict ? { physicalPage: null, row: null, column: null } : {}),
          updatedAt: now,
        })
        .where(eq(art.id, artId))
        .run();
      return tx.select().from(art).where(eq(art.id, artId)).get()! as ArtRow;
    });

    // The old image asset is otherwise unreferenced once no other art item
    // still points at it - cleaned up post-commit the same way art/card
    // deletion does, so a replaced image never leaves an orphaned file.
    if (newAsset && newAsset.assetId !== existing.imageAssetId) {
      const stillReferenced = database
        .select({ id: art.id })
        .from(art)
        .where(eq(art.imageAssetId, existing.imageAssetId))
        .get();
      if (!stillReferenced) {
        const oldAsset = database
          .select()
          .from(artImageAssets)
          .where(eq(artImageAssets.id, existing.imageAssetId))
          .get();
        database.delete(artImageAssets).where(eq(artImageAssets.id, existing.imageAssetId)).run();
        if (oldAsset) {
          for (const filename of [oldAsset.storageFilename, oldAsset.normalizedStorageFilename]) {
            if (!filename) continue;
            const filePath = join(imagesDirectory, filename);
            if (existsSync(filePath)) {
              try {
                unlinkSync(filePath);
              } catch (error) {
                request.log.error(
                  { err: error, path: filePath },
                  'Failed to delete an orphaned art image file after an art edit replaced its image.',
                );
              }
            }
          }
        }
      }
    }

    response.status(200).json(serializeArt(updated));
  });

  // Story 26's art-removal endpoint, mirroring routes/cards.ts's own
  // `DELETE /cards/:cardId`: permanently deletes the identified art item,
  // then - within the same transaction - deletes its image asset's row too
  // if this was the final art item referencing it. Unlike a card's single
  // image file, an art image asset may have up to two files (the source
  // upload and an orientation-normalized derivative - see
  // `resolveArtImageAsset` above), so both are removed when orphaned.
  router.delete('/art/:artId', (request, response) => {
    const { artId } = request.params;

    const orphanedFilePaths = database.transaction((tx) => {
      const row = tx
        .select({ imageAssetId: art.imageAssetId })
        .from(art)
        .where(eq(art.id, artId))
        .get();
      // Deleting an already-absent art item is still a successful no-op,
      // matching routes/cards.ts's own delete endpoint.
      if (!row) return null;

      tx.delete(art).where(eq(art.id, artId)).run();

      const stillReferenced = tx
        .select({ id: art.id })
        .from(art)
        .where(eq(art.imageAssetId, row.imageAssetId))
        .get();
      if (stillReferenced) return null;

      const asset = tx
        .select({
          storageFilename: artImageAssets.storageFilename,
          normalizedStorageFilename: artImageAssets.normalizedStorageFilename,
        })
        .from(artImageAssets)
        .where(eq(artImageAssets.id, row.imageAssetId))
        .get();
      tx.delete(artImageAssets).where(eq(artImageAssets.id, row.imageAssetId)).run();
      if (!asset) return null;

      const paths = [join(imagesDirectory, asset.storageFilename)];
      if (asset.normalizedStorageFilename) {
        paths.push(join(imagesDirectory, asset.normalizedStorageFilename));
      }
      return paths;
    });

    if (orphanedFilePaths) {
      for (const filePath of orphanedFilePaths) {
        if (existsSync(filePath)) {
          try {
            unlinkSync(filePath);
          } catch (error) {
            request.log.error(
              { err: error, path: filePath },
              'Failed to delete an orphaned art image file after art deletion.',
            );
          }
        }
      }
    }

    response.status(204).end();
  });

  // Story 26's duplicate-art endpoint: creates a new, always-unplaced art
  // item sharing the source item's image asset and every editable
  // property. Idempotency-key-aware (planning.md: "Each duplicate action
  // uses a client-generated UUID idempotency key; retries reuse that key,
  // and the backend retains and replays the outcome for the shared
  // 24-hour mutation-idempotency period") so a client retrying a
  // duplicate request after a dropped response never creates a second
  // copy.
  router.post('/art/:artId/duplicate', (request, response) => {
    const { artId } = request.params;
    const idempotencyKey = request.header('Idempotency-Key');
    if (!idempotencyKey) {
      response
        .status(400)
        .type('application/problem+json')
        .json(problem(400, 'Bad Request', 'An Idempotency-Key header is required.'));
      return;
    }

    const replayed = findIdempotentOutcome(database, 'art-duplicate', idempotencyKey);
    if (replayed) {
      const replayedResponse = response.status(replayed.responseStatus);
      if (replayed.locationHeader) replayedResponse.location(replayed.locationHeader);
      replayedResponse.json(replayed.responseBody);
      return;
    }

    const source = database.select().from(art).where(eq(art.id, artId)).get() as ArtRow | undefined;
    if (!source) {
      response
        .status(404)
        .type('application/problem+json')
        .json(problem(404, 'Not Found', `No art exists with id "${artId}".`));
      return;
    }

    const now = new Date().toISOString();
    const duplicate: ArtRow = {
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

    database.insert(art).values(duplicate).run();

    const responseBody = serializeArt(duplicate);
    const locationHeader = `/art/${duplicate.id}`;
    saveIdempotentOutcome(database, 'art-duplicate', idempotencyKey, {
      responseStatus: 201,
      responseBody,
      locationHeader,
    });

    response.status(201).location(locationHeader).json(responseBody);
  });

  // Story 25's image-streaming endpoint. Serves the orientation-normalized
  // derivative when one exists; falls back to the source bytes otherwise -
  // both are already correctly oriented for rendering purposes.
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

  return router;
}

// Replaces the placeholder `[]`-returning implementation in
// routes/binders.ts: returns every binder-owned art item, placed and
// unplaced. Ordered by creation timestamp descending, then id ascending,
// matching listCardsForBinder's tie-breaking rule (story 25).
export function listArtForBinder(database: DatabaseConnection['database'], binderId: string) {
  return database
    .select()
    .from(art)
    .where(eq(art.binderId, binderId))
    .orderBy(desc(art.createdAt), asc(art.id))
    .all()
    .map(serializeArt);
}

// Story 20 ("Add a binder preview"): the multi-slot art placed within the
// binder list's embedded preview spread, narrowed to only the physical
// pages the resolved spread actually shows. Returns the minimal
// `BinderPreviewArt` placement/geometry/image shape rather than the
// complete `Art` row, deliberately excluding the art's own
// title/description/timestamps - the raw (still-nullable)
// borderColor/borderRadius/borderWidth overrides are passed through
// unresolved, same as `Art` itself, so the frontend resolves them against
// the binder's own style the same way it already does for the full layout.
export function listPlacedArtForPreview(
  database: DatabaseConnection['database'],
  binderId: string,
  physicalPages: number[],
) {
  if (physicalPages.length === 0) return [];

  return database
    .select()
    .from(art)
    .where(and(eq(art.binderId, binderId), inArray(art.physicalPage, physicalPages)))
    .all()
    .map((row) => {
      const typedRow = row as ArtRow;
      return {
        // `physicalPage`/`row`/`column` are guaranteed non-null here, same
        // reasoning as `listPlacedCardsForPreview`.
        physicalPage: typedRow.physicalPage as number,
        row: typedRow.row as number,
        column: typedRow.column as number,
        widthSlots: typedRow.widthSlots,
        heightSlots: typedRow.heightSlots,
        imageUrl: `/art/${typedRow.id}/image`,
        imageRotationDegrees: typedRow.imageRotationDegrees,
        focalX: fromTenThousandths(typedRow.focalXTenThousandths),
        focalY: fromTenThousandths(typedRow.focalYTenThousandths),
        scaleX: fromTenThousandths(typedRow.scaleXTenThousandths),
        scaleY: fromTenThousandths(typedRow.scaleYTenThousandths),
        borderColor: typedRow.borderColor,
        borderRadius:
          typedRow.borderRadiusHundredths === null
            ? null
            : fromHundredths(typedRow.borderRadiusHundredths),
        borderWidth:
          typedRow.borderWidthHundredths === null
            ? null
            : fromHundredths(typedRow.borderWidthHundredths),
      };
    });
}
