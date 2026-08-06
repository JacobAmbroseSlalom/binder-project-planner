# 33. Export and import all application data

**Status:** Done (2026-08-04 00:34 EDT) - implemented per the technical requirements below. Backend: a new `dataTransfer` router with `GET /exports/data` (streams a `adm-zip` archive of `manifest.json` + `data.json` + `images/` from a request-scoped temp file), `POST /imports/data/validate` (validates format/schema-version/image-integrity/referential-integrity, then stages the extracted archive under a token with a 30-minute TTL and returns a preview summary), and `POST /imports/data/commit` (copies new image files in, then inserts remapped records in one transaction, rolling back files on failure). Image assets dedupe against existing by digest/provider-id; binders/cards/art are always new with fresh UUIDs and rewritten FKs, binder-name collisions resolved via `generateUniqueBinderCopyName`. Schema version comes from the newest drizzle migration tag; `EXPORT_FORMAT_VERSION`/`IMPORT_STAGING_TTL_MS` live in shared defaults. Frontend: `Export data`/`Import data` buttons in their own centered row on the home page (the create button stays centered), export downloads the zip, import validates then shows an `ImportConfirmDialog` with the counts and commits on confirm (reloading to refresh the list), all using the shared loading component and save-status toast.

#### Acceptance criteria

- The application has actions for exporting and importing all application data.
- Exporting creates a single portable archive that can be moved to another application instance or data-storage location.
- The export archive includes all contents of the application database.
- The export archive includes every application-managed image file, including original images uploaded for custom cards and multi-slot art.
- The export preserves record identifiers and image references so imported records remain connected to the correct image files.
- The export includes a manifest identifying the archive format and data-schema version.
- Secrets and environment-specific configuration are not included in the export archive.
- Importing accepts an archive created by the application's full-data export.
- Before changing current data, the import validates the archive format, schema compatibility, database contents, required image files, and image references.
- An invalid or incomplete archive is rejected without changing the current database or image files.
- A valid import displays a confirmation that importing will add the archive's database contents and image files to the current application data.
- Cancelling the confirmation leaves all current data unchanged.
- Confirming the import adds every database record and image file from the archive without overwriting or deleting existing records or files.
- Existing application elements remain unchanged even when imported elements contain matching identifiers, names, or image filenames.
- Imported record identifiers are remapped when needed, and all relationships between imported records are updated to use the remapped identifiers.
- Imported image filenames or storage paths are remapped when needed, and imported records continue to reference the correct imported images.
- Imported elements are added as new elements rather than merged with equivalent existing elements.
- Database records and image files are added as one atomic operation.
- If any part of the import fails, no imported records or image files are added and all existing data remains unchanged.
- Locked binders and their complete data are included in exports and can be added through import without changing existing binders.
- Export and import use the shared loading component while processing and the shared save-status toast when the operation succeeds or fails.

#### Technical requirements

##### Archive format

- The export archive is a single ZIP file produced and consumed by the backend using the `adm-zip` dependency (a single read+write library).
- The archive contains exactly: `manifest.json` (metadata), `data.json` (the database dump), and an `images/` directory holding the referenced image files.
- The download uses `Content-Type: application/zip` and `Content-Disposition: attachment` with a sanitized, timestamped filename (e.g. `binder-project-planner-export-YYYYMMDD-HHmmss.zip`).
- `EXPORT_FORMAT_VERSION` is exported from the canonical shared `defaults.ts` and starts at `1`.

##### Manifest schema (`manifest.json`)

- `format`: the fixed string `"binder-project-planner-export"`.
- `formatVersion`: the integer `EXPORT_FORMAT_VERSION`.
- `schemaVersion`: the current database migration tag (the newest applied drizzle migration identifier) so import can require an exact match.
- `exportedAt`: the UTC ISO-8601 timestamp the archive was created.
- `tableRowCounts`: an object mapping each exported table name to its exported row count, used for validation.
- `images`: an array of `{ filename, sha256 }` entries listing every image file included under `images/`, used to validate presence and integrity.

##### Database dump (`data.json`)

- `data.json` is a JSON object with one array per exported table, each array holding that table's full rows as stored (raw column values, including the internal integer-hundredths and `normalizedName` columns).
- The exported tables are the durable domain tables only: `binders`, `cards`, `card_image_assets`, `art`, and `art_image_assets`.
- The transient/environment tables `mutation_idempotency` and `app_metadata` are excluded, satisfying "secrets and environment-specific configuration are not included".
- Every image file referenced by an exported `card_image_assets`/`art_image_assets` row (its `storageFilename`, and `normalizedStorageFilename` when present) is included under `images/`; locked binders and all their data are included like any other binder (there is no lock column yet; this is inherently satisfied).

##### Validation (before any change)

- Import first fully validates the uploaded archive and changes nothing until the user confirms and the commit succeeds.
- Validation rejects, with a shared failed toast and a descriptive message, when: the file is not a readable ZIP; `manifest.json` or `data.json` is missing or malformed; `format` is not the expected string; `formatVersion` is not supported; `schemaVersion` does not exactly match the running application's current migration tag; a required image file listed in the manifest is missing from `images/`; an image file's bytes do not match its manifest `sha256`; or a foreign-key reference in `data.json` (card/art -> binder, card/art -> image asset) points to an id not present in the dump.
- An invalid or incomplete archive leaves the current database and image files completely unchanged.

##### Identifier and image remapping

- Every imported `binders`, `cards`, `art`, `card_image_assets`, and `art_image_assets` row that is inserted receives a freshly generated UUID; all in-dump foreign keys (`cards.binderId`, `cards.imageAssetId`, `art.binderId`, `art.imageAssetId`) are rewritten to the remapped ids so imported records stay connected to each other.
- Binders, cards, and art are always inserted as new records; a binder-name collision with an existing binder is resolved by generating a unique name via the shared `generateUniqueBinderCopyName` algorithm so existing binders are never modified.
- Image assets are deduplicated against existing local assets: if an imported `card_image_assets` row's `sha256Digest` (or `providerCardId`) - or an `art_image_assets` row's `sha256Digest` - already matches an existing local asset, the existing asset is reused (its id becomes the remap target) and no file is copied; otherwise a new asset row is inserted with a fresh id and a backend-generated unique `storageFilename` (and `normalizedStorageFilename` when the source had one), and the corresponding file(s) are copied from the archive into the images directory under those fresh names.
- Deduping image assets keeps existing elements unchanged while still adding every imported binder/card/art as a new element; imported filename/path collisions are avoided by the fresh backend-generated storage filenames.

##### Transactional import

- The commit copies any new image files into the images directory under their fresh unique names first, then inserts every remapped record in one database transaction.
- If the transaction fails, it is rolled back and every file copied during this commit is deleted, so no imported record or file is added and all existing data is unchanged.
- A file-copy failure before the transaction aborts the import the same way (deleting any files already copied) without touching the database.

##### API and two-step import flow

- `GET /exports/data` streams the generated ZIP; the backend builds it in a request-scoped temporary file, then streams and removes it (mirroring the story 29/30 PDF exports), and it is never restricted by binder lock state.
- Import is two requests: `POST /imports/data/validate` accepts the uploaded archive (multipart), validates it, stages the extracted archive under a server-side temporary directory keyed by a backend-generated token, and returns a summary (`token`, per-table counts of what will be added, and counts of image assets that will be newly created vs. deduped). Staged imports expire after `IMPORT_STAGING_TTL_MS` (exported from the shared `defaults.ts`) and are pruned opportunistically.
- `POST /imports/data/commit` accepts the `token`, re-validates the staged archive, performs the transactional import, removes the staged temporary directory, and returns a summary of what was added. An unknown or expired token returns a Problem Details error.
- Validation and commit failures use the app's standard Problem Details error contract.

##### User interface

- The home page gains Export and Import actions; the existing "Create new binder" button remains centered exactly as it is today (the export/import controls are laid out so they do not shift it off-center - e.g. in their own row/toolbar).
- Export triggers `GET /exports/data` and downloads the ZIP via a throwaway anchor element, using the shared save-status toast (and the shared loading component while generating).
- Import opens a file picker, uploads to the validate endpoint using the shared loading component, then shows a confirmation using the shared custom modal shell that states importing will add the archive's contents (with the returned counts) to the current data; Cancel changes nothing, Confirm calls the commit endpoint.
- A successful commit refreshes the home-page binder list to include the imported binders; export and import both surface success/failure through the shared save-status toast.
