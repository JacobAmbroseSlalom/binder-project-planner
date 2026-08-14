'use client';

import {
  DEFAULT_BINDER_COMPLETION_METRICS_VISIBLE,
  generateUniqueBinderCopyName,
} from '@binder-project-planner/shared';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';

import {
  deleteBinder,
  duplicateBinder,
  listBinders,
  updateBinder,
  type BinderSummary,
} from '@/lib/api';
import {
  LoadingIndicator,
  toProblemDetailsInfo,
  useDelayedLoading,
  useSaveStatusToast,
  useToastContext,
} from '@/shared/feedback';
import { useLocalStorageBoolean } from '@/shared/hooks/useLocalStorageBoolean';

import { BinderActionsOverlay } from './BinderActionsOverlay';
import { BinderCompletionMetrics } from './BinderCompletionMetrics';
import { DeleteBinderConfirmDialog } from './DeleteBinderConfirmDialog';
import { BinderPreview } from './preview/BinderPreview';

// Local-storage key for the completion-metrics visibility preference (story
// 22). Persisted client-side only; never sent to the backend. Exported so
// the home toolbar's toggle and this list's per-binder metrics read/write
// the same preference (they stay in sync via `useLocalStorageBoolean`).
export const COMPLETION_METRICS_VISIBLE_STORAGE_KEY = 'binder-completion-metrics-visible';

// Story 39's home-page sort toggle's two states: "Last Active" is
// `GET /binders`'s own existing newest-first (`updatedAt` descending)
// ordering, so it needs no client-side re-sort at all; "Name" is a
// client-side re-sort, ascending and case-insensitive. Exported so the
// toolbar's toggle button and the page's lifted state share the same type.
export type BinderSortOption = 'lastActive' | 'name';

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
// using the shared loading component (story 6). Story 39 adds a
// client-side search/sort over the already-fetched list, driven by state
// lifted to the home page (so the toolbar's search box/sort toggle and
// this list stay in sync without either fetching or persisting anything
// extra).
export function BinderList({
  searchQuery,
  sortOption,
  selectedTags,
  onAvailableTagsChange,
}: {
  searchQuery: string;
  sortOption: BinderSortOption;
  // Story 51: the home page's currently selected tag filter (OR logic) and
  // a callback this list uses to report the distinct tag options available
  // to pick from - derived from this already-fetched binder list itself,
  // rather than a separate `GET /tags` request, per its own "client-side,
  // no new backend query parameters" technical requirement.
  selectedTags: string[];
  onAvailableTagsChange: (tags: string[]) => void;
}) {
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
  // Story 32: binders whose lock state toggle is currently in flight -
  // every home-page action for that one binder is disabled until it
  // settles, mirroring `pendingCopyIds`'s own tracking pattern.
  const [pendingLockToggleIds, setPendingLockToggleIds] = useState<ReadonlySet<string>>(new Set());
  // The binder awaiting delete confirmation (story 21: "Clicking delete
  // opens a confirmation dialog naming the binder before any deletion
  // occurs"), or `null` when no confirmation dialog is open.
  const [confirmDeleteBinder, setConfirmDeleteBinder] = useState<BinderSummary | null>(null);
  // Applies the shared 200ms-delay/300ms-minimum-duration timing (story 6)
  // on top of the raw loading flag so a fast response never flashes the
  // spinner.
  const showLoading = useDelayedLoading(status === 'loading');
  // Story 22: the completion-metrics visibility toggle. Persisted in local
  // storage and restored on later visits; it's presentation-only, so
  // flipping it never refetches the binder list (it isn't a dependency of
  // the load effect above) - it just reads the counts already embedded in
  // each binder summary.
  const [metricsVisible] = useLocalStorageBoolean(
    COMPLETION_METRICS_VISIBLE_STORAGE_KEY,
    DEFAULT_BINDER_COMPLETION_METRICS_VISIBLE,
  );

  // Story 51: the distinct tag options the home page's tag filter offers,
  // derived from this already-fetched `binders` list rather than a
  // separate `GET /tags` request. Case-insensitively deduped (keeping the
  // first-seen casing) and alphabetically ordered, mirroring the backend's
  // own `GET /tags` suggestion-list semantics.
  const availableTags = useMemo(() => {
    const seen = new Map<string, string>();
    for (const binder of binders) {
      for (const tag of binder.tags) {
        const normalized = tag.toLowerCase();
        if (!seen.has(normalized)) {
          seen.set(normalized, tag);
        }
      }
    }
    return [...seen.values()].sort((a, b) => a.localeCompare(b));
  }, [binders]);

  useEffect(() => {
    onAvailableTagsChange(availableTags);
  }, [availableTags, onAvailableTagsChange]);

  // Story 39's search/sort, applied client-side over the already-fetched
  // `binders`: a case-insensitive substring match on name, then either the
  // fetched (newest-first) order as-is or a client-side ascending,
  // case-insensitive re-sort by name. Story 51 adds an OR-logic tag filter
  // over the same already-fetched list. Recomputed only when the underlying
  // data or the search/sort/tag-filter state actually changes, rather than
  // on every render.
  const visibleBinders = useMemo(() => {
    const normalizedQuery = searchQuery.trim().toLowerCase();
    const matchingSearch = normalizedQuery
      ? binders.filter((binder) => binder.name.toLowerCase().includes(normalizedQuery))
      : binders;

    // Story 51: a binder matching ANY selected tag (OR logic) passes;
    // selecting no tags applies no tag filter at all.
    const normalizedSelectedTags = selectedTags.map((tag) => tag.toLowerCase());
    const matching =
      normalizedSelectedTags.length === 0
        ? matchingSearch
        : matchingSearch.filter((binder) =>
            binder.tags.some((tag) => normalizedSelectedTags.includes(tag.toLowerCase())),
          );

    if (sortOption === 'name') {
      return [...matching].sort((a, b) => a.name.localeCompare(b.name));
    }
    // "Last Active": `GET /binders`'s own newest-first order is already
    // exactly this ordering, so no re-sort is needed.
    return matching;
  }, [binders, searchQuery, sortOption, selectedTags]);

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

  // Story 32's lock/unlock action: optimistically flips `locked` in local
  // state immediately and disables every action for this one binder until
  // the request settles, then reconciles with the authoritative persisted
  // `locked`/`updatedAt` on success or rolls back and shows a failed toast
  // otherwise - mirroring `handleCopyBinder`/`handleConfirmDelete`'s own
  // optimistic-update-then-reconcile pattern. Only `locked`/`updatedAt` are
  // merged in (rather than replacing the whole summary with the update
  // response) since that response is a plain `Binder`, not a `BinderSummary`,
  // and would otherwise drop this entry's completion-metric/preview fields.
  async function handleToggleLock(binder: BinderSummary) {
    const desiredLocked = !binder.locked;
    setBinders((previous) =>
      previous.map((entry) =>
        entry.id === binder.id ? { ...entry, locked: desiredLocked } : entry,
      ),
    );
    setPendingLockToggleIds((previous) => new Set(previous).add(binder.id));

    const toast = start(`toggle-lock-binder-${binder.id}`);
    try {
      const updated = await updateBinder(binder.id, { locked: desiredLocked });
      setBinders((previous) =>
        previous.map((entry) =>
          entry.id === binder.id
            ? { ...entry, locked: updated.locked, updatedAt: updated.updatedAt }
            : entry,
        ),
      );
      toast.markSaved();
    } catch (error) {
      setBinders((previous) =>
        previous.map((entry) =>
          entry.id === binder.id ? { ...entry, locked: binder.locked } : entry,
        ),
      );
      toast.markFailed(error);
    } finally {
      setPendingLockToggleIds((previous) => {
        const next = new Set(previous);
        next.delete(binder.id);
        return next;
      });
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
      {/* Story 39: a distinct empty state for "search matched nothing",
          separate from "no binders exist at all" above - only shown once
          there's at least one real binder to search over. */}
      {status === 'success' && binders.length > 0 && visibleBinders.length === 0 && (
        <p className="text-center text-body text-neutral-500">No binders match your search.</p>
      )}
      {status === 'success' && visibleBinders.length > 0 && (
        <ul className="flex flex-wrap justify-center gap-12">
          {visibleBinders.map((binder) => {
            const isPendingCopy = pendingCopyIds.has(binder.id);
            const isPendingLockToggle = pendingLockToggleIds.has(binder.id);
            // Story 32: every action for this binder is disabled while its
            // own lock toggle is in flight, on top of each action's existing
            // disabled conditions.
            const isActionDisabled = isPendingCopy || isPendingLockToggle;
            return (
              <li key={binder.id} className="group relative flex flex-col items-center gap-2">
                {/* Story 21: hover-revealed delete/copy/edit actions,
                    disabled on the temporary tile for an in-flight copy;
                    story 32 adds the lock/unlock toggle. */}
                <BinderActionsOverlay
                  name={binder.name}
                  locked={binder.locked}
                  isEditDisabled={isActionDisabled}
                  isCopyDisabled={isActionDisabled}
                  isDeleteDisabled={isActionDisabled}
                  isLockToggleDisabled={isActionDisabled}
                  onEdit={() => router.push(`/binders/${binder.id}/details`)}
                  onCopy={() => handleCopyBinder(binder)}
                  onDelete={() => setConfirmDeleteBinder(binder)}
                  onToggleLock={() => handleToggleLock(binder)}
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
                {/* Story 22: per-binder completion metrics, shown below the
                    binder only when the toggle is on. Rendered outside the
                    Link so it isn't part of the clickable navigation area. */}
                {metricsVisible && <BinderCompletionMetrics binder={binder} />}
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
