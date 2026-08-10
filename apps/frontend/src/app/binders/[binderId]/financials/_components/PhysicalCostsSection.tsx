'use client';

import { useState } from 'react';

import {
  updateFinanceSettings,
  type Binder,
  type BinderCostEntry,
  type FinanceSettings,
  type HolographicPaperCostEntry,
  type PrintingCostEntry,
} from '@/lib/api';
import { useSaveStatusToast } from '@/shared/feedback';

import { BinderCostEntryCard } from './BinderCostEntryCard';
import {
  financeErrorInputClassName,
  FinanceField,
  financeInputClassName,
  stripLeadingZero,
} from './FinanceField';
import { HolographicPaperCostEntryCard } from './HolographicPaperCostEntryCard';
import { PrintingCostEntryCard } from './PrintingCostEntryCard';

function parseErrorMarginPercent(value: string): number | null {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 && parsed <= 100 ? parsed : null;
}

// The "Physical costs" section (story 34): the Binder, Printing, and
// Holographic Paper cost-entry cards, plus the single shared error-margin
// percentage used by both the Printing and Holographic Paper costs.
export function PhysicalCostsSection({
  binder,
  binderCostEntries,
  printingCostEntries,
  holographicPaperCostEntries,
  financeSettings,
  pageCount,
  onBinderCostEntryCreated,
  onBinderCostEntryUpdated,
  onPrintingCostEntryCreated,
  onPrintingCostEntryUpdated,
  onHolographicPaperCostEntryCreated,
  onHolographicPaperCostEntryUpdated,
  onBinderUpdated,
  onFinanceSettingsUpdated,
}: {
  binder: Binder;
  binderCostEntries: BinderCostEntry[];
  printingCostEntries: PrintingCostEntry[];
  holographicPaperCostEntries: HolographicPaperCostEntry[];
  financeSettings: FinanceSettings;
  pageCount: number;
  onBinderCostEntryCreated: (entry: BinderCostEntry) => void;
  onBinderCostEntryUpdated: (entry: BinderCostEntry) => void;
  onPrintingCostEntryCreated: (entry: PrintingCostEntry) => void;
  onPrintingCostEntryUpdated: (entry: PrintingCostEntry) => void;
  onHolographicPaperCostEntryCreated: (entry: HolographicPaperCostEntry) => void;
  onHolographicPaperCostEntryUpdated: (entry: HolographicPaperCostEntry) => void;
  onBinderUpdated: (binder: Binder) => void;
  onFinanceSettingsUpdated: (settings: FinanceSettings) => void;
}) {
  const { start } = useSaveStatusToast();
  const [errorMarginPercent, setErrorMarginPercent] = useState(
    String(financeSettings.errorMarginPercent),
  );
  const [errorMarginError, setErrorMarginError] = useState<string | null>(null);

  async function handleErrorMarginBlur() {
    const parsed = parseErrorMarginPercent(errorMarginPercent);
    if (parsed === null) {
      setErrorMarginError('Must be between 0 and 100.');
      return;
    }
    if (parsed === financeSettings.errorMarginPercent) return;
    setErrorMarginError(null);
    const toast = start('edit-error-margin-percent');
    try {
      const updated = await updateFinanceSettings({ errorMarginPercent: parsed });
      onFinanceSettingsUpdated(updated);
      toast.markSaved();
    } catch (error) {
      setErrorMarginPercent(String(financeSettings.errorMarginPercent));
      toast.markFailed(error);
    }
  }

  return (
    <section className="flex flex-col gap-3">
      <div className="grid grid-cols-[1fr_auto_1fr] items-center">
        <div aria-hidden="true" />
        <h2 className="text-center text-heading font-bold">Material costs</h2>
        <FinanceField
          label="Error margin (%)"
          htmlFor="error-margin-percent"
          error={errorMarginError}
          className="max-w-40 justify-self-end"
        >
          <input
            id="error-margin-percent"
            type="number"
            min={0}
            max={100}
            step={1}
            value={errorMarginPercent}
            onChange={(event) => setErrorMarginPercent(stripLeadingZero(event.target.value))}
            onBlur={handleErrorMarginBlur}
            className={errorMarginError ? financeErrorInputClassName : financeInputClassName}
          />
        </FinanceField>
      </div>
      <div className="grid grid-cols-3 gap-4">
        <BinderCostEntryCard
          binder={binder}
          entries={binderCostEntries}
          onEntryCreated={onBinderCostEntryCreated}
          onEntryUpdated={onBinderCostEntryUpdated}
          onBinderUpdated={onBinderUpdated}
        />
        <PrintingCostEntryCard
          binder={binder}
          entries={printingCostEntries}
          pageCount={pageCount}
          errorMarginPercent={financeSettings.errorMarginPercent}
          onEntryCreated={onPrintingCostEntryCreated}
          onEntryUpdated={onPrintingCostEntryUpdated}
          onBinderUpdated={onBinderUpdated}
        />
        <HolographicPaperCostEntryCard
          binder={binder}
          entries={holographicPaperCostEntries}
          pageCount={pageCount}
          errorMarginPercent={financeSettings.errorMarginPercent}
          onEntryCreated={onHolographicPaperCostEntryCreated}
          onEntryUpdated={onHolographicPaperCostEntryUpdated}
          onBinderUpdated={onBinderUpdated}
        />
      </div>
    </section>
  );
}
