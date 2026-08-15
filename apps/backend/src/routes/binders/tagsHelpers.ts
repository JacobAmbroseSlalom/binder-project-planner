import { randomUUID } from 'node:crypto';

import { BINDER_TAG_MAX_LENGTH } from '@binder-project-planner/shared';
import { asc, eq } from 'drizzle-orm';

import type { DatabaseConnection } from '../../database/client.js';
import { binderTags } from '../../database/schema.js';

// Story 51: this binder's own tags, in the order they were added
// (`createdAt` ascending) - the order new pills appear alongside the tags
// input.
export function listTagsForBinder(
  database: DatabaseConnection['database'],
  binderId: string,
): string[] {
  return database
    .select({ tag: binderTags.tag })
    .from(binderTags)
    .where(eq(binderTags.binderId, binderId))
    .orderBy(asc(binderTags.createdAt))
    .all()
    .map((row) => row.tag);
}

// Story 51: the first trimmed tag (in array order) whose length exceeds the
// shared 30-character maximum, or null when every tag is within bounds.
// Defense-in-depth alongside the OpenAPI request schema's own `maxLength`
// and the database's `binder_tag_length` check constraint.
export function findOverlongTag(tags: string[]): string | null {
  return tags.find((tag) => tag.length > BINDER_TAG_MAX_LENGTH) ?? null;
}

// Story 51: replaces every tag currently stored for `binderId` with
// `tags` (already trimmed and case-insensitively deduplicated by
// `normalizeBinderTagsList`), inside the caller's transaction. Used by both
// `POST /binders` (starting from no existing rows) and
// `PATCH /binders/{binderId}` (a full replacement of whatever was there
// before).
export function replaceBinderTags(
  tx: DatabaseConnection['database'],
  binderId: string,
  tags: string[],
  now: string,
): void {
  tx.delete(binderTags).where(eq(binderTags.binderId, binderId)).run();
  if (tags.length === 0) return;

  tx.insert(binderTags)
    .values(
      tags.map((tag) => ({
        id: randomUUID(),
        binderId,
        tag,
        normalizedTag: tag.toLowerCase(),
        createdAt: now,
      })),
    )
    .run();
}
