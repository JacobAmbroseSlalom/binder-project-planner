'use client';

import { Toast } from './Toast';
import type { ToastEntry } from './types';

interface ToastViewportProps {
  toasts: ToastEntry[];
  onDismiss: (operationId: string) => void;
}

// Fixed bottom-right stack of every active save-status toast (one per
// concurrent mutation), per styling.instructions.md.
export function ToastViewport({ toasts, onDismiss }: ToastViewportProps) {
  if (toasts.length === 0) {
    return null;
  }

  return (
    <div className="fixed right-4 bottom-4 z-50 flex flex-col gap-2">
      {toasts.map((toast) => (
        <Toast key={toast.id} toast={toast} onDismiss={() => onDismiss(toast.id)} />
      ))}
    </div>
  );
}
