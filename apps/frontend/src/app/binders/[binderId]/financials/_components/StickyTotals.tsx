import { type FinanceSettings } from '@/lib/api';

import { computeWithTax, formatCurrency } from '../_lib/financeCalculations';

// One stat in the sticky totals bar - a label above a bold value, matching
// the compact stat layout used elsewhere in the app (e.g. binder-list
// completion stats). `emphasize` bumps the value up to the largest type
// step, for the one figure (excl.-Cards total) that should stand out from
// the rest.
function TotalStat({
  label,
  value,
  emphasize = false,
}: {
  label: string;
  value: string;
  emphasize?: boolean;
}) {
  return (
    <div className="flex flex-col justify-end gap-1">
      <span className="text-caption text-neutral-500">{label}</span>
      <span className={emphasize ? 'text-heading font-bold' : 'text-subheading font-bold'}>
        {value}
      </span>
    </div>
  );
}

// The Finances tab's stickied running-totals bar (story 34): a currency
// total for each of Material costs, Time-based costs, and Cards, a
// currency total excluding Cards, an overall currency total including
// Cards, and the total calculated hours across every time-based cost item.
// The Cards total here is always the static story-34 placeholder ($0.00),
// per that section's own placeholder scope.
//
// Also includes the "With Tax" figure (added after story 34 shipped): a
// fixed sales-tax percentage (Georgia's flat state sales tax rate, 4%,
// with no user-facing way to change it) applied on top of
// "Total (excl. Cards)". The rate is shown directly in the stat's label
// rather than as an editable field.
export function StickyTotals({
  physicalCostsTotal,
  timeCostsTotal,
  cardsTotal,
  totalHours,
  financeSettings,
}: {
  physicalCostsTotal: number;
  timeCostsTotal: number;
  cardsTotal: number;
  totalHours: number;
  financeSettings: FinanceSettings;
}) {
  const totalExcludingCards = physicalCostsTotal + timeCostsTotal;
  const overallTotal = totalExcludingCards + cardsTotal;
  const withTax = computeWithTax(totalExcludingCards, financeSettings.salesTaxPercent);

  return (
    <div className="sticky top-0 z-10 flex flex-wrap items-stretch justify-between gap-8 border-b border-neutral-700 bg-background p-4">
      <span className="flex items-center text-heading font-bold">Summary:</span>
      <div className="flex flex-wrap items-stretch justify-end gap-8">
        <TotalStat label="Material costs" value={formatCurrency(physicalCostsTotal)} />
        <TotalStat label="Time-based costs" value={formatCurrency(timeCostsTotal)} />
        <TotalStat label="Cards" value={formatCurrency(cardsTotal)} />
        <TotalStat
          label="Total (excl. Cards)"
          value={formatCurrency(totalExcludingCards)}
          emphasize
        />
        <TotalStat
          label={`With Tax (${financeSettings.salesTaxPercent}%)`}
          value={formatCurrency(withTax)}
        />
        <TotalStat label="Overall total" value={formatCurrency(overallTotal)} />
        <TotalStat label="Total hours" value={totalHours.toFixed(2)} />
      </div>
    </div>
  );
}
