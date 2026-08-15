import type { WatchlistColumnKey } from './watchlistEntryDerivation';

// Each sortable column's display label, mirroring `CardListTable`'s own
// `COLUMN_LABELS` minus Acquisition.
export const COLUMN_LABELS: Record<WatchlistColumnKey, string> = {
  name: 'Name',
  set: 'Set',
  number: 'Number',
  variation: 'Variation',
  price: 'Price',
  priceUpdatedAt: 'Price updated',
};

// Total column count, for the empty-results row's `colSpan`: the 6
// sortable columns plus the drag-handle column plus the thumbnail column
// plus this list's own trailing actions column, plus, only while the
// price-review state is active, its 6 expanded review columns - mirroring
// `getTotalColumnCount` in `cardlist/_lib/cardListColumns.ts`.
export function getTotalColumnCount(isPriceReviewActive: boolean): number {
  const baseColumnCount = Object.keys(COLUMN_LABELS).length + 3;
  return isPriceReviewActive ? baseColumnCount + 6 : baseColumnCount;
}
