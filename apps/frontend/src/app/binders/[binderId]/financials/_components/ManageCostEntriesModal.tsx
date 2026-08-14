'use client';

import { Trash2, X } from 'lucide-react';
import { useEffect, useState } from 'react';

import type { BinderCostEntry, HolographicPaperCostEntry, PrintingCostEntry } from '@/lib/api';

import { DeleteCostEntryConfirmDialog } from './DeleteCostEntryConfirmDialog';

// One of the 3 shared physical-cost catalogs, in the fixed display order
// this modal (and the Material costs section above it) always uses.
type CostEntryCatalog = 'Binder' | 'Printing' | 'Holographic Paper';

interface CostEntryRow {
  catalog: CostEntryCatalog;
  id: string;
  name: string;
  binderCount: number;
}

// Story 44's "Manage cost entries" modal: a single flat list combining all
// 3 shared physical-cost catalogs, each entry labeled with its catalog and
// a delete action, opened from the Finances tab sticky-totals area's gear
// icon. The 3 catalog lists are concatenated in a fixed order (Binder,
// then Printing, then Holographic Paper - matching the Material costs
// section's own display order) rather than re-sorted across catalogs; each
// list is already alphabetically ordered by its own `GET` endpoint (story
// 34), so no additional combined-and-sorted endpoint is needed. Modeled on
// `BulkAddFailuresModal`'s header-plus-scrollable-list dialog shell, since
// no shared top-level `ModalShell` exists yet in this codebase.
export function ManageCostEntriesModal({
  binderCostEntries,
  printingCostEntries,
  holographicPaperCostEntries,
  onDeleteBinderCostEntry,
  onDeletePrintingCostEntry,
  onDeleteHolographicPaperCostEntry,
  onClose,
}: {
  binderCostEntries: BinderCostEntry[];
  printingCostEntries: PrintingCostEntry[];
  holographicPaperCostEntries: HolographicPaperCostEntry[];
  onDeleteBinderCostEntry: (id: string) => void;
  onDeletePrintingCostEntry: (id: string) => void;
  onDeleteHolographicPaperCostEntry: (id: string) => void;
  onClose: () => void;
}) {
  // The entry awaiting delete confirmation (story 44: "Selecting delete on
  // an entry opens the shared confirmation modal before removing it"), or
  // `null` when no confirmation dialog is open.
  const [pendingDelete, setPendingDelete] = useState<CostEntryRow | null>(null);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
      }
    }

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  const rows: CostEntryRow[] = [
    ...binderCostEntries.map((entry) => ({
      catalog: 'Binder' as const,
      id: entry.id,
      name: entry.name,
      binderCount: entry.binderCount,
    })),
    ...printingCostEntries.map((entry) => ({
      catalog: 'Printing' as const,
      id: entry.id,
      name: entry.name,
      binderCount: entry.binderCount,
    })),
    ...holographicPaperCostEntries.map((entry) => ({
      catalog: 'Holographic Paper' as const,
      id: entry.id,
      name: entry.name,
      binderCount: entry.binderCount,
    })),
  ];

  // Dispatches the confirmed delete to the catalog-specific callback the
  // Finances page supplied, closing this confirmation dialog first so it
  // never lingers while the (possibly optimistic) removal plays out.
  function handleConfirmDelete() {
    const row = pendingDelete;
    if (!row) return;
    setPendingDelete(null);
    if (row.catalog === 'Binder') onDeleteBinderCostEntry(row.id);
    else if (row.catalog === 'Printing') onDeletePrintingCostEntry(row.id);
    else onDeleteHolographicPaperCostEntry(row.id);
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-8"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="manage-cost-entries-dialog-title"
        onClick={(event) => event.stopPropagation()}
        className="flex max-h-[32rem] w-full max-w-lg flex-col gap-4 rounded-standard bg-surface p-6 shadow-modal"
      >
        <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-4">
          <span aria-hidden="true" />
          <h3 id="manage-cost-entries-dialog-title" className="text-center">
            Manage cost entries
          </h3>
          <button
            type="button"
            aria-label="Close"
            onClick={onClose}
            className="cursor-pointer justify-self-end rounded-full p-1 hover:brightness-110"
          >
            <X className="size-5" aria-hidden="true" />
          </button>
        </div>

        {rows.length === 0 ? (
          <p className="text-body text-neutral-500">No cost entries have been saved yet.</p>
        ) : (
          <ul className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto">
            {rows.map((row) => (
              <li
                key={`${row.catalog}-${row.id}`}
                className="flex items-center justify-between gap-4 rounded-standard bg-neutral-800 px-4 py-3"
              >
                <div className="flex min-w-0 flex-col gap-1">
                  <span className="text-caption text-neutral-500">{row.catalog}</span>
                  <span className="truncate font-bold">{row.name}</span>
                </div>
                <div className="flex shrink-0 items-center gap-3">
                  <span className="text-caption text-neutral-500">
                    {row.binderCount} binder{row.binderCount === 1 ? '' : 's'}
                  </span>
                  <button
                    type="button"
                    aria-label={`Delete ${row.name}`}
                    onClick={() => setPendingDelete(row)}
                    className="cursor-pointer rounded-standard p-2 text-neutral-500 hover:text-error"
                  >
                    <Trash2 className="size-5" aria-hidden="true" />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {pendingDelete && (
        <DeleteCostEntryConfirmDialog
          entryName={pendingDelete.name}
          binderCount={pendingDelete.binderCount}
          onConfirm={handleConfirmDelete}
          onCancel={() => setPendingDelete(null)}
        />
      )}
    </div>
  );
}
