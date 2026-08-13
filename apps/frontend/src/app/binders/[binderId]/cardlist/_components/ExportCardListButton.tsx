'use client';

import { Printer } from 'lucide-react';
import { useState } from 'react';

import { exportCardsListPdf } from '@/lib/api';
import { Tooltip, useSaveStatusToast } from '@/shared/feedback';

// Story 37's Card List export button: generates and downloads a Card List
// PDF for the tab's currently visible (search/sort/filter-derived) cards,
// in their exact currently-sorted order - mirrors `PrintArtModal`'s own
// `handlePrint` download plumbing (object URL, temporary anchor click,
// revoke) and its shared save-status toast.
export function ExportCardListButton({
  binderId,
  cardIds,
}: {
  binderId: string;
  // The currently visible cards' ids, already in the tab's own
  // sort/filter order - the backend renders the PDF in this exact order.
  cardIds: readonly string[];
}) {
  const [isExporting, setIsExporting] = useState(false);
  const { start } = useSaveStatusToast();

  async function handleExport() {
    setIsExporting(true);
    const toast = start();
    try {
      const { blob, filename } = await exportCardsListPdf(binderId, [...cardIds]);
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

  const isDisabled = isExporting || cardIds.length === 0;

  return (
    <Tooltip label={cardIds.length === 0 ? 'No cards to export' : 'Export as PDF'}>
      <button
        type="button"
        onClick={handleExport}
        disabled={isDisabled}
        aria-label="Export card list as PDF"
        className="flex shrink-0 cursor-pointer items-center justify-center rounded-standard bg-primary p-2 text-neutral-100 hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
      >
        <Printer className="size-5" />
      </button>
    </Tooltip>
  );
}
