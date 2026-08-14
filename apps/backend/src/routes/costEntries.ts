import { COST_ENTRY_NAME_MAX_LENGTH } from '@binder-project-planner/shared';
import { randomUUID } from 'node:crypto';
import { asc, eq, isNotNull, sql } from 'drizzle-orm';
import { Router } from 'express';

import type { DatabaseConnection } from '../database/client.js';
import {
  binderCostEntries,
  binders,
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

function toBinderCostEntryResponse(row: BinderCostEntryRow, binderCount: number) {
  return {
    id: row.id,
    name: row.name,
    price: fromCents(row.priceCents),
    width: row.width,
    height: row.height,
    pages: row.pages,
    binderCount,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function toPrintingCostEntryResponse(row: PrintingCostEntryRow, binderCount: number) {
  return {
    id: row.id,
    name: row.name,
    pricePerPage: fromCents(row.pricePerPageCents),
    binderCount,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function toHolographicPaperCostEntryResponse(
  row: HolographicPaperCostEntryRow,
  binderCount: number,
) {
  return {
    id: row.id,
    name: row.name,
    price: fromCents(row.priceCents),
    pagesIncluded: row.pagesIncluded,
    binderCount,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

// Story 44: the count of binders currently selecting one catalog entry, for
// the "Manage cost entries" modal's per-row impact indicator. A single
// grouped query (rather than one query per entry) computes every entry's
// count at once for the list endpoints; a targeted single-id query covers
// the create/update endpoints, which only ever need one entry's count.
function countBindersByBinderCostEntry(
  database: DatabaseConnection['database'],
): Map<string, number> {
  const rows = database
    .select({ id: binders.selectedBinderCostEntryId, count: sql<number>`count(*)` })
    .from(binders)
    .where(isNotNull(binders.selectedBinderCostEntryId))
    .groupBy(binders.selectedBinderCostEntryId)
    .all() as { id: string; count: number }[];
  return new Map(rows.map((row) => [row.id, row.count]));
}

function countBindersSelectingBinderCostEntry(
  database: DatabaseConnection['database'],
  binderCostEntryId: string,
): number {
  const row = database
    .select({ count: sql<number>`count(*)` })
    .from(binders)
    .where(eq(binders.selectedBinderCostEntryId, binderCostEntryId))
    .get() as { count: number };
  return row.count;
}

function countBindersByPrintingCostEntry(
  database: DatabaseConnection['database'],
): Map<string, number> {
  const rows = database
    .select({ id: binders.selectedPrintingCostEntryId, count: sql<number>`count(*)` })
    .from(binders)
    .where(isNotNull(binders.selectedPrintingCostEntryId))
    .groupBy(binders.selectedPrintingCostEntryId)
    .all() as { id: string; count: number }[];
  return new Map(rows.map((row) => [row.id, row.count]));
}

function countBindersSelectingPrintingCostEntry(
  database: DatabaseConnection['database'],
  printingCostEntryId: string,
): number {
  const row = database
    .select({ count: sql<number>`count(*)` })
    .from(binders)
    .where(eq(binders.selectedPrintingCostEntryId, printingCostEntryId))
    .get() as { count: number };
  return row.count;
}

function countBindersByHolographicPaperCostEntry(
  database: DatabaseConnection['database'],
): Map<string, number> {
  const rows = database
    .select({ id: binders.selectedHolographicPaperCostEntryId, count: sql<number>`count(*)` })
    .from(binders)
    .where(isNotNull(binders.selectedHolographicPaperCostEntryId))
    .groupBy(binders.selectedHolographicPaperCostEntryId)
    .all() as { id: string; count: number }[];
  return new Map(rows.map((row) => [row.id, row.count]));
}

function countBindersSelectingHolographicPaperCostEntry(
  database: DatabaseConnection['database'],
  holographicPaperCostEntryId: string,
): number {
  const row = database
    .select({ count: sql<number>`count(*)` })
    .from(binders)
    .where(eq(binders.selectedHolographicPaperCostEntryId, holographicPaperCostEntryId))
    .get() as { count: number };
  return row.count;
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
    const counts = countBindersByBinderCostEntry(database);
    response
      .status(200)
      .json(rows.map((row) => toBinderCostEntryResponse(row, counts.get(row.id) ?? 0)));
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
      .json(toBinderCostEntryResponse(row, 0));
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

    response
      .status(200)
      .json(
        toBinderCostEntryResponse(
          updated,
          countBindersSelectingBinderCostEntry(database, binderCostEntryId),
        ),
      );
  });

  // Story 44: permanently deletes a shared Binder cost entry regardless of
  // whether any binder currently selects it, nulling
  // `selectedBinderCostEntryId` (and bumping `updatedAt`, matching every
  // other field-clearing update in this codebase) on every affected binder
  // in the same transaction as the delete itself.
  router.delete('/binder-cost-entries/:binderCostEntryId', (request, response) => {
    const { binderCostEntryId } = request.params;

    database.transaction((tx) => {
      const existing = tx
        .select({ id: binderCostEntries.id })
        .from(binderCostEntries)
        .where(eq(binderCostEntries.id, binderCostEntryId))
        .get();
      // Deleting an already-absent entry is still a successful no-op,
      // matching every other delete endpoint in this app.
      if (!existing) return;

      tx.update(binders)
        .set({ selectedBinderCostEntryId: null, updatedAt: new Date().toISOString() })
        .where(eq(binders.selectedBinderCostEntryId, binderCostEntryId))
        .run();
      tx.delete(binderCostEntries).where(eq(binderCostEntries.id, binderCostEntryId)).run();
    });

    response.status(204).send();
  });

  // -- Printing cost entries -------------------------------------------

  router.get('/printing-cost-entries', (_request, response) => {
    const rows = database
      .select()
      .from(printingCostEntries)
      .orderBy(asc(sql`lower(${printingCostEntries.name})`))
      .all() as PrintingCostEntryRow[];
    const counts = countBindersByPrintingCostEntry(database);
    response
      .status(200)
      .json(rows.map((row) => toPrintingCostEntryResponse(row, counts.get(row.id) ?? 0)));
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
      .json(toPrintingCostEntryResponse(row, 0));
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

    response
      .status(200)
      .json(
        toPrintingCostEntryResponse(
          updated,
          countBindersSelectingPrintingCostEntry(database, printingCostEntryId),
        ),
      );
  });

  // Story 44: mirrors the Binder catalog's delete endpoint above, nulling
  // `selectedPrintingCostEntryId` instead.
  router.delete('/printing-cost-entries/:printingCostEntryId', (request, response) => {
    const { printingCostEntryId } = request.params;

    database.transaction((tx) => {
      const existing = tx
        .select({ id: printingCostEntries.id })
        .from(printingCostEntries)
        .where(eq(printingCostEntries.id, printingCostEntryId))
        .get();
      if (!existing) return;

      tx.update(binders)
        .set({ selectedPrintingCostEntryId: null, updatedAt: new Date().toISOString() })
        .where(eq(binders.selectedPrintingCostEntryId, printingCostEntryId))
        .run();
      tx.delete(printingCostEntries).where(eq(printingCostEntries.id, printingCostEntryId)).run();
    });

    response.status(204).send();
  });

  // -- Holographic paper cost entries -----------------------------------

  router.get('/holographic-paper-cost-entries', (_request, response) => {
    const rows = database
      .select()
      .from(holographicPaperCostEntries)
      .orderBy(asc(sql`lower(${holographicPaperCostEntries.name})`))
      .all() as HolographicPaperCostEntryRow[];
    const counts = countBindersByHolographicPaperCostEntry(database);
    response
      .status(200)
      .json(rows.map((row) => toHolographicPaperCostEntryResponse(row, counts.get(row.id) ?? 0)));
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
      .json(toHolographicPaperCostEntryResponse(row, 0));
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

      response
        .status(200)
        .json(
          toHolographicPaperCostEntryResponse(
            updated,
            countBindersSelectingHolographicPaperCostEntry(database, holographicPaperCostEntryId),
          ),
        );
    },
  );

  // Story 44: mirrors the Binder catalog's delete endpoint above, nulling
  // `selectedHolographicPaperCostEntryId` instead.
  router.delete(
    '/holographic-paper-cost-entries/:holographicPaperCostEntryId',
    (request, response) => {
      const { holographicPaperCostEntryId } = request.params;

      database.transaction((tx) => {
        const existing = tx
          .select({ id: holographicPaperCostEntries.id })
          .from(holographicPaperCostEntries)
          .where(eq(holographicPaperCostEntries.id, holographicPaperCostEntryId))
          .get();
        if (!existing) return;

        tx.update(binders)
          .set({
            selectedHolographicPaperCostEntryId: null,
            updatedAt: new Date().toISOString(),
          })
          .where(eq(binders.selectedHolographicPaperCostEntryId, holographicPaperCostEntryId))
          .run();
        tx.delete(holographicPaperCostEntries)
          .where(eq(holographicPaperCostEntries.id, holographicPaperCostEntryId))
          .run();
      });

      response.status(204).send();
    },
  );

  return router;
}
