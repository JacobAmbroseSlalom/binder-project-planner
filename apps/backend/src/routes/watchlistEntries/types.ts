import type { DatabaseConnection } from '../../database/client.js';
import type { cards, watchlistEntries } from '../../database/schema.js';

// Shared dependencies every `routes/watchlistEntries/*Route.ts`
// registration function needs, mirroring `createWatchlistEntriesRouter`'s
// own former closure-captured arguments (`database`, `imagesDirectory`,
// `pokemonTcgApiKey`) - passed as one object rather than three positional
// arguments so adding a new dependency later doesn't require updating
// every registration function's signature.
export interface WatchlistEntriesRouteDeps {
  database: DatabaseConnection['database'];
  imagesDirectory: string;
  pokemonTcgApiKey: string | undefined;
}

export type WatchlistEntryRow = typeof watchlistEntries.$inferSelect;

// Only the fields a referenced entry's hydration reads from its joined
// card - a full `CardRow` isn't needed here since placement/binderId/
// acquired are never surfaced through a `WatchlistEntry` (story 45).
export type HydratingCardRow = Pick<
  typeof cards.$inferSelect,
  | 'id'
  | 'name'
  | 'setName'
  | 'localNumber'
  | 'source'
  | 'providerCardId'
  | 'providerSetId'
  | 'variation'
  | 'priceCents'
  | 'isManualPrice'
  | 'priceUpdatedAt'
>;

// The validated, OpenAPI-typed shape of a standalone create-entry request
// body (story 45, `multipart/form-data`), mirroring
// `CreateCustomCardRequestBody` minus placement/acquisition, which have no
// meaning for a binder-less entry.
export interface CreateWatchlistEntryRequestBody {
  name: string;
  setName?: string;
  localNumber?: string;
  variation?: string;
}

// The validated, OpenAPI-typed shape of `PATCH /watchlist-entries/
// {watchlistEntryId}`'s request body (story 45), mirroring
// `UpdateCardDetailsRequestBody`.
export interface UpdateWatchlistEntryRequestBody {
  name: string;
  setName?: string;
  localNumber?: string;
  variation?: string;
  price?: number;
}

// One normalized catalog result within a bulk request (story 45; story 43
// widens `source` beyond `tcgdex`), mirroring `routes/cards/`'s own
// `BulkCardItem`.
export interface BulkWatchlistCardItem {
  source: 'tcgdex' | 'pokemontcg';
  name: string;
  setName: string | null;
  localNumber: string | null;
  providerCardId: string;
  providerSetId: string;
  imageUrl: string;
}

export interface BulkCreateWatchlistEntriesRequestBody {
  cards: BulkWatchlistCardItem[];
  variation?: string | null;
}

export interface WatchlistEntryPriceFetchRequestBody {
  watchlistEntryIds: string[];
}

export interface WatchlistEntryPriceUpdate {
  watchlistEntryId: string;
  price: number;
  isManualPrice: boolean;
}

export interface UpdateWatchlistEntryPricesRequestBody {
  prices: WatchlistEntryPriceUpdate[];
}

// The validated, OpenAPI-typed shape of `PATCH /watchlist-entries/
// order`'s request body (story 52): a full replacement of every entry's
// `sortOrder` (as a plain ordered id array, renumbered 0..n-1) plus the
// new divider position, applied together in one request/transaction.
export interface UpdateWatchlistEntryOrderRequestBody {
  orderedEntryIds: string[];
  pdfExportCutoffCount: number;
}
