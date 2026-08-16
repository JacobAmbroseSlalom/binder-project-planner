import { randomUUID } from 'node:crypto';
import {
  closeSync,
  existsSync,
  mkdirSync,
  openSync,
  readSync,
  renameSync,
  unlinkSync,
} from 'node:fs';
import { join } from 'node:path';

import { and, eq } from 'drizzle-orm';

import type { DatabaseConnection } from '../../database/client.js';
import { cardImageAssets } from '../../database/schema.js';
import { detectImageFormat } from '../../images/imageFormat.js';
import {
  downloadPokemonTcgCardImage,
  PokemonTcgProviderError,
} from '../../integrations/pokemontcg/index.js';
import { downloadCardImage, TcgDexProviderError } from '../../integrations/tcgdex.js';

// better-sqlite3 surfaces unique-constraint violations as a `SqliteError`
// with `.code === 'SQLITE_CONSTRAINT_UNIQUE'`; matches the pattern already
// used by routes/binders/. Exported for reuse by routes/watchlistEntries/
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
// Exported for reuse by routes/watchlistEntries/ (story 45).
export class UnsupportedImageFormatError extends Error {
  constructor() {
    super('The uploaded file is not a supported image format (JPEG, PNG, or WebP).');
    this.name = 'UnsupportedImageFormatError';
  }
}

// Deletes any files multer already streamed to temporary storage for this
// request (story 12) - used on every custom-card validation failure that
// occurs before `resolveCustomImageAsset` takes ownership of the file, so a
// rejected request never leaves an orphaned temporary file behind. Exported
// for reuse by routes/watchlistEntries/ (story 45).
export function removeTemporaryUploads(files: Express.Multer.File[]): void {
  for (const file of files) {
    if (existsSync(file.path)) {
      unlinkSync(file.path);
    }
  }
}

// Exported for reuse by routes/watchlistEntries/ (story 45).
export interface ResolvedImageAsset {
  assetId: string;
  // Set only when this request downloaded and installed a brand-new file
  // for this asset (i.e. it wasn't already shared by another card), so a
  // subsequent card-insert failure knows it must remove both the row and
  // the file rather than leaving it as a still-referenced shared asset.
  newlyCreatedFilePath: string | null;
}

// Finds or creates the shared local image asset for a provider-sourced
// card (planning.md: "TCGdex card instances with the same provider card ID
// share one local image-asset record and file"; story 43 extends this to
// pokemontcg.io, keyed by `source` together with `providerCardId` so the
// two providers' independently-minted ids can never collide into a
// shared, wrong-provider asset). Downloads only happen when no existing
// asset is found; a concurrent duplicate download that loses the database
// race is discarded in favor of the winner's asset. Only the
// identity/image fields a provider card's shared asset actually keys on
// are needed here (used by the bulk create-cards endpoint, stories 17,
// 18, 43). Exported for reuse by routes/watchlistEntries/ (story 45).
export async function resolveCardCatalogImageAsset(
  database: DatabaseConnection['database'],
  imagesDirectory: string,
  body: {
    source: 'tcgdex' | 'pokemontcg';
    providerCardId: string;
    providerSetId: string;
    imageUrl: string;
  },
  signal: AbortSignal,
): Promise<ResolvedImageAsset> {
  const existing = database
    .select()
    .from(cardImageAssets)
    .where(
      and(
        eq(cardImageAssets.source, body.source),
        eq(cardImageAssets.providerCardId, body.providerCardId),
      ),
    )
    .get();
  if (existing) {
    return { assetId: existing.id, newlyCreatedFilePath: null };
  }

  mkdirSync(imagesDirectory, { recursive: true });
  const tempPath = join(imagesDirectory, `${randomUUID()}.tmp`);
  if (body.source === 'tcgdex') {
    await downloadCardImage(body.imageUrl, tempPath, signal);
  } else {
    await downloadPokemonTcgCardImage(body.imageUrl, tempPath, signal);
  }

  const format = detectImageFormat(readFileHeader(tempPath, 12));
  if (!format) {
    unlinkSync(tempPath);
    throw body.source === 'tcgdex'
      ? new TcgDexProviderError('The downloaded TCGdex image was not a supported format.')
      : new PokemonTcgProviderError(
          'The downloaded pokemontcg.io image was not a supported format.',
        );
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
        source: body.source,
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
      // Lost a concurrent race to assign the same provider card; discard
      // our own duplicate download and reuse the winner's asset.
      unlinkSync(finalPath);
      const winner = database
        .select()
        .from(cardImageAssets)
        .where(
          and(
            eq(cardImageAssets.source, body.source),
            eq(cardImageAssets.providerCardId, body.providerCardId),
          ),
        )
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
// (story 12), mirroring `resolveCardCatalogImageAsset`'s dedupe/concurrent-
// race pattern but keyed by the SHA-256 digest `createDigestDiskStorage`
// already computed while streaming the upload to temporary storage, rather
// than a provider card ID. `uploadedFile.path` is always consumed by this
// function - either deleted (a duplicate) or renamed into place - so the
// caller never needs to remove it itself once this function is called.
// Exported for reuse by routes/watchlistEntries/ (story 45).
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
