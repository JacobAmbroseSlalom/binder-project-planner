import { randomUUID } from 'node:crypto';
import { asc, eq, isNotNull, sql } from 'drizzle-orm';
import type { Router } from 'express';

import { binders, holographicPaperCostEntries } from '../../database/schema.js';
import { fromCents, toCents } from '../../finance/currency.js';

import { problem, validateName, type CostEntriesRouteDeps } from './shared.js';

interface HolographicPaperCostEntryRow {
  id: string;
  name: string;
  priceCents: number;
  pagesIncluded: number;
  createdAt: string;
  updatedAt: string;
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

function countBindersByHolographicPaperCostEntry(
  database: CostEntriesRouteDeps['database'],
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
  database: CostEntriesRouteDeps['database'],
  holographicPaperCostEntryId: string,
): number {
  const row = database
    .select({ count: sql<number>`count(*)` })
    .from(binders)
    .where(eq(binders.selectedHolographicPaperCostEntryId, holographicPaperCostEntryId))
    .get() as { count: number };
  return row.count;
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

// Story 34's Holographic Paper cost entry catalog - mirrors
// `registerBinderCostEntryRoutes`'s shape/behavior for its own fields; see
// that file's comments for the shared rationale.
export function registerHolographicPaperCostEntryRoutes(
  router: Router,
  deps: CostEntriesRouteDeps,
): void {
  const { database } = deps;

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

  // Story 44: mirrors the Binder catalog's delete endpoint, nulling
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
}
