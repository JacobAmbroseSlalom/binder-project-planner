'use client';

import { useState } from 'react';

import { BINDER_DIMENSION_MAX } from '@binder-project-planner/shared';

import { CostEntryDropdown } from '../../binders/[binderId]/financials/_components/CostEntryDropdown';
import {
  FinanceField,
  FinanceMoneyInput,
  financeErrorInputClassName,
  financeInputClassName,
  physicalCostCardClassName,
} from '../../binders/[binderId]/financials/_components/FinanceField';
import type { PreviewBinderCostEntryOption } from '../_lib/previewTypes';

function parsePrice(value: string): number | null {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

// Shared by both the "+ Add new…" form and the selected-entry fields below:
// width/height must be whole numbers from 1 through `BINDER_DIMENSION_MAX`,
// mirroring `binderDetailsSchema`'s own width/height rule.
function parseDimension(value: string): number | null {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > BINDER_DIMENSION_MAX) return null;
  return parsed;
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

interface PreviewBinderCostEntryCardProps {
  entries: PreviewBinderCostEntryOption[];
  selectedEntryId: string | null;
  onSelectEntry: (id: string) => void;
  onEntryCreated: (entry: PreviewBinderCostEntryOption) => void;
  onEntryUpdated: (entry: PreviewBinderCostEntryOption) => void;
}

// The Finances Preview page's Binder material-cost card (story 54).
// Unlike the real "View Financials" tab's `BinderCostEntryCard`, this page
// has no real binder to match dimensions against, so the dropdown lists
// every Binder cost entry unfiltered, and width/height/pages are always
// visible and directly editable - whichever entry ends up selected/created
// here is this page's *sole* source of width/height/pages, driving every
// other calculation below (Printing/Holographic Paper costs, time costs,
// Cards & Art slot totals). Nothing here ever calls a create/update
// endpoint: selecting, editing, and creating entries only ever change this
// page's own local state, even when the selected entry happens to be a
// real, previously saved catalog entry.
export function PreviewBinderCostEntryCard({
  entries,
  selectedEntryId,
  onSelectEntry,
  onEntryCreated,
  onEntryUpdated,
}: PreviewBinderCostEntryCardProps) {
  const [mode, setMode] = useState<'select' | 'add'>('select');
  const [newName, setNewName] = useState('');
  const [newPrice, setNewPrice] = useState('');
  const [newWidth, setNewWidth] = useState('');
  const [newHeight, setNewHeight] = useState('');
  const [newPages, setNewPages] = useState('');
  const [addErrors, setAddErrors] = useState<{
    name?: string;
    price?: string;
    width?: string;
    height?: string;
    pages?: string;
  }>({});

  const selectedEntry = entries.find((entry) => entry.id === selectedEntryId) ?? null;

  function handleAddNew() {
    setNewName('');
    setNewPrice('');
    setNewWidth('');
    setNewHeight('');
    setNewPages('');
    setAddErrors({});
    setMode('add');
  }

  // Appends a page-local-only entry (temporary client-side id) - this is
  // never sent to `POST /binder-cost-entries`, per story 54's "name field
  // is cosmetic only, no uniqueness/validation against the real catalog"
  // rule.
  function handleSaveNew() {
    const nameError = validateName(newName);
    const priceValue = parsePrice(newPrice);
    const widthValue = parseDimension(newWidth);
    const heightValue = parseDimension(newHeight);
    const pagesValue = parsePageCount(newPages);
    if (
      nameError ||
      priceValue === null ||
      widthValue === null ||
      heightValue === null ||
      pagesValue === null
    ) {
      setAddErrors({
        name: nameError ?? undefined,
        price: priceValue === null ? 'Price must be greater than 0.' : undefined,
        width:
          widthValue === null
            ? `Width must be a whole number from 1 to ${BINDER_DIMENSION_MAX}.`
            : undefined,
        height:
          heightValue === null
            ? `Height must be a whole number from 1 to ${BINDER_DIMENSION_MAX}.`
            : undefined,
        pages: pagesValue === null ? 'Pages must be a whole number greater than 0.' : undefined,
      });
      return;
    }

    onEntryCreated({
      id: `local-${crypto.randomUUID()}`,
      name: newName.trim(),
      price: priceValue,
      width: widthValue,
      height: heightValue,
      pages: pagesValue,
    });
    setMode('select');
  }

  return (
    <div className={physicalCostCardClassName}>
      <h3 className="text-subheading font-bold">Binder</h3>
      {mode === 'select' ? (
        <>
          <CostEntryDropdown
            id="preview-binder-cost-entry"
            label="Binder cost entry"
            items={entries}
            selectedId={selectedEntryId}
            placeholder="Select a Binder cost entry…"
            onSelectExisting={onSelectEntry}
            onSelectAddNew={handleAddNew}
          />
          {selectedEntry && (
            <SelectedBinderCostEntryFields
              key={selectedEntry.id}
              entry={selectedEntry}
              onEntryUpdated={onEntryUpdated}
            />
          )}
        </>
      ) : (
        <div className="flex flex-col gap-3">
          <FinanceField label="Name" htmlFor="new-preview-binder-cost-name" error={addErrors.name}>
            <input
              id="new-preview-binder-cost-name"
              type="text"
              value={newName}
              onChange={(event) => setNewName(event.target.value)}
              className={addErrors.name ? financeErrorInputClassName : financeInputClassName}
            />
          </FinanceField>
          <FinanceField
            label="Price"
            htmlFor="new-preview-binder-cost-price"
            error={addErrors.price}
          >
            <FinanceMoneyInput
              id="new-preview-binder-cost-price"
              value={newPrice}
              onChange={(event) => setNewPrice(event.target.value)}
              hasError={Boolean(addErrors.price)}
            />
          </FinanceField>
          <div className="flex gap-3">
            <FinanceField
              label="Width"
              htmlFor="new-preview-binder-cost-width"
              error={addErrors.width}
              className="flex-1"
            >
              <input
                id="new-preview-binder-cost-width"
                type="number"
                min={1}
                max={BINDER_DIMENSION_MAX}
                step={1}
                value={newWidth}
                onChange={(event) => setNewWidth(event.target.value)}
                className={`w-full ${addErrors.width ? financeErrorInputClassName : financeInputClassName}`}
              />
            </FinanceField>
            <FinanceField
              label="Height"
              htmlFor="new-preview-binder-cost-height"
              error={addErrors.height}
              className="flex-1"
            >
              <input
                id="new-preview-binder-cost-height"
                type="number"
                min={1}
                max={BINDER_DIMENSION_MAX}
                step={1}
                value={newHeight}
                onChange={(event) => setNewHeight(event.target.value)}
                className={`w-full ${addErrors.height ? financeErrorInputClassName : financeInputClassName}`}
              />
            </FinanceField>
            <FinanceField
              label="Pages"
              htmlFor="new-preview-binder-cost-pages"
              error={addErrors.pages}
              className="flex-1"
            >
              <input
                id="new-preview-binder-cost-pages"
                type="number"
                min={1}
                step={1}
                value={newPages}
                onChange={(event) => setNewPages(event.target.value)}
                className={`w-full ${addErrors.pages ? financeErrorInputClassName : financeInputClassName}`}
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

// The currently selected Binder cost entry's editable Name/Price/Width/
// Height/Pages fields. Edits here only ever update this page's own local
// `entries` state (via `onEntryUpdated`) - never `updateBinderCostEntry` -
// even when the selected entry happens to be a real, previously saved
// catalog entry (story 54: "never saves to the database"). Keyed by the
// entry's id from the parent so switching the selection remounts this with
// fresh local state instead of needing an effect to resync it.
function SelectedBinderCostEntryFields({
  entry,
  onEntryUpdated,
}: {
  entry: PreviewBinderCostEntryOption;
  onEntryUpdated: (entry: PreviewBinderCostEntryOption) => void;
}) {
  const [name, setName] = useState(entry.name);
  const [price, setPrice] = useState(entry.price.toFixed(2));
  const [width, setWidth] = useState(String(entry.width));
  const [height, setHeight] = useState(String(entry.height));
  const [pages, setPages] = useState(String(entry.pages));
  const [errors, setErrors] = useState<{
    name?: string;
    price?: string;
    width?: string;
    height?: string;
    pages?: string;
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

  function commitWidth() {
    const parsed = parseDimension(width);
    if (parsed === null) {
      setErrors((prev) => ({
        ...prev,
        width: `Width must be a whole number from 1 to ${BINDER_DIMENSION_MAX}.`,
      }));
      setWidth(String(entry.width));
      return;
    }
    setErrors((prev) => ({ ...prev, width: undefined }));
    if (parsed !== entry.width) onEntryUpdated({ ...entry, width: parsed });
  }

  function commitHeight() {
    const parsed = parseDimension(height);
    if (parsed === null) {
      setErrors((prev) => ({
        ...prev,
        height: `Height must be a whole number from 1 to ${BINDER_DIMENSION_MAX}.`,
      }));
      setHeight(String(entry.height));
      return;
    }
    setErrors((prev) => ({ ...prev, height: undefined }));
    if (parsed !== entry.height) onEntryUpdated({ ...entry, height: parsed });
  }

  function commitPages() {
    const parsed = parsePageCount(pages);
    if (parsed === null) {
      setErrors((prev) => ({ ...prev, pages: 'Pages must be a whole number greater than 0.' }));
      setPages(String(entry.pages));
      return;
    }
    setErrors((prev) => ({ ...prev, pages: undefined }));
    if (parsed !== entry.pages) onEntryUpdated({ ...entry, pages: parsed });
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex gap-3">
        <FinanceField
          label="Name"
          htmlFor={`preview-binder-cost-name-${entry.id}`}
          error={errors.name}
          className="flex-1"
        >
          <input
            id={`preview-binder-cost-name-${entry.id}`}
            type="text"
            value={name}
            onChange={(event) => setName(event.target.value)}
            onBlur={commitName}
            className={errors.name ? financeErrorInputClassName : financeInputClassName}
          />
        </FinanceField>
        <FinanceField
          label="Price"
          htmlFor={`preview-binder-cost-price-${entry.id}`}
          error={errors.price}
          className="w-32"
        >
          <FinanceMoneyInput
            id={`preview-binder-cost-price-${entry.id}`}
            value={price}
            onChange={(event) => setPrice(event.target.value)}
            onBlur={commitPrice}
            hasError={Boolean(errors.price)}
          />
        </FinanceField>
      </div>
      <div className="flex gap-3">
        <FinanceField
          label="Width"
          htmlFor={`preview-binder-cost-width-${entry.id}`}
          error={errors.width}
          className="flex-1"
        >
          <input
            id={`preview-binder-cost-width-${entry.id}`}
            type="number"
            min={1}
            max={BINDER_DIMENSION_MAX}
            step={1}
            value={width}
            onChange={(event) => setWidth(event.target.value)}
            onBlur={commitWidth}
            className={`w-full ${errors.width ? financeErrorInputClassName : financeInputClassName}`}
          />
        </FinanceField>
        <FinanceField
          label="Height"
          htmlFor={`preview-binder-cost-height-${entry.id}`}
          error={errors.height}
          className="flex-1"
        >
          <input
            id={`preview-binder-cost-height-${entry.id}`}
            type="number"
            min={1}
            max={BINDER_DIMENSION_MAX}
            step={1}
            value={height}
            onChange={(event) => setHeight(event.target.value)}
            onBlur={commitHeight}
            className={`w-full ${errors.height ? financeErrorInputClassName : financeInputClassName}`}
          />
        </FinanceField>
        <FinanceField
          label="Pages"
          htmlFor={`preview-binder-cost-pages-${entry.id}`}
          error={errors.pages}
          className="flex-1"
        >
          <input
            id={`preview-binder-cost-pages-${entry.id}`}
            type="number"
            min={1}
            step={1}
            value={pages}
            onChange={(event) => setPages(event.target.value)}
            onBlur={commitPages}
            className={`w-full ${errors.pages ? financeErrorInputClassName : financeInputClassName}`}
          />
        </FinanceField>
      </div>
    </div>
  );
}
