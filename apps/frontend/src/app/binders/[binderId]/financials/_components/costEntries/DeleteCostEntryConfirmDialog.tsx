'use client';

import { useEffect, useRef } from 'react';

// The "Manage cost entries" modal's nested delete-confirmation dialog
// (story 44: "Selecting delete on an entry opens the shared confirmation
// modal before removing it"). Mirrors `DeleteBinderConfirmDialog`'s own
// minimal two-button shell, but rendered above `ManageCostEntriesModal`
// (which is itself a modal) - so it uses the higher `z-[60]` layer already
// established by `ArtModalConfirmDialogs` for this same "dialog nested
// inside another dialog" situation, and relies on the outer modal's own
// Escape handling rather than adding a second one here.
export function DeleteCostEntryConfirmDialog({
  entryName,
  binderCount,
  onConfirm,
  onCancel,
}: {
  entryName: string;
  // Shown so the user can see the impact before confirming, matching this
  // same count already displayed on the entry's row in the modal list.
  binderCount: number;
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
        aria-labelledby="delete-cost-entry-dialog-title"
        onClick={(event) => event.stopPropagation()}
        className="flex w-full max-w-sm flex-col gap-4 rounded-standard bg-surface p-6 shadow-modal"
      >
        <h3 id="delete-cost-entry-dialog-title">Delete &ldquo;{entryName}&rdquo;?</h3>
        <p className="text-caption text-neutral-500">
          This permanently deletes the cost entry and can&apos;t be undone.
          {binderCount > 0 &&
            ` ${binderCount} binder${binderCount === 1 ? '' : 's'} currently ${
              binderCount === 1 ? 'has' : 'have'
            } it selected - that selection will be cleared.`}
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
            Delete
          </button>
        </div>
      </div>
    </div>
  );
}
