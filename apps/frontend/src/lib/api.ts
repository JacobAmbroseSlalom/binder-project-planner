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
