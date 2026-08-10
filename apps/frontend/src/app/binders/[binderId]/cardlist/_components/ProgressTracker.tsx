import { Check } from 'lucide-react';

import type { Card } from '@/lib/api';

// Story 37's card list progress tracker: acquired/total/percent computed
// from the binder's full `cards` array (both placed and unplaced),
// deliberately unaffected by the tab's own search/sort/filter state -
// mirrors `BinderCompletionMetrics`'s acquisition line on the home page,
// down to its rounding and "N/A" zero-cards fallback.
export function ProgressTracker({ cards }: { cards: readonly Card[] }) {
  const totalCards = cards.length;
  const acquiredCards = cards.filter((card) => card.acquired).length;
  const hasCards = totalCards > 0;
  const acquisitionPercent = hasCards ? Math.round((acquiredCards / totalCards) * 100) : null;
  const isFullyAcquired = hasCards && acquiredCards === totalCards;

  return (
    <p
      className={`flex items-center gap-1 text-body ${isFullyAcquired ? 'text-success' : 'text-neutral-500'}`}
    >
      {isFullyAcquired && <Check className="size-5" aria-hidden="true" />}
      {acquiredCards}/{totalCards} Cards acquired (
      {acquisitionPercent === null ? 'N/A' : `${acquisitionPercent}%`})
    </p>
  );
}
