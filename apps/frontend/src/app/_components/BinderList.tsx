'use client';

import { generateUniqueBinderCopyName } from '@binder-project-planner/shared';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useEffect, useState } from 'react';

import { deleteBinder, duplicateBinder, listBinders, type BinderSummary } from '@/lib/api';
import {
  LoadingIndicator,
  toProblemDetailsInfo,
  useDelayedLoading,
  useSaveStatusToast,
  useToastContext,
} from '@/shared/feedback';

import { BinderActionsOverlay } from './BinderActionsOverlay';
import { DeleteBinderConfirmDialog } from './DeleteBinderConfirmDialog';
import { BinderPreview } from './preview/BinderPreview';

// The three states the binder list can be in (story 5). Tracking this as one
// enum, rather than separate booleans, keeps "loading" and "failed" from
// ever being true simultaneously and makes the empty-state gating below
// ("only after a successful load with zero binders") straightforward.
type BinderListStatus = 'loading' | 'success' | 'error';

// Fixed (not per-attempt-random) toast id for this operation. Reusing the
// same id across mounts/retries means a later attempt replaces this
// operation's own toast rather than stacking a new one on top of a
// still-visible failed toast from an earlier attempt, while leaving
// unrelated toasts (e.g. a create-binder failure) untouched.
const LIST_BINDERS_TOAST_ID = 'list-binders';

// The home page's binder list (story 5): fetches the binder-summary
// collection on mount and renders its loading/empty/success/error states,
// using the shared loading component (story 6).
export function BinderList() {
  const router = useRouter();
  const [status, setStatus] = useState<BinderListStatus>('loading');
  const [binders, setBinders] = useState<BinderSummary[]>([]);
  const { markFailed, dismiss } = useToastContext();
  const { start } = useSaveStatusToast();
  // Optimistic copies (story 21) are tracked by their temporary
  // `optimistic-<uuid>` id so their tile can be rendered disabled while the
  // real `duplicateBinder` request is in flight, per "the temporary binder
  // is disabled while copying".
  const [pendingCopyIds, setPendingCopyIds] = useState<ReadonlySet<string>>(new Set());
  // The binder awaiting delete confirmation (story 21: "Clicking delete
  // opens a confirmation dialog naming the binder before any deletion
  // occurs"), or `null` when no confirmation dialog is open.
  const [confirmDeleteBinder, setConfirmDeleteBinder] = useState<BinderSummary | null>(null);
  // Applies the shared 200ms-delay/300ms-minimum-duration timing (story 6)
  // on top of the raw loading flag so a fast response never flashes the
  // spinner.
  const showLoading = useDelayedLoading(status === 'loading');

  useEffect(() => {
    // Aborts this fetch if the effect cleans up (unmount, or a future
    // dependency change) before it resolves, and lets the backend know the
    // response is no longer wanted, per story 6's AbortController
    // requirement.
    const controller = new AbortController();

    async function loadBinders() {
      setStatus('loading');
      try {
        const summaries = await listBinders(controller.signal);
        setBinders(summaries);
        setStatus('success');
        // Clears a leftover failed toast from an earlier failed attempt
        // (e.g. the user navigated away and back) now that a retry has
        // succeeded. No-ops if no such toast exists.
        dismiss(LIST_BINDERS_TOAST_ID);
      } catch (error) {
        // An aborted request's rejection isn't a real failure -- it means
        // this attempt was superseded (e.g. cleanup ran first), so it's
        // ignored rather than reported as an error.
        if (controller.signal.aborted) return;
        // No "saving" phase applies to a read, so the failed toast is raised
        // directly (bypassing useSaveStatusToast's saving->failed lifecycle)
        // per story 5: only the loading indicator and, on failure, the
        // failed toast are shown.
        setStatus('error');
        markFailed(LIST_BINDERS_TOAST_ID, toProblemDetailsInfo(error));
      }
    }

    loadBinders();

    return () => {
      controller.abort();
    };
  }, [markFailed, dismiss]);

  // Story 21's copy action: inserts an optimistic, disabled temporary
  // summary at the front of the list immediately (matching the backend's
  // "most recently updated first" ordering, since the copy's `updatedAt`
  // is newly minted), then replaces it with the backend's authoritative
  // summary on success or removes it and raises a failed toast otherwise.
  // The client-computed temporary name uses the exact same
  // `generateUniqueBinderCopyName` algorithm the backend's duplicate
  // endpoint uses, so the optimistic name usually matches the final one.
  async function handleCopyBinder(binder: BinderSummary) {
    const idempotencyKey = crypto.randomUUID();
    const optimisticId = `optimistic-${crypto.randomUUID()}`;
    const existingNormalizedNames = new Set(binders.map((existing) => existing.name.toLowerCase()));
    const now = new Date().toISOString();
    const optimisticSummary: BinderSummary = {
      ...binder,
      id: optimisticId,
      name: generateUniqueBinderCopyName(existingNormalizedNames, binder.name),
      createdAt: now,
      updatedAt: now,
    };

    setBinders((previous) => [optimisticSummary, ...previous]);
    setPendingCopyIds((previous) => new Set(previous).add(optimisticId));

    const toast = start(`copy-binder-${optimisticId}`);
    try {
      const created = await duplicateBinder(binder.id, idempotencyKey);
      setBinders((previous) =>
        previous.map((entry) => (entry.id === optimisticId ? created : entry)),
      );
      toast.markSaved();
    } catch (error) {
      setBinders((previous) => previous.filter((entry) => entry.id !== optimisticId));
      toast.markFailed(error);
    } finally {
      setPendingCopyIds((previous) => {
        const next = new Set(previous);
        next.delete(optimisticId);
        return next;
      });
    }
  }

  // Story 21's delete action: the confirmation dialog (opened by
  // `BinderActionsOverlay`'s delete button) calls this once the user
  // confirms. The binder is removed optimistically, retaining its prior
  // list index so a failed request can restore it in the same position.
  async function handleConfirmDelete() {
    const binder = confirmDeleteBinder;
    if (!binder) return;
    setConfirmDeleteBinder(null);

    const index = binders.findIndex((entry) => entry.id === binder.id);
    if (index === -1) return;
    setBinders((previous) => previous.filter((entry) => entry.id !== binder.id));

    const toast = start(`delete-binder-${binder.id}`);
    try {
      await deleteBinder(binder.id);
      toast.markSaved();
    } catch (error) {
      setBinders((previous) => {
        const restored = [...previous];
        restored.splice(index, 0, binder);
        return restored;
      });
      toast.markFailed(error);
    }
  }

  return (
    // Full page width (no max-width container, per the styling conventions);
    // binders wrap onto additional centered rows as more are added.
    <div className="w-full">
      {showLoading && <LoadingIndicator label="Loading binders…" size="10" />}
      {status === 'success' && binders.length === 0 && (
        <p className="text-center text-body text-neutral-500">
          No binders yet. Create one to get started.
        </p>
      )}
      {status === 'success' && binders.length > 0 && (
        <ul className="flex flex-wrap justify-center gap-12">
          {binders.map((binder) => {
            const isPendingCopy = pendingCopyIds.has(binder.id);
            return (
              <li key={binder.id} className="group relative flex flex-col items-center gap-2">
                {/* Story 21: hover-revealed delete/copy/edit actions,
                    disabled on the temporary tile for an in-flight copy. */}
                <BinderActionsOverlay
                  name={binder.name}
                  isEditDisabled={isPendingCopy}
                  isCopyDisabled={isPendingCopy}
                  isDeleteDisabled={isPendingCopy}
                  onEdit={() => router.push(`/binders/${binder.id}/details`)}
                  onCopy={() => handleCopyBinder(binder)}
                  onDelete={() => setConfirmDeleteBinder(binder)}
                />
                {/* Story 7: opens the binder's view/edit page with the "Edit
                    Layout" tab selected. The optimistic copy tile isn't
                    navigable until the real binder exists. */}
                <Link
                  href={isPendingCopy ? '#' : `/binders/${binder.id}/layout`}
                  aria-disabled={isPendingCopy}
                  onClick={(event) => {
                    if (isPendingCopy) event.preventDefault();
                  }}
                  className={`flex flex-col items-center gap-2 hover:brightness-110 ${isPendingCopy ? 'pointer-events-none opacity-50' : ''}`}
                >
                  {/* Story 20: a live miniature of the binder's saved
                      preview physical page/spread. */}
                  <BinderPreview binder={binder} />
                  <p className="font-bold">{binder.name}</p>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
      {confirmDeleteBinder && (
        <DeleteBinderConfirmDialog
          binderName={confirmDeleteBinder.name}
          onConfirm={handleConfirmDelete}
          onCancel={() => setConfirmDeleteBinder(null)}
        />
      )}
    </div>
  );
}
