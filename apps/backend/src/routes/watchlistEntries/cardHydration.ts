import { inArray } from 'drizzle-orm';

import type { DatabaseConnection } from '../../database/client.js';
import { cards } from '../../database/schema.js';

import type { HydratingCardRow, WatchlistEntryRow } from './types.js';

// Looks up the joined card (if any) for a batch of entry rows in one
// extra query, rather than one query per referenced entry.
export function loadCardsByIdForEntries(
  database: DatabaseConnection['database'],
  entryRows: WatchlistEntryRow[],
): Map<string, HydratingCardRow> {
  const referencedCardIds = entryRows
    .map((entry) => entry.cardId)
    .filter((id): id is string => id !== null);
  if (referencedCardIds.length === 0) return new Map();
  const cardRows = database.select().from(cards).where(inArray(cards.id, referencedCardIds)).all();
  return new Map(cardRows.map((card) => [card.id, card]));
}
