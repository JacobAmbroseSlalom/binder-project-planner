import { asc, desc, sql } from 'drizzle-orm';
import type { Router } from 'express';

import { art, binders, binderTags, cards } from '../../database/schema.js';

import { buildBinderSummary } from './summary.js';
import type { BinderRow, BindersRouteDeps } from './types.js';

// Story 5's binder list and story 51's tag-suggestion list - both simple,
// read-only, whole-table-scoped GETs with no path parameter, grouped in
// one file for that shared shape.
export function registerBinderListRoutes(router: Router, deps: BindersRouteDeps): void {
  const { database } = deps;

  // Story 5: "List binders". Returns the complete binder-summary collection
  // (no pagination), sorted by most recent activity descending and then by
  // binder UUID ascending as a deterministic tie-breaker. Story 20 embeds
  // each binder's own saved preview spread (cards/art placed within it)
  // directly in its summary, so the home page needs no separate preview
  // requests.
  router.get('/binders', (_request, response) => {
    // A binder's effective "last activity" is the newest of its own
    // `updatedAt` and the newest `updatedAt` among its cards and art, so
    // adding/moving/editing a card or art item floats the binder to the top
    // of the list - not just edits to the binder's own details. ISO-8601
    // timestamps sort correctly as strings, and SQLite's variadic `max()`
    // returns the greatest of its arguments. (A card/art deletion doesn't
    // change any remaining row's timestamp, so it isn't reflected here.)
    const lastActivity = sql`max(
      ${binders.updatedAt},
      coalesce((select max(${cards.updatedAt}) from ${cards} where ${cards.binderId} = ${binders.id}), ${binders.updatedAt}),
      coalesce((select max(${art.updatedAt}) from ${art} where ${art.binderId} = ${binders.id}), ${binders.updatedAt})
    )`;
    const rows = database
      .select()
      .from(binders)
      .orderBy(desc(lastActivity), asc(binders.id))
      .all() as BinderRow[];

    const summaries = rows.map((row) => buildBinderSummary(database, row));

    response.status(200).json(summaries);
  });

  // Story 51: the tags combobox's suggestion list - the distinct tag text
  // currently used by any binder, alphabetically ordered case-
  // insensitively. Grouping by `normalizedTag` collapses two binders'
  // differently-cased spellings of the same tag (e.g. "Foil" and "foil")
  // into one suggestion; `min(tag)` picks one deterministic casing to
  // display for that group.
  router.get('/tags', (_request, response) => {
    const rows = database
      .select({ tag: sql<string>`min(${binderTags.tag})` })
      .from(binderTags)
      .groupBy(binderTags.normalizedTag)
      .orderBy(asc(binderTags.normalizedTag))
      .all();

    response.status(200).json(rows.map((row) => row.tag));
  });
}
