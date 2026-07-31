import { toProblemDetailsInfo } from '@/shared/feedback/problemDetails';

// Covers story 3's acceptance criteria that failed toasts display the
// backend-provided error detail and retain status/type for diagnostics,
// while still degrading gracefully for non-Problem-Details failures (e.g.
// network errors or unknown thrown values).
describe('toProblemDetailsInfo', () => {
  it('extracts detail, status, and type from a Problem Details error', () => {
    const error = {
      detail: 'A binder with this name already exists.',
      status: 409,
      type: 'https://example.com/problems/duplicate-name',
    };

    expect(toProblemDetailsInfo(error)).toEqual({
      detail: 'A binder with this name already exists.',
      httpStatus: 409,
      problemType: 'https://example.com/problems/duplicate-name',
    });
  });

  it('omits httpStatus and problemType when they are not present', () => {
    const error = { detail: 'Something specific failed.' };

    expect(toProblemDetailsInfo(error)).toEqual({
      detail: 'Something specific failed.',
      httpStatus: undefined,
      problemType: undefined,
    });
  });

  it('ignores a non-string status or type rather than surfacing malformed values', () => {
    const error = { detail: 'Bad shape.', status: 'not-a-number', type: 42 };

    expect(toProblemDetailsInfo(error)).toEqual({
      detail: 'Bad shape.',
      httpStatus: undefined,
      problemType: undefined,
    });
  });

  it('falls back to a generic Error message when detail is missing', () => {
    expect(toProblemDetailsInfo(new Error('network error'))).toEqual({
      detail: 'network error',
    });
  });

  it('falls back to a generic user-facing message for an unrecognized error value', () => {
    expect(toProblemDetailsInfo('just a string')).toEqual({
      detail: 'Something went wrong. Please try again.',
    });
    expect(toProblemDetailsInfo(undefined)).toEqual({
      detail: 'Something went wrong. Please try again.',
    });
  });
});
