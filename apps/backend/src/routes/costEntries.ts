import { COST_ENTRY_NAME_MAX_LENGTH } from '@binder-project-planner/shared';
import { randomUUID } from 'node:crypto';
import { asc, eq, sql } from 'drizzle-orm';
import { Router } from 'express';

import type { DatabaseConnection } from '../database/client.js';
import {
  binderCostEntries,
  holographicPaperCostEntries,
  printingCostEntries,
} from '../database/schema.js';
import { fromCents, toCents } from '../finance/currency.js';

function problem(status: number, title: string, detail: string) {
  return { type: 'about:blank', title, status, detail };
}

// Trims and validates a cost entry's `name` field, shared by all 3
// catalogs below (story 34: "Add custom art finances"). Duplicate names
// across entries are allowed - selection is by id, not name - so this
// only checks length after trimming.
function validateName(name: string): { value: string } | { error: string } {
  const trimmed = name.trim();
  if (trimmed.length === 0 || trimmed.length > COST_ENTRY_NAME_MAX_LENGTH) {
    return {
      error: `name must be between 1 and ${COST_ENTRY_NAME_MAX_LENGTH} characters after trimming.`,
    };
  }
  return { value: trimmed };
}

interface BinderCostEntryRow {
  id: string;
  name: string;
  priceCents: number;
  width: number;
  height: number;
  pages: number;
  createdAt: string;
  updatedAt: string;
}

interface PrintingCostEntryRow {
  id: string;
  name: string;
  pricePerPageCents: number;
  createdAt: string;
  updatedAt: string;
}

interface HolographicPaperCostEntryRow {
  id: string;
  name: string;
  priceCents: number;
  pagesIncluded: number;
  createdAt: string;
  updatedAt: string;
}

function toBinderCostEntryResponse(row: BinderCostEntryRow) {
  return {
    id: row.id,
    name: row.name,
    price: fromCents(row.priceCents),
    width: row.width,
    height: row.height,
    pages: row.pages,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function toPrintingCostEntryResponse(row: PrintingCostEntryRow) {
  return {
    id: row.id,
    name: row.name,
    pricePerPage: fromCents(row.pricePerPageCents),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function toHolographicPaperCostEntryResponse(row: HolographicPaperCostEntryRow) {
  return {
    id: row.id,
    name: row.name,
    price: fromCents(row.priceCents),
    pagesIncluded: row.pagesIncluded,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

interface CreateBinderCostEntryRequestBody {
  name: string;
  price: number;
  width: number;
  height: number;
  pages: number;
}

interface UpdateBinderCostEntryRequestBody {
  name?: string;
  price?: number;
  width?: number;
  height?: number;
  pages?: number;
}

interface CreatePrintingCostEntryRequestBody {
  name: string;
  pricePerPage: number;
}

interface UpdatePrintingCostEntryRequestBody {
  name?: string;
  pricePerPage?: number;
}

interface CreateHolographicPaperCostEntryRequestBody {
  name: string;
  price: number;
  pagesIncluded: number;
}

interface UpdateHolographicPaperCostEntryRequestBody {
  name?: string;
  price?: number;
  pagesIncluded?: number;
}

// Story 34's 3 shared physical-cost catalogs: `binderCostEntries`,
// `printingCostEntries`, and `holographicPaperCostEntries`. Each is its own
// full-CRUD-minus-delete REST resource with a shape matching its own
// fields (rather than one generic discriminated table) - deletion is
// deferred to story 44. Every list endpoint returns entries ordered
// alphabetically by `name` (case-insensitive) so the frontend's dropdowns
// never need to re-sort. None of these mutations are ever restricted by
// any binder's lock state - they're shared catalogs, not scoped to one
// binder.
export function createCostEntriesRouter(database: DatabaseConnection['database']): Router {
  const router = Router();

  // -- Binder cost entries --------------------------------------------

  router.get('/binder-cost-entries', (_request, response) => {
    const rows = database
      .select()
      .from(binderCostEntries)
      .orderBy(asc(sql`lower(${binderCostEntries.name})`))
      .all() as BinderCostEntryRow[];
    response.status(200).json(rows.map(toBinderCostEntryResponse));
  });

  router.post('/binder-cost-entries', (request, response) => {
    const body = request.body as CreateBinderCostEntryRequestBody;
    const nameResult = validateName(body.name);
    if ('error' in nameResult) {
      response
        .status(400)
        .type('application/problem+json')
        .json(problem(400, 'Bad Request', nameResult.error));
      return;
    }

    const now = new Date().toISOString();
    const row = database
      .insert(binderCostEntries)
      .values({
        id: randomUUID(),
        name: nameResult.value,
        priceCents: toCents(body.price),
        width: body.width,
        height: body.height,
        pages: body.pages,
        createdAt: now,
        updatedAt: now,
      })
      .returning()
      .get() as BinderCostEntryRow;

    response
      .status(201)
      .location(`/binder-cost-entries/${row.id}`)
      .json(toBinderCostEntryResponse(row));
  });

  router.patch('/binder-cost-entries/:binderCostEntryId', (request, response) => {
    const { binderCostEntryId } = request.params;
    const body = request.body as UpdateBinderCostEntryRequestBody;

    const existing = database
      .select()
      .from(binderCostEntries)
      .where(eq(binderCostEntries.id, binderCostEntryId))
      .get() as BinderCostEntryRow | undefined;
    if (!existing) {
      response
        .status(404)
        .type('application/problem+json')
        .json(
          problem(404, 'Not Found', `No binder cost entry exists with id "${binderCostEntryId}".`),
        );
      return;
    }

    const updates: Partial<BinderCostEntryRow> = {};
    if (body.name !== undefined) {
      const nameResult = validateName(body.name);
      if ('error' in nameResult) {
        response
          .status(400)
          .type('application/problem+json')
          .json(problem(400, 'Bad Request', nameResult.error));
        return;
      }
      updates.name = nameResult.value;
    }
    if (body.price !== undefined) updates.priceCents = toCents(body.price);
    if (body.width !== undefined) updates.width = body.width;
    if (body.height !== undefined) updates.height = body.height;
    if (body.pages !== undefined) updates.pages = body.pages;
    updates.updatedAt = new Date().toISOString();

    const updated = database
      .update(binderCostEntries)
      .set(updates)
      .where(eq(binderCostEntries.id, binderCostEntryId))
      .returning()
      .get() as BinderCostEntryRow;

    response.status(200).json(toBinderCostEntryResponse(updated));
  });

  // -- Printing cost entries -------------------------------------------

  router.get('/printing-cost-entries', (_request, response) => {
    const rows = database
      .select()
      .from(printingCostEntries)
      .orderBy(asc(sql`lower(${printingCostEntries.name})`))
      .all() as PrintingCostEntryRow[];
    response.status(200).json(rows.map(toPrintingCostEntryResponse));
  });

  router.post('/printing-cost-entries', (request, response) => {
    const body = request.body as CreatePrintingCostEntryRequestBody;
    const nameResult = validateName(body.name);
    if ('error' in nameResult) {
      response
        .status(400)
        .type('application/problem+json')
        .json(problem(400, 'Bad Request', nameResult.error));
      return;
    }

    const now = new Date().toISOString();
    const row = database
      .insert(printingCostEntries)
      .values({
        id: randomUUID(),
        name: nameResult.value,
        pricePerPageCents: toCents(body.pricePerPage),
        createdAt: now,
        updatedAt: now,
      })
      .returning()
      .get() as PrintingCostEntryRow;

    response
      .status(201)
      .location(`/printing-cost-entries/${row.id}`)
      .json(toPrintingCostEntryResponse(row));
  });

  router.patch('/printing-cost-entries/:printingCostEntryId', (request, response) => {
    const { printingCostEntryId } = request.params;
    const body = request.body as UpdatePrintingCostEntryRequestBody;

    const existing = database
      .select()
      .from(printingCostEntries)
      .where(eq(printingCostEntries.id, printingCostEntryId))
      .get() as PrintingCostEntryRow | undefined;
    if (!existing) {
      response
        .status(404)
        .type('application/problem+json')
        .json(
          problem(
            404,
            'Not Found',
            `No printing cost entry exists with id "${printingCostEntryId}".`,
          ),
        );
      return;
    }

    const updates: Partial<PrintingCostEntryRow> = {};
    if (body.name !== undefined) {
      const nameResult = validateName(body.name);
      if ('error' in nameResult) {
        response
          .status(400)
          .type('application/problem+json')
          .json(problem(400, 'Bad Request', nameResult.error));
        return;
      }
      updates.name = nameResult.value;
    }
    if (body.pricePerPage !== undefined) updates.pricePerPageCents = toCents(body.pricePerPage);
    updates.updatedAt = new Date().toISOString();

    const updated = database
      .update(printingCostEntries)
      .set(updates)
      .where(eq(printingCostEntries.id, printingCostEntryId))
      .returning()
      .get() as PrintingCostEntryRow;

    response.status(200).json(toPrintingCostEntryResponse(updated));
  });

  // -- Holographic paper cost entries -----------------------------------

  router.get('/holographic-paper-cost-entries', (_request, response) => {
    const rows = database
      .select()
      .from(holographicPaperCostEntries)
      .orderBy(asc(sql`lower(${holographicPaperCostEntries.name})`))
      .all() as HolographicPaperCostEntryRow[];
    response.status(200).json(rows.map(toHolographicPaperCostEntryResponse));
  });

  router.post('/holographic-paper-cost-entries', (request, response) => {
    const body = request.body as CreateHolographicPaperCostEntryRequestBody;
    const nameResult = validateName(body.name);
    if ('error' in nameResult) {
      response
        .status(400)
        .type('application/problem+json')
        .json(problem(400, 'Bad Request', nameResult.error));
      return;
    }

    const now = new Date().toISOString();
    const row = database
      .insert(holographicPaperCostEntries)
      .values({
        id: randomUUID(),
        name: nameResult.value,
        priceCents: toCents(body.price),
        pagesIncluded: body.pagesIncluded,
        createdAt: now,
        updatedAt: now,
      })
      .returning()
      .get() as HolographicPaperCostEntryRow;

    response
      .status(201)
      .location(`/holographic-paper-cost-entries/${row.id}`)
      .json(toHolographicPaperCostEntryResponse(row));
  });

  router.patch(
    '/holographic-paper-cost-entries/:holographicPaperCostEntryId',
    (request, response) => {
      const { holographicPaperCostEntryId } = request.params;
      const body = request.body as UpdateHolographicPaperCostEntryRequestBody;

      const existing = database
        .select()
        .from(holographicPaperCostEntries)
        .where(eq(holographicPaperCostEntries.id, holographicPaperCostEntryId))
        .get() as HolographicPaperCostEntryRow | undefined;
      if (!existing) {
        response
          .status(404)
          .type('application/problem+json')
          .json(
            problem(
              404,
              'Not Found',
              `No holographic paper cost entry exists with id "${holographicPaperCostEntryId}".`,
            ),
          );
        return;
      }

      const updates: Partial<HolographicPaperCostEntryRow> = {};
      if (body.name !== undefined) {
        const nameResult = validateName(body.name);
        if ('error' in nameResult) {
          response
            .status(400)
            .type('application/problem+json')
            .json(problem(400, 'Bad Request', nameResult.error));
          return;
        }
        updates.name = nameResult.value;
      }
      if (body.price !== undefined) updates.priceCents = toCents(body.price);
      if (body.pagesIncluded !== undefined) updates.pagesIncluded = body.pagesIncluded;
      updates.updatedAt = new Date().toISOString();

      const updated = database
        .update(holographicPaperCostEntries)
        .set(updates)
        .where(eq(holographicPaperCostEntries.id, holographicPaperCostEntryId))
        .returning()
        .get() as HolographicPaperCostEntryRow;

      response.status(200).json(toHolographicPaperCostEntryResponse(updated));
    },
  );

  return router;
}
