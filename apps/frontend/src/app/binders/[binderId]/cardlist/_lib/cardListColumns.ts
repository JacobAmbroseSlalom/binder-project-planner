import type { CardListColumnKey } from './cardListDerivation';

// Each sortable column's display label, keyed by `CardListColumnKey` -
// `SortableColumnHeader` (in `_components/CardListTableHeader.tsx`) looks
// up a column's own label from here rather than each call site repeating
// it.
export const COLUMN_LABELS: Record<CardListColumnKey, string> = {
  name: 'Name',
  set: 'Set',
  number: 'Number',
  variation: 'Variation',
  acquisition: 'Acquisition',
  price: 'Price',
  priceUpdatedAt: 'Price updated',
};

// Total column count, for the empty-results row's `colSpan`: the 7
// sortable columns (`COLUMN_LABELS`, which now includes Price/Price
// updated) plus the thumbnail column plus story 49's trailing Actions
// column, plus, only while the price-review state is active, its 6
// expanded review columns.
export function getTotalColumnCount(isPriceReviewActive: boolean): number {
  const baseColumnCount = Object.keys(COLUMN_LABELS).length + 2;
  return isPriceReviewActive ? baseColumnCount + 6 : baseColumnCount;
}
