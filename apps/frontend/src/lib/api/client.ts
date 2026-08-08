import { DEFAULT_BACKEND_ORIGIN } from '@binder-project-planner/shared';
import createClient from 'openapi-fetch';

import type { paths } from '@binder-project-planner/api-contract';

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

// The result of a successful binder-layout PDF export: the generated file
// itself plus the filename the backend suggested via its
// `Content-Disposition` header, for the caller to use when triggering the
// browser download. Shared by every export endpoint (binder layout, art
// print, and the full-data export archive).
export interface ExportedBinderPdf {
  blob: Blob;
  filename: string;
}
