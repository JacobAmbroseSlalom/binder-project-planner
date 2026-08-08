'use client';

import { useEffect, useRef } from 'react';

// The nested "the new size no longer fits" confirmation dialog (story 26,
// planning.md: "If an edit changes placed art so its current footprint
// would be out of bounds or overlap another item, Save opens a nested
// confirmation dialog offering Cancel or Save and Move to Unplaced").
// Mirrors `PasteReplaceConfirmDialog`'s own minimal focus handling.
export function PlacementConflictConfirmDialog({
  onConfirm,
  onCancel,
}: {
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const confirmButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    confirmButtonRef.current?.focus();
  }, []);

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-8"
      onClick={onCancel}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="placement-conflict-dialog-title"
        onClick={(event) => event.stopPropagation()}
        className="flex w-full max-w-sm flex-col gap-4 rounded-standard bg-surface p-6 shadow-modal"
      >
        <h3 id="placement-conflict-dialog-title">Move this art to unplaced art?</h3>
        <p className="text-caption text-neutral-500">
          These changes no longer fit this art&apos;s current position on the binder layout. Saving
          will move it to the unplaced art section instead.
        </p>
        <div className="flex justify-end gap-3">
          <button
            type="button"
            onClick={onCancel}
            className="cursor-pointer rounded-standard px-4 py-2 text-neutral-100 hover:brightness-110"
          >
            Cancel
          </button>
          <button
            ref={confirmButtonRef}
            type="button"
            onClick={onConfirm}
            className="cursor-pointer rounded-standard bg-primary px-4 py-2 text-neutral-100 hover:brightness-110"
          >
            Save and Move to Unplaced
          </button>
        </div>
      </div>
    </div>
  );
}

// The nested "replace the loaded image?" confirmation dialog (planning.md:
// paste-confirmation requirement above). Deliberately minimal compared to
// the main dialog's focus trap - it only ever contains two buttons, so
// Tab naturally cycles between them without needing manual wraparound
// logic; Escape still cancels via the parent's own `onKeyDown` (this
// dialog renders inside the same outer backdrop click-catcher).
export function PasteReplaceConfirmDialog({
  onConfirm,
  onCancel,
}: {
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const confirmButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    confirmButtonRef.current?.focus();
  }, []);

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-8"
      onClick={onCancel}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="paste-replace-dialog-title"
        onClick={(event) => event.stopPropagation()}
        className="flex w-full max-w-sm flex-col gap-4 rounded-standard bg-surface p-6 shadow-modal"
      >
        <h3 id="paste-replace-dialog-title">Replace the current image?</h3>
        <p className="text-caption text-neutral-500">
          Pasting will replace the currently loaded image and reset its rotation and position to a
          centered fit.
        </p>
        <div className="flex justify-end gap-3">
          <button
            type="button"
            onClick={onCancel}
            className="cursor-pointer rounded-standard px-4 py-2 text-neutral-100 hover:brightness-110"
          >
            Cancel
          </button>
          <button
            ref={confirmButtonRef}
            type="button"
            onClick={onConfirm}
            className="cursor-pointer rounded-standard bg-primary px-4 py-2 text-neutral-100 hover:brightness-110"
          >
            Replace
          </button>
        </div>
      </div>
    </div>
  );
}
