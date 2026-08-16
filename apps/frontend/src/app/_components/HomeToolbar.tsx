'use client';

import { DEFAULT_BINDER_COMPLETION_METRICS_VISIBLE } from '@binder-project-planner/shared';
import { ArrowUpDown, Calculator, Check, Download, Upload } from 'lucide-react';
import Link from 'next/link';
import { useRef, useState } from 'react';

import { commitImport, exportData, validateImport, type ImportSummary } from '@/lib/api';
import {
  LoadingIndicator,
  toProblemDetailsInfo,
  Tooltip,
  useSaveStatusToast,
  useToastContext,
} from '@/shared/feedback';
import { useLocalStorageBoolean } from '@/shared/hooks/useLocalStorageBoolean';

import { COMPLETION_METRICS_VISIBLE_STORAGE_KEY, type BinderSortOption } from './BinderList';
import { ImportConfirmDialog } from './ImportConfirmDialog';
import { TagFilterControl } from './TagFilterControl';

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
  availableTags,
  selectedTags,
  onSelectedTagsChange,
}: {
  // Story 39's search box value and sort toggle state, lifted to the home
  // page so this toolbar and `BinderList` (which actually filters/sorts)
  // stay in sync without either persisting anything.
  searchQuery: string;
  onSearchChange: (value: string) => void;
  sortOption: BinderSortOption;
  onToggleSort: () => void;
  // Story 51's tag filter: the distinct tag options (reported up by
  // `BinderList` itself) and the currently selected tags, also lifted to
  // the home page for the same reason as the search/sort state above.
  availableTags: string[];
  selectedTags: string[];
  onSelectedTagsChange: (next: string[]) => void;
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
          className="h-10 rounded-standard border border-transparent bg-neutral-800 px-3 focus:border-primary focus:outline-none"
        />

        {/* Story 51's tag filter, swapped ahead of the sort toggle below;
            its own "Tags" label moved into an icon-button tooltip (see
            `TagFilterControl`). */}
        <TagFilterControl
          availableTags={availableTags}
          selectedTags={selectedTags}
          onSelectedTagsChange={onSelectedTagsChange}
        />

        {/* Story 39's sort toggle: a single icon button switching between
            the two orderings. The current ordering is kept as visible text
            (it's the button's own state, not just a static label), but the
            fixed "Sort:" prefix moved into a tooltip instead. */}
        <Tooltip label="Toggle sort options">
          <button
            type="button"
            onClick={onToggleSort}
            aria-label={`Sort by ${sortOption === 'lastActive' ? 'name' : 'last active'}`}
            className="flex h-10 cursor-pointer items-center gap-2 rounded-standard bg-neutral-800 px-4 font-bold hover:brightness-110"
          >
            <ArrowUpDown className="size-4" aria-hidden="true" />
            {sortOption === 'lastActive' ? 'Last Active' : 'Name'}
          </button>
        </Tooltip>

        {/* Story 4's create button. */}
        <Link
          href="/binders/new"
          className="flex h-10 items-center rounded-standard bg-primary px-4 font-bold hover:brightness-110"
        >
          Create new binder
        </Link>

        {/* Story 54's Finances Preview page - a standalone finance
            estimate calculator reachable without creating a binder.
            Icon-only, with its label moved into a tooltip to match the
            other icon actions in this toolbar. */}
        <Tooltip label="Preview Finances">
          <Link
            href="/finances-preview"
            aria-label="Preview Finances"
            className="flex h-10 w-10 items-center justify-center rounded-standard bg-neutral-800 hover:brightness-110"
          >
            <Calculator className="size-5" aria-hidden="true" />
          </Link>
        </Tooltip>

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

        {/* Story 33's export/import actions - icon-only buttons with their
            labels moved into tooltips, their icons swapped from the
            semantically "expected" pairing (Download=export, Upload=import),
            and Import placed ahead of Export, all per later revisions. */}
        <div className="flex gap-3">
          <Tooltip label="Import data">
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={isBusy}
              aria-label="Import data"
              className="flex h-10 w-10 cursor-pointer items-center justify-center rounded-standard bg-neutral-800 hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Download className="size-5" />
            </button>
          </Tooltip>
          <Tooltip label="Export data">
            <button
              type="button"
              onClick={handleExport}
              disabled={isBusy}
              aria-label="Export data"
              className="flex h-10 w-10 cursor-pointer items-center justify-center rounded-standard bg-neutral-800 hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Upload className="size-5" />
            </button>
          </Tooltip>
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
