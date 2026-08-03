'use client';

import { useEffect, useRef, useState, type FormEvent } from 'react';

import type { Card } from '@/lib/api';
import { VariationCombobox } from '@/shared/forms';

// Story 16's edit-variation modal, opened from a card's hover-revealed
// Pencil action (see `CardTile`). Modeled on `DeleteBinderConfirmDialog`'s
// minimal two-button dialog shell, since no shared top-level `ModalShell`
// exists yet - a bespoke modal per the rest of this codebase's convention.
export function EditCardVariationModal({
  card,
  isSaving,
  onSave,
  onClose,
}: {
  card: Card;
  // True while this card's own variation update is in flight (story 16) -
  // disables the form until it settles.
  isSaving: boolean;
  onSave: (variation: string | null) => void;
  onClose: () => void;
}) {
  // Seeded from the card's current value; the modal fully unmounts on
  // close (mirroring `CardSelectionModal`'s own lifecycle), so there's no
  // need to reset this on `card` changes beyond the initial render.
  const [variation, setVariation] = useState(card.variation ?? '');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

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

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    onSave(variation.trim() || null);
    onClose();
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-8"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="edit-card-variation-dialog-title"
        onClick={(event) => event.stopPropagation()}
        className="flex w-full max-w-sm flex-col gap-4 rounded-standard bg-surface p-6 shadow-modal"
      >
        <h3 id="edit-card-variation-dialog-title">Edit variation for &ldquo;{card.name}&rdquo;</h3>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <VariationCombobox
            id="edit-card-variation-input"
            value={variation}
            onChange={setVariation}
            disabled={isSaving}
            inputRef={inputRef}
          />
          <div className="flex justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              disabled={isSaving}
              className="cursor-pointer rounded-standard px-4 py-2 text-neutral-100 hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSaving}
              className="cursor-pointer rounded-standard bg-primary px-4 py-2 text-neutral-100 hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Save
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
