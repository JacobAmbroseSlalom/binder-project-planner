'use client';

import { SAVED_TOAST_DURATION_MS } from '@binder-project-planner/shared';
import { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';

import { ToastViewport } from './ToastViewport';
import type { FailedToastDetails, ToastEntry } from './types';

// Shape of the context value consumed via `useToastContext` /
// `useSaveStatusToast`: the live toast list plus the four lifecycle actions
// used to drive it.
interface ToastContextValue {
  toasts: ToastEntry[];
  startSaving: (operationId?: string) => string;
  markSaved: (operationId: string, message?: string) => void;
  markFailed: (operationId: string, details: FailedToastDetails) => void;
  dismiss: (operationId: string) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

// Mounted once at the app root. Owns the live list of save-status toasts and
// renders the shared viewport so any descendant can start/update a toast
// through `useSaveStatusToast` without prop-drilling.
export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastEntry[]>([]);

  // Pending "saved" auto-dismiss timers, keyed by operation id, so a toast
  // that changes status again before its timer fires doesn't get dismissed
  // out from under the new status.
  const dismissTimers = useRef(new Map<string, ReturnType<typeof setTimeout>>());

  // Cancels and forgets a pending auto-dismiss timer for `operationId`, if one
  // exists. Called before any status change so an in-flight timer from a
  // previous status (e.g. an old "saved") can never fire against a newer one.
  const clearDismissTimer = useCallback((operationId: string) => {
    const timer = dismissTimers.current.get(operationId);
    if (timer) {
      clearTimeout(timer);
      dismissTimers.current.delete(operationId);
    }
  }, []);

  // Inserts a new toast or replaces the existing one with the same id,
  // preserving the array-based `toasts` list that `ToastViewport` renders.
  const upsertToast = useCallback((toast: ToastEntry) => {
    setToasts((current) => [...current.filter((existing) => existing.id !== toast.id), toast]);
  }, []);

  // Removes a toast immediately, regardless of its current status. Used both
  // for the "saved" auto-dismiss timer and the manual X button on "failed"
  // toasts.
  const dismiss = useCallback(
    (operationId: string) => {
      clearDismissTimer(operationId);
      setToasts((current) => current.filter((toast) => toast.id !== operationId));
    },
    [clearDismissTimer],
  );

  // Starts (or restarts) a toast in the "saving" state. Generates an id when
  // the caller doesn't supply one so `useSaveStatusToast` can track it without
  // the caller needing to invent its own operation ids.
  const startSaving = useCallback(
    (operationId?: string) => {
      const id = operationId ?? crypto.randomUUID();
      clearDismissTimer(id);
      upsertToast({ id, status: 'saving' });
      return id;
    },
    [clearDismissTimer, upsertToast],
  );

  // Transitions a toast to "saved" and schedules its auto-dismiss per the
  // shared SAVED_TOAST_DURATION_MS default, so callers don't need to manage
  // that timing themselves.
  const markSaved = useCallback(
    (operationId: string, message?: string) => {
      clearDismissTimer(operationId);
      upsertToast({ id: operationId, status: 'saved', message });
      dismissTimers.current.set(
        operationId,
        setTimeout(() => dismiss(operationId), SAVED_TOAST_DURATION_MS),
      );
    },
    [clearDismissTimer, dismiss, upsertToast],
  );

  // Transitions a toast to "failed". Unlike "saved", no auto-dismiss timer is
  // scheduled — failed toasts stay visible until the user dismisses them.
  const markFailed = useCallback(
    (operationId: string, details: FailedToastDetails) => {
      clearDismissTimer(operationId);
      // `status` is spread first so the literal 'failed' below always wins;
      // details never actually contains a `status` key, but ordering keeps
      // this resilient regardless.
      upsertToast({ ...details, id: operationId, status: 'failed' });
    },
    [clearDismissTimer, upsertToast],
  );

  // Memoized so consumers of the context (via useToastContext) don't
  // re-render on every ToastProvider render, only when a dependency actually
  // changes.
  const value = useMemo<ToastContextValue>(
    () => ({ toasts, startSaving, markSaved, markFailed, dismiss }),
    [toasts, startSaving, markSaved, markFailed, dismiss],
  );

  return (
    <ToastContext.Provider value={value}>
      {children}
      <ToastViewport toasts={toasts} onDismiss={dismiss} />
    </ToastContext.Provider>
  );
}

// Reads the toast context, throwing if called outside a `ToastProvider` so
// a missing provider fails loudly during development rather than silently
// no-opping.
export function useToastContext(): ToastContextValue {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error('useToastContext must be used within a ToastProvider.');
  }
  return context;
}
