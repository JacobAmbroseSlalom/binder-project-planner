'use client';

import { Printer } from 'lucide-react';
import { useState } from 'react';

import { exportWatchlistPdf } from '@/lib/api';
import { Tooltip, useSaveStatusToast } from '@/shared/feedback';

// Story 45's What I'm Looking For print/export button: generates and
// downloads the page's currently visible (search/filter-derived, then
// manually-dragged-or-column-sorted) entries as a fixed 2-page PDF -
// mirrors the binder Card List's own `ExportCardListButton` download
// plumbing (object URL, temporary anchor click, revoke) and its shared
// save-status toast.
export function ExportWatchlistPdfButton({
  watchlistEntryIds,
}: {
  // The currently visible entries' ids, already in the page's own
  // manual-drag-or-column-sort order - the backend renders the PDF in
  // this exact order.
  watchlistEntryIds: readonly string[];
}) {
  const [isExporting, setIsExporting] = useState(false);
  const { start } = useSaveStatusToast();

  async function handleExport() {
    setIsExporting(true);
    const toast = start();
    try {
      const { blob, filename } = await exportWatchlistPdf([...watchlistEntryIds]);
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

  const isDisabled = isExporting || watchlistEntryIds.length === 0;

  return (
    <Tooltip label={watchlistEntryIds.length === 0 ? 'No cards to export' : 'Export as PDF'}>
      <button
        type="button"
        onClick={handleExport}
        disabled={isDisabled}
        aria-label="Export What I'm Looking For list as PDF"
        className="flex shrink-0 cursor-pointer items-center justify-center rounded-standard bg-primary p-2 text-neutral-100 hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
      >
        <Printer className="size-5" />
      </button>
    </Tooltip>
  );
}
