'use client';

import { useEffect } from 'react';
import { X } from 'lucide-react';

import { resolveCardImageUrl } from '@/lib/api';
import type { BulkAddFailure } from '../../../BinderRouteContext';

// Story 18's failure-details modal: opened from the shared failed toast's
// "View details" action after a bulk card-add batch has any failed card,
// listing every failed card with its own Problem Details message and
// offering "Retry All Failed" to resubmit them in one new batch. Modeled on
// `EditCardVariationModal`'s bespoke dialog shell, since no shared top-level
// `ModalShell` exists yet in this codebase.
export function BulkAddFailuresModal({
  failure,
  onRetryAll,
  onClose,
}: {
  failure: BulkAddFailure;
  onRetryAll: () => void;
  onClose: () => void;
}) {
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

  // Retry All Failed closes this modal right away (story 18: "runs the
  // retry in the background") - `onRetryAll` itself clears the route
  // context's `bulkAddFailure`, so this modal (rendered only while that's
  // non-null) unmounts as a natural consequence.
  function handleRetryAll() {
    onRetryAll();
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-8"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="bulk-add-failures-dialog-title"
        onClick={(event) => event.stopPropagation()}
        className="flex max-h-[32rem] w-full max-w-lg flex-col gap-4 rounded-standard bg-surface p-6 shadow-modal"
      >
        <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-4">
          <span aria-hidden="true" />
          <h3 id="bulk-add-failures-dialog-title" className="text-center">
            Cards that failed to save
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

        <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto">
          {failure.items.map((item) => (
            <div
              key={item.card.providerCardId}
              className="flex items-center gap-3 rounded-standard border border-neutral-700 bg-neutral-800 p-2"
            >
              {/* eslint-disable-next-line @next/next/no-img-element -- an
              arbitrary provider-hosted image, not eligible for next/image's
              fixed-domain optimization. */}
              <img
                src={resolveCardImageUrl(item.card.imageUrl)}
                alt={item.card.name}
                loading="lazy"
                className="h-16 w-12 shrink-0 object-contain"
              />
              <div className="flex min-w-0 flex-col gap-1">
                <span className="truncate font-bold">{item.card.name}</span>
                <span className="text-caption text-error">{item.detail}</span>
              </div>
            </div>
          ))}
        </div>

        <div className="flex justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            className="cursor-pointer rounded-standard px-4 py-2 font-bold hover:brightness-110"
          >
            Dismiss
          </button>
          <button
            type="button"
            onClick={handleRetryAll}
            className="cursor-pointer rounded-standard bg-primary px-4 py-2 font-bold hover:brightness-110"
          >
            Retry All Failed
          </button>
        </div>
      </div>
    </div>
  );
}
