'use client';

import { useState } from 'react';

import {
  FinanceField,
  financeErrorInputClassName,
  financeInputClassName,
  stripLeadingZero,
} from '../../binders/[binderId]/financials/_components/FinanceField';
import type {
  PreviewBinderCostEntryOption,
  PreviewHolographicPaperCostEntryOption,
  PreviewPrintingCostEntryOption,
} from '../_lib/previewTypes';
import { PreviewBinderCostEntryCard } from './PreviewBinderCostEntryCard';
import { PreviewHolographicPaperCostEntryCard } from './PreviewHolographicPaperCostEntryCard';
import { PreviewPrintingCostEntryCard } from './PreviewPrintingCostEntryCard';

function parseErrorMarginPercent(value: string): number | null {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 && parsed <= 100 ? parsed : null;
}

// The Finances Preview page's "Material costs" section (story 54): the
// Binder, Printing, and Holographic Paper cost-entry cards, plus the
// shared error-margin percentage, mirroring the real "View Financials"
// tab's `PhysicalCostsSection`. Unlike that tab, editing the error margin
// here only ever updates this page's own local state - it never calls
// `updateFinanceSettings`.
export function PreviewMaterialCostsSection({
  binderEntries,
  selectedBinderEntryId,
  onSelectBinderEntry,
  onBinderEntryCreated,
  onBinderEntryUpdated,
  printingEntries,
  selectedPrintingEntryId,
  onSelectPrintingEntry,
  onPrintingEntryCreated,
  onPrintingEntryUpdated,
  holographicPaperEntries,
  selectedHolographicPaperEntryId,
  onSelectHolographicPaperEntry,
  onHolographicPaperEntryCreated,
  onHolographicPaperEntryUpdated,
  pageCount,
  errorMarginPercent,
  onErrorMarginPercentChange,
}: {
  binderEntries: PreviewBinderCostEntryOption[];
  selectedBinderEntryId: string | null;
  onSelectBinderEntry: (id: string) => void;
  onBinderEntryCreated: (entry: PreviewBinderCostEntryOption) => void;
  onBinderEntryUpdated: (entry: PreviewBinderCostEntryOption) => void;
  printingEntries: PreviewPrintingCostEntryOption[];
  selectedPrintingEntryId: string | null;
  onSelectPrintingEntry: (id: string) => void;
  onPrintingEntryCreated: (entry: PreviewPrintingCostEntryOption) => void;
  onPrintingEntryUpdated: (entry: PreviewPrintingCostEntryOption) => void;
  holographicPaperEntries: PreviewHolographicPaperCostEntryOption[];
  selectedHolographicPaperEntryId: string | null;
  onSelectHolographicPaperEntry: (id: string) => void;
  onHolographicPaperEntryCreated: (entry: PreviewHolographicPaperCostEntryOption) => void;
  onHolographicPaperEntryUpdated: (entry: PreviewHolographicPaperCostEntryOption) => void;
  pageCount: number;
  errorMarginPercent: number;
  onErrorMarginPercentChange: (value: number) => void;
}) {
  const [errorMarginInput, setErrorMarginInput] = useState(String(errorMarginPercent));
  const [errorMarginError, setErrorMarginError] = useState<string | null>(null);

  function handleErrorMarginBlur() {
    const parsed = parseErrorMarginPercent(errorMarginInput);
    if (parsed === null) {
      setErrorMarginError('Must be between 0 and 100.');
      return;
    }
    setErrorMarginError(null);
    onErrorMarginPercentChange(parsed);
  }

  return (
    <section className="flex flex-col gap-3">
      <div className="grid grid-cols-[1fr_auto_1fr] items-center">
        <div aria-hidden="true" />
        <h2 className="text-center text-heading font-bold">Material costs</h2>
        <FinanceField
          label="Error margin (%)"
          htmlFor="preview-error-margin-percent"
          error={errorMarginError}
          className="max-w-40 justify-self-end"
        >
          <input
            id="preview-error-margin-percent"
            type="number"
            min={0}
            max={100}
            step={1}
            value={errorMarginInput}
            onChange={(event) => setErrorMarginInput(stripLeadingZero(event.target.value))}
            onBlur={handleErrorMarginBlur}
            className={errorMarginError ? financeErrorInputClassName : financeInputClassName}
          />
        </FinanceField>
      </div>
      <div className="grid grid-cols-3 gap-4">
        <PreviewBinderCostEntryCard
          entries={binderEntries}
          selectedEntryId={selectedBinderEntryId}
          onSelectEntry={onSelectBinderEntry}
          onEntryCreated={onBinderEntryCreated}
          onEntryUpdated={onBinderEntryUpdated}
        />
        <PreviewPrintingCostEntryCard
          entries={printingEntries}
          selectedEntryId={selectedPrintingEntryId}
          onSelectEntry={onSelectPrintingEntry}
          onEntryCreated={onPrintingEntryCreated}
          onEntryUpdated={onPrintingEntryUpdated}
          pageCount={pageCount}
          errorMarginPercent={errorMarginPercent}
        />
        <PreviewHolographicPaperCostEntryCard
          entries={holographicPaperEntries}
          selectedEntryId={selectedHolographicPaperEntryId}
          onSelectEntry={onSelectHolographicPaperEntry}
          onEntryCreated={onHolographicPaperEntryCreated}
          onEntryUpdated={onHolographicPaperEntryUpdated}
          pageCount={pageCount}
          errorMarginPercent={errorMarginPercent}
        />
      </div>
    </section>
  );
}
