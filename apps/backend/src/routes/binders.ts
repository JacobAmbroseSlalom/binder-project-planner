import { randomUUID } from 'node:crypto';

import { BINDER_NAME_MAX_LENGTH } from '@binder-project-planner/shared';
import { Router } from 'express';

import type { DatabaseConnection } from '../database/client.js';
import { binders } from '../database/schema.js';

// The validated, OpenAPI-typed shape of a create-binder request body. The
// OpenAPI validation middleware (mounted in app.ts) already rejects requests
// that don't match this shape before this router runs.
interface CreateBinderRequestBody {
  name: string;
  width: number;
  height: number;
  pages: number;
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
    response.status(201).location(`/binders/${binder.id}`).json({
      id: binder.id,
      name: binder.name,
      width: binder.width,
      height: binder.height,
      pages: binder.pages,
      createdAt: binder.createdAt,
      updatedAt: binder.updatedAt,
    });
  });

  return router;
}
