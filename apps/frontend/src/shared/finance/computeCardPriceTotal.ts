import type { Card } from '@/lib/api';

// One group's summed saved-price total (story 38), shared by the Card
// List tab's totals row and the "View Financials" tab's Cards section -
// both need the same "sum every card's saved `price`, excluding cards
// without one" calculation, just over different card subsets (all,
// unacquired, or - Card List only - the currently filtered/searched set).
export interface CardPriceTotal {
  // The sum of every priced card's saved `price` in this group; cards
  // with a `null` price are excluded from the sum entirely rather than
  // treated as zero.
  sum: number;
  // How many cards in this group have no saved price yet. Only the Card
  // List tab's totals row displays this count - the Financials tab shows
  // just the summed total, per that story's acceptance criteria.
  missingPriceCount: number;
}

// Computes `cards`' saved-price total and missing-price count in one pass.
export function computeCardPriceTotal(cards: readonly Card[]): CardPriceTotal {
  let sum = 0;
  let missingPriceCount = 0;

  for (const card of cards) {
    if (card.price === null) {
      missingPriceCount += 1;
    } else {
      sum += card.price;
    }
  }

  return { sum, missingPriceCount };
}
