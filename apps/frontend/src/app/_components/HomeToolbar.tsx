'use client';

import { DEFAULT_BINDER_COMPLETION_METRICS_VISIBLE } from '@binder-project-planner/shared';
import { ArrowUpDown, Check, Download, Upload } from 'lucide-react';
import Link from 'next/link';
import { useRef, useState } from 'react';

import { commitImport, exportData, validateImport, type ImportSummary } from '@/lib/api';
import {
  LoadingIndicator,
  toProblemDetailsInfo,
  useSaveStatusToast,
  useToastContext,
} from '@/shared/feedback';
import { useLocalStorageBoolean } from '@/shared/hooks/useLocalStorageBoolean';

import { COMPLETION_METRICS_VISIBLE_STORAGE_KEY, type BinderSortOption } from './BinderList';
import { ImportConfirmDialog } from './ImportConfirmDialog';

// Fixed toast ids so a retried export/import replaces its own toast rather
// than stacking a new one.
const EXPORT_TOAST_ID = 'export-data';
const IMPORT_TOAST_ID = 'import-data';

// The home page's single-line controls row (stories 22, 4, 33, 39): the
// search box, sort toggle, and completion-metrics toggle on the left (in
// that order, per story 39), the "Create new binder" button centered on the
// page, and the Export/Import actions on the right. A 3-column grid keeps
// the create button centered on the page regardless of the widths of the
// side groups.
export function HomeToolbar({
  searchQuery,
  onSearchChange,
  sortOption,
  onToggleSort,
}: {
  // Story 39's search box value and sort toggle state, lifted to the home
  // page so this toolbar and `BinderList` (which actually filters/sorts)
  // stay in sync without either persisting anything.
  searchQuery: string;
  onSearchChange: (value: string) => void;
  sortOption: BinderSortOption;
  onToggleSort: () => void;
}) {
  const { start } = useSaveStatusToast();
  const { markFailed } = useToastContext();

  // Story 22's completion-metrics toggle. Its value is localStorage-backed
  // and shared with `BinderList` (via the same key), so toggling it here
  // updates the per-binder metrics the list renders, with no prop drilling.
  const [metricsVisible, setMetricsVisible] = useLocalStorageBoolean(
    COMPLETION_METRICS_VISIBLE_STORAGE_KEY,
    DEFAULT_BINDER_COMPLETION_METRICS_VISIBLE,
  );

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isExporting, setIsExporting] = useState(false);
  const [isValidating, setIsValidating] = useState(false);
  const [isCommitting, setIsCommitting] = useState(false);
  // The validated, staged import awaiting confirmation, or null when none.
  const [pendingImport, setPendingImport] = useState<{
    token: string;
    summary: ImportSummary;
  } | null>(null);

  // Generates and downloads the export archive via a throwaway anchor
  // element, mirroring the layout-PDF export's download handling.
  async function handleExport() {
    setIsExporting(true);
    const toast = start(EXPORT_TOAST_ID);
    try {
      const { blob, filename } = await exportData();
      const objectUrl = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = objectUrl;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(objectUrl);
      toast.markSaved();
    } catch (error) {
      toast.markFailed(error);
    } finally {
      setIsExporting(false);
    }
  }

  // Validates the chosen archive; on success opens the confirmation dialog,
  // on failure raises the shared failed toast directly (validation is a
  // read-like step with no "saving" phase).
  async function handleFileSelected(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    // Reset the input so selecting the same file again re-triggers change.
    event.target.value = '';
    if (!file) return;

    setIsValidating(true);
    try {
      const { token, summary } = await validateImport(file);
      setPendingImport({ token, summary });
    } catch (error) {
      markFailed(IMPORT_TOAST_ID, toProblemDetailsInfo(error));
    } finally {
      setIsValidating(false);
    }
  }

  // Commits the staged import; on success reloads the page so the binder
  // list reflects the imported binders.
  async function handleConfirmImport() {
    if (!pendingImport) return;
    setIsCommitting(true);
    const toast = start(IMPORT_TOAST_ID);
    try {
      await commitImport(pendingImport.token);
      toast.markSaved();
      setPendingImport(null);
      // A full reload is the simplest reliable way to refresh the
      // client-fetched binder list with the newly imported binders.
      window.location.reload();
    } catch (error) {
      toast.markFailed(error);
      setPendingImport(null);
    } finally {
      setIsCommitting(false);
    }
  }

  const isBusy = isExporting || isValidating || isCommitting;

  return (
    <div className="flex w-full flex-col items-center gap-2">
      <div className="flex flex-wrap items-center justify-center gap-4">
        {/* Story 39's search box - a plain case-insensitive substring match
            on binder name, filtered client-side by `BinderList`. */}
        <input
          type="text"
          value={searchQuery}
          onChange={(event) => onSearchChange(event.target.value)}
          placeholder="Search binders"
          aria-label="Search binders"
          className="rounded-standard border border-transparent bg-neutral-800 px-3 py-2 focus:border-primary focus:outline-none"
        />

        {/* Story 39's sort toggle: a single button switching between the two
            orderings, labeled with the ordering selecting it would switch
            to (matching this codebase's other toggle-button conventions). */}
        <button
          type="button"
          onClick={onToggleSort}
          aria-label={`Sort by ${sortOption === 'lastActive' ? 'name' : 'last active'}`}
          className="flex cursor-pointer items-center gap-2 rounded-standard bg-neutral-800 px-4 py-2 font-bold hover:brightness-110"
        >
          <ArrowUpDown className="size-4" aria-hidden="true" />
          Sort: {sortOption === 'lastActive' ? 'Last Active' : 'Name'}
        </button>

        {/* Story 4's create button. */}
        <Link
          href="/binders/new"
          className="rounded-standard bg-primary px-4 py-2 font-bold hover:brightness-110"
        >
          Create new binder
        </Link>

        {/* Story 22's completion-metrics toggle. */}
        <label htmlFor="completion-metrics-toggle" className="flex items-center gap-2">
          <span className="relative inline-flex size-5 shrink-0 items-center justify-center">
            <input
              id="completion-metrics-toggle"
              type="checkbox"
              checked={metricsVisible}
              onChange={(event) => setMetricsVisible(event.target.checked)}
              className="peer size-5 appearance-none rounded-standard border border-neutral-500 bg-neutral-800 checked:border-primary checked:bg-primary"
            />
            <Check className="pointer-events-none absolute size-4 text-background opacity-0 peer-checked:opacity-100" />
          </span>
          <span className="text-caption text-neutral-500">Show completion metrics</span>
        </label>

        {/* Story 33's export/import actions. */}
        <div className="flex gap-3">
          <button
            type="button"
            onClick={handleExport}
            disabled={isBusy}
            className="flex cursor-pointer items-center gap-2 rounded-standard bg-neutral-800 px-4 py-2 font-bold hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Download className="size-5" />
            Export
          </button>
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={isBusy}
            className="flex cursor-pointer items-center gap-2 rounded-standard bg-neutral-800 px-4 py-2 font-bold hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Upload className="size-5" />
            Import
          </button>
          {/* Hidden file input driven by the Import button; accepts ZIP
              archives produced by Export. */}
          <input
            ref={fileInputRef}
            type="file"
            accept=".zip,application/zip"
            onChange={handleFileSelected}
            className="hidden"
          />
        </div>
      </div>

      {/* Import's loading feedback stays below the row (its confirmation
          dialog occupies the center of the screen during commit). */}
      {isValidating && <LoadingIndicator label="Validating archive…" />}
      {isCommitting && <LoadingIndicator label="Importing data…" />}

      {pendingImport && (
        <ImportConfirmDialog
          summary={pendingImport.summary}
          isCommitting={isCommitting}
          onConfirm={handleConfirmImport}
          onCancel={() => setPendingImport(null)}
        />
      )}
    </div>
  );
}
