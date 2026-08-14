import { apiClient, type ExportedBinderPdf } from './client';
import type {
  ArtPrintPageCountResult,
  Binder,
  BinderSummary,
  CreateBinderRequest,
  ResizePreviewRequest,
  ResizePreviewResult,
  UpdateBinderRequest,
  UpdateBinderResult,
} from './types';

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

// Story 51: fetches the tags combobox's suggestion list through
// `GET /tags` - the distinct tag text currently used by any binder,
// alphabetically ordered case-insensitively.
export async function listTagSuggestions(signal?: AbortSignal): Promise<string[]> {
  const { data, error } = await apiClient.GET('/tags', { signal });

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
// returning just the complete persisted binder for existing callers.
export async function updateBinder(binderId: string, patch: UpdateBinderRequest): Promise<Binder> {
  const result = await updateBinderWithRelocations(binderId, patch);
  return result.binder;
}

// Story 27-aware variant of binder update: returns the complete persisted
// binder plus any moved card/art representations included by an affecting
// resize response.
export async function updateBinderWithRelocations(
  binderId: string,
  patch: UpdateBinderRequest,
): Promise<UpdateBinderResult> {
  const { data, error } = await apiClient.PATCH('/binders/{binderId}', {
    params: { path: { binderId } },
    body: patch,
  });

  if (error) {
    throw error;
  }

  return data;
}

// Story 27's read-only dry run for a proposed binder resize. Returns every
// currently placed card/art id that would be affected, plus separate counts,
// without changing data.
export async function previewBinderResize(
  binderId: string,
  request: ResizePreviewRequest,
): Promise<ResizePreviewResult> {
  const { data, error } = await apiClient.POST('/binders/{binderId}/resize-preview', {
    params: { path: { binderId } },
    body: request,
  });

  if (error) {
    throw error;
  }

  return data;
}

// Permanently deletes a binder through `DELETE /binders/{binderId}` (story
// 21). Deleting an already-absent binder also succeeds (`204 No Content`).
// Throws the Problem Details body on any other failure (e.g. a locked-
// binder `409 Conflict`, once story 32 adds binder locking) so the caller
// can restore its optimistically removed binder summary.
export async function deleteBinder(binderId: string): Promise<void> {
  const { error } = await apiClient.DELETE('/binders/{binderId}', {
    params: { path: { binderId } },
  });

  if (error) {
    throw error;
  }
}

// Duplicates a binder and everything it owns through
// `POST /binders/{binderId}/duplicate` (story 21). `idempotencyKey` is a
// client-generated UUID sent as the `Idempotency-Key` header; retrying the
// same key after a dropped response replays the original outcome instead
// of creating a second copy, matching the backend's 24-hour
// mutation-idempotency retention. Throws the Problem Details body on
// failure so the caller can roll back its optimistic temporary summary.
export async function duplicateBinder(
  binderId: string,
  idempotencyKey: string,
): Promise<BinderSummary> {
  const { data, error } = await apiClient.POST('/binders/{binderId}/duplicate', {
    params: { path: { binderId }, header: { 'Idempotency-Key': idempotencyKey } },
  });

  if (error) {
    throw error;
  }

  return data;
}

// Generates and downloads a binder's layout PDF through
// `POST /binders/{binderId}/exports/pdf` (story 29). `parseAs: 'blob'`
// only changes how the *success* response body is parsed - openapi-fetch
// still parses an error response as Problem Details JSON regardless of
// `parseAs`, so the shared save-status toast's error handling keeps
// working unchanged. Throws the Problem Details body on failure, matching
// every other mutation here.
export async function exportBinderLayoutPdf(
  binderId: string,
  includeVariations: boolean,
): Promise<ExportedBinderPdf> {
  const { data, error, response } = await apiClient.POST('/binders/{binderId}/exports/pdf', {
    params: { path: { binderId } },
    body: { includeVariations },
    parseAs: 'blob',
  });

  if (error) {
    throw error;
  }

  // Extracts the suggested filename from `Content-Disposition:
  // attachment; filename="<name>.pdf"`; falls back to a generic name in
  // the (unexpected) case the header is missing or doesn't match.
  const contentDisposition = response.headers.get('Content-Disposition') ?? '';
  const filenameMatch = /filename="([^"]+)"/.exec(contentDisposition);
  const filename = filenameMatch?.[1] ?? 'binder.pdf';

  return { blob: data, filename };
}

// Generates and downloads a PDF of only the request's selected, currently
// placed multi-slot art through `POST /binders/{binderId}/exports/art-pdf`
// (story 30) - see `exportBinderLayoutPdf`'s comment above for why
// `parseAs: 'blob'` doesn't affect Problem Details error handling. Throws
// the Problem Details body on failure, matching every other mutation here.
export async function exportArtPrintPdf(
  binderId: string,
  selectedArtIds: string[],
): Promise<ExportedBinderPdf> {
  const { data, error, response } = await apiClient.POST('/binders/{binderId}/exports/art-pdf', {
    params: { path: { binderId } },
    body: { selectedArtIds },
    parseAs: 'blob',
  });

  if (error) {
    throw error;
  }

  // Extracts the suggested filename from `Content-Disposition:
  // attachment; filename="<name>-art.pdf"`; falls back to a generic name
  // in the (unexpected) case the header is missing or doesn't match.
  const contentDisposition = response.headers.get('Content-Disposition') ?? '';
  const filenameMatch = /filename="([^"]+)"/.exec(contentDisposition);
  const filename = filenameMatch?.[1] ?? 'binder-art.pdf';

  return { blob: data, filename };
}

// Generates and downloads a PDF of the request's card ids (in the exact
// order supplied - the caller already resolved the list's own
// search/sort/filter state into this order) through
// `POST /binders/{binderId}/exports/cards-pdf` (story 37) - see
// `exportBinderLayoutPdf`'s comment above for why `parseAs: 'blob'` doesn't
// affect Problem Details error handling. Throws the Problem Details body
// on failure, matching every other mutation here.
export async function exportCardsListPdf(
  binderId: string,
  cardIds: string[],
): Promise<ExportedBinderPdf> {
  const { data, error, response } = await apiClient.POST('/binders/{binderId}/exports/cards-pdf', {
    params: { path: { binderId } },
    body: { cardIds },
    parseAs: 'blob',
  });

  if (error) {
    throw error;
  }

  // Extracts the suggested filename from `Content-Disposition:
  // attachment; filename="<name>-cards.pdf"`; falls back to a generic
  // name in the (unexpected) case the header is missing or doesn't match.
  const contentDisposition = response.headers.get('Content-Disposition') ?? '';
  const filenameMatch = /filename="([^"]+)"/.exec(contentDisposition);
  const filename = filenameMatch?.[1] ?? 'binder-cards.pdf';

  return { blob: data, filename };
}

// Story 34: fetches the computed page count for this binder's currently
// placed multi-slot art through `GET /binders/{binderId}/art-print-page-count`,
// reusing the same packing/tiling logic as the art-print PDF export instead
// of generating one - the Finances tab uses this to derive its Printing,
// Holographic Paper, and time-based cost totals client-side.
export async function getArtPrintPageCount(
  binderId: string,
  signal?: AbortSignal,
): Promise<ArtPrintPageCountResult> {
  const { data, error } = await apiClient.GET('/binders/{binderId}/art-print-page-count', {
    params: { path: { binderId } },
    signal,
  });

  if (error) {
    throw error;
  }

  return data;
}
