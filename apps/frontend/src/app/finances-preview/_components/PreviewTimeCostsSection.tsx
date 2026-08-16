'use client';

import { useState } from 'react';

import type { TimeCosts } from '@/lib/api';

import {
  computeTimeCost,
  formatCurrency,
  TIME_COST_CATEGORIES,
} from '../../binders/[binderId]/financials/_lib/financeCalculations';
import {
  FinanceField,
  FinanceMoneyInput,
  financeErrorInputClassName,
  financeInputClassName,
  stripLeadingZero,
} from '../../binders/[binderId]/financials/_components/FinanceField';

function parseNonNegative(value: string): number | null {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

function parsePositiveInteger(value: string): number | null {
  const parsed = Number(value);
  return Number.isFinite(parsed) && Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

// One fixed time-cost category's row on the Finances Preview page (story
// 54): its reference-minutes/reference-pages rate basis, editable but only
// ever changing this page's own local `timeCosts` state (via
// `onRateBasisChange`) - never `updateFinanceSettings` - plus the
// category's computed total hours/price derived from it. Mirrors the real
// "View Financials" tab's `TimeCostCategoryRow`.
function PreviewTimeCostCategoryRow({
  categoryKey,
  label,
  scalesWithPages,
  rateBasis,
  pageCount,
  wagePerHour,
  onRateBasisChange,
}: {
  categoryKey: keyof TimeCosts;
  label: string;
  scalesWithPages: boolean;
  rateBasis: TimeCosts[keyof TimeCosts];
  pageCount: number;
  wagePerHour: number;
  onRateBasisChange: (categoryKey: keyof TimeCosts, rateBasis: TimeCosts[keyof TimeCosts]) => void;
}) {
  const [referenceMinutes, setReferenceMinutes] = useState(String(rateBasis.referenceMinutes));
  // Only meaningful when `scalesWithPages` is true; a flat, one-time-cost
  // category's rateBasis.referencePages is always null, and this state/
  // field is never rendered for it.
  const [referencePages, setReferencePages] = useState(
    rateBasis.referencePages === null ? '' : String(rateBasis.referencePages),
  );
  const [errors, setErrors] = useState<{ referenceMinutes?: string; referencePages?: string }>({});

  function handleReferenceMinutesBlur() {
    const parsed = parseNonNegative(referenceMinutes);
    if (parsed === null) {
      setErrors((prev) => ({ ...prev, referenceMinutes: 'Must be 0 or greater.' }));
      return;
    }
    setErrors((prev) => ({ ...prev, referenceMinutes: undefined }));
    if (parsed === rateBasis.referenceMinutes) return;
    onRateBasisChange(categoryKey, { ...rateBasis, referenceMinutes: parsed });
  }

  function handleReferencePagesBlur() {
    const parsed = parsePositiveInteger(referencePages);
    if (parsed === null) {
      setErrors((prev) => ({ ...prev, referencePages: 'Must be a positive whole number.' }));
      return;
    }
    setErrors((prev) => ({ ...prev, referencePages: undefined }));
    if (parsed === rateBasis.referencePages) return;
    onRateBasisChange(categoryKey, { ...rateBasis, referencePages: parsed });
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
          htmlFor={`preview-time-cost-minutes-${categoryKey}`}
          error={errors.referenceMinutes}
        >
          <input
            id={`preview-time-cost-minutes-${categoryKey}`}
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
            htmlFor={`preview-time-cost-pages-${categoryKey}`}
            error={errors.referencePages}
          >
            <input
              id={`preview-time-cost-pages-${categoryKey}`}
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

// The Finances Preview page's "Time-based costs" section (story 54): the 5
// fixed categories, each with its own reference-minutes/reference-pages
// rate basis, and a shared wage-per-hour value - all seeded from the real
// `financeSettings` singleton on load but held only in this page's own
// local state from then on. Mirrors the real "View Financials" tab's
// `TimeCostsSection`, except no field here ever calls
// `updateFinanceSettings`.
export function PreviewTimeCostsSection({
  wagePerHour,
  onWagePerHourChange,
  timeCosts,
  onTimeCostsChange,
  pageCount,
}: {
  wagePerHour: number;
  onWagePerHourChange: (value: number) => void;
  timeCosts: TimeCosts;
  onTimeCostsChange: (timeCosts: TimeCosts) => void;
  pageCount: number;
}) {
  const [wagePerHourInput, setWagePerHourInput] = useState(wagePerHour.toFixed(2));
  const [wageError, setWageError] = useState<string | null>(null);

  function handleWagePerHourBlur() {
    const parsed = parseNonNegative(wagePerHourInput);
    if (parsed === null) {
      setWageError('Must be 0 or greater.');
      return;
    }
    setWageError(null);
    if (parsed !== wagePerHour) onWagePerHourChange(parsed);
  }

  function handleRateBasisChange(
    categoryKey: keyof TimeCosts,
    rateBasis: TimeCosts[keyof TimeCosts],
  ) {
    onTimeCostsChange({ ...timeCosts, [categoryKey]: rateBasis });
  }

  return (
    <section className="flex flex-col gap-3">
      <div className="grid grid-cols-[1fr_auto_1fr] items-center">
        <div aria-hidden="true" />
        <h2 className="text-center text-heading font-bold">Time-based costs</h2>
        <FinanceField
          label="Wage per hour"
          htmlFor="preview-wage-per-hour"
          error={wageError}
          className="max-w-40 justify-self-end"
        >
          <FinanceMoneyInput
            id="preview-wage-per-hour"
            min={0}
            value={wagePerHourInput}
            onChange={(event) => setWagePerHourInput(event.target.value)}
            onBlur={handleWagePerHourBlur}
            hasError={Boolean(wageError)}
          />
        </FinanceField>
      </div>
      {TIME_COST_CATEGORIES.map(({ key, label, scalesWithPages }) => (
        <PreviewTimeCostCategoryRow
          key={key}
          categoryKey={key}
          label={label}
          scalesWithPages={scalesWithPages}
          rateBasis={timeCosts[key]}
          pageCount={pageCount}
          wagePerHour={wagePerHour}
          onRateBasisChange={handleRateBasisChange}
        />
      ))}
    </section>
  );
}
