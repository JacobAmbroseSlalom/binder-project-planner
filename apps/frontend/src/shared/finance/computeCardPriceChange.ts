// Story 38's price-change indicator: compares a card's previously saved
// price to its pending review new-price value. A card with no prior saved
// price treats it as $0 for comparison purposes, so setting an initial
// price always displays as an increase rather than requiring special-case
// "first price ever" wording.
export interface CardPriceChange {
  // `null` when there's nothing to compare (no pending new-price value at
  // all, e.g. this card's price couldn't be fetched and it has no saved
  // price either) - displayed as `--`, matching a zero-change comparison.
  direction: 'increase' | 'decrease' | 'unchanged' | null;
  amount: number;
}

export function computeCardPriceChange(
  previousPrice: number | null,
  newPrice: number | null,
): CardPriceChange {
  if (newPrice === null) {
    return { direction: null, amount: 0 };
  }

  const diff = newPrice - (previousPrice ?? 0);
  if (diff === 0) {
    return { direction: 'unchanged', amount: 0 };
  }

  return { direction: diff > 0 ? 'increase' : 'decrease', amount: Math.abs(diff) };
}
