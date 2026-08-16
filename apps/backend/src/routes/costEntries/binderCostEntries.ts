import { randomUUID } from 'node:crypto';
import { asc, eq, isNotNull, sql } from 'drizzle-orm';
import type { Router } from 'express';

import { binderCostEntries, binders } from '../../database/schema.js';
import { fromCents, toCents } from '../../finance/currency.js';

import { problem, validateName, type CostEntriesRouteDeps } from './shared.js';

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

// Story 44: the count of binders currently selecting one catalog entry, for
// the "Manage cost entries" modal's per-row impact indicator. A single
// grouped query (rather than one query per entry) computes every entry's
// count at once for the list endpoint; a targeted single-id query covers
// the create/update endpoints, which only ever need one entry's count.
function countBindersByBinderCostEntry(
  database: CostEntriesRouteDeps['database'],
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
  database: CostEntriesRouteDeps['database'],
  binderCostEntryId: string,
): number {
  const row = database
    .select({ count: sql<number>`count(*)` })
    .from(binders)
    .where(eq(binders.selectedBinderCostEntryId, binderCostEntryId))
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

// Story 34's Binder cost entry catalog: a full-CRUD-minus-delete REST
// resource (deletion added by story 44) shaped to match its own fields
// (rather than one generic discriminated table). The list endpoint returns
// entries ordered alphabetically by `name` (case-insensitive) so the
// frontend's dropdowns never need to re-sort. None of these mutations are
// ever restricted by any binder's lock state - it's a shared catalog, not
// scoped to one binder.
export function registerBinderCostEntryRoutes(router: Router, deps: CostEntriesRouteDeps): void {
  const { database } = deps;

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
}
