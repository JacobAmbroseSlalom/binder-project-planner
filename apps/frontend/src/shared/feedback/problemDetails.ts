// Best-effort extraction of a backend Problem Details error (see
// packages/api-contract/openapi.yaml's ProblemDetails schema) into the fields
// the failed toast needs, tolerating non-Problem-Details failures (e.g.
// network errors or aborted requests) so every save operation can still
// report something to the user.
export interface ProblemDetailsInfo {
  detail: string;
  httpStatus?: number;
  problemType?: string;
}

const FALLBACK_DETAIL = 'Something went wrong. Please try again.';

// Reads `error` as a Problem Details body when possible, otherwise falls back
// to a generic `Error` message or, failing that, a generic user-facing string.
export function toProblemDetailsInfo(error: unknown): ProblemDetailsInfo {
  if (error && typeof error === 'object') {
    const candidate = error as { detail?: unknown; status?: unknown; type?: unknown };

    if (typeof candidate.detail === 'string' && candidate.detail.length > 0) {
      return {
        detail: candidate.detail,
        httpStatus: typeof candidate.status === 'number' ? candidate.status : undefined,
        problemType: typeof candidate.type === 'string' ? candidate.type : undefined,
      };
    }
  }

  if (error instanceof Error && error.message) {
    return { detail: error.message };
  }

  return { detail: FALLBACK_DETAIL };
}
