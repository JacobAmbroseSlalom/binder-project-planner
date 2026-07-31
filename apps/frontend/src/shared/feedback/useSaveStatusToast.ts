'use client';

import { useCallback } from 'react';

import { toProblemDetailsInfo } from './problemDetails';
import { useToastContext } from './ToastProvider';

// A single mutation's toast lifecycle, bound to the operation id `start()`
// generated for it. `markSaved`/`markFailed` always target that same toast,
// regardless of how many other mutations are in flight concurrently.
export interface SaveStatusToastHandle {
  operationId: string;
  markSaved: (message?: string) => void;
  markFailed: (error: unknown) => void;
}

// The shared entry point every save/update/move/duplicate/delete/lock/unlock
// mutation uses to drive its toast (story 3). Call `start()` when the
// mutation begins, then `markSaved()` or `markFailed(error)` once it
// settles; `markFailed` accepts the thrown/returned error directly and
// extracts its Problem Details `detail`, `status`, and `type` for display.
export function useSaveStatusToast() {
  const { startSaving, markSaved, markFailed, dismiss } = useToastContext();

  const start = useCallback(
    (operationId?: string): SaveStatusToastHandle => {
      const id = startSaving(operationId);
      return {
        operationId: id,
        markSaved: (message?: string) => markSaved(id, message),
        markFailed: (error: unknown) => markFailed(id, toProblemDetailsInfo(error)),
      };
    },
    [startSaving, markSaved, markFailed],
  );

  return { start, dismiss };
}
