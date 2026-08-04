import { randomUUID } from 'node:crypto';
import { createReadStream, existsSync, unlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  ART_PRINT_ITEM_GAP_INCHES,
  ART_PRINT_PAGE_MARGIN_INCHES,
  ART_PRINT_TILE_OVERLAP_INCHES,
  BINDER_NAME_MAX_LENGTH,
  BINDER_NOTES_MAX_LENGTH,
  DEFAULT_BINDER_PREVIEW_PHYSICAL_PAGE,
  DEFAULT_BORDER_COLOR,
  DEFAULT_BORDER_RADIUS_PERCENT,
  DEFAULT_BORDER_WIDTH_CM,
  DEFAULT_HEIGHT_BASE_CM,
  DEFAULT_HEIGHT_PER_SLOT_CM,
  DEFAULT_WIDTH_BASE_CM,
  DEFAULT_WIDTH_PER_SLOT_CM,
  generateUniqueBinderCopyName,
  getMaxPhysicalPage,
  getTotalSlots,
  resolveSpread,
} from '@binder-project-planner/shared';
import { and, asc, desc, eq, isNotNull, sql } from 'drizzle-orm';
import { Router } from 'express';

import type { DatabaseConnection } from '../database/client.js';
import { art, artImageAssets, binders, cardImageAssets, cards } from '../database/schema.js';
import {
  findIdempotentOutcome,
  saveIdempotentOutcome,
} from '../idempotency/mutationIdempotency.js';
import { generateArtPrintPdf } from '../pdf/artPrintPdf.js';
import { generateBinderLayoutPdf } from '../pdf/binderLayoutPdf.js';
import { countOccupiedSlots } from '../placement/occupancy.js';
import { listArtForBinder, listPlacedArtForPreview } from './art.js';
import { listCardsForBinder, listPlacedCardsForPreview } from './cards.js';

// The validated, OpenAPI-typed shape of a create-binder request body. The
// OpenAPI validation middleware (mounted in app.ts) already rejects requests
// that don't match this shape before this router runs. Story 24's
// dimension/style fields are optional here and default to the canonical
// shared values when omitted (see `applyDimensionDefaults` below).
interface CreateBinderRequestBody {
  name: string;
  width: number;
  height: number;
  pages: number;
  widthPerSlot?: number;
  widthBase?: number;
  heightPerSlot?: number;
  heightBase?: number;
  borderColor?: string;
  borderRadius?: number;
  borderWidth?: number;
  previewPhysicalPage?: number;
  notes?: string | null;
}

// The validated, OpenAPI-typed shape of an update-binder request body
// (story 7; story 24 adds the dimension/style fields). Every field is
// optional since it's a partial update; the OpenAPI schema already
// guarantees at least one field is present and that no undocumented field
// slipped through.
interface UpdateBinderRequestBody {
  name?: string;
  width?: number;
  height?: number;
  pages?: number;
  widthPerSlot?: number;
  widthBase?: number;
  heightPerSlot?: number;
  heightBase?: number;
  borderColor?: string;
  borderRadius?: number;
  borderWidth?: number;
  previewPhysicalPage?: number;
  notes?: string | null;
}

// The raw database row shape (includes the internal `normalizedName`
// uniqueness column and the integer-hundredths dimension/style columns,
// neither of which are ever exposed to clients as-is).
interface BinderRow {
  id: string;
  name: string;
  normalizedName: string;
  width: number;
  height: number;
  pages: number;
  widthPerSlotHundredths: number;
  widthBaseHundredths: number;
  heightPerSlotHundredths: number;
  heightBaseHundredths: number;
  borderColor: string;
  borderRadiusHundredths: number;
  borderWidthHundredths: number;
  previewPhysicalPage: number;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

// Story 24: REST contracts expose centimeters/percentages as decimals to
// two decimal places, but the database stores them as integer hundredths
// to avoid floating-point drift (per planning.md). These two helpers
// convert between the two representations at the API boundary.
function toHundredths(value: number): number {
  return Math.round(value * 100);
}

function fromHundredths(value: number): number {
  return value / 100;
}

// Story 25/29: art's normalized focal/scale fields are stored as integer
// ten-thousandths (see routes/art.ts's own copy of this helper); needed
// here too so the PDF exporter can convert them back to the decimals
// `computeArtDisplayGeometry` expects.
function fromTenThousandths(value: number): number {
  return value / 10_000;
}

// Strips internal-only columns (`normalizedName`, the `*Hundredths` storage
// columns) and converts stored hundredths back to their documented decimal
// units before a binder row is serialized as an OpenAPI `Binder`, shared by
// every route that returns one.
function serializeBinder(row: BinderRow) {
  return {
    id: row.id,
    name: row.name,
    width: row.width,
    height: row.height,
    pages: row.pages,
    widthPerSlot: fromHundredths(row.widthPerSlotHundredths),
    widthBase: fromHundredths(row.widthBaseHundredths),
    heightPerSlot: fromHundredths(row.heightPerSlotHundredths),
    heightBase: fromHundredths(row.heightBaseHundredths),
    borderColor: row.borderColor,
    borderRadius: fromHundredths(row.borderRadiusHundredths),
    borderWidth: fromHundredths(row.borderWidthHundredths),
    previewPhysicalPage: row.previewPhysicalPage,
    notes: row.notes,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

// A validated `#RRGGBB` hex color (case-insensitive input; OpenAPI's
// `pattern` already enforces this shape, this is a defense-in-depth
// re-check before normalizing to uppercase for storage).
const HEX_COLOR_PATTERN = /^#[0-9A-Fa-f]{6}$/;

// Story 24's cross-field dimension/style validation, applied on both
// create and update: OpenAPI's schema already enforces each field's own
// range, but "base may be negative only when the one-slot formula stays
// positive" spans two fields and can't be expressed as a JSON Schema
// constraint, so it's re-checked here (and, belt-and-suspenders, by a
// database check constraint). Returns a Problem Details `detail` message
// describing the first violation found, or `null` when the combination is
// valid.
function validateDimensionFields(fields: {
  widthPerSlot: number;
  widthBase: number;
  heightPerSlot: number;
  heightBase: number;
}): string | null {
  if (fields.widthPerSlot <= 0) {
    return 'widthPerSlot must be greater than zero.';
  }
  if (fields.heightPerSlot <= 0) {
    return 'heightPerSlot must be greater than zero.';
  }
  if (fields.widthPerSlot + fields.widthBase <= 0) {
    return 'The one-slot width (widthPerSlot + widthBase) must be greater than zero.';
  }
  if (fields.heightPerSlot + fields.heightBase <= 0) {
    return 'The one-slot height (heightPerSlot + heightBase) must be greater than zero.';
  }
  return null;
}

function badRequestProblem(detail: string) {
  return {
    type: 'about:blank',
    title: 'Bad Request',
    status: 400,
    detail,
  };
}

function notFoundProblem(binderId: string) {
  return {
    type: 'about:blank',
    title: 'Not Found',
    status: 404,
    detail: `No binder exists with id "${binderId}".`,
  };
}

// Builds one binder's home-page summary (story 5's list shape plus story
// 20's embedded preview spread), shared by `GET /binders` and story 21's
// `POST /binders/{binderId}/duplicate` response - both need the identical
// shape for a binder row they already have in hand.
function buildBinderSummary(database: DatabaseConnection['database'], row: BinderRow) {
  const maxPhysicalPage = getMaxPhysicalPage(row.pages);
  const spread = resolveSpread(row.previewPhysicalPage, maxPhysicalPage);
  // Only the spread's actual page(s) - the first/last spread has only one
  // side - are queried, matching the OpenAPI `BinderPreviewSpread` schema's
  // `left`/`right` nullability.
  const physicalPages = [spread.left, spread.right].filter((page): page is number => page !== null);

  // Story 22: whole-binder slot-completion counts. `totalSlots` is derived
  // purely from the binder's dimensions/page count; `occupiedSlots` counts
  // every slot holding a card or covered by placed art (unplaced items
  // excluded), and the client derives the slot-completion percentage from
  // the two. The card-acquisition metric is deferred to story 36.
  const totalSlots = getTotalSlots(row.width, row.height, row.pages);
  const occupiedSlots = countOccupiedSlots(database, row.id);

  return {
    ...serializeBinder(row),
    totalSlots,
    occupiedSlots,
    emptySlots: totalSlots - occupiedSlots,
    preview: {
      spread,
      cards: listPlacedCardsForPreview(database, row.id, physicalPages),
      art: listPlacedArtForPreview(database, row.id, physicalPages),
    },
  };
}

// Story 21's binder-copy name generator now lives in the shared package
// (`generateUniqueBinderCopyName`) so the frontend's optimistic copy-name
// preview and this backend endpoint always agree on the same generated
// name.

// better-sqlite3 throws a `SqliteError` with a `.code` of
// `SQLITE_CONSTRAINT_UNIQUE` (among other `SQLITE_CONSTRAINT_*` codes) when an
// insert violates a unique constraint. Checking the code (rather than
// select-then-insert) avoids a check-then-act race between concurrent
// requests for the same normalized binder name.
function isUniqueConstraintError(error: unknown): boolean {
  return (
    error instanceof Error &&
    'code' in error &&
    (error as { code?: unknown }).code === 'SQLITE_CONSTRAINT_UNIQUE'
  );
}

// Creates the router owning binder resources. Takes the raw database handle
// (rather than the whole `DatabaseConnection`) so it only depends on what it
// needs to run queries. `imagesDirectory` is used by story 21's delete
// endpoint to clean up now-orphaned card/art image files after a binder
// (and everything it owns) is removed.
export function createBindersRouter(
  database: DatabaseConnection['database'],
  imagesDirectory: string,
): Router {
  const router = Router();

  // Story 5: "List binders". Returns the complete binder-summary collection
  // (no pagination), sorted by most recent activity descending and then by
  // binder UUID ascending as a deterministic tie-breaker. Story 20 embeds
  // each binder's own saved preview spread (cards/art placed within it)
  // directly in its summary, so the home page needs no separate preview
  // requests.
  router.get('/binders', (_request, response) => {
    // A binder's effective "last activity" is the newest of its own
    // `updatedAt` and the newest `updatedAt` among its cards and art, so
    // adding/moving/editing a card or art item floats the binder to the top
    // of the list - not just edits to the binder's own details. ISO-8601
    // timestamps sort correctly as strings, and SQLite's variadic `max()`
    // returns the greatest of its arguments. (A card/art deletion doesn't
    // change any remaining row's timestamp, so it isn't reflected here.)
    const lastActivity = sql`max(
      ${binders.updatedAt},
      coalesce((select max(${cards.updatedAt}) from ${cards} where ${cards.binderId} = ${binders.id}), ${binders.updatedAt}),
      coalesce((select max(${art.updatedAt}) from ${art} where ${art.binderId} = ${binders.id}), ${binders.updatedAt})
    )`;
    const rows = database
      .select()
      .from(binders)
      .orderBy(desc(lastActivity), asc(binders.id))
      .all() as BinderRow[];

    const summaries = rows.map((row) => buildBinderSummary(database, row));

    response.status(200).json(summaries);
  });

  router.post('/binders', (request, response) => {
    const body = request.body as CreateBinderRequestBody;
    const trimmedName = body.name.trim();

    // The OpenAPI schema validates the raw (untrimmed) name's length, but
    // trimming can change whether it's actually within bounds, so the
    // trimmed value is re-checked here per planning.md's requirement that
    // the 100-character limit and "required" rule apply after trimming.
    if (trimmedName.length === 0 || trimmedName.length > BINDER_NAME_MAX_LENGTH) {
      response
        .status(400)
        .type('application/problem+json')
        .json({
          type: 'about:blank',
          title: 'Bad Request',
          status: 400,
          detail: `Binder name must be between 1 and ${BINDER_NAME_MAX_LENGTH} characters after trimming.`,
        });
      return;
    }

    // Story 24's dimension/style fields are optional on create; an omitted
    // field falls back to its canonical shared default (per planning.md's
    // "Width per slot defaults to 6.85 cm" and similar defaults). The
    // reusable frontend form always sends all of them, so this fallback
    // only matters for a request that bypasses the form.
    const dimensionFields = {
      widthPerSlot: body.widthPerSlot ?? DEFAULT_WIDTH_PER_SLOT_CM,
      widthBase: body.widthBase ?? DEFAULT_WIDTH_BASE_CM,
      heightPerSlot: body.heightPerSlot ?? DEFAULT_HEIGHT_PER_SLOT_CM,
      heightBase: body.heightBase ?? DEFAULT_HEIGHT_BASE_CM,
    };
    const borderColor = body.borderColor ?? DEFAULT_BORDER_COLOR;
    const borderRadius = body.borderRadius ?? DEFAULT_BORDER_RADIUS_PERCENT;
    const borderWidth = body.borderWidth ?? DEFAULT_BORDER_WIDTH_CM;

    const dimensionError = validateDimensionFields(dimensionFields);
    if (dimensionError) {
      response.status(400).type('application/problem+json').json(badRequestProblem(dimensionError));
      return;
    }

    if (!HEX_COLOR_PATTERN.test(borderColor)) {
      response
        .status(400)
        .type('application/problem+json')
        .json(badRequestProblem('borderColor must be a six-digit #RRGGBB hexadecimal color.'));
      return;
    }

    // Story 20: an omitted previewPhysicalPage falls back to the shared
    // default (page 2); a supplied value must be a valid physical page for
    // this binder's own stored page count.
    const previewPhysicalPage = body.previewPhysicalPage ?? DEFAULT_BINDER_PREVIEW_PHYSICAL_PAGE;
    const maxPhysicalPage = getMaxPhysicalPage(body.pages);
    if (previewPhysicalPage < 1 || previewPhysicalPage > maxPhysicalPage) {
      response
        .status(400)
        .type('application/problem+json')
        .json(badRequestProblem(`previewPhysicalPage must be between 1 and ${maxPhysicalPage}.`));
      return;
    }

    const now = new Date().toISOString();
    const binder = {
      id: randomUUID(),
      name: trimmedName,
      normalizedName: trimmedName.toLowerCase(),
      width: body.width,
      height: body.height,
      pages: body.pages,
      widthPerSlotHundredths: toHundredths(dimensionFields.widthPerSlot),
      widthBaseHundredths: toHundredths(dimensionFields.widthBase),
      heightPerSlotHundredths: toHundredths(dimensionFields.heightPerSlot),
      heightBaseHundredths: toHundredths(dimensionFields.heightBase),
      // Normalizes hexadecimal letters to uppercase before saving, per
      // planning.md.
      borderColor: borderColor.toUpperCase(),
      borderRadiusHundredths: toHundredths(borderRadius),
      borderWidthHundredths: toHundredths(borderWidth),
      previewPhysicalPage,
      // Story 23: notes aren't part of binder creation (they're edited on
      // the Edit Layout tab), so a new binder always starts with none.
      notes: null,
      createdAt: now,
      updatedAt: now,
    };

    try {
      database.insert(binders).values(binder).run();
    } catch (error) {
      if (isUniqueConstraintError(error)) {
        response
          .status(409)
          .type('application/problem+json')
          .json({
            type: 'about:blank',
            title: 'Conflict',
            status: 409,
            detail: `A binder named "${trimmedName}" already exists.`,
            conflictingField: 'name',
          });
        return;
      }

      throw error;
    }

    // Only the documented Binder fields are returned; `normalizedName` is an
    // internal uniqueness-enforcement detail and is never exposed to clients.
    response.status(201).location(`/binders/${binder.id}`).json(serializeBinder(binder));
  });

  // Story 7: "Create the view/edit binder page". Backs the shared binder
  // context and Edit Details tab.
  router.get('/binders/:binderId', (request, response) => {
    const { binderId } = request.params;
    const row = database.select().from(binders).where(eq(binders.id, binderId)).get();

    if (!row) {
      response.status(404).type('application/problem+json').json(notFoundProblem(binderId));
      return;
    }

    response.status(200).json(serializeBinder(row));
  });

  router.patch('/binders/:binderId', (request, response) => {
    const { binderId } = request.params;
    const body = request.body as UpdateBinderRequestBody;

    const existing = database.select().from(binders).where(eq(binders.id, binderId)).get();
    if (!existing) {
      response.status(404).type('application/problem+json').json(notFoundProblem(binderId));
      return;
    }

    // Only `name` needs post-trim re-validation and re-normalization here;
    // width/height/pages are already fully validated by the OpenAPI schema.
    const updates: Partial<BinderRow> = {};
    if (body.name !== undefined) {
      const trimmedName = body.name.trim();
      if (trimmedName.length === 0 || trimmedName.length > BINDER_NAME_MAX_LENGTH) {
        response
          .status(400)
          .type('application/problem+json')
          .json({
            type: 'about:blank',
            title: 'Bad Request',
            status: 400,
            detail: `Binder name must be between 1 and ${BINDER_NAME_MAX_LENGTH} characters after trimming.`,
          });
        return;
      }
      updates.name = trimmedName;
      updates.normalizedName = trimmedName.toLowerCase();
    }
    if (body.width !== undefined) updates.width = body.width;
    if (body.height !== undefined) updates.height = body.height;
    if (body.pages !== undefined) updates.pages = body.pages;

    // Story 23: notes. An exactly-empty string is normalized to null;
    // non-empty Markdown is stored as-is without trimming leading/trailing
    // whitespace. The OpenAPI schema already enforces the 1,000,000-char
    // maximum, but it's re-checked here as defense-in-depth (a null value
    // clears the notes and is always within bounds).
    if (body.notes !== undefined) {
      if (body.notes !== null && body.notes.length > BINDER_NOTES_MAX_LENGTH) {
        response
          .status(400)
          .type('application/problem+json')
          .json(
            badRequestProblem(
              `Binder notes must be ${BINDER_NOTES_MAX_LENGTH} characters or fewer.`,
            ),
          );
        return;
      }
      updates.notes = body.notes === '' ? null : body.notes;
    }

    // Cross-field dimension validation (story 24) runs against the
    // *effective* values - existing persisted values overridden by any
    // fields included in this patch - since e.g. changing only `widthBase`
    // must still be checked against the binder's current (or
    // simultaneously updated) `widthPerSlot`.
    const dimensionFieldsIncluded =
      body.widthPerSlot !== undefined ||
      body.widthBase !== undefined ||
      body.heightPerSlot !== undefined ||
      body.heightBase !== undefined;
    if (dimensionFieldsIncluded) {
      const effective = {
        widthPerSlot: body.widthPerSlot ?? fromHundredths(existing.widthPerSlotHundredths),
        widthBase: body.widthBase ?? fromHundredths(existing.widthBaseHundredths),
        heightPerSlot: body.heightPerSlot ?? fromHundredths(existing.heightPerSlotHundredths),
        heightBase: body.heightBase ?? fromHundredths(existing.heightBaseHundredths),
      };
      const dimensionError = validateDimensionFields(effective);
      if (dimensionError) {
        response
          .status(400)
          .type('application/problem+json')
          .json(badRequestProblem(dimensionError));
        return;
      }
    }
    if (body.widthPerSlot !== undefined) {
      updates.widthPerSlotHundredths = toHundredths(body.widthPerSlot);
    }
    if (body.widthBase !== undefined) {
      updates.widthBaseHundredths = toHundredths(body.widthBase);
    }
    if (body.heightPerSlot !== undefined) {
      updates.heightPerSlotHundredths = toHundredths(body.heightPerSlot);
    }
    if (body.heightBase !== undefined) {
      updates.heightBaseHundredths = toHundredths(body.heightBase);
    }
    if (body.borderColor !== undefined) {
      if (!HEX_COLOR_PATTERN.test(body.borderColor)) {
        response
          .status(400)
          .type('application/problem+json')
          .json(badRequestProblem('borderColor must be a six-digit #RRGGBB hexadecimal color.'));
        return;
      }
      updates.borderColor = body.borderColor.toUpperCase();
    }
    if (body.borderRadius !== undefined) {
      updates.borderRadiusHundredths = toHundredths(body.borderRadius);
    }
    if (body.borderWidth !== undefined) {
      updates.borderWidthHundredths = toHundredths(body.borderWidth);
    }

    // Story 20: previewPhysicalPage must be a valid physical page for the
    // *effective* stored page count (an included `pages` change, or the
    // existing value otherwise) - same "effective values" reasoning as the
    // dimension fields above.
    const effectivePages = body.pages ?? existing.pages;
    const maxPhysicalPage = getMaxPhysicalPage(effectivePages);
    if (body.previewPhysicalPage !== undefined) {
      if (body.previewPhysicalPage < 1 || body.previewPhysicalPage > maxPhysicalPage) {
        response
          .status(400)
          .type('application/problem+json')
          .json(badRequestProblem(`previewPhysicalPage must be between 1 and ${maxPhysicalPage}.`));
        return;
      }
      updates.previewPhysicalPage = body.previewPhysicalPage;
    } else if (existing.previewPhysicalPage > maxPhysicalPage) {
      // Reducing the stored page count made the saved preview page
      // invalid without the request explicitly supplying a replacement -
      // reset it to the shared default in this same update, per
      // planning.md's "If reducing stored page count makes the saved
      // preview page invalid, the frontend and backend reset
      // previewPhysicalPage to DEFAULT_BINDER_PREVIEW_PHYSICAL_PAGE".
      updates.previewPhysicalPage = DEFAULT_BINDER_PREVIEW_PHYSICAL_PAGE;
    }

    updates.updatedAt = new Date().toISOString();

    let updated: BinderRow;
    try {
      updated = database
        .update(binders)
        .set(updates)
        .where(eq(binders.id, binderId))
        .returning()
        .get();
    } catch (error) {
      if (isUniqueConstraintError(error)) {
        response
          .status(409)
          .type('application/problem+json')
          .json({
            type: 'about:blank',
            title: 'Conflict',
            status: 409,
            detail: `A binder named "${body.name}" already exists.`,
            conflictingField: 'name',
          });
        return;
      }

      throw error;
    }

    response.status(200).json(serializeBinder(updated));
  });

  // Story 21's binder-deletion endpoint: permanently deletes the binder
  // and cascade-deletes every card, art, and dependent record it owns (the
  // schema's `onDelete: 'cascade'` foreign keys) in one transaction, then -
  // still within that same transaction - deletes any card/art image-asset
  // record this binder's own cards/art referenced that no other card or
  // art (in any binder) still references. Note: story 32 ("Lock a
  // binder"), which planning.md's acceptance criteria for this story
  // depend on for rejecting deletion of a locked binder with `409
  // Conflict`, hasn't been implemented yet - there's no `locked` column on
  // `binders` at all yet, so that specific acceptance criterion is a known
  // gap deferred until story 32 adds the lock feature this one builds on.
  router.delete('/binders/:binderId', (request, response) => {
    const { binderId } = request.params;

    const orphanedFilePaths = database.transaction((tx) => {
      const existing = tx
        .select({ id: binders.id })
        .from(binders)
        .where(eq(binders.id, binderId))
        .get();
      // Deleting an already-absent binder is still a successful no-op per
      // planning.md, matching every other delete endpoint in this app.
      if (!existing) return [];

      // Collected before the cascade delete below removes the rows that
      // reference them - deduplicated since multiple cards/art commonly
      // share one image asset (e.g. repeated TCGdex cards).
      const cardAssetIds = [
        ...new Set(
          tx
            .select({ imageAssetId: cards.imageAssetId })
            .from(cards)
            .where(eq(cards.binderId, binderId))
            .all()
            .map((row) => row.imageAssetId),
        ),
      ];
      const artAssetIds = [
        ...new Set(
          tx
            .select({ imageAssetId: art.imageAssetId })
            .from(art)
            .where(eq(art.binderId, binderId))
            .all()
            .map((row) => row.imageAssetId),
        ),
      ];

      // Cascade-deletes this binder's own cards, art, and other
      // binder-owned dependent records via the schema's foreign keys.
      tx.delete(binders).where(eq(binders.id, binderId)).run();

      const paths: string[] = [];

      // An asset is only cleaned up once no card anywhere (in any binder)
      // still references it - shared assets (e.g. a TCGdex card also
      // placed in another binder) are left alone.
      for (const assetId of cardAssetIds) {
        const stillReferenced = tx
          .select({ id: cards.id })
          .from(cards)
          .where(eq(cards.imageAssetId, assetId))
          .get();
        if (stillReferenced) continue;

        const asset = tx
          .select({ storageFilename: cardImageAssets.storageFilename })
          .from(cardImageAssets)
          .where(eq(cardImageAssets.id, assetId))
          .get();
        tx.delete(cardImageAssets).where(eq(cardImageAssets.id, assetId)).run();
        if (asset) paths.push(join(imagesDirectory, asset.storageFilename));
      }

      // Mirrors the loop above for art image assets, which may have up to
      // two files (the source upload and an orientation-normalized
      // derivative - see routes/art.ts).
      for (const assetId of artAssetIds) {
        const stillReferenced = tx
          .select({ id: art.id })
          .from(art)
          .where(eq(art.imageAssetId, assetId))
          .get();
        if (stillReferenced) continue;

        const asset = tx
          .select({
            storageFilename: artImageAssets.storageFilename,
            normalizedStorageFilename: artImageAssets.normalizedStorageFilename,
          })
          .from(artImageAssets)
          .where(eq(artImageAssets.id, assetId))
          .get();
        tx.delete(artImageAssets).where(eq(artImageAssets.id, assetId)).run();
        if (asset) {
          paths.push(join(imagesDirectory, asset.storageFilename));
          if (asset.normalizedStorageFilename) {
            paths.push(join(imagesDirectory, asset.normalizedStorageFilename));
          }
        }
      }

      return paths;
    });

    // Filesystem cleanup runs after the transaction commits (planning.md).
    // A failure here doesn't roll back or fail the already-completed
    // deletion - the now-unreferenced file (its asset row is already gone)
    // is left for the existing orphaned-image maintenance sweep
    // (routes/maintenance.ts) to find and remove on a later pass, which is
    // this app's existing "persisted as pending cleanup work and retried
    // by the backend" mechanism.
    for (const filePath of orphanedFilePaths) {
      if (existsSync(filePath)) {
        try {
          unlinkSync(filePath);
        } catch (error) {
          request.log.error(
            { err: error, path: filePath },
            'Failed to delete an orphaned image file after binder deletion.',
          );
        }
      }
    }

    response.status(204).end();
  });

  // Story 21's binder-duplication endpoint: deep-copies the binder itself
  // plus every card and art record it owns into a brand-new binder, all in
  // one database transaction so a failure partway through rolls back the
  // complete copied graph without touching the source. Copied cards/art
  // reference the source records' existing image assets rather than
  // copying image files. Idempotency-key-aware (mirrors
  // `POST /art/{artId}/duplicate`) so a client retrying a duplicate
  // request after a dropped response never creates a second binder.
  router.post('/binders/:binderId/duplicate', (request, response) => {
    const { binderId } = request.params;
    const idempotencyKey = request.header('Idempotency-Key');
    if (!idempotencyKey) {
      response
        .status(400)
        .type('application/problem+json')
        .json(badRequestProblem('An Idempotency-Key header is required.'));
      return;
    }

    const replayed = findIdempotentOutcome(database, 'binder-duplicate', idempotencyKey);
    if (replayed) {
      const replayedResponse = response.status(replayed.responseStatus);
      if (replayed.locationHeader) replayedResponse.location(replayed.locationHeader);
      replayedResponse.json(replayed.responseBody);
      return;
    }

    const source = database.select().from(binders).where(eq(binders.id, binderId)).get() as
      BinderRow | undefined;
    if (!source) {
      response.status(404).type('application/problem+json').json(notFoundProblem(binderId));
      return;
    }

    const newBinderId = randomUUID();
    const now = new Date().toISOString();

    const newBinderRow = database.transaction((tx) => {
      // Reads every existing normalized name once, up front, to compute
      // the unique copy name in-process. Node/better-sqlite3 run this
      // callback fully synchronously, so nothing else can insert a
      // colliding binder name between this read and the insert below.
      const existingNormalizedNames = new Set(
        tx
          .select({ normalizedName: binders.normalizedName })
          .from(binders)
          .all()
          .map((row) => row.normalizedName),
      );
      const uniqueName = generateUniqueBinderCopyName(existingNormalizedNames, source.name);

      const newBinder: BinderRow = {
        ...source,
        id: newBinderId,
        name: uniqueName,
        normalizedName: uniqueName.toLowerCase(),
        createdAt: now,
        updatedAt: now,
      };
      tx.insert(binders).values(newBinder).run();

      const sourceCards = tx.select().from(cards).where(eq(cards.binderId, binderId)).all();
      for (const card of sourceCards) {
        tx.insert(cards)
          .values({
            ...card,
            id: randomUUID(),
            binderId: newBinderId,
            createdAt: now,
            updatedAt: now,
          })
          .run();
      }

      const sourceArt = tx.select().from(art).where(eq(art.binderId, binderId)).all();
      for (const artItem of sourceArt) {
        tx.insert(art)
          .values({
            ...artItem,
            id: randomUUID(),
            binderId: newBinderId,
            createdAt: now,
            updatedAt: now,
          })
          .run();
      }

      return newBinder;
    });

    const summary = buildBinderSummary(database, newBinderRow);
    const locationHeader = `/binders/${newBinderId}`;
    saveIdempotentOutcome(database, 'binder-duplicate', idempotencyKey, {
      responseStatus: 201,
      responseBody: summary,
      locationHeader,
    });

    response.status(201).location(locationHeader).json(summary);
  });

  // Story 29: exports the binder's complete layout as a print-ready PDF.
  // Read-only, so it's never restricted by binder lock state (once story
  // 32 adds one) - unlike every other mutation above, nothing here writes
  // to the database.
  router.post('/binders/:binderId/exports/pdf', async (request, response, next) => {
    const { binderId } = request.params;
    const { includeVariations = false } = request.body as { includeVariations?: boolean };

    // One transactionally consistent snapshot read (planning.md: "changes
    // committed afterward do not appear in that PDF and are not blocked by
    // the export") - kept synchronous and short-lived, per this app's
    // existing transaction convention; the (potentially slow) PDF
    // generation itself happens afterward, outside the transaction, from
    // the already-fetched snapshot.
    const snapshot = database.transaction((tx) => {
      const binderRow = tx.select().from(binders).where(eq(binders.id, binderId)).get() as
        BinderRow | undefined;
      if (!binderRow) return null;

      const cardRows = tx
        .select({
          physicalPage: cards.physicalPage,
          row: cards.row,
          column: cards.column,
          variation: cards.variation,
          storageFilename: cardImageAssets.storageFilename,
        })
        .from(cards)
        .innerJoin(cardImageAssets, eq(cards.imageAssetId, cardImageAssets.id))
        .where(and(eq(cards.binderId, binderId), isNotNull(cards.physicalPage)))
        .all();

      const artRows = tx
        .select({
          physicalPage: art.physicalPage,
          row: art.row,
          column: art.column,
          widthSlots: art.widthSlots,
          heightSlots: art.heightSlots,
          imageRotationDegrees: art.imageRotationDegrees,
          focalXTenThousandths: art.focalXTenThousandths,
          focalYTenThousandths: art.focalYTenThousandths,
          scaleXTenThousandths: art.scaleXTenThousandths,
          scaleYTenThousandths: art.scaleYTenThousandths,
          borderColor: art.borderColor,
          borderRadiusHundredths: art.borderRadiusHundredths,
          borderWidthHundredths: art.borderWidthHundredths,
          storageFilename: artImageAssets.storageFilename,
          normalizedStorageFilename: artImageAssets.normalizedStorageFilename,
          pixelWidth: artImageAssets.pixelWidth,
          pixelHeight: artImageAssets.pixelHeight,
        })
        .from(art)
        .innerJoin(artImageAssets, eq(art.imageAssetId, artImageAssets.id))
        .where(and(eq(art.binderId, binderId), isNotNull(art.physicalPage)))
        .all();

      return { binderRow, cardRows, artRows };
    });

    if (!snapshot) {
      response.status(404).type('application/problem+json').json(notFoundProblem(binderId));
      return;
    }

    // A filesystem-safe download filename derived from the binder's name
    // (which otherwise allows any character): non-alphanumeric characters
    // (other than space/hyphen/underscore) become underscores, falling
    // back to a generic name for the unlikely case that strips everything.
    // " Binder" is appended (e.g. "Umbreon Binder.pdf") to distinguish this
    // full-layout export from the separate art-only export below, which
    // instead suffixes "-art".
    const sanitizedName =
      snapshot.binderRow.name.replace(/[^A-Za-z0-9 _-]/g, '_').trim() || 'binder';
    const downloadFilename = `${sanitizedName} Binder`;
    const tempFilePath = join(tmpdir(), `binder-pdf-export-${randomUUID()}.pdf`);

    try {
      await generateBinderLayoutPdf({
        outputPath: tempFilePath,
        binder: {
          name: snapshot.binderRow.name,
          width: snapshot.binderRow.width,
          height: snapshot.binderRow.height,
          pages: snapshot.binderRow.pages,
          widthPerSlot: fromHundredths(snapshot.binderRow.widthPerSlotHundredths),
          widthBase: fromHundredths(snapshot.binderRow.widthBaseHundredths),
          heightPerSlot: fromHundredths(snapshot.binderRow.heightPerSlotHundredths),
          heightBase: fromHundredths(snapshot.binderRow.heightBaseHundredths),
        },
        cards: snapshot.cardRows.map((row) => ({
          physicalPage: row.physicalPage as number,
          row: row.row as number,
          column: row.column as number,
          variation: row.variation,
          imagePath: join(imagesDirectory, row.storageFilename),
        })),
        art: snapshot.artRows.map((row) => ({
          physicalPage: row.physicalPage as number,
          row: row.row as number,
          column: row.column as number,
          widthSlots: row.widthSlots,
          heightSlots: row.heightSlots,
          imagePath: join(imagesDirectory, row.normalizedStorageFilename ?? row.storageFilename),
          naturalWidth: row.pixelWidth,
          naturalHeight: row.pixelHeight,
          imageRotationDegrees: row.imageRotationDegrees as 0 | 90 | 180 | 270,
          focalX: fromTenThousandths(row.focalXTenThousandths),
          focalY: fromTenThousandths(row.focalYTenThousandths),
          scaleX: fromTenThousandths(row.scaleXTenThousandths),
          scaleY: fromTenThousandths(row.scaleYTenThousandths),
          // A null override falls back to the binder's own current border
          // setting at render time, mirroring `ArtTile.tsx`'s own
          // `art.borderColor ?? binder.borderColor` resolution (see
          // schema.ts's comment on `art.borderColor`).
          borderColor: row.borderColor ?? snapshot.binderRow.borderColor,
          borderRadius: fromHundredths(
            row.borderRadiusHundredths ?? snapshot.binderRow.borderRadiusHundredths,
          ),
          borderWidth: fromHundredths(
            row.borderWidthHundredths ?? snapshot.binderRow.borderWidthHundredths,
          ),
        })),
        includeVariations,
      });
    } catch (error) {
      if (existsSync(tempFilePath)) {
        try {
          unlinkSync(tempFilePath);
        } catch (cleanupError) {
          request.log.error(
            { err: cleanupError, path: tempFilePath },
            'Failed to remove a failed PDF export temporary file.',
          );
        }
      }
      next(error);
      return;
    }

    response
      .status(200)
      .type('application/pdf')
      .set('Content-Disposition', `attachment; filename="${downloadFilename}.pdf"`);

    const readStream = createReadStream(tempFilePath);
    readStream.pipe(response);

    // Cleans up the temporary file once the response is done, whether it
    // completed normally or the client disconnected early - 'close' fires
    // in both cases (planning.md: "removes the temporary PDF after the
    // response completes or the client disconnects"). A cleanup failure
    // here is logged only; the already-sent response is unaffected.
    response.once('close', () => {
      if (!existsSync(tempFilePath)) return;
      try {
        unlinkSync(tempFilePath);
      } catch (cleanupError) {
        request.log.error(
          { err: cleanupError, path: tempFilePath },
          'Failed to remove a completed PDF export temporary file.',
        );
      }
    });
  });

  // Story 30: exports the request's selected, currently placed multi-slot
  // art as a print-ready PDF, packed across as many pages as needed - never
  // the fixed one-page-per-spread layout `exports/pdf` above uses, and
  // never including any card. Read-only, so (like `exports/pdf`) it's never
  // restricted by binder lock state.
  router.post('/binders/:binderId/exports/art-pdf', async (request, response, next) => {
    const { binderId } = request.params;
    const { selectedArtIds } = request.body as { selectedArtIds: string[] };

    // One transactionally consistent snapshot read, matching `exports/pdf`
    // above - `placedArtRows` is every currently placed art item in this
    // binder (not just the selected ones), so the handler below can tell
    // apart "id doesn't exist at all"/"id exists but isn't placed" from "id
    // is placed but wasn't selected" when validating `selectedArtIds`.
    const snapshot = database.transaction((tx) => {
      const binderRow = tx.select().from(binders).where(eq(binders.id, binderId)).get() as
        BinderRow | undefined;
      if (!binderRow) return null;

      const placedArtRows = tx
        .select({
          id: art.id,
          widthSlots: art.widthSlots,
          heightSlots: art.heightSlots,
          imageRotationDegrees: art.imageRotationDegrees,
          focalXTenThousandths: art.focalXTenThousandths,
          focalYTenThousandths: art.focalYTenThousandths,
          scaleXTenThousandths: art.scaleXTenThousandths,
          scaleYTenThousandths: art.scaleYTenThousandths,
          borderColor: art.borderColor,
          borderRadiusHundredths: art.borderRadiusHundredths,
          borderWidthHundredths: art.borderWidthHundredths,
          storageFilename: artImageAssets.storageFilename,
          normalizedStorageFilename: artImageAssets.normalizedStorageFilename,
          pixelWidth: artImageAssets.pixelWidth,
          pixelHeight: artImageAssets.pixelHeight,
        })
        .from(art)
        .innerJoin(artImageAssets, eq(art.imageAssetId, artImageAssets.id))
        .where(and(eq(art.binderId, binderId), isNotNull(art.physicalPage)))
        .all();

      return { binderRow, placedArtRows };
    });

    if (!snapshot) {
      response.status(404).type('application/problem+json').json(notFoundProblem(binderId));
      return;
    }

    // Every submitted id must currently identify placed art in this binder
    // (planning.md: "a submitted UUID that is not currently placed art in
    // the binder, or an empty array, returns a request-validation Problem
    // Details response and does not generate a PDF").
    const placedArtById = new Map(snapshot.placedArtRows.map((row) => [row.id, row]));
    if (selectedArtIds.length === 0) {
      response
        .status(400)
        .type('application/problem+json')
        .json(badRequestProblem('selectedArtIds must include at least one placed art id.'));
      return;
    }
    const unknownArtId = selectedArtIds.find((id) => !placedArtById.has(id));
    if (unknownArtId !== undefined) {
      response
        .status(400)
        .type('application/problem+json')
        .json(
          badRequestProblem(
            `Art id "${unknownArtId}" does not currently identify placed art in this binder.`,
          ),
        );
      return;
    }

    const selectedArtRows = selectedArtIds.map((id) => placedArtById.get(id)!);

    const sanitizedName =
      snapshot.binderRow.name.replace(/[^A-Za-z0-9 _-]/g, '_').trim() || 'binder';
    const tempFilePath = join(tmpdir(), `art-pdf-export-${randomUUID()}.pdf`);

    try {
      await generateArtPrintPdf({
        outputPath: tempFilePath,
        art: selectedArtRows.map((row) => ({
          id: row.id,
          imagePath: join(imagesDirectory, row.normalizedStorageFilename ?? row.storageFilename),
          naturalWidth: row.pixelWidth,
          naturalHeight: row.pixelHeight,
          imageRotationDegrees: row.imageRotationDegrees as 0 | 90 | 180 | 270,
          focalX: fromTenThousandths(row.focalXTenThousandths),
          focalY: fromTenThousandths(row.focalYTenThousandths),
          scaleX: fromTenThousandths(row.scaleXTenThousandths),
          scaleY: fromTenThousandths(row.scaleYTenThousandths),
          // A null override falls back to the binder's own current border
          // setting at render time, matching `exports/pdf`'s identical
          // resolution above.
          borderColor: row.borderColor ?? snapshot.binderRow.borderColor,
          borderRadius: fromHundredths(
            row.borderRadiusHundredths ?? snapshot.binderRow.borderRadiusHundredths,
          ),
          borderWidth: fromHundredths(
            row.borderWidthHundredths ?? snapshot.binderRow.borderWidthHundredths,
          ),
          physicalWidthCm:
            row.widthSlots * fromHundredths(snapshot.binderRow.widthPerSlotHundredths) +
            fromHundredths(snapshot.binderRow.widthBaseHundredths),
          physicalHeightCm:
            row.heightSlots * fromHundredths(snapshot.binderRow.heightPerSlotHundredths) +
            fromHundredths(snapshot.binderRow.heightBaseHundredths),
        })),
        marginIn: ART_PRINT_PAGE_MARGIN_INCHES,
        gapIn: ART_PRINT_ITEM_GAP_INCHES,
        tileOverlapIn: ART_PRINT_TILE_OVERLAP_INCHES,
      });
    } catch (error) {
      if (existsSync(tempFilePath)) {
        try {
          unlinkSync(tempFilePath);
        } catch (cleanupError) {
          request.log.error(
            { err: cleanupError, path: tempFilePath },
            'Failed to remove a failed art PDF export temporary file.',
          );
        }
      }
      next(error);
      return;
    }

    response
      .status(200)
      .type('application/pdf')
      .set('Content-Disposition', `attachment; filename="${sanitizedName}-art.pdf"`);

    const readStream = createReadStream(tempFilePath);
    readStream.pipe(response);

    // Cleans up the temporary file once the response is done, matching
    // `exports/pdf`'s identical cleanup above.
    response.once('close', () => {
      if (!existsSync(tempFilePath)) return;
      try {
        unlinkSync(tempFilePath);
      } catch (cleanupError) {
        request.log.error(
          { err: cleanupError, path: tempFilePath },
          'Failed to remove a completed art PDF export temporary file.',
        );
      }
    });
  });

  // Story 7 requires the shared binder context to load details, cards, and
  // art in parallel; both card creation (story 11, routes/cards.ts) and
  // art creation (story 25, routes/art.ts) exist as of this router.
  router.get('/binders/:binderId/cards', (request, response) => {
    const { binderId } = request.params;
    const exists = database
      .select({ id: binders.id })
      .from(binders)
      .where(eq(binders.id, binderId))
      .get();

    if (!exists) {
      response.status(404).type('application/problem+json').json(notFoundProblem(binderId));
      return;
    }

    response.status(200).json(listCardsForBinder(database, binderId));
  });

  router.get('/binders/:binderId/art', (request, response) => {
    const { binderId } = request.params;
    const exists = database
      .select({ id: binders.id })
      .from(binders)
      .where(eq(binders.id, binderId))
      .get();

    if (!exists) {
      response.status(404).type('application/problem+json').json(notFoundProblem(binderId));
      return;
    }

    response.status(200).json(listArtForBinder(database, binderId));
  });

  return router;
}
