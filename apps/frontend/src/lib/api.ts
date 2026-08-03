import { DEFAULT_BACKEND_ORIGIN } from '@binder-project-planner/shared';
import createClient from 'openapi-fetch';

import type { components, paths } from '@binder-project-planner/api-contract';

// The backend origin is overridable per-environment via NEXT_PUBLIC_BACKEND_URL
// (e.g. for a non-default port in local development); it otherwise falls back to
// the canonical shared default so the frontend and backend never drift apart.
// Exported so callers rendering a card's image (story 11) can resolve its
// backend-relative `imageUrl` (e.g. `/cards/{cardId}/image`) into a full URL.
export const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL ?? DEFAULT_BACKEND_ORIGIN;

// A single OpenAPI-typed REST client shared by every backend call the frontend makes.
export const apiClient = createClient<paths>({ baseUrl: backendUrl });

export interface HealthResponse {
  status: 'ok';
  database: 'connected';
}

// Calls the backend health-check endpoint and returns its typed JSON body, or
// throws if the request fails or the backend responds with an error.
export async function getHealth(): Promise<HealthResponse> {
  const { data, error } = await apiClient.GET('/health');

  if (error) {
    throw new Error('Failed to reach the backend health endpoint.');
  }

  return data;
}

export type Binder = components['schemas']['Binder'];
export type BinderSummary = components['schemas']['BinderSummary'];
export type CreateBinderRequest = components['schemas']['CreateBinderRequest'];
export type UpdateBinderRequest = components['schemas']['UpdateBinderRequest'];
export type Card = components['schemas']['Card'];
export type TcgDexCatalogCard = components['schemas']['TcgDexCatalogCard'];
export type CreateCardRequest = components['schemas']['CreateCardRequest'];
export type CardSearchLanguage = components['schemas']['CardSearchLanguage'];
export type CardSearchResponse = components['schemas']['CardSearchResponse'];
export type CardPositionUpdate = components['schemas']['CardPositionUpdate'];
export type Art = components['schemas']['Art'];
export type PlacementCoordinates = components['schemas']['PlacementCoordinates'];
export type BinderPreviewSpread = components['schemas']['BinderPreviewSpread'];
export type BinderPreviewCard = components['schemas']['BinderPreviewCard'];
export type BinderPreviewArt = components['schemas']['BinderPreviewArt'];
export type BinderPreview = components['schemas']['BinderPreview'];

// Fetches the complete binder-summary collection through `GET /binders`
// (story 5). The backend already returns it in the documented sort order
// (updatedAt descending, then binder UUID ascending), so the frontend
// renders the response as-is without re-sorting. Accepts an optional
// `AbortSignal` (story 6) so callers can cancel a stale in-flight request
// when a newer one starts.
export async function listBinders(signal?: AbortSignal): Promise<BinderSummary[]> {
  const { data, error } = await apiClient.GET('/binders', { signal });

  if (error) {
    throw error;
  }

  return data;
}

// Creates a binder through `POST /binders` (story 4). On failure, throws the
// backend's Problem Details body as-is so callers (via
// `useSaveStatusToast`/`toProblemDetailsInfo`) can read its `detail`,
// `status`, and `type` fields directly.
export async function createBinder(request: CreateBinderRequest): Promise<Binder> {
  const { data, error } = await apiClient.POST('/binders', { body: request });

  if (error) {
    throw error;
  }

  return data;
}

// Fetches one binder's details through `GET /binders/{binderId}` (story 7),
// used by the shared binder route context. Throws the Problem Details body
// on failure (including 404) so the caller can distinguish "missing binder"
// from other failures via `toProblemDetailsInfo`.
export async function getBinder(binderId: string, signal?: AbortSignal): Promise<Binder> {
  const { data, error } = await apiClient.GET('/binders/{binderId}', {
    params: { path: { binderId } },
    signal,
  });

  if (error) {
    throw error;
  }

  return data;
}

// Applies a partial update through `PATCH /binders/{binderId}` (story 7),
// used by the Edit Details tab's save-on-blur logic. Returns the complete
// persisted binder so the caller can reset form/context state from the
// backend's authoritative values.
export async function updateBinder(binderId: string, patch: UpdateBinderRequest): Promise<Binder> {
  const { data, error } = await apiClient.PATCH('/binders/{binderId}', {
    params: { path: { binderId } },
    body: patch,
  });

  if (error) {
    throw error;
  }

  return data;
}

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

// Assigns a TCGdex catalog card to a binder slot through
// `POST /binders/{binderId}/cards` (story 11). Throws the Problem Details
// body on failure so the caller can roll back its optimistic update and
// surface the error via `toProblemDetailsInfo`.
export async function createCard(binderId: string, request: CreateCardRequest): Promise<Card> {
  const { data, error } = await apiClient.POST('/binders/{binderId}/cards', {
    params: { path: { binderId } },
    body: request,
  });

  if (error) {
    throw error;
  }

  return data;
}

// A manually-entered custom card's creation request (story 12) - built into
// a `multipart/form-data` body below rather than JSON, since it carries the
// uploaded image file itself.
export interface CreateCustomCardRequest {
  name: string;
  setName: string | null;
  localNumber: string | null;
  placement: { physicalPage: number; row: number; column: number } | null;
  image: File;
}

// Assigns a manually-entered custom card to a binder slot through
// `POST /binders/{binderId}/cards` (story 12's multipart variant of the
// same endpoint `createCard` above uses for TCGdex cards). Blank
// setName/localNumber are omitted from the form data entirely (rather than
// sent as empty strings) so the backend stores them as `null`, matching
// `createCard`'s JSON request shape.
export async function createCustomCard(
  binderId: string,
  request: CreateCustomCardRequest,
): Promise<Card> {
  const formData = new FormData();
  formData.append('name', request.name);
  if (request.setName) formData.append('setName', request.setName);
  if (request.localNumber) formData.append('localNumber', request.localNumber);
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
// `toProblemDetailsInfo`.
export async function moveCards(cardId: string, updates: CardPositionUpdate[]): Promise<Card[]> {
  const { data, error } = await apiClient.PATCH('/cards/{cardId}', {
    params: { path: { cardId } },
    body: { updates },
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

// Fetches every binder-owned multi-slot-art record through
// `GET /binders/{binderId}/art` (story 7, populated by story 25's art
// creation).
export async function listBinderArt(binderId: string, signal?: AbortSignal): Promise<Art[]> {
  const { data, error } = await apiClient.GET('/binders/{binderId}/art', {
    params: { path: { binderId } },
    signal,
  });

  if (error) {
    throw error;
  }

  return data;
}

// One multi-slot-art item's creation request (story 25) - built into a
// `multipart/form-data` body below since it carries the uploaded image
// file itself. Border overrides are `null` when the field stays in "use
// binder setting" mode; a non-null value is a custom per-art override.
export interface CreateArtRequest {
  title: string;
  description: string | null;
  widthSlots: number;
  heightSlots: number;
  imageRotationDegrees: 0 | 90 | 180 | 270;
  focalX: number;
  focalY: number;
  scaleX: number;
  scaleY: number;
  borderColor: string | null;
  borderRadius: number | null;
  borderWidth: number | null;
  image: File;
}

// Creates multi-slot art in the unplaced-art section through
// `POST /binders/{binderId}/art` (story 25). Throws the Problem Details
// body on failure so the caller can roll back its optimistic insert and
// surface the error via `toProblemDetailsInfo`.
export async function createArt(binderId: string, request: CreateArtRequest): Promise<Art> {
  const formData = new FormData();
  formData.append('title', request.title);
  if (request.description) formData.append('description', request.description);
  formData.append('widthSlots', String(request.widthSlots));
  formData.append('heightSlots', String(request.heightSlots));
  formData.append('imageRotationDegrees', String(request.imageRotationDegrees));
  formData.append('focalX', String(request.focalX));
  formData.append('focalY', String(request.focalY));
  formData.append('scaleX', String(request.scaleX));
  formData.append('scaleY', String(request.scaleY));
  if (request.borderColor) formData.append('borderColor', request.borderColor);
  if (request.borderRadius !== null) formData.append('borderRadius', String(request.borderRadius));
  if (request.borderWidth !== null) formData.append('borderWidth', String(request.borderWidth));
  formData.append('image', request.image);

  const { data, error } = await apiClient.POST('/binders/{binderId}/art', {
    params: { path: { binderId } },
    // See createCustomCard's identical comment: openapi-fetch passes a
    // `FormData` instance through untouched, but the generated request-body
    // type only models the multipart schema's field shapes.
    body: formData as never,
  });

  if (error) {
    throw error;
  }

  return data;
}

// Resolves an `Art.imageUrl` into a full URL for an `<img>` tag (story 25),
// mirroring `resolveCardImageUrl`.
export function resolveArtImageUrl(imageUrl: string): string {
  if (imageUrl.startsWith('http://') || imageUrl.startsWith('https://')) {
    return imageUrl;
  }
  return `${backendUrl}${imageUrl}`;
}

// Moves one art item to a new placement (or to the unplaced-art section)
// through `PATCH /art/{artId}` (story 26). Unlike `moveCards`, art never
// swaps - this always sends exactly one expected/final placement pair.
// Throws the Problem Details body on failure (e.g. `409 Conflict` for a
// stale expected position or an occupied destination) so the caller can
// roll back its optimistic move and surface the error via
// `toProblemDetailsInfo`.
export async function moveArt(
  artId: string,
  expectedPlacement: PlacementCoordinates,
  finalPlacement: PlacementCoordinates,
): Promise<Art> {
  const { data, error } = await apiClient.PATCH('/art/{artId}', {
    params: { path: { artId } },
    body: { expectedPlacement, finalPlacement },
  });

  if (error) {
    throw error;
  }

  return data;
}

// One art item's edit request (story 26) - built into a `multipart/
// form-data` body below, mirroring `CreateArtRequest`'s fields. `image` is
// optional: omitting it keeps the art's current image.
// `moveToUnplacedOnConflict` confirms saving edited dimensions that would
// leave currently-placed art out of bounds or overlapping another item by
// moving it to the unplaced-art section in the same request.
export interface UpdateArtRequest {
  title: string;
  description: string | null;
  widthSlots: number;
  heightSlots: number;
  imageRotationDegrees: 0 | 90 | 180 | 270;
  focalX: number;
  focalY: number;
  scaleX: number;
  scaleY: number;
  borderColor: string | null;
  borderRadius: number | null;
  borderWidth: number | null;
  moveToUnplacedOnConflict?: boolean;
  image?: File;
}

// Edits an existing art item's metadata, transform, style overrides, and
// (optionally) its image through `PATCH /art/{artId}` (story 26). Throws
// the Problem Details body on failure - including `409 Conflict` when
// edited dimensions would leave placed art out of bounds/overlapping and
// `moveToUnplacedOnConflict` wasn't set - so the caller can roll back its
// optimistic edit and surface the error, or offer the nested "Save and
// Move to Unplaced" confirmation.
export async function updateArt(artId: string, request: UpdateArtRequest): Promise<Art> {
  const formData = new FormData();
  formData.append('title', request.title);
  if (request.description) formData.append('description', request.description);
  formData.append('widthSlots', String(request.widthSlots));
  formData.append('heightSlots', String(request.heightSlots));
  formData.append('imageRotationDegrees', String(request.imageRotationDegrees));
  formData.append('focalX', String(request.focalX));
  formData.append('focalY', String(request.focalY));
  formData.append('scaleX', String(request.scaleX));
  formData.append('scaleY', String(request.scaleY));
  if (request.borderColor) formData.append('borderColor', request.borderColor);
  if (request.borderRadius !== null) formData.append('borderRadius', String(request.borderRadius));
  if (request.borderWidth !== null) formData.append('borderWidth', String(request.borderWidth));
  if (request.moveToUnplacedOnConflict) formData.append('moveToUnplacedOnConflict', 'true');
  if (request.image) formData.append('image', request.image);

  const { data, error } = await apiClient.PATCH('/art/{artId}', {
    params: { path: { artId } },
    // See createCustomCard's identical comment: openapi-fetch passes a
    // `FormData` instance through untouched, but the generated request-body
    // type only models the multipart schema's field shapes.
    body: formData as never,
  });

  if (error) {
    throw error;
  }

  return data;
}

// Permanently deletes a binder-owned art item through `DELETE
// /art/{artId}` (story 26). Deleting an already-absent art item also
// succeeds (`204 No Content`), matching the backend's idempotent-delete
// contract; throws the Problem Details body on any other failure so the
// caller can roll back its optimistic removal and surface the error via
// `toProblemDetailsInfo`.
export async function deleteArt(artId: string): Promise<void> {
  const { error } = await apiClient.DELETE('/art/{artId}', {
    params: { path: { artId } },
  });

  if (error) {
    throw error;
  }
}

// Duplicates an art item into the unplaced-art section through `POST
// /art/{artId}/duplicate` (story 26). `idempotencyKey` is a
// client-generated UUID sent as the `Idempotency-Key` header; retrying the
// same key after a dropped response replays the original outcome instead
// of creating a second copy, matching the backend's 24-hour
// mutation-idempotency retention. Throws the Problem Details body on
// failure so the caller can roll back its optimistic insert.
export async function duplicateArt(artId: string, idempotencyKey: string): Promise<Art> {
  const { data, error } = await apiClient.POST('/art/{artId}/duplicate', {
    params: { path: { artId }, header: { 'Idempotency-Key': idempotencyKey } },
  });

  if (error) {
    throw error;
  }

  return data;
}
