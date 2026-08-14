import type { Card } from '@/lib/api';

// Story 50: the `count` highest-priced cards across a binder (by saved
// `price`, highest first, regardless of acquisition status), for the
// "View Financials" tab's Cards section "Top priced cards" list. Cards
// without a saved price are excluded entirely rather than sorting to one
// end. Ties at the cutoff are broken by name (alphabetical) for a stable,
// deterministic list across renders.
export function computeTopPricedCards(cards: readonly Card[], count: number): Card[] {
  return cards
    .filter((card) => card.price !== null)
    .sort((a, b) => (b.price as number) - (a.price as number) || a.name.localeCompare(b.name))
    .slice(0, count);
}
