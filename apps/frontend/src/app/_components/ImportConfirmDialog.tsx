import { useEffect, useRef } from 'react';

import type { ImportSummary } from '@/lib/api';

// The home-page import confirmation dialog (story 33): shown after an
// uploaded archive validates, it states what importing will add to the
// current data and offers Cancel / Import. Modeled on
// `DeleteBinderConfirmDialog`'s minimal two-button modal shell.
export function ImportConfirmDialog({
  summary,
  isCommitting,
  onConfirm,
  onCancel,
}: {
  summary: ImportSummary;
  // Disables the actions while the commit request is in flight.
  isCommitting: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const confirmButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    confirmButtonRef.current?.focus();
  }, []);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      // Escape cancels, but not mid-commit (the request can't be aborted).
      if (event.key === 'Escape' && !isCommitting) {
        event.preventDefault();
        onCancel();
      }
    }

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onCancel, isCommitting]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-8"
      onClick={() => {
        if (!isCommitting) onCancel();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="import-dialog-title"
        onClick={(event) => event.stopPropagation()}
        className="flex w-full max-w-sm flex-col gap-4 rounded-standard bg-surface p-6 shadow-modal"
      >
        <h3 id="import-dialog-title">Import data?</h3>
        <p className="text-caption text-neutral-500">
          This adds the archive&apos;s contents to your current data without changing anything that
          already exists:
        </p>
        <ul className="flex flex-col gap-1 text-caption text-neutral-300">
          <li>
            {summary.binders} {summary.binders === 1 ? 'binder' : 'binders'}
          </li>
          <li>
            {summary.cards} {summary.cards === 1 ? 'card' : 'cards'}
          </li>
          <li>
            {summary.art} {summary.art === 1 ? 'art item' : 'art items'}
          </li>
          <li>
            {summary.newImages} new {summary.newImages === 1 ? 'image' : 'images'}
            {summary.dedupedImages > 0 && ` (${summary.dedupedImages} reused from existing)`}
          </li>
        </ul>
        <div className="flex justify-end gap-3">
          <button
            type="button"
            onClick={onCancel}
            disabled={isCommitting}
            className="cursor-pointer rounded-standard px-4 py-2 text-neutral-100 hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            ref={confirmButtonRef}
            type="button"
            onClick={onConfirm}
            disabled={isCommitting}
            className="cursor-pointer rounded-standard bg-primary px-4 py-2 text-neutral-100 hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Import
          </button>
        </div>
      </div>
    </div>
  );
}
