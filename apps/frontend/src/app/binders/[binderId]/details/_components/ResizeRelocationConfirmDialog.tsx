'use client';

import { useEffect, useRef } from 'react';

// Story 27's resize-relocation confirmation dialog. Shown only when a
// proposed width/height/page-count reduction would invalidate existing
// placed items; confirming allows the final PATCH to move affected cards/art
// to their unplaced sections in the same backend transaction.
export function ResizeRelocationConfirmDialog({
  affectedCardCount,
  affectedArtCount,
  pending,
  onConfirm,
  onCancel,
}: {
  affectedCardCount: number;
  affectedArtCount: number;
  pending: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const confirmButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    confirmButtonRef.current?.focus();
  }, []);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key !== 'Escape' || pending) return;
      event.preventDefault();
      onCancel();
    }

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onCancel, pending]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-8"
      onClick={pending ? undefined : onCancel}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="resize-relocation-dialog-title"
        aria-describedby="resize-relocation-dialog-description"
        onClick={(event) => event.stopPropagation()}
        className="flex w-full max-w-md flex-col gap-4 rounded-standard bg-surface p-6 shadow-modal"
      >
        <h3 id="resize-relocation-dialog-title">Move affected items to unplaced?</h3>
        <p id="resize-relocation-dialog-description" className="text-caption text-neutral-500">
          Saving this binder size or page-count reduction will move {affectedCardCount} card
          {affectedCardCount === 1 ? '' : 's'} and {affectedArtCount} art item
          {affectedArtCount === 1 ? '' : 's'} to the unplaced sections.
        </p>
        <div className="flex justify-end gap-3">
          <button
            type="button"
            onClick={onCancel}
            disabled={pending}
            className="cursor-pointer rounded-standard px-4 py-2 text-neutral-100 hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            ref={confirmButtonRef}
            type="button"
            onClick={onConfirm}
            disabled={pending}
            className="cursor-pointer rounded-standard bg-primary px-4 py-2 text-neutral-100 hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Save and Move to Unplaced
          </button>
        </div>
      </div>
    </div>
  );
}
