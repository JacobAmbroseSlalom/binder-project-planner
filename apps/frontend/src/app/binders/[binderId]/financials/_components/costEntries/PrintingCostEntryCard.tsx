'use client';

import { useState } from 'react';

import {
  createPrintingCostEntry,
  updateBinder as updateBinderRequest,
  updatePrintingCostEntry,
  type Binder,
  type PrintingCostEntry,
} from '@/lib/api';
import { useSaveStatusToast } from '@/shared/feedback';

import { computePrintingCost, formatCurrency, roundCents } from '../../_lib/financeCalculations';
import {
  financeErrorInputClassName,
  FinanceField,
  FinanceMoneyInput,
  financeInputClassName,
  physicalCostCardClassName,
  stripLeadingZero,
} from '../FinanceField';
import { CostEntryDropdown } from './CostEntryDropdown';

const SELECT_TOAST_ID = 'select-printing-cost-entry';
const SAVE_NEW_ENTRY_TOAST_ID = 'save-new-printing-cost-entry';

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

interface PrintingCostEntryCardProps {
  binder: Binder;
  entries: PrintingCostEntry[];
  pageCount: number;
  errorMarginPercent: number;
  onEntryCreated: (entry: PrintingCostEntry) => void;
  onEntryUpdated: (entry: PrintingCostEntry) => void;
  onBinderUpdated: (binder: Binder) => void;
}

// The Physical costs section's Printing row (story 34): price-per-page
// multiplied by the binder's art-print page count, shown both with and
// without the shared error margin applied.
export function PrintingCostEntryCard({
  binder,
  entries,
  pageCount,
  errorMarginPercent,
  onEntryCreated,
  onEntryUpdated,
  onBinderUpdated,
}: PrintingCostEntryCardProps) {
  const { start } = useSaveStatusToast();
  const [mode, setMode] = useState<'select' | 'add'>('select');
  const [isSelecting, setIsSelecting] = useState(false);
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
  const [isCreating, setIsCreating] = useState(false);

  const selectedEntry =
    entries.find((entry) => entry.id === binder.selectedPrintingCostEntryId) ?? null;

  async function handleSelectExisting(id: string) {
    setIsSelecting(true);
    const toast = start(SELECT_TOAST_ID);
    try {
      const updated = await updateBinderRequest(binder.id, { selectedPrintingCostEntryId: id });
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

  async function handleSaveNew() {
    const nameError = validateName(newName);

    // The price-per-page is required either directly or derived from the
    // total price ÷ number of pages fields - whichever the user actually
    // filled in (the per-page field is kept in sync with the total/pages
    // fields as the user types, but can also be overwritten directly).
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

    setIsCreating(true);
    const toast = start(SAVE_NEW_ENTRY_TOAST_ID);
    try {
      const created = await createPrintingCostEntry({
        name: newName.trim(),
        pricePerPage: pricePerPageValue,
      });
      onEntryCreated(created);
      const updatedBinder = await updateBinderRequest(binder.id, {
        selectedPrintingCostEntryId: created.id,
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
    ? computePrintingCost(selectedEntry.pricePerPage, pageCount, errorMarginPercent)
    : null;

  return (
    <div className={physicalCostCardClassName}>
      <h3 className="text-subheading font-bold">Printing</h3>
      {mode === 'select' ? (
        <>
          <CostEntryDropdown
            id="printing-cost-entry"
            label="Printing cost entry"
            items={entries}
            selectedId={binder.selectedPrintingCostEntryId}
            placeholder="Select a Printing cost entry…"
            disabled={isSelecting}
            onSelectExisting={handleSelectExisting}
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
          <FinanceField label="Name" htmlFor="new-printing-cost-name" error={addErrors.name}>
            <input
              id="new-printing-cost-name"
              type="text"
              value={newName}
              disabled={isCreating}
              onChange={(event) => setNewName(event.target.value)}
              className={addErrors.name ? financeErrorInputClassName : financeInputClassName}
            />
          </FinanceField>
          <div className="flex gap-3">
            <FinanceField
              label="Total price"
              htmlFor="new-printing-cost-total-price"
              error={addErrors.totalPrice}
              className="flex-1"
            >
              <FinanceMoneyInput
                id="new-printing-cost-total-price"
                value={newTotalPrice}
                disabled={isCreating}
                onChange={(event) => {
                  setNewTotalPrice(event.target.value);
                  handleNewTotalFieldsChange(event.target.value, newTotalPages);
                }}
                hasError={Boolean(addErrors.totalPrice)}
              />
            </FinanceField>
            <FinanceField
              label="Number of pages"
              htmlFor="new-printing-cost-total-pages"
              error={addErrors.totalPages}
              className="flex-1"
            >
              <input
                id="new-printing-cost-total-pages"
                type="number"
                min={1}
                step={1}
                value={newTotalPages}
                disabled={isCreating}
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
              htmlFor="new-printing-cost-price-per-page"
              error={addErrors.pricePerPage}
              className="w-52"
            >
              <FinanceMoneyInput
                id="new-printing-cost-price-per-page"
                placeholder={PRICE_PER_PAGE_PLACEHOLDER}
                value={newPricePerPage}
                disabled={isCreating}
                onChange={(event) => setNewPricePerPage(event.target.value)}
                hasError={Boolean(addErrors.pricePerPage)}
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

function SelectedPrintingCostEntryFields({
  entry,
  onEntryUpdated,
}: {
  entry: PrintingCostEntry;
  onEntryUpdated: (entry: PrintingCostEntry) => void;
}) {
  const { start } = useSaveStatusToast();
  const [name, setName] = useState(entry.name);
  const [pricePerPage, setPricePerPage] = useState(entry.pricePerPage.toFixed(2));
  const [errors, setErrors] = useState<{ name?: string; pricePerPage?: string }>({});
  const toastId = `edit-printing-cost-entry-${entry.id}`;

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
      const updated = await updatePrintingCostEntry(entry.id, { name: trimmed });
      onEntryUpdated(updated);
      toast.markSaved();
    } catch (error) {
      setName(entry.name);
      toast.markFailed(error);
    }
  }

  async function handlePricePerPageBlur() {
    const parsed = parsePrice(pricePerPage);
    if (parsed === null) {
      setErrors((prev) => ({ ...prev, pricePerPage: 'Price per page must be greater than 0.' }));
      return;
    }
    if (parsed === entry.pricePerPage) return;
    setErrors((prev) => ({ ...prev, pricePerPage: undefined }));
    const toast = start(toastId);
    try {
      const updated = await updatePrintingCostEntry(entry.id, { pricePerPage: parsed });
      onEntryUpdated(updated);
      setPricePerPage(updated.pricePerPage.toFixed(2));
      toast.markSaved();
    } catch (error) {
      setPricePerPage(entry.pricePerPage.toFixed(2));
      toast.markFailed(error);
    }
  }

  return (
    <div className="flex gap-3">
      <FinanceField
        label="Name"
        htmlFor={`printing-cost-name-${entry.id}`}
        error={errors.name}
        className="flex-1"
      >
        <input
          id={`printing-cost-name-${entry.id}`}
          type="text"
          value={name}
          onChange={(event) => setName(event.target.value)}
          onBlur={handleNameBlur}
          className={errors.name ? financeErrorInputClassName : financeInputClassName}
        />
      </FinanceField>
      <FinanceField
        label="Price per page"
        htmlFor={`printing-cost-price-per-page-${entry.id}`}
        error={errors.pricePerPage}
        className="flex-1"
      >
        <FinanceMoneyInput
          id={`printing-cost-price-per-page-${entry.id}`}
          value={pricePerPage}
          onChange={(event) => setPricePerPage(event.target.value)}
          onBlur={handlePricePerPageBlur}
          hasError={Boolean(errors.pricePerPage)}
        />
      </FinanceField>
    </div>
  );
}
