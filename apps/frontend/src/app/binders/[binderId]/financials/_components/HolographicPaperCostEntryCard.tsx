'use client';

import { useState } from 'react';

import {
  createHolographicPaperCostEntry,
  updateBinder as updateBinderRequest,
  updateHolographicPaperCostEntry,
  type Binder,
  type HolographicPaperCostEntry,
} from '@/lib/api';
import { useSaveStatusToast } from '@/shared/feedback';

import { computeHolographicPaperCost, formatCurrency } from '../_lib/financeCalculations';
import {
  financeErrorInputClassName,
  FinanceField,
  FinanceMoneyInput,
  financeInputClassName,
  physicalCostCardClassName,
  stripLeadingZero,
} from './FinanceField';
import { CostEntryDropdown } from './CostEntryDropdown';

const SELECT_TOAST_ID = 'select-holographic-paper-cost-entry';
const SAVE_NEW_ENTRY_TOAST_ID = 'save-new-holographic-paper-cost-entry';

function parsePrice(value: string): number | null {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function parsePagesIncluded(value: string): number | null {
  const parsed = Number(value);
  return Number.isFinite(parsed) && Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function validateName(value: string): string | null {
  const trimmed = value.trim();
  if (trimmed.length === 0) return 'Name is required.';
  if (trimmed.length > 100) return 'Name must be 100 characters or fewer.';
  return null;
}

interface HolographicPaperCostEntryCardProps {
  binder: Binder;
  entries: HolographicPaperCostEntry[];
  pageCount: number;
  errorMarginPercent: number;
  onEntryCreated: (entry: HolographicPaperCostEntry) => void;
  onEntryUpdated: (entry: HolographicPaperCostEntry) => void;
  onBinderUpdated: (binder: Binder) => void;
}

// The Physical costs section's Holographic Paper row (story 34):
// (price / pagesIncluded) multiplied by the binder's art-print page count,
// shown both with and without the shared error margin applied.
export function HolographicPaperCostEntryCard({
  binder,
  entries,
  pageCount,
  errorMarginPercent,
  onEntryCreated,
  onEntryUpdated,
  onBinderUpdated,
}: HolographicPaperCostEntryCardProps) {
  const { start } = useSaveStatusToast();
  const [mode, setMode] = useState<'select' | 'add'>('select');
  const [isSelecting, setIsSelecting] = useState(false);
  const [newName, setNewName] = useState('');
  const [newPrice, setNewPrice] = useState('');
  const [newPagesIncluded, setNewPagesIncluded] = useState('');
  const [addErrors, setAddErrors] = useState<{
    name?: string;
    price?: string;
    pagesIncluded?: string;
  }>({});
  const [isCreating, setIsCreating] = useState(false);

  const selectedEntry =
    entries.find((entry) => entry.id === binder.selectedHolographicPaperCostEntryId) ?? null;

  async function handleSelectExisting(id: string) {
    setIsSelecting(true);
    const toast = start(SELECT_TOAST_ID);
    try {
      const updated = await updateBinderRequest(binder.id, {
        selectedHolographicPaperCostEntryId: id,
      });
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
    setNewPagesIncluded('');
    setAddErrors({});
    setMode('add');
  }

  async function handleSaveNew() {
    const nameError = validateName(newName);
    const priceValue = parsePrice(newPrice);
    const pagesIncludedValue = parsePagesIncluded(newPagesIncluded);
    if (nameError || priceValue === null || pagesIncludedValue === null) {
      setAddErrors({
        name: nameError ?? undefined,
        price: priceValue === null ? 'Price must be greater than 0.' : undefined,
        pagesIncluded:
          pagesIncludedValue === null
            ? 'Number of pages must be a positive whole number.'
            : undefined,
      });
      return;
    }

    setIsCreating(true);
    const toast = start(SAVE_NEW_ENTRY_TOAST_ID);
    try {
      const created = await createHolographicPaperCostEntry({
        name: newName.trim(),
        price: priceValue,
        pagesIncluded: pagesIncludedValue,
      });
      onEntryCreated(created);
      const updatedBinder = await updateBinderRequest(binder.id, {
        selectedHolographicPaperCostEntryId: created.id,
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

  const cost = selectedEntry
    ? computeHolographicPaperCost(
        selectedEntry.price,
        selectedEntry.pagesIncluded,
        pageCount,
        errorMarginPercent,
      )
    : null;

  return (
    <div className={physicalCostCardClassName}>
      <h3 className="text-subheading font-bold">Holographic Paper</h3>
      {mode === 'select' ? (
        <>
          <CostEntryDropdown
            id="holographic-paper-cost-entry"
            label="Holographic Paper cost entry"
            items={entries}
            selectedId={binder.selectedHolographicPaperCostEntryId}
            placeholder="Select a Holographic Paper cost entry…"
            disabled={isSelecting}
            onSelectExisting={handleSelectExisting}
            onSelectAddNew={handleAddNew}
          />
          {selectedEntry && (
            <SelectedHolographicPaperCostEntryFields
              key={selectedEntry.id}
              entry={selectedEntry}
              onEntryUpdated={onEntryUpdated}
            />
          )}
          {cost && (
            <p className="text-caption text-neutral-500">
              Without error margin: {formatCurrency(cost.withoutMargin)} · With error margin:{' '}
              {formatCurrency(cost.withMargin)}
            </p>
          )}
        </>
      ) : (
        <div className="flex flex-col gap-3">
          <FinanceField label="Name" htmlFor="new-holo-cost-name" error={addErrors.name}>
            <input
              id="new-holo-cost-name"
              type="text"
              value={newName}
              disabled={isCreating}
              onChange={(event) => setNewName(event.target.value)}
              className={addErrors.name ? financeErrorInputClassName : financeInputClassName}
            />
          </FinanceField>
          <div className="flex gap-3">
            <FinanceField
              label="Price"
              htmlFor="new-holo-cost-price"
              error={addErrors.price}
              className="flex-1"
            >
              <FinanceMoneyInput
                id="new-holo-cost-price"
                value={newPrice}
                disabled={isCreating}
                onChange={(event) => setNewPrice(event.target.value)}
                hasError={Boolean(addErrors.price)}
              />
            </FinanceField>
            <FinanceField
              label="Number of pages"
              htmlFor="new-holo-cost-pages-included"
              error={addErrors.pagesIncluded}
              className="flex-1"
            >
              <input
                id="new-holo-cost-pages-included"
                type="number"
                min={1}
                step={1}
                value={newPagesIncluded}
                disabled={isCreating}
                onChange={(event) => setNewPagesIncluded(stripLeadingZero(event.target.value))}
                className={
                  addErrors.pagesIncluded ? financeErrorInputClassName : financeInputClassName
                }
              />
            </FinanceField>
          </div>
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

function SelectedHolographicPaperCostEntryFields({
  entry,
  onEntryUpdated,
}: {
  entry: HolographicPaperCostEntry;
  onEntryUpdated: (entry: HolographicPaperCostEntry) => void;
}) {
  const { start } = useSaveStatusToast();
  const [name, setName] = useState(entry.name);
  const [price, setPrice] = useState(entry.price.toFixed(2));
  const [pagesIncluded, setPagesIncluded] = useState(String(entry.pagesIncluded));
  const [errors, setErrors] = useState<{
    name?: string;
    price?: string;
    pagesIncluded?: string;
  }>({});
  const toastId = `edit-holographic-paper-cost-entry-${entry.id}`;

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
      const updated = await updateHolographicPaperCostEntry(entry.id, { name: trimmed });
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
      const updated = await updateHolographicPaperCostEntry(entry.id, { price: parsed });
      onEntryUpdated(updated);
      setPrice(updated.price.toFixed(2));
      toast.markSaved();
    } catch (error) {
      setPrice(entry.price.toFixed(2));
      toast.markFailed(error);
    }
  }

  async function handlePagesIncludedBlur() {
    const parsed = parsePagesIncluded(pagesIncluded);
    if (parsed === null) {
      setErrors((prev) => ({
        ...prev,
        pagesIncluded: 'Number of pages must be a positive whole number.',
      }));
      return;
    }
    if (parsed === entry.pagesIncluded) return;
    setErrors((prev) => ({ ...prev, pagesIncluded: undefined }));
    const toast = start(toastId);
    try {
      const updated = await updateHolographicPaperCostEntry(entry.id, { pagesIncluded: parsed });
      onEntryUpdated(updated);
      setPagesIncluded(String(updated.pagesIncluded));
      toast.markSaved();
    } catch (error) {
      setPagesIncluded(String(entry.pagesIncluded));
      toast.markFailed(error);
    }
  }

  return (
    // `min-w-0` on each field overrides flexbox's default min-width:auto,
    // which otherwise refuses to shrink a flex item below its content's
    // width (e.g. the "Number of pages" label) and forces the row
    // to overflow the card instead of fitting on one line.
    <div className="flex gap-3">
      <FinanceField
        label="Name"
        htmlFor={`holo-cost-name-${entry.id}`}
        error={errors.name}
        className="min-w-0 flex-1"
      >
        <input
          id={`holo-cost-name-${entry.id}`}
          type="text"
          value={name}
          onChange={(event) => setName(event.target.value)}
          onBlur={handleNameBlur}
          className={errors.name ? financeErrorInputClassName : financeInputClassName}
        />
      </FinanceField>
      <FinanceField
        label="Price"
        htmlFor={`holo-cost-price-${entry.id}`}
        error={errors.price}
        className="min-w-0 flex-1"
      >
        <FinanceMoneyInput
          id={`holo-cost-price-${entry.id}`}
          value={price}
          onChange={(event) => setPrice(event.target.value)}
          onBlur={handlePriceBlur}
          hasError={Boolean(errors.price)}
        />
      </FinanceField>
      <FinanceField
        label="Number of pages"
        htmlFor={`holo-cost-pages-included-${entry.id}`}
        error={errors.pagesIncluded}
        className="min-w-0 flex-1"
      >
        <input
          id={`holo-cost-pages-included-${entry.id}`}
          type="number"
          min={1}
          step={1}
          value={pagesIncluded}
          onChange={(event) => setPagesIncluded(stripLeadingZero(event.target.value))}
          onBlur={handlePagesIncludedBlur}
          className={errors.pagesIncluded ? financeErrorInputClassName : financeInputClassName}
        />
      </FinanceField>
    </div>
  );
}
