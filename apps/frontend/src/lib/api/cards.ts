import { apiClient, backendUrl } from './client';
import type {
  BulkCardOutcome,
  BulkTargetPlacement,
  Card,
  CardPositionUpdate,
  CardSearchLanguage,
  CardSearchResponse,
  TcgDexCatalogCard,
} from './types';

// Fetches every binder-owned card through `GET /binders/{binderId}/cards`
// (story 7, populated by story 11's card creation).
export async function listBinderCards(binderId: string, signal?: AbortSignal): Promise<Card[]> {
  const { data, error } = await apiClient.GET('/binders/{binderId}/cards', {
    params: { path: { binderId } },
    signal,
  });

  if (error) {
    throw error;
  }

  return data;
}

// Searches the TCGdex card catalog through `GET /card-catalog/search`
// (story 11), used by the card-selection modal's debounced search box.
// Accepts an `AbortSignal` so the modal can cancel a stale in-flight search
// as soon as a newer query is typed. `language` (story 41) defaults to
// English on the backend when omitted; the response's `translationWarning`
// flag is only ever meaningful for a `ja` search. `includeTcgPocket`
// (story 41) defaults to `false` on the backend when omitted, excluding
// Pokémon TCG Pocket cards from results.
export async function searchCardCatalog(
  query: string,
  language?: CardSearchLanguage,
  includeTcgPocket?: boolean,
  signal?: AbortSignal,
): Promise<CardSearchResponse> {
  const { data, error } = await apiClient.GET('/card-catalog/search', {
    params: { query: { query, language, includeTcgPocket } },
    signal,
  });

  if (error) {
    throw error;
  }

  return data;
}

// Creates one or more independent TCGdex cards through
// `POST /binders/{binderId}/cards/bulk` (stories 17/18) - the sole
// TCGdex-card creation path; a single selected card is submitted as a
// one-element `cards` array rather than a separate single-card request.
// `idempotencyKey` is a client-generated UUID sent as the `Idempotency-Key`
// header; retrying the same key after a dropped response replays the
// original outcome instead of creating additional cards, matching the
// backend's 24-hour mutation-idempotency retention. Throws the Problem
// Details body only for a request-wide failure (e.g. missing binder,
// overlapping bulk request, or invalid `targetPlacement`) - per-card
// failures are reported through the returned outcome array instead, since
// the backend's `207 Multi-Status` response is still a successful fetch.
export async function createCardsBulk(
  binderId: string,
  request: {
    cards: TcgDexCatalogCard[];
    variation?: string | null;
    // Story 36: applied to every card in this batch, mirroring `variation`
    // above; omitted defaults to unacquired on the backend.
    acquired?: boolean;
    targetPlacement?: BulkTargetPlacement;
  },
  idempotencyKey: string,
): Promise<BulkCardOutcome[]> {
  const { data, error } = await apiClient.POST('/binders/{binderId}/cards/bulk', {
    params: { path: { binderId }, header: { 'Idempotency-Key': idempotencyKey } },
    body: request,
  });

  if (error) {
    throw error;
  }

  return data;
}

// A manually-entered custom card's creation request (story 12) - built into
// a `multipart/form-data` body below rather than JSON, since it carries the
// uploaded image file itself. `variation` (story 16) is optional/nullable,
// matching the TCGdex `CreateCardRequest`'s own optional variation field.
export interface CreateCustomCardRequest {
  name: string;
  setName: string | null;
  localNumber: string | null;
  variation?: string | null;
  // Story 36: the modal's "Acquired" checkbox value; unchecked (`false`)
  // by default.
  acquired?: boolean;
  placement: { physicalPage: number; row: number; column: number } | null;
  image: File;
}

// Assigns a manually-entered custom card to a binder slot through
// `POST /binders/{binderId}/cards` (story 12's multipart variant of the
// same endpoint `createCard` above uses for TCGdex cards). Blank
// setName/localNumber/variation are omitted from the form data entirely
// (rather than sent as empty strings) so the backend stores them as
// `null`, matching `createCard`'s JSON request shape.
export async function createCustomCard(
  binderId: string,
  request: CreateCustomCardRequest,
): Promise<Card> {
  const formData = new FormData();
  formData.append('name', request.name);
  if (request.setName) formData.append('setName', request.setName);
  if (request.localNumber) formData.append('localNumber', request.localNumber);
  if (request.variation) formData.append('variation', request.variation);
  // Story 36: always sent explicitly (unlike the blank-omits-the-field text
  // fields above) since `false` is a meaningful value here, not "absent" -
  // the multipart field is a string either way, coerced to boolean by the
  // backend's `coerceTypes: true` body validation.
  formData.append('acquired', String(request.acquired ?? false));
  if (request.placement) {
    formData.append('physicalPage', String(request.placement.physicalPage));
    formData.append('row', String(request.placement.row));
    formData.append('column', String(request.placement.column));
  }
  formData.append('image', request.image);

  const { data, error } = await apiClient.POST('/binders/{binderId}/cards', {
    params: { path: { binderId } },
    // openapi-fetch's default body serializer passes a `FormData` instance
    // through untouched (letting the browser set the multipart
    // `Content-Type` boundary itself); the generated request-body type only
    // models the multipart schema's field shapes rather than a runtime
    // `FormData` instance, so this cast is required.
    body: formData as never,
  });

  if (error) {
    throw error;
  }

  return data;
}

// Permanently deletes a binder-owned card through `DELETE /cards/{cardId}`
// (story 13). Deleting an already-absent card also succeeds (`204 No
// Content`), matching the backend's idempotent-delete contract; throws the
// Problem Details body on any other failure so the caller can roll back its
// optimistic removal and surface the error via `toProblemDetailsInfo`.
export async function deleteCard(cardId: string): Promise<void> {
  const { error } = await apiClient.DELETE('/cards/{cardId}', {
    params: { path: { cardId } },
  });

  if (error) {
    throw error;
  }
}

// Moves or swaps card positions through `PATCH /cards/{cardId}` (story 14).
// `updates` contains one entry for a simple move or two for a swap; the
// path `cardId` must identify the dragged card included among them. Returns
// the complete persisted representation of every card the backend updated,
// so the caller can replace its optimistic values with the authoritative
// ones. Throws the Problem Details body on failure (e.g. `409 Conflict` for
// a stale expected position or an occupied destination) so the caller can
// roll back its optimistic move/swap and surface the error via
// `toProblemDetailsInfo`. `PATCH /cards/{cardId}` also accepts story 16's
// variation-only request shape (see `updateCardVariation` below), so the
// generated response type is a union - this call site always supplies
// `updates`, so the response is always the array branch.
export async function moveCards(cardId: string, updates: CardPositionUpdate[]): Promise<Card[]> {
  const { data, error } = await apiClient.PATCH('/cards/{cardId}', {
    params: { path: { cardId } },
    body: { updates },
  });

  if (error) {
    throw error;
  }

  return data as Card[];
}

// Updates a card's saved variation through `PATCH /cards/{cardId}` (story
// 16), sharing the same path/method as `moveCards` above but with a
// `variation`-only request body instead of `updates` - the backend
// branches on which shape the body is. Returns the complete persisted
// card, using last-write-wins semantics (no expected prior value is sent).
// Throws the Problem Details body on failure so the caller can roll back
// its optimistic variation update.
export async function updateCardVariation(cardId: string, variation: string | null): Promise<Card> {
  const { data, error } = await apiClient.PATCH('/cards/{cardId}', {
    params: { path: { cardId } },
    body: { variation },
  });

  if (error) {
    throw error;
  }

  return data as Card;
}

// Updates a card's acquisition state through `PATCH /cards/{cardId}` (story
// 36), sharing the same path/method as `moveCards`/`updateCardVariation`
// above but with an `acquired`-only request body - the backend branches on
// which shape the body is. Returns the complete persisted card, using
// last-write-wins semantics. Throws the Problem Details body on failure so
// the caller can roll back its optimistic acquisition toggle.
export async function updateCardAcquired(cardId: string, acquired: boolean): Promise<Card> {
  const { data, error } = await apiClient.PATCH('/cards/{cardId}', {
    params: { path: { cardId } },
    body: { acquired },
  });

  if (error) {
    throw error;
  }

  return data as Card;
}

// Bulk-updates multiple cards' acquisition state through `PATCH /binders/
// {binderId}/cards/acquisition` (story 46), used by the Card List tab's
// select-all/deselect-all header control instead of looping individual
// `updateCardAcquired` calls. Returns the complete persisted
// representation of every updated card (order not guaranteed to match
// `cardIds`), so the caller can replace its optimistic values with the
// authoritative ones. Throws the Problem Details body on failure so the
// caller can roll back its optimistic bulk toggle.
export async function updateCardsAcquisition(
  binderId: string,
  cardIds: string[],
  acquired: boolean,
): Promise<Card[]> {
  const { data, error } = await apiClient.PATCH('/binders/{binderId}/cards/acquisition', {
    params: { path: { binderId } },
    body: { cardIds, acquired },
  });

  if (error) {
    throw error;
  }

  return data;
}

// Duplicates a card into the unplaced-cards section through `POST
// /cards/{cardId}/duplicate` (story 19), mirroring `duplicateArt` above.
// `idempotencyKey` is a client-generated UUID sent as the
// `Idempotency-Key` header; retrying the same key after a dropped response
// replays the original outcome instead of creating a second copy, matching
// the backend's 24-hour mutation-idempotency retention. Throws the
// Problem Details body on failure so the caller can roll back its
// optimistic insert.
export async function duplicateCard(cardId: string, idempotencyKey: string): Promise<Card> {
  const { data, error } = await apiClient.POST('/cards/{cardId}/duplicate', {
    params: { path: { cardId }, header: { 'Idempotency-Key': idempotencyKey } },
  });

  if (error) {
    throw error;
  }

  return data;
}

// Resolves a `Card.imageUrl` into a full URL for an `<img>` tag (story 11).
// The backend's persisted representation returns a backend-relative path
// (`/cards/{cardId}/image`), which needs the backend origin prefixed; the
// provider's own absolute URL (used transiently by the optimistic card
// while the assignment request is in flight) is already a full URL and is
// returned as-is.
export function resolveCardImageUrl(imageUrl: string): string {
  if (imageUrl.startsWith('http://') || imageUrl.startsWith('https://')) {
    return imageUrl;
  }
  return `${backendUrl}${imageUrl}`;
}
