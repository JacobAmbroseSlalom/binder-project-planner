import { randomUUID } from 'node:crypto';
import { asc, eq, isNotNull, sql } from 'drizzle-orm';
import type { Router } from 'express';

import { binders, printingCostEntries } from '../../database/schema.js';
import { fromCents, toCents } from '../../finance/currency.js';

import { problem, validateName, type CostEntriesRouteDeps } from './shared.js';

interface PrintingCostEntryRow {
  id: string;
  name: string;
  pricePerPageCents: number;
  createdAt: string;
  updatedAt: string;
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

function countBindersByPrintingCostEntry(
  database: CostEntriesRouteDeps['database'],
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
  database: CostEntriesRouteDeps['database'],
  printingCostEntryId: string,
): number {
  const row = database
    .select({ count: sql<number>`count(*)` })
    .from(binders)
    .where(eq(binders.selectedPrintingCostEntryId, printingCostEntryId))
    .get() as { count: number };
  return row.count;
}

interface CreatePrintingCostEntryRequestBody {
  name: string;
  pricePerPage: number;
}

interface UpdatePrintingCostEntryRequestBody {
  name?: string;
  pricePerPage?: number;
}

// Story 34's Printing cost entry catalog - mirrors
// `registerBinderCostEntryRoutes`'s shape/behavior for its own fields; see
// that file's comments for the shared rationale (ordering, lock-state
// independence, story 44's delete-and-null-references behavior).
export function registerPrintingCostEntryRoutes(router: Router, deps: CostEntriesRouteDeps): void {
  const { database } = deps;

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

  // Story 44: mirrors the Binder catalog's delete endpoint, nulling
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
}
