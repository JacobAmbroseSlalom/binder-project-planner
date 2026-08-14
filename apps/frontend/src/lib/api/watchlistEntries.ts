import { apiClient, type ExportedBinderPdf } from './client';
import type {
  BulkAddCardsToWatchlistOutcome,
  BulkCreateWatchlistEntriesRequest,
  BulkWatchlistEntryOutcome,
  TcgDexCatalogCard,
  UpdateWatchlistEntryOrderResponse,
  WatchlistEntry,
  WatchlistEntryList,
  WatchlistEntryPriceFetchResult,
  WatchlistEntryPriceUpdate,
  WatchlistEntryPriceUpdateOutcome,
} from './types';

// Story 45's "What I'm Looking For" section: every backend call the
// binder-less watchlist page makes, mirroring `cards.ts`'s own call
// shapes/conventions (multipart form bodies for image uploads,
// `Idempotency-Key` headers for bulk creates, per-item outcome arrays for
// bulk/price operations) so the two features stay consistent even though
// they're not the same endpoints.

// Fetches every entry on the shared list through `GET /watchlist-entries`
// - both standalone entries and ones referencing an existing binder card,
// already hydrated by the backend from whichever source (its own columns,
// or its joined card) applies. Ordered by each entry's persisted
// `sortOrder` (story 52); the page applies its own active column sort on
// top of this, or falls back to this order when no column sort is active.
// `pdfExportCutoffCount` is the persisted PDF export divider position,
// returned alongside the entries since it's a single global value.
export async function listWatchlistEntries(signal?: AbortSignal): Promise<WatchlistEntryList> {
  const { data, error } = await apiClient.GET('/watchlist-entries', { signal });

  if (error) {
    throw error;
  }

  return data;
}

// A binder Card List row's new "Add to What I'm Looking For" action
// through `POST /cards/{cardId}/watchlist-entry` - idempotent on the
// backend (returns the existing entry unchanged if this exact card is
// already listed), so the caller never needs to check for a duplicate
// itself before calling this.
export async function addCardToWatchlist(cardId: string): Promise<WatchlistEntry> {
  const { data, error } = await apiClient.POST('/cards/{cardId}/watchlist-entry', {
    params: { path: { cardId } },
  });

  if (error) {
    throw error;
  }

  return data;
}

// The bulk variant of `addCardToWatchlist` above through
// `POST /cards/watchlist-entries/bulk` - adds every submitted card id by
// reference in one request, each independently and idempotently, so a
// multi-row Card List selection can add them all at once.
export async function bulkAddCardsToWatchlist(
  cardIds: string[],
): Promise<BulkAddCardsToWatchlistOutcome[]> {
  const { data, error } = await apiClient.POST('/cards/watchlist-entries/bulk', {
    body: { cardIds },
  });

  if (error) {
    throw error;
  }

  return data;
}

// A manually-entered standalone entry's creation request (mirrors
// `CreateCustomCardRequest`, minus placement/acquisition, which have no
// meaning for a binder-less entry).
export interface CreateWatchlistEntryRequest {
  name: string;
  setName: string | null;
  localNumber: string | null;
  variation?: string | null;
  image: File;
}

// Creates a standalone custom entry directly on the What I'm Looking For
// list through `POST /watchlist-entries` (the "Add card" button's
// manual-entry view) - a `multipart/form-data` body, mirroring
// `createCustomCard`'s own field-omission convention for a blank
// setName/localNumber/variation.
export async function createWatchlistEntry(
  request: CreateWatchlistEntryRequest,
): Promise<WatchlistEntry> {
  const formData = new FormData();
  formData.append('name', request.name);
  if (request.setName) formData.append('setName', request.setName);
  if (request.localNumber) formData.append('localNumber', request.localNumber);
  if (request.variation) formData.append('variation', request.variation);
  formData.append('image', request.image);

  const { data, error } = await apiClient.POST('/watchlist-entries', {
    // See `createCustomCard` in `cards.ts`: openapi-fetch passes a
    // `FormData` instance through untouched, so this cast is required.
    body: formData as never,
  });

  if (error) {
    throw error;
  }

  return data;
}

// Creates one or more standalone TCGdex entries directly on the What I'm
// Looking For list through `POST /watchlist-entries/bulk` (the "Add card"
// button's search view) - mirrors `createCardsBulk`'s per-item outcome
// pattern and idempotency-key convention, minus placement/acquisition.
export async function createWatchlistEntriesBulk(
  request: {
    cards: TcgDexCatalogCard[];
    variation?: string | null;
  },
  idempotencyKey: string,
): Promise<BulkWatchlistEntryOutcome[]> {
  const { data, error } = await apiClient.POST('/watchlist-entries/bulk', {
    params: { header: { 'Idempotency-Key': idempotencyKey } },
    body: request as BulkCreateWatchlistEntriesRequest,
  });

  if (error) {
    throw error;
  }

  return data;
}

// Removes an entry from the What I'm Looking For list through
// `DELETE /watchlist-entries/{watchlistEntryId}` - a complete deletion for
// a standalone entry (nothing else references it), or just the reference
// for one linked to a binder card (the card itself is untouched). Also
// succeeds (`204 No Content`) for an already-absent entry, matching
// `deleteCard`'s own idempotent-delete contract.
export async function deleteWatchlistEntry(watchlistEntryId: string): Promise<void> {
  const { error } = await apiClient.DELETE('/watchlist-entries/{watchlistEntryId}', {
    params: { path: { watchlistEntryId } },
  });

  if (error) {
    throw error;
  }
}

// "Mark as acquired & remove" (only offered for an entry referencing a
// binder card): marks that card acquired and removes the entry in one
// request through `POST /watchlist-entries/{watchlistEntryId}/mark-acquired`,
// so a partial failure can't leave one change applied without the other.
export async function markWatchlistEntryAcquired(watchlistEntryId: string): Promise<void> {
  const { error } = await apiClient.POST('/watchlist-entries/{watchlistEntryId}/mark-acquired', {
    params: { path: { watchlistEntryId } },
  });

  if (error) {
    throw error;
  }
}

// Requests current pokemontcg.io price data for `watchlistEntryIds`
// through `POST /watchlist-entries/prices/fetch` (mirrors `fetchCardPrices`
// - nothing is persisted until `updateWatchlistEntryPrices` below commits
// it).
export async function fetchWatchlistEntryPrices(
  watchlistEntryIds: string[],
  signal?: AbortSignal,
): Promise<WatchlistEntryPriceFetchResult[]> {
  const { data, error } = await apiClient.POST('/watchlist-entries/prices/fetch', {
    body: { watchlistEntryIds },
    signal,
  });

  if (error) {
    throw error;
  }

  return data;
}

// Commits every reviewed row's new price at once through
// `PATCH /watchlist-entries/prices` (mirrors `updateCardPrices`) - a
// referenced entry's update writes through to its underlying card; a
// standalone entry's update writes to its own columns.
export async function updateWatchlistEntryPrices(
  prices: WatchlistEntryPriceUpdate[],
): Promise<WatchlistEntryPriceUpdateOutcome[]> {
  const { data, error } = await apiClient.PATCH('/watchlist-entries/prices', {
    body: { prices },
  });

  if (error) {
    throw error;
  }

  return data;
}

// Persists the list's drag order and PDF export divider position in one
// request through `PATCH /watchlist-entries/order` (story 52) - a full
// replacement of every entry's `sortOrder` from `orderedEntryIds`'s own
// order, plus the new divider position, applied together so a plain entry
// drag and a divider drag share one request shape.
export async function updateWatchlistEntryOrder(
  orderedEntryIds: string[],
  pdfExportCutoffCount: number,
): Promise<UpdateWatchlistEntryOrderResponse> {
  const { data, error } = await apiClient.PATCH('/watchlist-entries/order', {
    body: { orderedEntryIds, pdfExportCutoffCount },
  });

  if (error) {
    throw error;
  }

  return data;
}

// Generates and downloads the request's watchlist entry ids (in the exact
// order supplied - the caller already resolved the page's own manual-drag-
// or-column-sort order into this order) as a print/export PDF through
// `POST /watchlist-entries/exports/pdf` (story 45) - see
// `exportCardsListPdf` in `binders.ts` for why `parseAs: 'blob'` doesn't
// affect Problem Details error handling. Throws the Problem Details body
// on failure, matching every other mutation here.
export async function exportWatchlistPdf(watchlistEntryIds: string[]): Promise<ExportedBinderPdf> {
  const { data, error, response } = await apiClient.POST('/watchlist-entries/exports/pdf', {
    body: { watchlistEntryIds },
    parseAs: 'blob',
  });

  if (error) {
    throw error;
  }

  // Extracts the suggested filename from `Content-Disposition:
  // attachment; filename="<name>"`; falls back to a generic name in the
  // (unexpected) case the header is missing or doesn't match.
  const contentDisposition = response.headers.get('Content-Disposition') ?? '';
  const filenameMatch = /filename="([^"]+)"/.exec(contentDisposition);
  const filename = filenameMatch?.[1] ?? 'whats-im-looking-for.pdf';

  return { blob: data, filename };
}
