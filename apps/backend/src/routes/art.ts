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
import { asc, desc, eq } from 'drizzle-orm';
import { Router } from 'express';
import sharp from 'sharp';

import type { DatabaseConnection } from '../database/client.js';
import { art, artImageAssets, binders } from '../database/schema.js';
import { detectImageFormat } from '../images/imageFormat.js';

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
