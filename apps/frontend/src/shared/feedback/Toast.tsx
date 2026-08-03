'use client';

import { CircleAlert, CircleCheck, Loader2, X } from 'lucide-react';

import type { ToastEntry } from './types';

interface ToastProps {
  toast: ToastEntry;
  onDismiss: () => void;
}

// Renders one save-status toast. Visual spec: styling.instructions.md's
// "Toast notifications" section.
export function Toast({ toast, onDismiss }: ToastProps) {
  if (toast.status === 'saving') {
    // Polite live region: announces without interrupting, matching the
    // "selected toast library's default accessibility behavior" requirement
    // for a non-error status update.
    return (
      <div
        role="status"
        className="flex items-center gap-2 rounded-standard bg-warning px-4 py-3 text-neutral-100 shadow-panel"
      >
        <Loader2 className="size-5 animate-spin" />
        <span>Saving…</span>
      </div>
    );
  }

  if (toast.status === 'saved') {
    return (
      <div
        role="status"
        className="flex items-center gap-2 rounded-standard bg-success px-4 py-3 text-neutral-100 shadow-panel"
      >
        <CircleCheck className="size-5" />
        <span>{toast.message ?? 'Saved'}</span>
      </div>
    );
  }

  // Failed toasts use an assertive alert role since they require user
  // attention and remain until manually dismissed.
  return (
    <div
      role="alert"
      className="flex items-center gap-2 rounded-standard bg-error px-4 py-3 text-neutral-100 shadow-panel"
    >
      <CircleAlert className="size-5" />
      <span>{toast.detail}</span>
      {toast.action && (
        <button
          type="button"
          onClick={toast.action.onClick}
          className="ml-2 cursor-pointer font-bold underline hover:no-underline"
        >
          {toast.action.label}
        </button>
      )}
      <button
        type="button"
        aria-label="Dismiss"
        onClick={onDismiss}
        className="ml-2 cursor-pointer"
      >
        <X className="size-4" />
      </button>
    </div>
  );
}
