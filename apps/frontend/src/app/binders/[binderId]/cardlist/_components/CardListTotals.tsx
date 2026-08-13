import { computeCardPriceTotal } from '@/shared/finance/computeCardPriceTotal';
import { formatCurrency } from '@/shared/finance/formatCurrency';
import type { Card } from '@/lib/api';

import { ProgressTracker } from './ProgressTracker';

// One group's stat: its summed price total, plus a count of cards still
// missing a saved price (story 38's Card List totals row shows this count
// alongside every group's total - the "View Financials" tab's own totals
// omit it).
function TotalStat({ label, cards }: { label: string; cards: readonly Card[] }) {
  const { sum, missingPriceCount } = computeCardPriceTotal(cards);
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

// The Card List tab's totals row (story 38): the acquisition progress
// tracker (story 37) alongside a saved-price total - plus a missing-price
// count - for all cards, unacquired cards, and cards matching the
// currently active search/filters. Recomputed on every render from
// whichever card arrays the tab passes in, since none of these totals are
// persisted.
export function CardListTotals({
  allCards,
  unacquiredCards,
  filteredCards,
  className,
}: {
  allCards: readonly Card[];
  unacquiredCards: readonly Card[];
  filteredCards: readonly Card[];
  // Optional extra classes appended to the row's own layout classes - the
  // tab page uses this to center the row above the search bar, since this
  // component itself stays agnostic about where it's placed.
  className?: string;
}) {
  return (
    <div className={`flex flex-wrap items-center gap-6 ${className ?? ''}`}>
      <ProgressTracker cards={allCards} />
      <TotalStat label="All cards" cards={allCards} />
      <TotalStat label="Unacquired cards" cards={unacquiredCards} />
      <TotalStat label="Filtered cards" cards={filteredCards} />
    </div>
  );
}
