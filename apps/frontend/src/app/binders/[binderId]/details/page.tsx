'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useCallback, useRef, useState } from 'react';
import { useForm } from 'react-hook-form';

import {
  previewBinderResize,
  updateBinderWithRelocations,
  type Binder,
  type UpdateBinderRequest,
  type UpdateBinderResult,
} from '@/lib/api';
import { useSaveStatusToast } from '@/shared/feedback';
import {
  BinderDetailsForm,
  binderDetailsSchema,
  type BinderDetailsFormInput,
  type BinderDetailsFormValues,
} from '@/shared/forms';

import { useBinderRouteContext } from '../BinderRouteContext';
import { ResizeRelocationConfirmDialog } from './_components/ResizeRelocationConfirmDialog';

// Fixed toast id, matching the pattern used by the other save/load
// operations in this app (e.g. `CREATE_BINDER_TOAST_ID`): a later save
// replaces this operation's own toast instead of stacking a new one.
const EDIT_BINDER_DETAILS_TOAST_ID = 'edit-binder-details';

interface ResizeReductionValues {
  width: number;
  height: number;
  pages: number;
}

interface ResizeRelocationConfirmation {
  patch: UpdateBinderRequest;
  affectedCardCount: number;
  affectedArtCount: number;
}

function getBinderFormValues(binder: Binder): BinderDetailsFormInput {
  return {
    name: binder.name,
    width: binder.width,
    height: binder.height,
    pages: binder.pages,
    widthPerSlot: binder.widthPerSlot,
    widthBase: binder.widthBase,
    heightPerSlot: binder.heightPerSlot,
    heightBase: binder.heightBase,
    borderColor: binder.borderColor,
    borderRadius: binder.borderRadius,
    borderWidth: binder.borderWidth,
    previewPhysicalPage: binder.previewPhysicalPage,
  };
}

// Reads effective width/height/pages for this pending patch (dirty fields
// override current persisted binder values), used to determine whether the
// patch is a potentially reducing resize.
function getEffectiveResizeValues(
  binder: Binder,
  patch: UpdateBinderRequest,
): ResizeReductionValues {
  return {
    width: patch.width ?? binder.width,
    height: patch.height ?? binder.height,
    pages: patch.pages ?? binder.pages,
  };
}

// Story 27 preview is only needed when any slot-coverage dimension
// decreases; non-reducing updates use the normal save path.
function isReducingResize(binder: Binder, next: ResizeReductionValues): boolean {
  return next.width < binder.width || next.height < binder.height || next.pages < binder.pages;
}

// Best-effort extraction of story 27's `409 Conflict` counts payload from a
// failed update response.
function getResizeConflictCounts(error: unknown): {
  affectedCardCount: number;
  affectedArtCount: number;
} | null {
  if (!error || typeof error !== 'object') return null;

  const candidate = error as {
    status?: unknown;
    affectedCardCount?: unknown;
    affectedArtCount?: unknown;
  };

  if (
    candidate.status === 409 &&
    typeof candidate.affectedCardCount === 'number' &&
    typeof candidate.affectedArtCount === 'number'
  ) {
    return {
      affectedCardCount: candidate.affectedCardCount,
      affectedArtCount: candidate.affectedArtCount,
    };
  }

  return null;
}

// The "Edit Details" tab (story 7): reuses the same `BinderDetailsForm` as
// the new-binder page, but instead of a Create button, a field blur saves
// all currently valid dirty fields automatically.
export default function BinderDetailsPage() {
  const { binder, updateBinder, applyBinderResizeUpdate } = useBinderRouteContext();
  const { start, dismiss } = useSaveStatusToast();
  const [resizeConfirmation, setResizeConfirmation] = useState<ResizeRelocationConfirmation | null>(
    null,
  );
  const [isResizeConfirmSavePending, setIsResizeConfirmSavePending] = useState(false);

  const form = useForm<BinderDetailsFormInput, unknown, BinderDetailsFormValues>({
    resolver: zodResolver(binderDetailsSchema),
    // Seeded from the already-loaded binder context (never refetched here),
    // so switching to this tab never triggers its own loading state.
    defaultValues: getBinderFormValues(binder),
  });

  // RHF's `formState` is a Proxy that only tracks (and keeps up to date) the
  // properties actually read during render. Nothing else in this component
  // reads `dirtyFields` at render time (only `runSave`'s blur handler does,
  // below), so without this line the Proxy never subscribes to it and it
  // would always evaluate to `{}` — silently disabling every on-blur save.
  void form.formState.dirtyFields;

  // Serializes save requests so only one is in flight at a time (story 7).
  // `queuedRef` records that another blur happened while `savingRef` was
  // true, so its (by-then-current) dirty fields get folded into one
  // follow-up save once the in-flight request settles, rather than firing a
  // second overlapping request.
  const savingRef = useRef(false);
  const queuedRef = useRef(false);

  // Applies one successful binder-details update response to both the form
  // and binder route context.
  const applyUpdateResult = useCallback(
    (result: UpdateBinderResult, patch: UpdateBinderRequest) => {
      const updatedBinder = result.binder;

      // Marks exactly the submitted fields clean using authoritative backend
      // values; fields not part of this request remain untouched.
      (Object.keys(patch) as (keyof BinderDetailsFormInput)[]).forEach((field) => {
        form.resetField(field, { defaultValue: updatedBinder[field] });
      });

      // A page-count change can reset previewPhysicalPage server-side even
      // when that field wasn't in the patch.
      if (form.getValues('previewPhysicalPage') !== updatedBinder.previewPhysicalPage) {
        form.resetField('previewPhysicalPage', { defaultValue: updatedBinder.previewPhysicalPage });
      }

      if (applyBinderResizeUpdate) {
        applyBinderResizeUpdate(result);
      } else {
        updateBinder(updatedBinder);
      }
    },
    [applyBinderResizeUpdate, form, updateBinder],
  );

  // Runs the final PATCH request. For story 27 conflicts where consent is
  // still absent, the saving toast is dismissed and a relocation-confirm
  // modal is opened instead of showing a failed toast.
  const submitPatch = useCallback(
    async (patch: UpdateBinderRequest, moveAffectedItemsToUnplaced: boolean): Promise<boolean> => {
      const requestPatch = moveAffectedItemsToUnplaced
        ? { ...patch, moveAffectedItemsToUnplaced: true }
        : patch;

      const toast = start(EDIT_BINDER_DETAILS_TOAST_ID);
      try {
        const result = await updateBinderWithRelocations(binder.id, requestPatch);
        applyUpdateResult(result, patch);
        toast.markSaved();
        return true;
      } catch (error) {
        const conflictCounts = getResizeConflictCounts(error);
        if (!moveAffectedItemsToUnplaced && conflictCounts) {
          dismiss(toast.operationId);
          setResizeConfirmation({
            patch,
            affectedCardCount: conflictCounts.affectedCardCount,
            affectedArtCount: conflictCounts.affectedArtCount,
          });
          return false;
        }

        toast.markFailed(error);
        return false;
      }
    },
    [applyUpdateResult, binder.id, dismiss, start],
  );

  const runSave = useCallback(async () => {
    savingRef.current = true;

    try {
      // Re-validates every field so each field's post-validation errors are
      // current before deciding which dirty fields are safe to submit.
      await form.trigger();
      const { dirtyFields } = form.formState;
      const values = form.getValues();

      // Only dirty *and* currently-valid fields are included; an invalid
      // dirty field is simply left out (and left dirty) rather than
      // blocking the other valid fields from saving. `dirtyFields` (above)
      // reflects the current render because it's read during render too
      // (the `void form.formState.dirtyFields;` line above), but validity
      // can only change here, inside this async callback, as a *result* of
      // the `trigger()` call just above - there's no guaranteed render in
      // between for the exposed `form.formState` Proxy snapshot to have
      // picked it up. `getFieldState(field)` (called without a `formState`
      // argument) reads directly from RHF's live internal state instead of
      // that render-synced snapshot, so it reflects `trigger()`'s results
      // immediately, avoiding a race where a field that just failed
      // validation (e.g. `width: 0`) is incorrectly still treated as valid.
      const patch: UpdateBinderRequest = {};
      (Object.keys(dirtyFields) as (keyof BinderDetailsFormInput)[]).forEach((field) => {
        if (dirtyFields[field] && !form.getFieldState(field).invalid) {
          (patch as Record<string, unknown>)[field] = values[field];
        }
      });

      if (Object.keys(patch).length === 0) {
        return;
      }

      const nextResizeValues = getEffectiveResizeValues(binder, patch);
      if (isReducingResize(binder, nextResizeValues)) {
        const preview = await previewBinderResize(binder.id, nextResizeValues);
        if (preview.affectedCardCount + preview.affectedArtCount > 0) {
          setResizeConfirmation({
            patch,
            affectedCardCount: preview.affectedCardCount,
            affectedArtCount: preview.affectedArtCount,
          });
          return;
        }
      }

      await submitPatch(patch, false);
    } finally {
      savingRef.current = false;
      if (queuedRef.current) {
        queuedRef.current = false;
        void runSave();
      }
    }
  }, [binder, form, submitPatch]);

  const handleBlur = useCallback(() => {
    if (resizeConfirmation || isResizeConfirmSavePending) {
      return;
    }
    if (savingRef.current) {
      queuedRef.current = true;
      return;
    }
    void runSave();
  }, [isResizeConfirmSavePending, resizeConfirmation, runSave]);

  const handleCancelResizeConfirmation = useCallback(() => {
    if (isResizeConfirmSavePending) return;

    // Story 27 UX: canceling relocation confirmation abandons the pending
    // reducing edits and restores the form to persisted binder values.
    form.reset(getBinderFormValues(binder));
    setResizeConfirmation(null);
  }, [binder, form, isResizeConfirmSavePending]);

  const handleConfirmResizeRelocation = useCallback(async () => {
    if (!resizeConfirmation) return;

    setIsResizeConfirmSavePending(true);
    const didSave = await submitPatch(resizeConfirmation.patch, true);
    if (didSave) {
      setResizeConfirmation(null);
    }
    setIsResizeConfirmSavePending(false);
  }, [resizeConfirmation, submitPatch]);

  return (
    <div className="flex flex-col items-center gap-8 p-8">
      {/* React re-dispatches native `focusout` (which bubbles) for
          `onBlur`, so this one handler covers every field's blur without
          registering a per-field listener. */}
      <form onBlur={handleBlur} className="flex w-full max-w-2xl flex-col gap-8">
        <BinderDetailsForm form={form} />
      </form>
      {resizeConfirmation && (
        <ResizeRelocationConfirmDialog
          affectedCardCount={resizeConfirmation.affectedCardCount}
          affectedArtCount={resizeConfirmation.affectedArtCount}
          pending={isResizeConfirmSavePending}
          onCancel={handleCancelResizeConfirmation}
          onConfirm={handleConfirmResizeRelocation}
        />
      )}
    </div>
  );
}
