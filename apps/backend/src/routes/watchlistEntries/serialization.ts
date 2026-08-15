import { fromCents } from '../../finance/currency.js';

import type { HydratingCardRow, WatchlistEntryRow } from './types.js';

// A minimal RFC 7807 Problem Details object, matching every other route
// file's own local `problem()` helper.
export function problem(status: number, title: string, detail: string) {
  return { type: 'about:blank', title, status, detail };
}

// Serializes one persisted watchlist-entry row as the OpenAPI
// `WatchlistEntry` response shape (story 45). When `card` is supplied
// (the entry references an existing binder card), every display/edit
// field is hydrated from that card's own row instead of the entry's own
// (mostly-null, per the `watchlist_entry_standalone_or_referenced` CHECK
// constraint) columns - a referenced entry's price/name/etc. are always
// the card's current values, never a stale copy.
export function serializeWatchlistEntry(entry: WatchlistEntryRow, card: HydratingCardRow | null) {
  const fields = card ?? entry;
  return {
    id: entry.id,
    cardId: entry.cardId,
    sortOrder: entry.sortOrder,
    name: fields.name!,
    setName: fields.setName,
    localNumber: fields.localNumber,
    source: fields.source!,
    providerCardId: fields.providerCardId,
    providerSetId: fields.providerSetId,
    variation: fields.variation,
    imageUrl: entry.cardId
      ? `/cards/${entry.cardId}/image`
      : `/watchlist-entries/${entry.id}/image`,
    price: fields.priceCents === null ? null : fromCents(fields.priceCents),
    isManualPrice: fields.isManualPrice,
    priceUpdatedAt: fields.priceUpdatedAt,
    createdAt: entry.createdAt,
    updatedAt: entry.updatedAt,
  };
}
