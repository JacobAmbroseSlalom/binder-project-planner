import Link from 'next/link';

import { formatCurrency } from '../../binders/[binderId]/financials/_lib/financeCalculations';

// One stat in the sticky totals bar - a label above a bold value, matching
// the real "View Financials" tab's `StickyTotals` (and, before that, the
// binder-list completion stats) `TotalStat`. `emphasize` bumps the value up
// to the largest type step for the one figure that should stand out from
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

// The Finances Preview page's stickied running-totals bar (story 54).
// Unlike the real "View Financials" tab's `StickyTotals`, there's no Cards
// line (this page has no saved card prices) and no "Overall total" (which
// would just equal "Total" with nothing added), and the trailing gear icon
// is replaced with a "Create binder" button that navigates to the real
// "Create a new binder" page, prefilling its width/height/pages from
// whichever Binder cost entry is currently selected/created here - none of
// this page's other selections carry over.
export function PreviewStickyTotals({
  materialCostsTotal,
  timeCostsTotal,
  total,
  withTax,
  salesTaxPercent,
  totalHours,
  createBinderHref,
}: {
  materialCostsTotal: number;
  timeCostsTotal: number;
  total: number;
  withTax: number;
  salesTaxPercent: number;
  totalHours: number;
  createBinderHref: string;
}) {
  return (
    <div className="sticky top-0 z-10 flex flex-wrap items-stretch justify-between gap-8 border-b border-neutral-700 bg-background p-4">
      {/* Stands in for both the real tab's "Summary:" label and this
          page's own title (previously a separate `<h1>` below this bar) -
          folded into one to avoid saying "Finances Preview" twice on the
          page. */}
      <span className="flex items-center text-heading font-bold">Finances Preview:</span>
      <div className="flex flex-wrap items-stretch justify-end gap-8">
        <TotalStat label="Material costs" value={formatCurrency(materialCostsTotal)} />
        <TotalStat label="Time-based costs" value={formatCurrency(timeCostsTotal)} />
        <TotalStat label="Total" value={formatCurrency(total)} emphasize />
        <TotalStat label={`With Tax (${salesTaxPercent}%)`} value={formatCurrency(withTax)} />
        <TotalStat label="Total hours" value={totalHours.toFixed(2)} />
        <div className="flex items-center">
          <Link
            href={createBinderHref}
            className="rounded-standard bg-primary px-4 py-2 font-bold hover:brightness-110"
          >
            Create binder
          </Link>
        </div>
      </div>
    </div>
  );
}
