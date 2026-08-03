import { randomUUID } from 'node:crypto';

import {
  BINDER_NAME_MAX_LENGTH,
  DEFAULT_BORDER_COLOR,
  DEFAULT_BORDER_RADIUS_PERCENT,
  DEFAULT_BORDER_WIDTH_CM,
  DEFAULT_HEIGHT_BASE_CM,
  DEFAULT_HEIGHT_PER_SLOT_CM,
  DEFAULT_WIDTH_BASE_CM,
  DEFAULT_WIDTH_PER_SLOT_CM,
} from '@binder-project-planner/shared';
import { asc, desc, eq } from 'drizzle-orm';
import { Router } from 'express';

import type { DatabaseConnection } from '../database/client.js';
import { binders } from '../database/schema.js';
import { listArtForBinder } from './art.js';
import { listCardsForBinder } from './cards.js';

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
// needs to run queries.
export function createBindersRouter(database: DatabaseConnection['database']): Router {
  const router = Router();

  // Story 5: "List binders". Returns the complete binder-summary collection
  // (no pagination), sorted by `updatedAt` descending and then by binder
  // UUID ascending as a deterministic tie-breaker per planning.md.
  router.get('/binders', (_request, response) => {
    const rows = database
      .select({
        id: binders.id,
        name: binders.name,
        width: binders.width,
        height: binders.height,
        pages: binders.pages,
        createdAt: binders.createdAt,
        updatedAt: binders.updatedAt,
      })
      .from(binders)
      .orderBy(desc(binders.updatedAt), asc(binders.id))
      .all();

    response.status(200).json(rows);
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
