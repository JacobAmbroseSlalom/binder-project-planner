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
// `GET /binders/{binderId}/art` (story 7). Art creation doesn't exist yet
// (story 25), so this always resolves to an empty array today.
export async function listBinderArt(binderId: string, signal?: AbortSignal): Promise<unknown[]> {
  const { data, error } = await apiClient.GET('/binders/{binderId}/art', {
    params: { path: { binderId } },
    signal,
  });

  if (error) {
    throw error;
  }

  return data;
}
