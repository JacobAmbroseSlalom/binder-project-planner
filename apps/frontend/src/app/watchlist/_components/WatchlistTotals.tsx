import { computeCardPriceTotal } from '@/shared/finance/computeCardPriceTotal';
import { formatCurrency } from '@/shared/finance/formatCurrency';
import type { WatchlistEntry } from '@/lib/api';

// One group's stat: its summed price total, plus a count of entries still
// missing a saved price, mirroring the Card List tab's own `TotalStat`.
function TotalStat({ label, entries }: { label: string; entries: readonly WatchlistEntry[] }) {
  const { sum, missingPriceCount } = computeCardPriceTotal(entries);
  return (
    <p className="text-body text-neutral-500">
      {label}: <span className="font-bold text-neutral-100">{formatCurrency(sum)}</span>
      {missingPriceCount > 0 && (
        <span className="text-caption">
          {' '}
          ({missingPriceCount} missing price{missingPriceCount === 1 ? '' : 's'})
        </span>
      )}
    </p>
  );
}

// Story 45's What I'm Looking For page's totals row: a saved-price total
// (plus missing-price count) for every entry and for the currently
// search/filtered subset - mirroring the Card List tab's own
// `CardListTotals`, minus its acquisition progress tracker and
// unacquired-cards stat, neither of which has an equivalent here (this
// list has no Acquisition column at all).
export function WatchlistTotals({
  allEntries,
  filteredEntries,
  className,
}: {
  allEntries: readonly WatchlistEntry[];
  filteredEntries: readonly WatchlistEntry[];
  className?: string;
}) {
  return (
    <div className={`flex flex-wrap items-center gap-6 ${className ?? ''}`}>
      <TotalStat label="All entries" entries={allEntries} />
      <TotalStat label="Filtered entries" entries={filteredEntries} />
    </div>
  );
}
