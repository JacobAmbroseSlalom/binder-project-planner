import { createHash, randomUUID } from 'node:crypto';
import {
  copyFileSync,
  createReadStream,
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  unlinkSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  EXPORT_FORMAT_VERSION,
  generateUniqueBinderCopyName,
  IMPORT_STAGING_TTL_MS,
} from '@binder-project-planner/shared';
import AdmZip from 'adm-zip';
import { Router } from 'express';

import type { DatabaseConnection } from '../database/client.js';
import { getCurrentSchemaVersion } from '../database/schemaVersion.js';
import { art, artImageAssets, binders, cardImageAssets, cards } from '../database/schema.js';

// Story 33: "Export and import all application data". Produces and consumes
// a single portable ZIP archive containing a manifest, a JSON dump of the
// durable domain tables, and the referenced image files - see planning.md
// for the full contract. Import is a two-step flow (validate + stage, then
// commit by token) so the user can confirm before anything changes.

// The durable domain tables included in an export; the transient
// `mutation_idempotency` and environment `app_metadata` tables are
// deliberately excluded (no secrets/env config in the archive).
type ExportData = {
  binders: (typeof binders.$inferSelect)[];
  card_image_assets: (typeof cardImageAssets.$inferSelect)[];
  cards: (typeof cards.$inferSelect)[];
  art_image_assets: (typeof artImageAssets.$inferSelect)[];
  art: (typeof art.$inferSelect)[];
};

interface ArchiveManifest {
  format: string;
  formatVersion: number;
  schemaVersion: string;
  exportedAt: string;
  tableRowCounts: Record<string, number>;
  images: { filename: string; sha256: string }[];
}

// The fixed manifest `format` marker identifying an archive as this app's
// full-data export.
const ARCHIVE_FORMAT = 'binder-project-planner-export';

// Counts of what a commit will add, surfaced by both validate (a preview)
// and commit (the result).
interface ImportSummary {
  binders: number;
  cards: number;
  art: number;
  // Image assets newly created (their bytes copied in) vs. deduplicated
  // against an identical asset already present locally.
  newImages: number;
  dedupedImages: number;
}

// The fully-resolved, ready-to-apply import plan produced from the archive's
// data dump plus the current database's contents (for asset dedup and
// binder-name collision handling). Shared by validate (for the summary) and
// commit (for execution) so both agree exactly.
interface ImportPlan {
  binderRows: (typeof binders.$inferInsert)[];
  cardRows: (typeof cards.$inferInsert)[];
  artRows: (typeof art.$inferInsert)[];
  cardAssetRows: (typeof cardImageAssets.$inferInsert)[];
  artAssetRows: (typeof artImageAssets.$inferInsert)[];
  // New asset files to copy from the archive's `images/` folder into the
  // images directory, under fresh backend-generated names.
  fileCopies: { sourceFilename: string; targetFilename: string }[];
  summary: ImportSummary;
}

// A staged (validated but not yet committed) import: the extracted archive's
// temporary directory and when it expires.
interface StagedImport {
  directory: string;
  expiresAt: number;
}

// Root directory for extracted, staged imports awaiting commit.
const stagingRoot = join(tmpdir(), 'binder-project-planner-import-staging');

// In-memory registry of staged imports keyed by the token returned to the
// client; process-local (a staged import doesn't survive a restart, which
// is fine - the user simply re-uploads).
const stagedImports = new Map<string, StagedImport>();

// Removes expired staged imports (their temp directories and registry
// entries), called opportunistically on each validate/commit rather than on
// a timer.
function pruneExpiredStagedImports(): void {
  const now = Date.now();
  for (const [token, staged] of stagedImports) {
    if (staged.expiresAt > now) continue;
    if (existsSync(staged.directory)) {
      try {
        rmSync(staged.directory, { recursive: true, force: true });
      } catch {
        // Best-effort cleanup; a leftover temp directory is harmless.
      }
    }
    stagedImports.delete(token);
  }
}

// Removes one staged import (its directory and registry entry).
function removeStagedImport(token: string): void {
  const staged = stagedImports.get(token);
  if (staged && existsSync(staged.directory)) {
    try {
      rmSync(staged.directory, { recursive: true, force: true });
    } catch {
      // Best-effort cleanup.
    }
  }
  stagedImports.delete(token);
}

function badRequestProblem(detail: string) {
  return { type: 'about:blank', title: 'Bad Request', status: 400, detail };
}

// Validates the archive's manifest and data dump against the running app's
// format/schema version and internal referential integrity, returning a
// descriptive error message when invalid or `null` when valid. Does not
// touch the database or filesystem.
function validateArchive(zip: AdmZip, manifest: unknown, data: unknown): string | null {
  const m = manifest as Partial<ArchiveManifest> | null;
  if (!m || typeof m !== 'object') return 'The archive manifest is missing or malformed.';
  if (m.format !== ARCHIVE_FORMAT) return 'The archive is not a Binder Project Planner export.';
  if (m.formatVersion !== EXPORT_FORMAT_VERSION) {
    return `Unsupported export format version ${String(m.formatVersion)}; expected ${EXPORT_FORMAT_VERSION}.`;
  }
  const currentSchema = getCurrentSchemaVersion();
  if (m.schemaVersion !== currentSchema) {
    return `The archive's data schema (${String(m.schemaVersion)}) does not match this application's (${currentSchema}).`;
  }
  if (!Array.isArray(m.images)) return 'The archive manifest is missing its image list.';

  const d = data as Partial<ExportData> | null;
  if (!d || typeof d !== 'object') return 'The archive data is missing or malformed.';
  const tables: (keyof ExportData)[] = [
    'binders',
    'card_image_assets',
    'cards',
    'art_image_assets',
    'art',
  ];
  for (const table of tables) {
    if (!Array.isArray(d[table])) return `The archive data is missing the "${table}" table.`;
  }

  // Every manifest-listed image must be present and byte-for-byte intact.
  for (const image of m.images) {
    const entry = zip.getEntry(`images/${image.filename}`);
    if (!entry) return `The archive is missing image file "${image.filename}".`;
    const actual = createHash('sha256').update(entry.getData()).digest('hex');
    if (actual !== image.sha256) return `Image file "${image.filename}" is corrupted.`;
  }

  // Referential integrity within the dump: every card/art must point at a
  // binder and image asset that the dump also contains.
  const binderIds = new Set(d.binders!.map((row) => row.id));
  const cardAssetIds = new Set(d.card_image_assets!.map((row) => row.id));
  const artAssetIds = new Set(d.art_image_assets!.map((row) => row.id));
  for (const card of d.cards!) {
    if (!binderIds.has(card.binderId)) return `Card "${card.id}" references a missing binder.`;
    if (!cardAssetIds.has(card.imageAssetId)) {
      return `Card "${card.id}" references a missing image asset.`;
    }
  }
  for (const item of d.art!) {
    if (!binderIds.has(item.binderId)) return `Art "${item.id}" references a missing binder.`;
    if (!artAssetIds.has(item.imageAssetId)) {
      return `Art "${item.id}" references a missing image asset.`;
    }
  }

  return null;
}

// Builds the ready-to-apply import plan from a validated data dump plus the
// current database contents. Assets are deduped against existing local
// assets (by SHA-256 digest, or provider card id for TCGdex cards); binders,
// cards, and art always become new records with freshly generated ids and
// rewritten foreign keys. Pure over (database, data), so validate and commit
// produce identical plans.
function planImport(database: DatabaseConnection['database'], data: ExportData): ImportPlan {
  // Existing-asset dedup lookups.
  const existingCardByDigest = new Map<string, string>();
  const existingCardByProvider = new Map<string, string>();
  for (const asset of database.select().from(cardImageAssets).all()) {
    if (asset.sha256Digest) existingCardByDigest.set(asset.sha256Digest, asset.id);
    if (asset.providerCardId) existingCardByProvider.set(asset.providerCardId, asset.id);
  }
  const existingArtByDigest = new Map<string, string>();
  for (const asset of database.select().from(artImageAssets).all()) {
    existingArtByDigest.set(asset.sha256Digest, asset.id);
  }

  const fileCopies: { sourceFilename: string; targetFilename: string }[] = [];

  // Card image assets: reuse an existing local asset when its bytes
  // (digest) or provider card id already exist; otherwise create a new
  // asset with a fresh id and storage filename and plan its file copy.
  const cardAssetRemap = new Map<string, string>();
  const cardAssetRows: (typeof cardImageAssets.$inferInsert)[] = [];
  for (const asset of data.card_image_assets) {
    const byDigest = asset.sha256Digest ? existingCardByDigest.get(asset.sha256Digest) : undefined;
    const byProvider = asset.providerCardId
      ? existingCardByProvider.get(asset.providerCardId)
      : undefined;
    const existingId = byDigest ?? byProvider;
    if (existingId) {
      cardAssetRemap.set(asset.id, existingId);
      continue;
    }
    const newId = randomUUID();
    const targetFilename = `${newId}.${asset.fileExtension}`;
    cardAssetRows.push({ ...asset, id: newId, storageFilename: targetFilename });
    fileCopies.push({ sourceFilename: asset.storageFilename, targetFilename });
    cardAssetRemap.set(asset.id, newId);
  }

  // Art image assets: same dedup, plus the optional orientation-normalized
  // derivative gets its own fresh filename and copy.
  const artAssetRemap = new Map<string, string>();
  const artAssetRows: (typeof artImageAssets.$inferInsert)[] = [];
  for (const asset of data.art_image_assets) {
    const existingId = existingArtByDigest.get(asset.sha256Digest);
    if (existingId) {
      artAssetRemap.set(asset.id, existingId);
      continue;
    }
    const newId = randomUUID();
    const targetFilename = `${newId}.${asset.fileExtension}`;
    let newNormalized: string | null = null;
    if (asset.normalizedStorageFilename) {
      newNormalized = `${randomUUID()}.${asset.fileExtension}`;
      fileCopies.push({
        sourceFilename: asset.normalizedStorageFilename,
        targetFilename: newNormalized,
      });
    }
    artAssetRows.push({
      ...asset,
      id: newId,
      storageFilename: targetFilename,
      normalizedStorageFilename: newNormalized,
    });
    fileCopies.push({ sourceFilename: asset.storageFilename, targetFilename });
    artAssetRemap.set(asset.id, newId);
  }

  // Binders: always new records. A name that collides with an existing
  // binder (or an already-planned imported binder) is made unique via the
  // shared copy-name algorithm so existing binders are never modified.
  const existingNormalizedNames = new Set(
    database
      .select({ normalizedName: binders.normalizedName })
      .from(binders)
      .all()
      .map((row) => row.normalizedName),
  );
  const binderRemap = new Map<string, string>();
  const binderRows: (typeof binders.$inferInsert)[] = [];
  for (const binder of data.binders) {
    const newId = randomUUID();
    let name = binder.name;
    if (existingNormalizedNames.has(binder.normalizedName)) {
      name = generateUniqueBinderCopyName(existingNormalizedNames, binder.name);
    }
    const normalizedName = name.toLowerCase();
    existingNormalizedNames.add(normalizedName);
    binderRows.push({ ...binder, id: newId, name, normalizedName });
    binderRemap.set(binder.id, newId);
  }

  // Cards and art: new records with binder/image-asset foreign keys
  // rewritten to their remapped ids.
  const cardRows: (typeof cards.$inferInsert)[] = data.cards.map((card) => ({
    ...card,
    id: randomUUID(),
    binderId: binderRemap.get(card.binderId)!,
    imageAssetId: cardAssetRemap.get(card.imageAssetId)!,
  }));
  const artRows: (typeof art.$inferInsert)[] = data.art.map((item) => ({
    ...item,
    id: randomUUID(),
    binderId: binderRemap.get(item.binderId)!,
    imageAssetId: artAssetRemap.get(item.imageAssetId)!,
  }));

  const newImages = cardAssetRows.length + artAssetRows.length;
  const dedupedImages = data.card_image_assets.length + data.art_image_assets.length - newImages;

  return {
    binderRows,
    cardRows,
    artRows,
    cardAssetRows,
    artAssetRows,
    fileCopies,
    summary: {
      binders: binderRows.length,
      cards: cardRows.length,
      art: artRows.length,
      newImages,
      dedupedImages,
    },
  };
}

export function createDataTransferRouter(
  database: DatabaseConnection['database'],
  imagesDirectory: string,
): Router {
  const router = Router();

  // Full-data export (story 33): builds the ZIP in a request-scoped
  // temporary file, then streams and removes it (mirroring the story 29/30
  // PDF exports). Read-only, so never restricted by binder lock state.
  router.get('/exports/data', (_request, response, next) => {
    try {
      const data: ExportData = {
        binders: database.select().from(binders).all(),
        card_image_assets: database.select().from(cardImageAssets).all(),
        cards: database.select().from(cards).all(),
        art_image_assets: database.select().from(artImageAssets).all(),
        art: database.select().from(art).all(),
      };

      // Every image file referenced by an exported asset, deduplicated by
      // filename (storage filenames are unique per asset).
      const imageFilenames = new Set<string>();
      for (const asset of data.card_image_assets) imageFilenames.add(asset.storageFilename);
      for (const asset of data.art_image_assets) {
        imageFilenames.add(asset.storageFilename);
        if (asset.normalizedStorageFilename) imageFilenames.add(asset.normalizedStorageFilename);
      }

      const zip = new AdmZip();
      const images: { filename: string; sha256: string }[] = [];
      for (const filename of imageFilenames) {
        const filePath = join(imagesDirectory, filename);
        if (!existsSync(filePath)) {
          // A referenced image file is missing on disk - the export can't
          // produce an archive that would pass its own import validation,
          // so fail rather than emit a broken archive.
          throw new Error(`Referenced image file "${filename}" is missing from storage.`);
        }
        const bytes = readFileSync(filePath);
        images.push({ filename, sha256: createHash('sha256').update(bytes).digest('hex') });
        zip.addFile(`images/${filename}`, bytes);
      }

      const manifest: ArchiveManifest = {
        format: ARCHIVE_FORMAT,
        formatVersion: EXPORT_FORMAT_VERSION,
        schemaVersion: getCurrentSchemaVersion(),
        exportedAt: new Date().toISOString(),
        tableRowCounts: {
          binders: data.binders.length,
          card_image_assets: data.card_image_assets.length,
          cards: data.cards.length,
          art_image_assets: data.art_image_assets.length,
          art: data.art.length,
        },
        images,
      };
      zip.addFile('manifest.json', Buffer.from(JSON.stringify(manifest, null, 2)));
      zip.addFile('data.json', Buffer.from(JSON.stringify(data)));

      mkdirSync(tmpdir(), { recursive: true });
      const tempFilePath = join(tmpdir(), `binder-project-planner-export-${randomUUID()}.zip`);
      zip.writeZip(tempFilePath);

      const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
      response
        .status(200)
        .type('application/zip')
        .set(
          'Content-Disposition',
          `attachment; filename="binder-project-planner-export-${timestamp}.zip"`,
        );

      const readStream = createReadStream(tempFilePath);
      readStream.pipe(response);
      response.once('close', () => {
        if (existsSync(tempFilePath)) {
          try {
            unlinkSync(tempFilePath);
          } catch {
            // Best-effort cleanup of the throwaway archive.
          }
        }
      });
    } catch (error) {
      next(error);
    }
  });

  // Import step 1 (story 33): validate the uploaded archive and, if valid,
  // stage its extracted contents under a token for a later commit. Changes
  // nothing in the database or images directory.
  router.post('/imports/data/validate', (request, response, next) => {
    pruneExpiredStagedImports();

    const uploadedFiles = Array.isArray(request.files) ? request.files : undefined;
    const uploadedFile = uploadedFiles?.find((file) => file.fieldname === 'archive');
    if (!uploadedFile) {
      response
        .status(400)
        .type('application/problem+json')
        .json(badRequestProblem('An archive file is required.'));
      return;
    }

    try {
      let zip: AdmZip;
      try {
        zip = new AdmZip(uploadedFile.path);
      } catch {
        response
          .status(400)
          .type('application/problem+json')
          .json(badRequestProblem('The uploaded file is not a readable ZIP archive.'));
        return;
      }

      const manifestEntry = zip.getEntry('manifest.json');
      const dataEntry = zip.getEntry('data.json');
      if (!manifestEntry || !dataEntry) {
        response
          .status(400)
          .type('application/problem+json')
          .json(badRequestProblem('The archive is missing its manifest or data file.'));
        return;
      }

      let manifest: unknown;
      let data: unknown;
      try {
        manifest = JSON.parse(manifestEntry.getData().toString('utf8'));
        data = JSON.parse(dataEntry.getData().toString('utf8'));
      } catch {
        response
          .status(400)
          .type('application/problem+json')
          .json(badRequestProblem('The archive manifest or data file is not valid JSON.'));
        return;
      }

      const validationError = validateArchive(zip, manifest, data);
      if (validationError) {
        response
          .status(400)
          .type('application/problem+json')
          .json(badRequestProblem(validationError));
        return;
      }

      // Stage the extracted archive for a later commit.
      const token = randomUUID();
      const directory = join(stagingRoot, token);
      mkdirSync(directory, { recursive: true });
      zip.extractAllTo(directory, true);
      stagedImports.set(token, { directory, expiresAt: Date.now() + IMPORT_STAGING_TTL_MS });

      const { summary } = planImport(database, data as ExportData);
      response.status(200).json({ token, summary });
    } catch (error) {
      next(error);
    } finally {
      // The uploaded temp file has been read (and extracted) - remove it.
      if (existsSync(uploadedFile.path)) {
        try {
          unlinkSync(uploadedFile.path);
        } catch {
          // Best-effort cleanup.
        }
      }
    }
  });

  // Import step 2 (story 33): commit a previously validated+staged archive
  // by token. Copies any new image files in, then inserts every remapped
  // record in one transaction; on any failure the transaction rolls back
  // and the just-copied files are removed, leaving existing data unchanged.
  router.post('/imports/data/commit', (request, response, next) => {
    pruneExpiredStagedImports();

    const { token } = request.body as { token: string };
    const staged = stagedImports.get(token);
    if (!staged) {
      response.status(404).type('application/problem+json').json({
        type: 'about:blank',
        title: 'Not Found',
        status: 404,
        detail: 'No staged import exists for this token; it may have expired. Please re-upload.',
      });
      return;
    }

    const stagingImagesDirectory = join(staged.directory, 'images');
    const copiedTargetPaths: string[] = [];
    try {
      const data = JSON.parse(
        readFileSync(join(staged.directory, 'data.json'), 'utf8'),
      ) as ExportData;
      const plan = planImport(database, data);

      // Copy new image files in first (under their fresh unique names), so
      // they exist before the records that reference them are committed.
      mkdirSync(imagesDirectory, { recursive: true });
      for (const copy of plan.fileCopies) {
        const target = join(imagesDirectory, copy.targetFilename);
        copyFileSync(join(stagingImagesDirectory, copy.sourceFilename), target);
        copiedTargetPaths.push(target);
      }

      database.transaction((tx) => {
        for (const row of plan.cardAssetRows) tx.insert(cardImageAssets).values(row).run();
        for (const row of plan.artAssetRows) tx.insert(artImageAssets).values(row).run();
        for (const row of plan.binderRows) tx.insert(binders).values(row).run();
        for (const row of plan.cardRows) tx.insert(cards).values(row).run();
        for (const row of plan.artRows) tx.insert(art).values(row).run();
      });

      removeStagedImport(token);
      response.status(200).json({ summary: plan.summary });
    } catch (error) {
      // Roll back the copied files (the DB transaction already rolled back
      // itself), so a failed import adds nothing.
      for (const target of copiedTargetPaths) {
        if (existsSync(target)) {
          try {
            unlinkSync(target);
          } catch {
            // Best-effort cleanup.
          }
        }
      }
      removeStagedImport(token);
      next(error);
    }
  });

  return router;
}
