'use client';

import { BINDER_NOTES_MAX_LENGTH } from '@binder-project-planner/shared';
import { useCallback, useRef, useState } from 'react';

import { updateBinder as updateBinderRequest } from '@/lib/api';
import { useSaveStatusToast } from '@/shared/feedback';

import { useBinderRouteContext } from '../../BinderRouteContext';

// Fixed toast id (matching the other binder save operations, e.g.
// `EDIT_BINDER_DETAILS_TOAST_ID`): a later notes save replaces this
// operation's own toast rather than stacking a new one.
const EDIT_BINDER_NOTES_TOAST_ID = 'edit-binder-notes';

// The full-width binder notes section (story 23), rendered below the layout
// grid on the "Edit Layout" tab when the notes toggle is on. A plain
// Markdown-source textarea (no rendered preview) that saves on blur when its
// contents changed, through the existing `PATCH /binders/{binderId}` and the
// shared save-status toast. Notes are already part of the loaded binder
// context, so nothing is fetched here.
export function BinderNotesSection() {
  const { binder, updateBinder } = useBinderRouteContext();
  const { start } = useSaveStatusToast();

  // The textarea's live value, seeded once from the loaded binder's saved
  // notes (null renders as an empty box). `valueRef` mirrors it so the
  // serialized-save logic below always reads the latest text without a
  // stale closure, even when a queued follow-up save runs after the
  // component last rendered.
  const [value, setValue] = useState(binder.notes ?? '');
  const valueRef = useRef(value);

  // The last value successfully persisted (or the initial saved value),
  // used both to skip a no-op save on blur and to compare against a queued
  // follow-up. Empty string here mirrors the backend's null-notes.
  const lastSavedRef = useRef(binder.notes ?? '');

  // Serializes saves so only one is in flight at a time (story 23);
  // `queuedRef` records that the text changed again mid-save so the latest
  // value is sent in one follow-up once the active request settles.
  const savingRef = useRef(false);
  const queuedRef = useRef(false);

  const runSave = useCallback(async () => {
    // Nothing to do if the current text already matches what's saved (e.g.
    // a blur with no change, or a queued follow-up whose value was already
    // captured by the request that just finished).
    if (valueRef.current === lastSavedRef.current) return;

    savingRef.current = true;
    const attempted = valueRef.current;
    const toast = start(EDIT_BINDER_NOTES_TOAST_ID);
    try {
      // An exactly-empty textarea sends an empty string, which the backend
      // normalizes to null; non-empty Markdown is sent as-is.
      const updated = await updateBinderRequest(binder.id, { notes: attempted });
      // Track what the backend actually persisted (null -> '') so the
      // no-op check above stays accurate.
      lastSavedRef.current = updated.notes ?? '';
      updateBinder(updated);
      toast.markSaved();
    } catch (error) {
      // The entered text is left in the textarea (never reset) so the user
      // can correct or retry it on the next blur.
      toast.markFailed(error);
    } finally {
      savingRef.current = false;
      // If the text changed again while this save was in flight, send the
      // latest value now in one follow-up request (story 23's coalescing).
      // A failed active save still submits the queued value per the
      // acceptance criteria, since this runs regardless of success/failure.
      if (queuedRef.current) {
        queuedRef.current = false;
        void runSave();
      }
    }
    // `runSave` self-references in its `finally`; by the time that runs the
    // binding is assigned, matching the Edit Details tab's identical pattern.
  }, [binder.id, start, updateBinder]);

  const handleBlur = useCallback(() => {
    if (savingRef.current) {
      // A save is already running; remember to send the latest value after
      // it settles rather than starting an overlapping request.
      queuedRef.current = true;
      return;
    }
    void runSave();
  }, [runSave]);

  return (
    // `flex-1 min-h-0` so the section grows to fill the center column's
    // remaining height below the (fixed-height) spread, aligning its bottom
    // with the unplaced side panels.
    <section className="flex min-h-0 flex-1 flex-col gap-2">
      <label htmlFor="binder-notes" className="text-caption text-neutral-500">
        Notes
      </label>
      <textarea
        id="binder-notes"
        value={value}
        maxLength={BINDER_NOTES_MAX_LENGTH}
        onChange={(event) => {
          setValue(event.target.value);
          valueRef.current = event.target.value;
        }}
        onBlur={handleBlur}
        placeholder="Free-form notes and to-do items for this binder…"
        // Filled-input treatment from the styling conventions (neutral-800
        // fill, no resting border, primary border on focus). Fills the
        // section's remaining height (`flex-1 min-h-0`) so it reaches the
        // bottom of the unplaced panels, with a small floor and manual
        // vertical resize still available.
        className="min-h-24 w-full flex-1 resize-y rounded-standard border border-transparent bg-neutral-800 px-3 py-2 placeholder:text-neutral-500 focus:border-primary focus:outline-none"
      />
    </section>
  );
}
