'use client';

import { useEffect, useRef } from 'react';

import { useModalFocusTrap } from '@/shared/hooks/useModalFocusTrap';

// The generic "leave without saving?" confirmation dialog behind
// `useNavigationGuard` (story 38's navigate-away confirmation). Modeled on
// `DeleteBinderConfirmDialog`'s minimal two-button dialog shell/Escape
// handling, but reusable across any feature that registers a guard message
// via `useSetNavigationGuardMessage` rather than being specific to one
// caller.
export function NavigationConfirmDialog({
  message,
  onConfirm,
  onCancel,
}: {
  message: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const confirmButtonRef = useRef<HTMLButtonElement>(null);
  const { handleTabTrap } = useModalFocusTrap(dialogRef);

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
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="navigation-confirm-dialog-title"
        onClick={(event) => event.stopPropagation()}
        onKeyDown={handleTabTrap}
        className="flex w-full max-w-sm flex-col gap-4 rounded-standard bg-surface p-6 shadow-modal"
      >
        <h3 id="navigation-confirm-dialog-title">Leave without saving?</h3>
        <p className="text-caption text-neutral-500">{message}</p>
        <div className="flex justify-end gap-3">
          <button
            type="button"
            onClick={onCancel}
            className="cursor-pointer rounded-standard px-4 py-2 text-neutral-100 hover:brightness-110"
          >
            Stay
          </button>
          <button
            ref={confirmButtonRef}
            type="button"
            onClick={onConfirm}
            className="cursor-pointer rounded-standard bg-primary px-4 py-2 text-neutral-100 hover:brightness-110"
          >
            Leave
          </button>
        </div>
      </div>
    </div>
  );
}
