import { randomUUID } from 'node:crypto';
import { closeSync, existsSync, openSync, readSync, renameSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';

import { eq } from 'drizzle-orm';
import sharp from 'sharp';

import type { DatabaseConnection } from '../../database/client.js';
import { artImageAssets } from '../../database/schema.js';
import { detectImageFormat } from '../../images/imageFormat.js';

import { isUniqueConstraintError } from './validation.js';

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

// Mirrors routes/cards/imageAssets.ts's own filename sanitizer.
function sanitizeOriginalFilename(originalFilename: string): string {
  const basename = originalFilename.split(/[/\\]/).pop() ?? '';
  const sanitized = basename.replace(/[^a-zA-Z0-9 ._-]/g, '').trim();
  return sanitized.slice(0, 255) || 'upload';
}

export class UnsupportedImageFormatError extends Error {
  constructor() {
    super('The uploaded file is not a supported image format (JPEG, PNG, or WebP).');
    this.name = 'UnsupportedImageFormatError';
  }
}

// Deletes any files multer already streamed to temporary storage for this
// request - used on every validation failure that occurs before the image
// asset takes ownership of the file, so a rejected request never leaves an
// orphaned temporary file behind.
export function removeTemporaryUploads(files: Express.Multer.File[]): void {
  for (const file of files) {
    if (existsSync(file.path)) {
      unlinkSync(file.path);
    }
  }
}

export interface ResolvedArtImageAsset {
  assetId: string;
  // Set only when this request installed brand-new file(s) for this asset
  // (i.e. it wasn't already shared by another art item), so a subsequent
  // art-insert failure knows it must remove the row and file(s) rather
  // than leaving a still-referenced shared asset orphaned.
  newlyCreatedPaths: string[];
}

// Finds or creates the shared local image asset for an art upload (story
// 25), mirroring routes/cards/imageAssets.ts's `resolveCustomImageAsset`
// dedupe/ concurrent-race pattern. Additionally uses `sharp` to inspect the
// correctly-oriented pixel dimensions and, when the source JPEG's EXIF
// orientation isn't already "normal", generate an immutable auto-oriented
// rendering derivative (planning.md) - every renderer serves that
// derivative when present and falls back to the source bytes otherwise.
// `uploadedFile.path` is always consumed by this function - either deleted
// (a duplicate) or renamed into place - so the caller never needs to
// remove it itself once this function is called.
export async function resolveArtImageAsset(
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
