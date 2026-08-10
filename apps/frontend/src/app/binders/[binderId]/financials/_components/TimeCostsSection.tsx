'use client';

import { useState } from 'react';

import { updateFinanceSettings, type FinanceSettings, type TimeCosts } from '@/lib/api';
import { useSaveStatusToast } from '@/shared/feedback';

import { computeTimeCost, TIME_COST_CATEGORIES, formatCurrency } from '../_lib/financeCalculations';
import {
  financeErrorInputClassName,
  FinanceField,
  FinanceMoneyInput,
  financeInputClassName,
  stripLeadingZero,
} from './FinanceField';

function parseNonNegative(value: string): number | null {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

function parsePositiveInteger(value: string): number | null {
  const parsed = Number(value);
  return Number.isFinite(parsed) && Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

// One fixed time-cost category's row: its shared reference-minutes/
// reference-pages rate basis (editable, saved to the global
// `financeSettings` singleton on blur) plus this binder's computed total
// hours and price derived from it. When `scalesWithPages` is false
// (currently only Printing), the category is a flat, one-time cost with
// no reference-pages field - only reference minutes is shown/editable,
// and its value is used directly as total minutes.
function TimeCostCategoryRow({
  categoryKey,
  label,
  scalesWithPages,
  rateBasis,
  pageCount,
  wagePerHour,
  onFinanceSettingsUpdated,
}: {
  categoryKey: keyof TimeCosts;
  label: string;
  scalesWithPages: boolean;
  rateBasis: TimeCosts[keyof TimeCosts];
  pageCount: number;
  wagePerHour: number;
  onFinanceSettingsUpdated: (settings: FinanceSettings) => void;
}) {
  const { start } = useSaveStatusToast();
  const [referenceMinutes, setReferenceMinutes] = useState(String(rateBasis.referenceMinutes));
  // Only meaningful when `scalesWithPages` is true; a flat, one-time-cost
  // category's rateBasis.referencePages is always null, and this state/
  // field is never rendered for it.
  const [referencePages, setReferencePages] = useState(
    rateBasis.referencePages === null ? '' : String(rateBasis.referencePages),
  );
  const [errors, setErrors] = useState<{ referenceMinutes?: string; referencePages?: string }>({});
  const toastId = `edit-time-cost-${categoryKey}`;

  async function handleReferenceMinutesBlur() {
    const parsed = parseNonNegative(referenceMinutes);
    if (parsed === null) {
      setErrors((prev) => ({ ...prev, referenceMinutes: 'Must be 0 or greater.' }));
      return;
    }
    if (parsed === rateBasis.referenceMinutes) return;
    setErrors((prev) => ({ ...prev, referenceMinutes: undefined }));
    const toast = start(toastId);
    try {
      const updated = await updateFinanceSettings({
        timeCosts: { [categoryKey]: { referenceMinutes: parsed } },
      });
      onFinanceSettingsUpdated(updated);
      toast.markSaved();
    } catch (error) {
      setReferenceMinutes(String(rateBasis.referenceMinutes));
      toast.markFailed(error);
    }
  }

  async function handleReferencePagesBlur() {
    const parsed = parsePositiveInteger(referencePages);
    if (parsed === null) {
      setErrors((prev) => ({ ...prev, referencePages: 'Must be a positive whole number.' }));
      return;
    }
    if (parsed === rateBasis.referencePages) return;
    setErrors((prev) => ({ ...prev, referencePages: undefined }));
    const toast = start(toastId);
    try {
      const updated = await updateFinanceSettings({
        timeCosts: { [categoryKey]: { referencePages: parsed } },
      });
      onFinanceSettingsUpdated(updated);
      toast.markSaved();
    } catch (error) {
      setReferencePages(rateBasis.referencePages === null ? '' : String(rateBasis.referencePages));
      toast.markFailed(error);
    }
  }

  const { hours, price } = computeTimeCost(rateBasis, pageCount, wagePerHour);

  return (
    <div className="flex flex-col gap-3 rounded-standard bg-surface p-4 shadow-panel">
      <div className="flex items-center justify-between">
        <h4 className="font-bold">{label}</h4>
        <p className="text-caption text-neutral-500">
          {hours.toFixed(2)} hours · {formatCurrency(price)}
        </p>
      </div>
      {/* 2 equal-width columns so the fields always fill the row - for a
          flat, one-time-cost category (`scalesWithPages` false, currently
          only Printing), only the first column renders a field, leaving
          the second column as blank space rather than stretching the one
          field across the full row. */}
      <div className="grid grid-cols-2 gap-3">
        <FinanceField
          label="Reference minutes"
          htmlFor={`time-cost-minutes-${categoryKey}`}
          error={errors.referenceMinutes}
        >
          <input
            id={`time-cost-minutes-${categoryKey}`}
            type="number"
            min={0}
            step={1}
            value={referenceMinutes}
            onChange={(event) => setReferenceMinutes(stripLeadingZero(event.target.value))}
            onBlur={handleReferenceMinutesBlur}
            className={`w-full ${errors.referenceMinutes ? financeErrorInputClassName : financeInputClassName}`}
          />
        </FinanceField>
        {scalesWithPages ? (
          <FinanceField
            label="Reference pages"
            htmlFor={`time-cost-pages-${categoryKey}`}
            error={errors.referencePages}
          >
            <input
              id={`time-cost-pages-${categoryKey}`}
              type="number"
              min={1}
              step={1}
              value={referencePages}
              onChange={(event) => setReferencePages(stripLeadingZero(event.target.value))}
              onBlur={handleReferencePagesBlur}
              className={`w-full ${errors.referencePages ? financeErrorInputClassName : financeInputClassName}`}
            />
          </FinanceField>
        ) : null}
      </div>
    </div>
  );
}

// The "Time-based costs" section (story 34): the 5 fixed categories, each
// with its own shared reference-minutes/reference-pages rate basis and a
// shared wage-per-hour value, both editable here and reflected on every
// binder's Finances tab going forward.
export function TimeCostsSection({
  financeSettings,
  pageCount,
  onFinanceSettingsUpdated,
}: {
  financeSettings: FinanceSettings;
  pageCount: number;
  onFinanceSettingsUpdated: (settings: FinanceSettings) => void;
}) {
  const { start } = useSaveStatusToast();
  const [wagePerHour, setWagePerHour] = useState(financeSettings.wagePerHour.toFixed(2));
  const [wageError, setWageError] = useState<string | null>(null);

  async function handleWagePerHourBlur() {
    const parsed = parseNonNegative(wagePerHour);
    if (parsed === null) {
      setWageError('Must be 0 or greater.');
      return;
    }
    if (parsed === financeSettings.wagePerHour) return;
    setWageError(null);
    const toast = start('edit-wage-per-hour');
    try {
      const updated = await updateFinanceSettings({ wagePerHour: parsed });
      onFinanceSettingsUpdated(updated);
      toast.markSaved();
    } catch (error) {
      setWagePerHour(financeSettings.wagePerHour.toFixed(2));
      toast.markFailed(error);
    }
  }

  return (
    <section className="flex flex-col gap-3">
      <div className="grid grid-cols-[1fr_auto_1fr] items-center">
        <div aria-hidden="true" />
        <h2 className="text-center text-heading font-bold">Time-based costs</h2>
        <FinanceField
          label="Wage per hour"
          htmlFor="wage-per-hour"
          error={wageError}
          className="max-w-40 justify-self-end"
        >
          <FinanceMoneyInput
            id="wage-per-hour"
            min={0}
            value={wagePerHour}
            onChange={(event) => setWagePerHour(event.target.value)}
            onBlur={handleWagePerHourBlur}
            hasError={Boolean(wageError)}
          />
        </FinanceField>
      </div>
      {TIME_COST_CATEGORIES.map(({ key, label, scalesWithPages }) => (
        <TimeCostCategoryRow
          key={key}
          categoryKey={key}
          label={label}
          scalesWithPages={scalesWithPages}
          rateBasis={financeSettings.timeCosts[key]}
          pageCount={pageCount}
          wagePerHour={financeSettings.wagePerHour}
          onFinanceSettingsUpdated={onFinanceSettingsUpdated}
        />
      ))}
    </section>
  );
}
