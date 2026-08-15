import { DEFAULT_BACKEND_ORIGIN } from '@binder-project-planner/shared';
import createClient from 'openapi-fetch';

import type { paths } from '@binder-project-planner/api-contract';

// Story 47: "Package and export the application as an executable". The
// packaged desktop app can't know its backend's actual port at build time
// (it's chosen at runtime - see apps/desktop/src/ports.ts), so its preload
// script injects the real origin as this global before any of the page's
// own scripts run (see apps/desktop/src/preload.ts). Declared here so
// `window.__BACKEND_URL__` below type-checks without `any`.
declare global {
  interface Window {
    __BACKEND_URL__?: string;
  }
}

// The backend origin is, in order: the Electron desktop app's injected
// runtime global (above); NEXT_PUBLIC_BACKEND_URL, overridable
// per-environment (e.g. for a non-default port in local web development);
// or the canonical shared default, so the frontend and backend never drift
// apart. Exported so callers rendering a card's image (story 11) can
// resolve its backend-relative `imageUrl` (e.g. `/cards/{cardId}/image`)
// into a full URL.
export const backendUrl =
  (typeof window !== 'undefined' ? window.__BACKEND_URL__ : undefined) ??
  process.env.NEXT_PUBLIC_BACKEND_URL ??
  DEFAULT_BACKEND_ORIGIN;

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
