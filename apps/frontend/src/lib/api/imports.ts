import { apiClient, type ExportedBinderPdf } from './client';
import type { ImportCommitResponse, ImportValidateResponse } from './types';

// Downloads the full-data export archive through `GET /exports/data`
// (story 33). Like the PDF exports, `parseAs: 'blob'` only affects the
// success body; an error response is still parsed as Problem Details.
// Returns the ZIP blob plus the filename the backend suggested via
// `Content-Disposition`, for the caller to trigger a browser download.
export async function exportData(): Promise<ExportedBinderPdf> {
  const { data, error, response } = await apiClient.GET('/exports/data', { parseAs: 'blob' });

  if (error) {
    throw error;
  }

  const contentDisposition = response.headers.get('Content-Disposition') ?? '';
  const filenameMatch = /filename="([^"]+)"/.exec(contentDisposition);
  const filename = filenameMatch?.[1] ?? 'binder-project-planner-export.zip';

  return { blob: data, filename };
}

// Validates and stages an import archive through
// `POST /imports/data/validate` (story 33). Sends the selected ZIP file as
// the multipart `archive` field; on success returns a `token` (identifying
// the staged archive to commit) and a summary of what a commit would add.
// Throws the Problem Details body on any validation failure so the caller
// can surface it via the shared failed toast.
export async function validateImport(file: File): Promise<ImportValidateResponse> {
  const formData = new FormData();
  formData.append('archive', file);

  const { data, error } = await apiClient.POST('/imports/data/validate', {
    // See createCustomCard's comment: openapi-fetch passes a `FormData`
    // instance through untouched, but the generated request-body type only
    // models the multipart schema's field shapes.
    body: formData as never,
  });

  if (error) {
    throw error;
  }

  return data;
}

// Commits a previously validated+staged import through
// `POST /imports/data/commit` (story 33), applying it in one transaction.
// Throws the Problem Details body on failure (e.g. an expired token) so the
// caller can surface it via the shared failed toast.
export async function commitImport(token: string): Promise<ImportCommitResponse> {
  const { data, error } = await apiClient.POST('/imports/data/commit', {
    body: { token },
  });

  if (error) {
    throw error;
  }

  return data;
}
