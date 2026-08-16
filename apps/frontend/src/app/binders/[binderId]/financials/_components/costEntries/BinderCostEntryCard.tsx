'use client';

import { useState } from 'react';

import {
  createBinderCostEntry,
  updateBinder as updateBinderRequest,
  updateBinderCostEntry,
  type Binder,
  type BinderCostEntry,
} from '@/lib/api';
import { useSaveStatusToast } from '@/shared/feedback';

import {
  financeErrorInputClassName,
  FinanceField,
  FinanceMoneyInput,
  financeInputClassName,
  physicalCostCardClassName,
} from '../FinanceField';
import { CostEntryDropdown } from './CostEntryDropdown';

const SELECT_TOAST_ID = 'select-binder-cost-entry';
const SAVE_NEW_ENTRY_TOAST_ID = 'save-new-binder-cost-entry';

// Parses a price input, requiring a finite value greater than 0 per this
// story's field-validation rules; returns null when invalid.
function parsePrice(value: string): number | null {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

// Trims and validates a cost-entry name: required, 1-100 characters after
// trimming (duplicate names across entries are allowed since selection is
// by id).
function validateName(value: string): string | null {
  const trimmed = value.trim();
  if (trimmed.length === 0) return 'Name is required.';
  if (trimmed.length > 100) return 'Name must be 100 characters or fewer.';
  return null;
}

interface BinderCostEntryCardProps {
  binder: Binder;
  entries: BinderCostEntry[];
  onEntryCreated: (entry: BinderCostEntry) => void;
  onEntryUpdated: (entry: BinderCostEntry) => void;
  onBinderUpdated: (binder: Binder) => void;
}

// The Physical costs section's Binder row (story 34). The dropdown is
// limited to entries whose stored width/height/pages match this binder's
// current values, per the story's dimension-matching rule - a saved entry
// for a differently sized binder is meaningless here. Width/height/pages
// aren't shown to the user; a newly created entry silently inherits them
// from this binder, since it's being created specifically to describe a
// binder of this shape.
export function BinderCostEntryCard({
  binder,
  entries,
  onEntryCreated,
  onEntryUpdated,
  onBinderUpdated,
}: BinderCostEntryCardProps) {
  const { start } = useSaveStatusToast();
  const [mode, setMode] = useState<'select' | 'add'>('select');
  const [isSelecting, setIsSelecting] = useState(false);
  const [newName, setNewName] = useState('');
  const [newPrice, setNewPrice] = useState('');
  const [addErrors, setAddErrors] = useState<{ name?: string; price?: string }>({});
  const [isCreating, setIsCreating] = useState(false);

  const matchingEntries = entries.filter(
    (entry) =>
      entry.width === binder.width &&
      entry.height === binder.height &&
      entry.pages === binder.pages,
  );
  const selectedEntry =
    matchingEntries.find((entry) => entry.id === binder.selectedBinderCostEntryId) ?? null;

  async function handleSelectExisting(id: string) {
    setIsSelecting(true);
    const toast = start(SELECT_TOAST_ID);
    try {
      const updated = await updateBinderRequest(binder.id, { selectedBinderCostEntryId: id });
      onBinderUpdated(updated);
      toast.markSaved();
    } catch (error) {
      toast.markFailed(error);
    } finally {
      setIsSelecting(false);
    }
  }

  function handleAddNew() {
    setNewName('');
    setNewPrice('');
    setAddErrors({});
    setMode('add');
  }

  async function handleSaveNew() {
    const nameError = validateName(newName);
    const priceValue = parsePrice(newPrice);
    if (nameError || priceValue === null) {
      setAddErrors({
        name: nameError ?? undefined,
        price: priceValue === null ? 'Price must be greater than 0.' : undefined,
      });
      return;
    }

    setIsCreating(true);
    const toast = start(SAVE_NEW_ENTRY_TOAST_ID);
    try {
      const created = await createBinderCostEntry({
        name: newName.trim(),
        price: priceValue,
        width: binder.width,
        height: binder.height,
        pages: binder.pages,
      });
      onEntryCreated(created);
      const updatedBinder = await updateBinderRequest(binder.id, {
        selectedBinderCostEntryId: created.id,
      });
      onBinderUpdated(updatedBinder);
      toast.markSaved();
      setMode('select');
    } catch (error) {
      toast.markFailed(error);
    } finally {
      setIsCreating(false);
    }
  }

  return (
    <div className={physicalCostCardClassName}>
      <h3 className="text-subheading font-bold">Binder</h3>
      {mode === 'select' ? (
        <>
          <CostEntryDropdown
            id="binder-cost-entry"
            label="Binder cost entry"
            items={matchingEntries}
            selectedId={binder.selectedBinderCostEntryId}
            placeholder="Select a Binder cost entry…"
            disabled={isSelecting}
            onSelectExisting={handleSelectExisting}
            onSelectAddNew={handleAddNew}
          />
          {selectedEntry && (
            <SelectedBinderCostEntryFields
              key={selectedEntry.id}
              entry={selectedEntry}
              onEntryUpdated={onEntryUpdated}
            />
          )}
          {selectedEntry && (
            <p className="text-caption text-neutral-500">
              Cost: {formatEntryPrice(selectedEntry.price)}
            </p>
          )}
        </>
      ) : (
        <div className="flex flex-col gap-3">
          <FinanceField label="Name" htmlFor="new-binder-cost-name" error={addErrors.name}>
            <input
              id="new-binder-cost-name"
              type="text"
              value={newName}
              disabled={isCreating}
              onChange={(event) => setNewName(event.target.value)}
              className={addErrors.name ? financeErrorInputClassName : financeInputClassName}
            />
          </FinanceField>
          <FinanceField label="Price" htmlFor="new-binder-cost-price" error={addErrors.price}>
            <FinanceMoneyInput
              id="new-binder-cost-price"
              value={newPrice}
              disabled={isCreating}
              onChange={(event) => setNewPrice(event.target.value)}
              hasError={Boolean(addErrors.price)}
            />
          </FinanceField>
          <div className="flex gap-2">
            <button
              type="button"
              disabled={isCreating}
              onClick={handleSaveNew}
              className="cursor-pointer rounded-standard bg-primary px-4 py-2 font-bold hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Save
            </button>
            <button
              type="button"
              disabled={isCreating}
              onClick={() => setMode('select')}
              className="cursor-pointer rounded-standard bg-neutral-800 px-4 py-2 font-bold hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function formatEntryPrice(price: number): string {
  return `$${price.toFixed(2)}`;
}

// The currently selected Binder cost entry's editable Name/Price fields
// (story 34: "Editing the details of a selected physical cost entry
// updates that same shared entry"). Keyed by the entry's id from the
// parent so switching the selection remounts this with fresh local state
// instead of needing an effect to resync it.
function SelectedBinderCostEntryFields({
  entry,
  onEntryUpdated,
}: {
  entry: BinderCostEntry;
  onEntryUpdated: (entry: BinderCostEntry) => void;
}) {
  const { start } = useSaveStatusToast();
  const [name, setName] = useState(entry.name);
  const [price, setPrice] = useState(entry.price.toFixed(2));
  const [errors, setErrors] = useState<{ name?: string; price?: string }>({});
  const toastId = `edit-binder-cost-entry-${entry.id}`;

  async function handleNameBlur() {
    const trimmed = name.trim();
    if (trimmed === entry.name) return;
    const error = validateName(name);
    if (error) {
      setErrors((prev) => ({ ...prev, name: error }));
      return;
    }
    setErrors((prev) => ({ ...prev, name: undefined }));
    const toast = start(toastId);
    try {
      const updated = await updateBinderCostEntry(entry.id, { name: trimmed });
      onEntryUpdated(updated);
      toast.markSaved();
    } catch (error) {
      setName(entry.name);
      toast.markFailed(error);
    }
  }

  async function handlePriceBlur() {
    const parsed = parsePrice(price);
    if (parsed === null) {
      setErrors((prev) => ({ ...prev, price: 'Price must be greater than 0.' }));
      return;
    }
    if (parsed === entry.price) return;
    setErrors((prev) => ({ ...prev, price: undefined }));
    const toast = start(toastId);
    try {
      const updated = await updateBinderCostEntry(entry.id, { price: parsed });
      onEntryUpdated(updated);
      setPrice(updated.price.toFixed(2));
      toast.markSaved();
    } catch (error) {
      setPrice(entry.price.toFixed(2));
      toast.markFailed(error);
    }
  }

  return (
    <div className="flex gap-3">
      <FinanceField
        label="Name"
        htmlFor={`binder-cost-name-${entry.id}`}
        error={errors.name}
        className="flex-1"
      >
        <input
          id={`binder-cost-name-${entry.id}`}
          type="text"
          value={name}
          onChange={(event) => setName(event.target.value)}
          onBlur={handleNameBlur}
          className={errors.name ? financeErrorInputClassName : financeInputClassName}
        />
      </FinanceField>
      <FinanceField
        label="Price"
        htmlFor={`binder-cost-price-${entry.id}`}
        error={errors.price}
        className="flex-1"
      >
        <FinanceMoneyInput
          id={`binder-cost-price-${entry.id}`}
          value={price}
          onChange={(event) => setPrice(event.target.value)}
          onBlur={handlePriceBlur}
          hasError={Boolean(errors.price)}
        />
      </FinanceField>
    </div>
  );
}
