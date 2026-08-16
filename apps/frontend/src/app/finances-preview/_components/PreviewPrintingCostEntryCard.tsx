'use client';

import { useState } from 'react';

import {
  computePrintingCost,
  formatCurrency,
  roundCents,
} from '../../binders/[binderId]/financials/_lib/financeCalculations';
import { CostEntryDropdown } from '../../binders/[binderId]/financials/_components/costEntries/CostEntryDropdown';
import {
  FinanceField,
  FinanceMoneyInput,
  financeErrorInputClassName,
  financeInputClassName,
  physicalCostCardClassName,
  stripLeadingZero,
} from '../../binders/[binderId]/financials/_components/FinanceField';
import type { PreviewPrintingCostEntryOption } from '../_lib/previewTypes';

// Placeholder shown in the price-per-page field whenever it's left blank -
// communicates that leaving it empty derives the price from the total
// price ÷ number of pages fields above it, rather than requiring a value.
const PRICE_PER_PAGE_PLACEHOLDER = 'Auto-calculated';

function parsePrice(value: string): number | null {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function parsePageCount(value: string): number | null {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function validateName(value: string): string | null {
  const trimmed = value.trim();
  if (trimmed.length === 0) return 'Name is required.';
  if (trimmed.length > 100) return 'Name must be 100 characters or fewer.';
  return null;
}

interface PreviewPrintingCostEntryCardProps {
  entries: PreviewPrintingCostEntryOption[];
  selectedEntryId: string | null;
  onSelectEntry: (id: string) => void;
  onEntryCreated: (entry: PreviewPrintingCostEntryOption) => void;
  onEntryUpdated: (entry: PreviewPrintingCostEntryOption) => void;
  pageCount: number;
  errorMarginPercent: number;
}

// The Finances Preview page's Printing material-cost card (story 54).
// Behaves like the real "View Financials" tab's `PrintingCostEntryCard` -
// same fields, same total-price/pages auto-calculated price-per-page
// convenience - except nothing here ever calls a create/update endpoint;
// selecting, editing, and creating entries only ever change this page's
// own local state.
export function PreviewPrintingCostEntryCard({
  entries,
  selectedEntryId,
  onSelectEntry,
  onEntryCreated,
  onEntryUpdated,
  pageCount,
  errorMarginPercent,
}: PreviewPrintingCostEntryCardProps) {
  const [mode, setMode] = useState<'select' | 'add'>('select');
  const [newName, setNewName] = useState('');
  const [newPricePerPage, setNewPricePerPage] = useState('');
  const [newTotalPrice, setNewTotalPrice] = useState('');
  const [newTotalPages, setNewTotalPages] = useState('');
  const [addErrors, setAddErrors] = useState<{
    name?: string;
    pricePerPage?: string;
    totalPrice?: string;
    totalPages?: string;
  }>({});

  const selectedEntry = entries.find((entry) => entry.id === selectedEntryId) ?? null;

  function handleAddNew() {
    setNewName('');
    setNewPricePerPage('');
    setNewTotalPrice('');
    setNewTotalPages('');
    setAddErrors({});
    setMode('add');
  }

  // Whenever the total price or number of pages changes, keep the
  // price-per-page field filled with the derived value - the user can then
  // still directly overwrite it before saving, since it's a plain
  // controlled input rather than a read-only computed display.
  function handleNewTotalFieldsChange(nextTotalPrice: string, nextTotalPages: string) {
    const totalPriceValue = parsePrice(nextTotalPrice);
    const totalPagesValue = parsePageCount(nextTotalPages);
    if (totalPriceValue !== null && totalPagesValue !== null) {
      setNewPricePerPage(roundCents(totalPriceValue / totalPagesValue).toFixed(2));
    }
  }

  function handleSaveNew() {
    const nameError = validateName(newName);

    let pricePerPageValue = parsePrice(newPricePerPage);
    const fieldErrors: { pricePerPage?: string; totalPrice?: string; totalPages?: string } = {};
    if (pricePerPageValue === null) {
      const totalPriceValue = parsePrice(newTotalPrice);
      const totalPagesValue = parsePageCount(newTotalPages);
      if (totalPriceValue === null) fieldErrors.totalPrice = 'Total price must be greater than 0.';
      if (totalPagesValue === null) {
        fieldErrors.totalPages = 'Number of pages must be a whole number greater than 0.';
      }
      if (totalPriceValue !== null && totalPagesValue !== null) {
        pricePerPageValue = roundCents(totalPriceValue / totalPagesValue);
      } else {
        fieldErrors.pricePerPage = 'Enter a price per page, or a total price and page count.';
      }
    }

    if (nameError || pricePerPageValue === null) {
      setAddErrors({ name: nameError ?? undefined, ...fieldErrors });
      return;
    }

    onEntryCreated({
      id: `local-${crypto.randomUUID()}`,
      name: newName.trim(),
      pricePerPage: pricePerPageValue,
    });
    setMode('select');
  }

  const cost = selectedEntry
    ? computePrintingCost(selectedEntry.pricePerPage, pageCount, errorMarginPercent)
    : null;

  return (
    <div className={physicalCostCardClassName}>
      <h3 className="text-subheading font-bold">Printing</h3>
      {mode === 'select' ? (
        <>
          <CostEntryDropdown
            id="preview-printing-cost-entry"
            label="Printing cost entry"
            items={entries}
            selectedId={selectedEntryId}
            placeholder="Select a Printing cost entry…"
            onSelectExisting={onSelectEntry}
            onSelectAddNew={handleAddNew}
          />
          {selectedEntry && (
            <SelectedPrintingCostEntryFields
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
          <FinanceField
            label="Name"
            htmlFor="new-preview-printing-cost-name"
            error={addErrors.name}
          >
            <input
              id="new-preview-printing-cost-name"
              type="text"
              value={newName}
              onChange={(event) => setNewName(event.target.value)}
              className={addErrors.name ? financeErrorInputClassName : financeInputClassName}
            />
          </FinanceField>
          <div className="flex gap-3">
            <FinanceField
              label="Total price"
              htmlFor="new-preview-printing-cost-total-price"
              error={addErrors.totalPrice}
              className="flex-1"
            >
              <FinanceMoneyInput
                id="new-preview-printing-cost-total-price"
                value={newTotalPrice}
                onChange={(event) => {
                  setNewTotalPrice(event.target.value);
                  handleNewTotalFieldsChange(event.target.value, newTotalPages);
                }}
                hasError={Boolean(addErrors.totalPrice)}
              />
            </FinanceField>
            <FinanceField
              label="Number of pages"
              htmlFor="new-preview-printing-cost-total-pages"
              error={addErrors.totalPages}
              className="flex-1"
            >
              <input
                id="new-preview-printing-cost-total-pages"
                type="number"
                min={1}
                step={1}
                value={newTotalPages}
                onChange={(event) => {
                  const nextValue = stripLeadingZero(event.target.value);
                  setNewTotalPages(nextValue);
                  handleNewTotalFieldsChange(newTotalPrice, nextValue);
                }}
                className={
                  addErrors.totalPages ? financeErrorInputClassName : financeInputClassName
                }
              />
            </FinanceField>
          </div>
          <div className="flex justify-end">
            <FinanceField
              label="Price per page"
              htmlFor="new-preview-printing-cost-price-per-page"
              error={addErrors.pricePerPage}
              className="w-52"
            >
              <FinanceMoneyInput
                id="new-preview-printing-cost-price-per-page"
                placeholder={PRICE_PER_PAGE_PLACEHOLDER}
                value={newPricePerPage}
                onChange={(event) => setNewPricePerPage(event.target.value)}
                hasError={Boolean(addErrors.pricePerPage)}
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

// The currently selected Printing cost entry's editable Name/Price-per-page
// fields. Edits here only ever update this page's own local `entries`
// state (via `onEntryUpdated`), never `updatePrintingCostEntry`.
function SelectedPrintingCostEntryFields({
  entry,
  onEntryUpdated,
}: {
  entry: PreviewPrintingCostEntryOption;
  onEntryUpdated: (entry: PreviewPrintingCostEntryOption) => void;
}) {
  const [name, setName] = useState(entry.name);
  const [pricePerPage, setPricePerPage] = useState(entry.pricePerPage.toFixed(2));
  const [errors, setErrors] = useState<{ name?: string; pricePerPage?: string }>({});

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

  function commitPricePerPage() {
    const parsed = parsePrice(pricePerPage);
    if (parsed === null) {
      setErrors((prev) => ({ ...prev, pricePerPage: 'Price must be greater than 0.' }));
      setPricePerPage(entry.pricePerPage.toFixed(2));
      return;
    }
    setErrors((prev) => ({ ...prev, pricePerPage: undefined }));
    if (parsed !== entry.pricePerPage) onEntryUpdated({ ...entry, pricePerPage: parsed });
  }

  return (
    <div className="flex gap-3">
      <FinanceField
        label="Name"
        htmlFor={`preview-printing-cost-name-${entry.id}`}
        error={errors.name}
        className="flex-1"
      >
        <input
          id={`preview-printing-cost-name-${entry.id}`}
          type="text"
          value={name}
          onChange={(event) => setName(event.target.value)}
          onBlur={commitName}
          className={errors.name ? financeErrorInputClassName : financeInputClassName}
        />
      </FinanceField>
      <FinanceField
        label="Price per page"
        htmlFor={`preview-printing-cost-price-per-page-${entry.id}`}
        error={errors.pricePerPage}
        className="w-40"
      >
        <FinanceMoneyInput
          id={`preview-printing-cost-price-per-page-${entry.id}`}
          value={pricePerPage}
          onChange={(event) => setPricePerPage(event.target.value)}
          onBlur={commitPricePerPage}
          hasError={Boolean(errors.pricePerPage)}
        />
      </FinanceField>
    </div>
  );
}
