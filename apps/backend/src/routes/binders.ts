import { randomUUID } from 'node:crypto';

import { BINDER_NAME_MAX_LENGTH } from '@binder-project-planner/shared';
import { asc, desc, eq } from 'drizzle-orm';
import { Router } from 'express';

import type { DatabaseConnection } from '../database/client.js';
import { binders } from '../database/schema.js';
import { listCardsForBinder } from './cards.js';

// The validated, OpenAPI-typed shape of a create-binder request body. The
// OpenAPI validation middleware (mounted in app.ts) already rejects requests
// that don't match this shape before this router runs.
interface CreateBinderRequestBody {
  name: string;
  width: number;
  height: number;
  pages: number;
}

// The validated, OpenAPI-typed shape of an update-binder request body
// (story 7). Every field is optional since it's a partial update; the
// OpenAPI schema already guarantees at least one field is present and that
// no undocumented field slipped through.
interface UpdateBinderRequestBody {
  name?: string;
  width?: number;
  height?: number;
  pages?: number;
}

// The raw database row shape (includes the internal `normalizedName`
// uniqueness column, which is never exposed to clients).
interface BinderRow {
  id: string;
  name: string;
  normalizedName: string;
  width: number;
  height: number;
  pages: number;
  createdAt: string;
  updatedAt: string;
}

// Strips internal-only columns (`normalizedName`) before a binder row is
// serialized as an OpenAPI `Binder`, shared by every route that returns one.
function serializeBinder(row: BinderRow) {
  return {
    id: row.id,
    name: row.name,
    width: row.width,
    height: row.height,
    pages: row.pages,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
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

    const now = new Date().toISOString();
    const binder = {
      id: randomUUID(),
      name: trimmedName,
      normalizedName: trimmedName.toLowerCase(),
      width: body.width,
      height: body.height,
      pages: body.pages,
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
  // art in parallel. Card creation exists as of story 11
  // (routes/cards.ts); art creation (story 25) doesn't yet, so `/art`
  // still always returns an empty array today.
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

    response.status(200).json([]);
  });

  return router;
}
