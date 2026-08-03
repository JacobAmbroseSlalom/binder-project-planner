import { useEffect, useRef } from 'react';

// The home-page binder-list delete confirmation dialog (story 21:
// "Clicking delete opens a confirmation dialog naming the binder before
// any deletion occurs"). Modeled on `CreateArtModal`'s nested
// `PasteReplaceConfirmDialog`/`PlacementConflictConfirmDialog` minimal
// two-button dialog shell, since no shared top-level `ModalShell` exists
// yet - but this one is a true top-level dialog (there's no outer editor
// beneath it), so it owns its own Escape-to-close handling instead of
// relying on a parent dialog's `onKeyDown`.
export function DeleteBinderConfirmDialog({
  binderName,
  onConfirm,
  onCancel,
}: {
  binderName: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const confirmButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    confirmButtonRef.current?.focus();
  }, []);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.preventDefault();
        onCancel();
      }
    }

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onCancel]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-8"
      onClick={onCancel}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="delete-binder-dialog-title"
        onClick={(event) => event.stopPropagation()}
        className="flex w-full max-w-sm flex-col gap-4 rounded-standard bg-surface p-6 shadow-modal"
      >
        <h3 id="delete-binder-dialog-title">Delete &ldquo;{binderName}&rdquo;?</h3>
        <p className="text-caption text-neutral-500">
          This permanently deletes the binder and everything placed in it. This can&apos;t be
          undone.
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
