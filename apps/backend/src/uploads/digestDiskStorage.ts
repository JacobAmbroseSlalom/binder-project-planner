import { createHash, randomUUID } from 'node:crypto';
import { createWriteStream } from 'node:fs';
import { mkdir, unlink } from 'node:fs/promises';
import { join } from 'node:path';

import type { StorageEngine } from 'multer';

// TypeScript's ambient global module augmentation requires the `namespace`
// keyword (there's no ES2015-module equivalent for reopening an existing
// `declare global` namespace like `Express.Multer`), so the general
// `no-namespace` lint rule is disabled just for this required pattern.
/* eslint-disable @typescript-eslint/no-namespace */
declare global {
  namespace Express {
    namespace Multer {
      interface File {
        // Set by `createDigestDiskStorage`'s custom storage engine (story
        // 12): the SHA-256 hex digest computed while this file's bytes were
        // streamed to temporary storage, so the route handler can dedupe
        // identical custom-card uploads without a second read pass over the
        // file.
        sha256Digest?: string;
      }
    }
  }
}

// A multer storage engine used for custom-card image uploads (story 12).
// Streams each uploaded file directly to a temporary file under
// `directory` - never buffering the complete upload in memory, per the
// story's "no application-level byte-size limit" requirement - while
// simultaneously computing a SHA-256 digest of its bytes as they arrive.
// The digest is attached to the resulting `Express.Multer.File` object as
// `sha256Digest` (see the module augmentation above) so the route handler
// can dedupe identical uploads and reuse a shared image asset.
export function createDigestDiskStorage(directory: string): StorageEngine {
  return {
    _handleFile(_request, file, callback) {
      mkdir(directory, { recursive: true })
        .then(() => {
          // A `.tmp`-suffixed random filename, matching the temporary-file
          // naming convention `resolveTcgDexImageAsset` already uses in
          // routes/cards.ts; renamed to its final `{assetId}.{extension}`
          // name only once the upload is validated and persisted.
          const tempPath = join(directory, `${randomUUID()}.tmp`);
          const hash = createHash('sha256');
          const writeStream = createWriteStream(tempPath);

          file.stream.on('data', (chunk: Buffer) => hash.update(chunk));
          file.stream.on('error', (error) => writeStream.destroy(error));
          writeStream.on('error', (error) => callback(error));
          writeStream.on('finish', () => {
            callback(null, {
              path: tempPath,
              destination: directory,
              filename: tempPath,
              size: writeStream.bytesWritten,
              sha256Digest: hash.digest('hex'),
            });
          });

          file.stream.pipe(writeStream);
        })
        .catch((error) => callback(error));
    },
    _removeFile(_request, file, callback) {
      unlink(file.path).then(
        () => callback(null),
        (error: unknown) => callback(error instanceof Error ? error : new Error(String(error))),
      );
    },
  };
}
