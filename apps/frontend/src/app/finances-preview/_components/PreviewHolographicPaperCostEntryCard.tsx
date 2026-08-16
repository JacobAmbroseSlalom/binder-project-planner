'use client';

import { useState } from 'react';

import {
  computeHolographicPaperCost,
  formatCurrency,
} from '../../binders/[binderId]/financials/_lib/financeCalculations';
import { CostEntryDropdown } from '../../binders/[binderId]/financials/_components/CostEntryDropdown';
import {
  FinanceField,
  FinanceMoneyInput,
  financeErrorInputClassName,
  financeInputClassName,
  physicalCostCardClassName,
  stripLeadingZero,
} from '../../binders/[binderId]/financials/_components/FinanceField';
import type { PreviewHolographicPaperCostEntryOption } from '../_lib/previewTypes';

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

interface PreviewHolographicPaperCostEntryCardProps {
  entries: PreviewHolographicPaperCostEntryOption[];
  selectedEntryId: string | null;
  onSelectEntry: (id: string) => void;
  onEntryCreated: (entry: PreviewHolographicPaperCostEntryOption) => void;
  onEntryUpdated: (entry: PreviewHolographicPaperCostEntryOption) => void;
  pageCount: number;
  errorMarginPercent: number;
}

// The Finances Preview page's Holographic Paper material-cost card (story
// 54). Behaves like the real "View Financials" tab's
// `HolographicPaperCostEntryCard`, except nothing here ever calls a
// create/update endpoint - selecting, editing, and creating entries only
// ever change this page's own local state.
export function PreviewHolographicPaperCostEntryCard({
  entries,
  selectedEntryId,
  onSelectEntry,
  onEntryCreated,
  onEntryUpdated,
  pageCount,
  errorMarginPercent,
}: PreviewHolographicPaperCostEntryCardProps) {
  const [mode, setMode] = useState<'select' | 'add'>('select');
  const [newName, setNewName] = useState('');
  const [newPrice, setNewPrice] = useState('');
  const [newPagesIncluded, setNewPagesIncluded] = useState('');
  const [addErrors, setAddErrors] = useState<{
    name?: string;
    price?: string;
    pagesIncluded?: string;
  }>({});

  const selectedEntry = entries.find((entry) => entry.id === selectedEntryId) ?? null;

  function handleAddNew() {
    setNewName('');
    setNewPrice('');
    setNewPagesIncluded('');
    setAddErrors({});
    setMode('add');
  }

  function handleSaveNew() {
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

    onEntryCreated({
      id: `local-${crypto.randomUUID()}`,
      name: newName.trim(),
      price: priceValue,
      pagesIncluded: pagesIncludedValue,
    });
    setMode('select');
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
            id="preview-holographic-paper-cost-entry"
            label="Holographic Paper cost entry"
            items={entries}
            selectedId={selectedEntryId}
            placeholder="Select a Holographic Paper cost entry…"
            onSelectExisting={onSelectEntry}
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
          <FinanceField label="Name" htmlFor="new-preview-holo-cost-name" error={addErrors.name}>
            <input
              id="new-preview-holo-cost-name"
              type="text"
              value={newName}
              onChange={(event) => setNewName(event.target.value)}
              className={addErrors.name ? financeErrorInputClassName : financeInputClassName}
            />
          </FinanceField>
          <div className="flex gap-3">
            <FinanceField
              label="Price"
              htmlFor="new-preview-holo-cost-price"
              error={addErrors.price}
              className="flex-1"
            >
              <FinanceMoneyInput
                id="new-preview-holo-cost-price"
                value={newPrice}
                onChange={(event) => setNewPrice(event.target.value)}
                hasError={Boolean(addErrors.price)}
              />
            </FinanceField>
            <FinanceField
              label="Number of pages"
              htmlFor="new-preview-holo-cost-pages-included"
              error={addErrors.pagesIncluded}
              className="flex-1"
            >
              <input
                id="new-preview-holo-cost-pages-included"
                type="number"
                min={1}
                step={1}
                value={newPagesIncluded}
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
              onClick={handleSaveNew}
              className="cursor-pointer rounded-standard bg-primary px-4 py-2 font-bold hover:brightness-110"
            >
              Save
            </button>
            <button
              type="button"
              onClick={() => setMode('select')}
              className="cursor-pointer rounded-standard bg-neutral-800 px-4 py-2 font-bold hover:brightness-110"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// The currently selected Holographic Paper cost entry's editable Name/
// Price/Number-of-pages fields. Edits here only ever update this page's
// own local `entries` state (via `onEntryUpdated`), never
// `updateHolographicPaperCostEntry`.
function SelectedHolographicPaperCostEntryFields({
  entry,
  onEntryUpdated,
}: {
  entry: PreviewHolographicPaperCostEntryOption;
  onEntryUpdated: (entry: PreviewHolographicPaperCostEntryOption) => void;
}) {
  const [name, setName] = useState(entry.name);
  const [price, setPrice] = useState(entry.price.toFixed(2));
  const [pagesIncluded, setPagesIncluded] = useState(String(entry.pagesIncluded));
  const [errors, setErrors] = useState<{
    name?: string;
    price?: string;
    pagesIncluded?: string;
  }>({});

  function commitName() {
    const error = validateName(name);
    if (error) {
      setErrors((prev) => ({ ...prev, name: error }));
      return;
    }
    setErrors((prev) => ({ ...prev, name: undefined }));
    const trimmed = name.trim();
    if (trimmed !== entry.name) onEntryUpdated({ ...entry, name: trimmed });
  }

  function commitPrice() {
    const parsed = parsePrice(price);
    if (parsed === null) {
      setErrors((prev) => ({ ...prev, price: 'Price must be greater than 0.' }));
      setPrice(entry.price.toFixed(2));
      return;
    }
    setErrors((prev) => ({ ...prev, price: undefined }));
    if (parsed !== entry.price) onEntryUpdated({ ...entry, price: parsed });
  }

  function commitPagesIncluded() {
    const parsed = parsePagesIncluded(pagesIncluded);
    if (parsed === null) {
      setErrors((prev) => ({
        ...prev,
        pagesIncluded: 'Number of pages must be a positive whole number.',
      }));
      setPagesIncluded(String(entry.pagesIncluded));
      return;
    }
    setErrors((prev) => ({ ...prev, pagesIncluded: undefined }));
    if (parsed !== entry.pagesIncluded) onEntryUpdated({ ...entry, pagesIncluded: parsed });
  }

  return (
    <div className="flex gap-3">
      <FinanceField
        label="Name"
        htmlFor={`preview-holo-cost-name-${entry.id}`}
        error={errors.name}
        className="flex-1"
      >
        <input
          id={`preview-holo-cost-name-${entry.id}`}
          type="text"
          value={name}
          onChange={(event) => setName(event.target.value)}
          onBlur={commitName}
          className={errors.name ? financeErrorInputClassName : financeInputClassName}
        />
      </FinanceField>
      <FinanceField
        label="Price"
        htmlFor={`preview-holo-cost-price-${entry.id}`}
        error={errors.price}
        className="w-28"
      >
        <FinanceMoneyInput
          id={`preview-holo-cost-price-${entry.id}`}
          value={price}
          onChange={(event) => setPrice(event.target.value)}
          onBlur={commitPrice}
          hasError={Boolean(errors.price)}
        />
      </FinanceField>
      <FinanceField
        label="Number of pages"
        htmlFor={`preview-holo-cost-pages-included-${entry.id}`}
        error={errors.pagesIncluded}
        className="w-32"
      >
        <input
          id={`preview-holo-cost-pages-included-${entry.id}`}
          type="number"
          min={1}
          step={1}
          value={pagesIncluded}
          onChange={(event) => setPagesIncluded(stripLeadingZero(event.target.value))}
          onBlur={commitPagesIncluded}
          className={errors.pagesIncluded ? financeErrorInputClassName : financeInputClassName}
        />
      </FinanceField>
    </div>
  );
}
