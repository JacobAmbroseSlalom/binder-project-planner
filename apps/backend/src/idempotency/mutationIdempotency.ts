import { MUTATION_IDEMPOTENCY_RETENTION_MS } from '@binder-project-planner/shared';
import { eq, lt } from 'drizzle-orm';

import type { DatabaseConnection } from '../database/client.js';
import { mutationIdempotency } from '../database/schema.js';

// Deletes every idempotency record older than the shared retention window
// (planning.md: "removes expired idempotency records opportunistically
// during startup and bulk-request handling rather than requiring a
// background scheduler"). Called before every idempotency-key lookup below
// so an expired record is never replayed and the table doesn't grow
// without bound.
export function pruneExpiredIdempotencyRecords(database: DatabaseConnection['database']): void {
  const cutoff = new Date(Date.now() - MUTATION_IDEMPOTENCY_RETENTION_MS).toISOString();
  database.delete(mutationIdempotency).where(lt(mutationIdempotency.createdAt, cutoff)).run();
}

export interface StoredIdempotentOutcome {
  responseStatus: number;
  responseBody: unknown;
  locationHeader: string | null;
}

// Looks up a previously recorded outcome for one idempotency key scoped to
// one mutation kind (e.g. `art-duplicate`), pruning expired records first
// so a stale key is never replayed past the retention window.
export function findIdempotentOutcome(
  database: DatabaseConnection['database'],
  scope: string,
  key: string,
): StoredIdempotentOutcome | null {
  pruneExpiredIdempotencyRecords(database);

  const row = database
    .select()
    .from(mutationIdempotency)
    .where(eq(mutationIdempotency.key, key))
    .get();
  if (!row || row.scope !== scope) return null;

  return {
    responseStatus: row.responseStatus,
    responseBody: JSON.parse(row.responseBody),
    locationHeader: row.locationHeader,
  };
}

// Persists one mutation's outcome for the retention window (story 26).
export function saveIdempotentOutcome(
  database: DatabaseConnection['database'],
  scope: string,
  key: string,
  outcome: { responseStatus: number; responseBody: unknown; locationHeader: string | null },
): void {
  database
    .insert(mutationIdempotency)
    .values({
      key,
      scope,
      responseStatus: outcome.responseStatus,
      responseBody: JSON.stringify(outcome.responseBody),
      locationHeader: outcome.locationHeader,
      createdAt: new Date().toISOString(),
    })
    .run();
}
