import { Check } from 'lucide-react';

import type { BinderSummary } from '@/lib/api';

// The per-binder completion metrics shown below each home-page binder when
// the completion-metrics toggle is on (story 22). Reads the backend-computed
// slot and card-acquisition counts already embedded in the binder summary
// (no separate request) and derives both percentages on the client, rounded
// to the nearest whole percent.
export function BinderCompletionMetrics({ binder }: { binder: BinderSummary }) {
  const { totalSlots, occupiedSlots, totalCards, acquiredCards } = binder;

  // `totalSlots` is width * height * 2 * pages, each at least 1, so it's
  // always positive - no divide-by-zero guard needed.
  const slotCompletionPercent = Math.round((occupiedSlots / totalSlots) * 100);
  // Every slot occupied. Compared on the raw counts (not the rounded
  // percent) so a nearly-full binder that rounds up to 100% isn't shown as
  // complete.
  const isFull = occupiedSlots === totalSlots;

  // Story 36: unlike `totalSlots` above, a binder can genuinely have zero
  // cards (both placed and unplaced), so this percentage needs an explicit
  // "N/A" fallback rather than dividing by zero.
  const hasCards = totalCards > 0;
  const acquisitionPercent = hasCards ? Math.round((acquiredCards / totalCards) * 100) : null;
  const isFullyAcquired = hasCards && acquiredCards === totalCards;

  return (
    <>
      <p
        // Full binders switch to the app's success color and add a checkmark,
        // reusing the existing success/checkmark language rather than a new
        // badge style; partial binders stay muted like the other secondary
        // metadata on the card.
        className={`flex items-center gap-1 text-caption ${isFull ? 'text-success' : 'text-neutral-500'}`}
      >
        {isFull && <Check className="size-4" aria-hidden="true" />}
        {occupiedSlots}/{totalSlots} Slots filled ({slotCompletionPercent}%)
      </p>
      <p
        className={`flex items-center gap-1 text-caption ${isFullyAcquired ? 'text-success' : 'text-neutral-500'}`}
      >
        {isFullyAcquired && <Check className="size-4" aria-hidden="true" />}
        {acquiredCards}/{totalCards} Cards acquired (
        {acquisitionPercent === null ? 'N/A' : `${acquisitionPercent}%`})
      </p>
    </>
  );
}
