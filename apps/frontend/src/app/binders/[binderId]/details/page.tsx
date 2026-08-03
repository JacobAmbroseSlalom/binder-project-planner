'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useCallback, useRef } from 'react';
import { useForm } from 'react-hook-form';

import { updateBinder as updateBinderRequest, type UpdateBinderRequest } from '@/lib/api';
import { useSaveStatusToast } from '@/shared/feedback';
import {
  BinderDetailsForm,
  binderDetailsSchema,
  type BinderDetailsFormInput,
  type BinderDetailsFormValues,
} from '@/shared/forms';

import { useBinderRouteContext } from '../BinderRouteContext';

// Fixed toast id, matching the pattern used by the other save/load
// operations in this app (e.g. `CREATE_BINDER_TOAST_ID`): a later save
// replaces this operation's own toast instead of stacking a new one.
const EDIT_BINDER_DETAILS_TOAST_ID = 'edit-binder-details';

// The "Edit Details" tab (story 7): reuses the same `BinderDetailsForm` as
// the new-binder page, but instead of a Create button, a field blur saves
// all currently valid dirty fields automatically.
export default function BinderDetailsPage() {
  const { binder, updateBinder } = useBinderRouteContext();
  const { start } = useSaveStatusToast();

  const form = useForm<BinderDetailsFormInput, unknown, BinderDetailsFormValues>({
    resolver: zodResolver(binderDetailsSchema),
    // Seeded from the already-loaded binder context (never refetched here),
    // so switching to this tab never triggers its own loading state.
    defaultValues: {
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
    },
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

      const toast = start(EDIT_BINDER_DETAILS_TOAST_ID);
      try {
        const updated = await updateBinderRequest(binder.id, patch);

        // Marks exactly the submitted fields clean using the backend's
        // returned values (per story 7); fields the user has since changed
        // again (and thus aren't in `patch`) are left untouched.
        (Object.keys(patch) as (keyof BinderDetailsFormInput)[]).forEach((field) => {
          form.resetField(field, { defaultValue: updated[field] });
        });
        // Story 20: reducing `pages` can make the previously saved
        // previewPhysicalPage invalid, causing the backend to reset it to
        // the shared default in this same response - even when
        // `previewPhysicalPage` itself wasn't part of this patch. Syncing
        // the field here (rather than only via the loop above) keeps the
        // form showing the same value the backend just saved instead of a
        // stale, now-invalid one until the next reload.
        if (form.getValues('previewPhysicalPage') !== updated.previewPhysicalPage) {
          form.resetField('previewPhysicalPage', { defaultValue: updated.previewPhysicalPage });
        }
        updateBinder(updated);
        toast.markSaved();
      } catch (error) {
        // Submitted fields remain dirty with the user's values so they can
        // be corrected or retried on the next blur.
        toast.markFailed(error);
      }
    } finally {
      savingRef.current = false;
      if (queuedRef.current) {
        queuedRef.current = false;
        void runSave();
      }
    }
  }, [binder.id, form, start, updateBinder]);

  const handleBlur = useCallback(() => {
    if (savingRef.current) {
      queuedRef.current = true;
      return;
    }
    void runSave();
  }, [runSave]);

  return (
    <div className="flex flex-col items-center gap-8 p-8">
      {/* React re-dispatches native `focusout` (which bubbles) for
          `onBlur`, so this one handler covers every field's blur without
          registering a per-field listener. */}
      <form onBlur={handleBlur} className="flex w-full max-w-2xl flex-col gap-8">
        <BinderDetailsForm form={form} />
      </form>
    </div>
  );
}
