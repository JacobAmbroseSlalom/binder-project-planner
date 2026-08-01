import { DEFAULT_BACKEND_ORIGIN } from '@binder-project-planner/shared';
import createClient from 'openapi-fetch';

import type { components, paths } from '@binder-project-planner/api-contract';

// The backend origin is overridable per-environment via NEXT_PUBLIC_BACKEND_URL
// (e.g. for a non-default port in local development); it otherwise falls back to
// the canonical shared default so the frontend and backend never drift apart.
const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL ?? DEFAULT_BACKEND_ORIGIN;

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
// (story 7). Card creation doesn't exist yet (story 11), so this always
// resolves to an empty array today; the shared binder context still fetches
// it in parallel with details and art so nothing needs to change here once
// cards exist.
export async function listBinderCards(binderId: string, signal?: AbortSignal): Promise<unknown[]> {
  const { data, error } = await apiClient.GET('/binders/{binderId}/cards', {
    params: { path: { binderId } },
    signal,
  });

  if (error) {
    throw error;
  }

  return data;
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
