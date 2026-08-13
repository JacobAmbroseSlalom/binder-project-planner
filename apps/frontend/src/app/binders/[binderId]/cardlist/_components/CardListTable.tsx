'use client';

import { ArrowDown, ArrowUp, ArrowUpDown, Circle, CircleCheck } from 'lucide-react';

import { resolveCardImageUrl, type Card } from '@/lib/api';
import { ImagePreview, Tooltip } from '@/shared/feedback';
import { computeCardPriceChange } from '@/shared/finance/computeCardPriceChange';
import { formatCurrency } from '@/shared/finance/formatCurrency';
import { MoneyInput } from '@/shared/finance/MoneyInput';

import { ColumnFilterDropdown } from './ColumnFilterDropdown';
import { VariantSelect } from './VariantSelect';
import {
  getDistinctColumnValues,
  type CardListColumnFilters,
  type CardListColumnKey,
  type CardListSortDirection,
  type CardListSortOption,
} from '../_lib/cardListDerivation';
import type { PriceReviewRow, PriceReviewSource } from '../useCardPriceReview';

// Each sortable column's display label, keyed by `CardListColumnKey` -
// `SortableColumnHeader` below looks up a column's own label from here
// rather than each call site repeating it.
const COLUMN_LABELS: Record<CardListColumnKey, string> = {
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
// updated) plus the thumbnail column, plus, only while the price-review
// state is active, its 6 expanded review columns.
function getTotalColumnCount(isPriceReviewActive: boolean): number {
  const baseColumnCount = Object.keys(COLUMN_LABELS).length + 1;
  return isPriceReviewActive ? baseColumnCount + 6 : baseColumnCount;
}

// Story 38's price-review row data a table cell needs, plus the handlers
// it calls back into `useCardPriceReview` through. `null` while the
// price-review state isn't active at all.
export interface PriceReviewTableProps {
  isFetching: boolean;
  rows: Map<string, PriceReviewRow>;
  onVariantChange: (cardId: string, variantKey: string) => void;
  onPriceInputChange: (cardId: string, rawValue: string) => void;
  onFillPrice: (cardId: string, value: number | null, source: PriceReviewSource) => void;
}

// Story 46's select-all/deselect-all header control for the Acquisition
// column. Its icon state is derived from the currently visible
// (filtered/searched) card set only, matching story 37's own
// `deriveVisibleCards` filtering: the acquired icon appears only when
// every visible card is already acquired, otherwise the unacquired icon -
// selecting it bulk-toggles every visible card to that icon's opposite
// state. Disabled while a bulk toggle is already in flight, or while no
// cards are currently displayed (nothing to toggle).
function BulkAcquisitionHeaderControl({
  visibleCards,
  onToggleAllAcquisition,
  isBulkAcquisitionPending,
  disabled,
}: {
  visibleCards: readonly Card[];
  onToggleAllAcquisition: (acquired: boolean) => void;
  isBulkAcquisitionPending: boolean;
  // Story 38: disabled while the card list's price-review state is
  // active.
  disabled?: boolean;
}) {
  const allAcquired = visibleCards.length > 0 && visibleCards.every((card) => card.acquired);
  const label = allAcquired
    ? 'Mark every displayed card as unacquired'
    : 'Mark every displayed card as acquired';

  return (
    <Tooltip label={label}>
      <button
        type="button"
        disabled={disabled || isBulkAcquisitionPending || visibleCards.length === 0}
        onClick={() => onToggleAllAcquisition(!allAcquired)}
        aria-label={label}
        className="flex size-7 cursor-pointer items-center justify-center rounded-standard text-neutral-100 hover:bg-neutral-700 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {allAcquired ? (
          <CircleCheck className="size-5 fill-secondary text-background" aria-hidden="true" />
        ) : (
          <Circle className="size-5" aria-hidden="true" />
        )}
      </button>
    </Tooltip>
  );
}

// One sortable column's header cell: its clickable label (toggles sort)
// plus its filter dropdown - shared by all 5 sortable columns so each
// call site below only needs to say which column and in what position.
function SortableColumnHeader({
  column,
  allCards,
  sortOption,
  sortDirection,
  onSortColumnClick,
  columnFilters,
  onColumnFilterChange,
  headerAccessory,
  align = 'left',
  disabled,
}: {
  column: CardListColumnKey;
  allCards: readonly Card[];
  sortOption: CardListSortOption;
  sortDirection: CardListSortDirection;
  onSortColumnClick: (column: CardListColumnKey) => void;
  columnFilters: CardListColumnFilters;
  onColumnFilterChange: (column: CardListColumnKey, next: Set<string>) => void;
  // Story 46: an optional control rendered before the sort button - used
  // only by the Acquisition column's select-all/deselect-all header
  // control, so every other column simply omits this prop.
  headerAccessory?: React.ReactNode;
  // Optional header alignment, defaulting to the other columns' left
  // alignment - only the Acquisition column passes 'center', matching
  // its centered, icon-only body cells rather than the text columns'
  // left-aligned reading flow.
  align?: 'left' | 'center';
  // Story 38: disabled while the card list's price-review state is
  // active, so the reviewed card set can't change out from under the
  // pending new-price values.
  disabled?: boolean;
}) {
  const label = COLUMN_LABELS[column];
  const isActive = sortOption === column;
  return (
    <th className={`py-2 pr-4 font-regular ${align === 'center' ? 'text-center' : ''}`}>
      <div className={`flex items-center gap-1 ${align === 'center' ? 'justify-center' : ''}`}>
        {headerAccessory}
        <button
          type="button"
          disabled={disabled}
          onClick={() => onSortColumnClick(column)}
          aria-label={`Sort by ${label}`}
          className={`flex cursor-pointer items-center gap-1 rounded-standard px-1 py-0.5 hover:bg-neutral-700 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-transparent ${
            isActive ? 'text-primary' : ''
          }`}
        >
          {label}
          {isActive ? (
            sortDirection === 'ascending' ? (
              <ArrowUp className="size-3.5" aria-hidden="true" />
            ) : (
              <ArrowDown className="size-3.5" aria-hidden="true" />
            )
          ) : (
            <ArrowUpDown className="size-3.5" aria-hidden="true" />
          )}
        </button>
        <ColumnFilterDropdown
          columnLabel={label}
          options={getDistinctColumnValues(allCards, column)}
          selected={columnFilters[column]}
          onChange={(next) => onColumnFilterChange(column, next)}
          disabled={disabled}
        />
      </div>
    </th>
  );
}

// Story 37's card list table: the tab's main content, combining each
// column's sortable header + filter dropdown with the currently
// search/sort/filter-derived rows, plus an empty-results state. Column
// order (left to right): Acquisition, thumbnail, Name, Variation, Set,
// Number, Price, Price updated (story 38) - Acquisition leads since it's
// the tab's primary action, and is centered over its icon-only body cells
// unlike the left-aligned text columns; Variation sits fourth, directly
// after Name. Price and Price updated get the same sort/filter treatment
// as the other 5 columns (added after the fact, once users started
// wanting to sort/find cards by saved price). While `priceReview` is
// active, 6 more columns (Variant, Market price, Low price, TCGplayer,
// New price, Change) appear after Price updated, per that story's
// "expands" requirement.
export function CardListTable({
  allCards,
  visibleCards,
  sortOption,
  sortDirection,
  onSortColumnClick,
  columnFilters,
  onColumnFilterChange,
  onToggleAcquired,
  pendingCardAcquiredToggleIds,
  onToggleAllAcquisition,
  isBulkAcquisitionPending,
  priceReview,
}: {
  // Every binder card, used only to compute each column's full
  // distinct-value list for its filter dropdown - never rendered
  // directly.
  allCards: readonly Card[];
  // The already search/sort/filter-derived cards to render as rows.
  visibleCards: readonly Card[];
  sortOption: CardListSortOption;
  sortDirection: CardListSortDirection;
  // Handles a column header click: switches to that column ascending if
  // it wasn't already the active sort, or flips direction if it was.
  onSortColumnClick: (column: CardListColumnKey) => void;
  columnFilters: CardListColumnFilters;
  onColumnFilterChange: (column: CardListColumnKey, next: Set<string>) => void;
  onToggleAcquired: (cardId: string) => void;
  pendingCardAcquiredToggleIds: ReadonlySet<string>;
  // Story 46: bulk-toggles every currently visible card to `acquired`,
  // powering the Acquisition column header's select-all/deselect-all
  // control.
  onToggleAllAcquisition: (acquired: boolean) => void;
  isBulkAcquisitionPending: boolean;
  // Story 38: present only while the price-review state is active. Its
  // mere presence (rather than a separate boolean) both disables the
  // search/sort/filter controls and switches the table into its expanded
  // review-column rendering.
  priceReview: PriceReviewTableProps | null;
}) {
  const controlsDisabled = priceReview !== null;

  const sortableHeaderProps = {
    allCards,
    sortOption,
    sortDirection,
    onSortColumnClick,
    columnFilters,
    onColumnFilterChange,
    disabled: controlsDisabled,
  };

  return (
    <table className="w-full border-collapse text-left">
      <thead>
        <tr className="border-b border-neutral-700 text-caption text-neutral-500">
          <SortableColumnHeader
            column="acquisition"
            align="center"
            {...sortableHeaderProps}
            headerAccessory={
              <BulkAcquisitionHeaderControl
                visibleCards={visibleCards}
                onToggleAllAcquisition={onToggleAllAcquisition}
                isBulkAcquisitionPending={isBulkAcquisitionPending}
                disabled={controlsDisabled}
              />
            }
          />
          {/* Thumbnail column has no sort/filter of its own. */}
          <th className="w-16 py-2 pr-2 font-regular">
            <span className="sr-only">Card image</span>
          </th>
          <SortableColumnHeader column="name" {...sortableHeaderProps} />
          <SortableColumnHeader column="variation" {...sortableHeaderProps} />
          <SortableColumnHeader column="set" {...sortableHeaderProps} />
          <SortableColumnHeader column="number" {...sortableHeaderProps} />
          <SortableColumnHeader column="price" {...sortableHeaderProps} />
          <SortableColumnHeader column="priceUpdatedAt" {...sortableHeaderProps} />
          {priceReview && (
            <>
              <th className="py-2 pr-4 font-regular">Variant</th>
              <th className="py-2 pr-4 font-regular">Market price</th>
              <th className="py-2 pr-4 font-regular">Low price</th>
              <th className="py-2 pr-4 font-regular">TCGplayer</th>
              <th className="py-2 pr-4 font-regular">New price</th>
              <th className="py-2 pr-4 font-regular">Change</th>
            </>
          )}
        </tr>
      </thead>
      <tbody>
        {visibleCards.length === 0 && (
          <tr>
            <td
              colSpan={getTotalColumnCount(priceReview !== null)}
              className="py-8 text-center text-neutral-500"
            >
              No cards match the current search and filters.
            </td>
          </tr>
        )}
        {visibleCards.map((card) => {
          const isTogglePending = pendingCardAcquiredToggleIds.has(card.id);
          const reviewRow = priceReview?.rows.get(card.id) ?? null;
          return (
            <tr key={card.id} className="border-b border-neutral-800">
              <td className="py-2 pr-4 text-center">
                {/* Story 37: reuses the same acquisition mutation and
                    optimistic-update/rollback behavior introduced by story
                    36 (`toggleCardAcquired`/`pendingCardAcquiredToggleIds`,
                    threaded down from `page.tsx`), and the same icon-swap
                    button styling used on the layout tab's `CardTile`
                    (sized up here since this is this column's sole
                    content, rather than one of several hover actions),
                    rather than a second card-list-specific control. */}
                <Tooltip label={card.acquired ? 'Mark as unacquired' : 'Mark as acquired'}>
                  <button
                    type="button"
                    disabled={isTogglePending}
                    onClick={() => onToggleAcquired(card.id)}
                    aria-label={
                      card.acquired
                        ? `Mark ${card.name} as unacquired`
                        : `Mark ${card.name} as acquired`
                    }
                    className="flex size-9 cursor-pointer items-center justify-center rounded-standard text-neutral-100 hover:bg-neutral-700 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {card.acquired ? (
                      <CircleCheck
                        className="size-7 fill-secondary text-background"
                        aria-hidden="true"
                      />
                    ) : (
                      <Circle className="size-7" aria-hidden="true" />
                    )}
                  </button>
                </Tooltip>
              </td>
              <td className="py-2 pr-2">
                {/* Story 37 (this file) + on-hover enlarge: wraps the
                    small thumbnail in the shared `ImagePreview` so hovering
                    a row shows a much larger version of the same image,
                    without needing a second, higher-resolution image URL -
                    the browser already has the thumbnail's URL cached from
                    the `img` below, so the enlarged copy loads instantly. */}
                <ImagePreview src={resolveCardImageUrl(card.imageUrl)} alt={card.name}>
                  <div className="flex h-12 w-9 items-center justify-center overflow-hidden rounded-standard border border-neutral-700 bg-neutral-800">
                    {/* eslint-disable-next-line @next/next/no-img-element -- the
                        card image comes from an arbitrary backend/provider
                        origin, so next/image's fixed-domain optimization
                        doesn't apply here. */}
                    <img
                      src={resolveCardImageUrl(card.imageUrl)}
                      alt={card.name}
                      className="h-full w-full object-contain"
                    />
                  </div>
                </ImagePreview>
              </td>
              <td className="py-2 pr-4">{card.name}</td>
              <td className="py-2 pr-4 text-neutral-500">{card.variation ?? '—'}</td>
              <td className="py-2 pr-4 text-neutral-500">{card.setName ?? '—'}</td>
              <td className="py-2 pr-4 text-neutral-500">{card.localNumber ?? '—'}</td>
              <td className="py-2 pr-4">
                {/* Story 38: clicking the saved price fills the review
                    row's new-price input with it (only meaningful, and
                    only clickable, while review is active) - a manually
                    entered price renders in the secondary color to stay
                    visually distinct from an API-derived one. */}
                {card.price === null ? (
                  <span className="text-neutral-500">--</span>
                ) : priceReview ? (
                  <button
                    type="button"
                    onClick={() => priceReview.onFillPrice(card.id, card.price, 'savedPrice')}
                    className={`cursor-pointer hover:underline ${
                      card.isManualPrice ? 'text-secondary' : ''
                    }`}
                  >
                    {formatCurrency(card.price)}
                  </button>
                ) : (
                  <span className={card.isManualPrice ? 'text-secondary' : ''}>
                    {formatCurrency(card.price)}
                  </span>
                )}
              </td>
              <td className="py-2 pr-4 text-neutral-500">
                {card.priceUpdatedAt ? new Date(card.priceUpdatedAt).toLocaleDateString() : '--'}
              </td>
              {priceReview && (
                <PriceReviewCells card={card} row={reviewRow} priceReview={priceReview} />
              )}
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

// Story 38's 6 expanded review-mode cells for one card's row, split out
// from the main row markup above purely to keep that already-long row
// template readable.
function PriceReviewCells({
  card,
  row,
  priceReview,
}: {
  card: Card;
  row: PriceReviewRow | null;
  priceReview: PriceReviewTableProps;
}) {
  const selectedVariant =
    row?.variants.find((variant) => variant.variantKey === row.selectedVariantKey) ?? null;
  const change = computeCardPriceChange(card.price, row?.newPrice ?? null);
  const isRowLoading = priceReview.isFetching || row === null;
  // pokemontcg.io's "low" price is meant to sit at or below its "market"
  // price - when a listing anomaly flips that (low > market), flag the
  // low price in the secondary color so the reviewer notices before
  // filling it into the new-price input.
  const hasPriceAnomaly =
    !!selectedVariant &&
    selectedVariant.marketPrice !== null &&
    selectedVariant.lowPrice !== null &&
    selectedVariant.lowPrice > selectedVariant.marketPrice;

  return (
    <>
      <td className="py-2 pr-4">
        {isRowLoading ? (
          <span className="text-neutral-500">--</span>
        ) : (
          <VariantSelect
            variants={row.variants}
            selectedVariantKey={row.selectedVariantKey}
            onChange={(variantKey) => priceReview.onVariantChange(card.id, variantKey)}
          />
        )}
      </td>
      <td className="py-2 pr-4">
        {isRowLoading || !selectedVariant || selectedVariant.marketPrice === null ? (
          <span className="text-neutral-500">--</span>
        ) : (
          <button
            type="button"
            onClick={() => priceReview.onFillPrice(card.id, selectedVariant.marketPrice, 'variant')}
            className="cursor-pointer hover:underline"
          >
            {formatCurrency(selectedVariant.marketPrice)}
          </button>
        )}
      </td>
      <td className="py-2 pr-4">
        {isRowLoading || !selectedVariant || selectedVariant.lowPrice === null ? (
          <span className="text-neutral-500">--</span>
        ) : (
          <button
            type="button"
            onClick={() => priceReview.onFillPrice(card.id, selectedVariant.lowPrice, 'variant')}
            className={`cursor-pointer hover:underline ${hasPriceAnomaly ? 'text-secondary' : ''}`}
          >
            {formatCurrency(selectedVariant.lowPrice)}
          </button>
        )}
      </td>
      <td className="py-2 pr-4">
        {isRowLoading || !row?.tcgplayerUrl ? (
          <span className="text-neutral-500">--</span>
        ) : (
          <a
            href={row.tcgplayerUrl}
            target="_blank"
            rel="noreferrer noopener"
            className="text-primary hover:underline"
          >
            View
          </a>
        )}
      </td>
      <td className="py-2 pr-4">
        <MoneyInput
          min={0}
          disabled={isRowLoading}
          value={row?.newPrice?.toString() ?? ''}
          onChange={(event) => priceReview.onPriceInputChange(card.id, event.target.value)}
          ariaLabel={`${card.name} new price`}
          className="w-28"
        />
      </td>
      <td className="py-2 pr-4 whitespace-nowrap">
        {change.direction === null || change.direction === 'unchanged' ? (
          <span className="text-neutral-500">--</span>
        ) : change.direction === 'increase' ? (
          <span className="text-success">▲ +{formatCurrency(change.amount)}</span>
        ) : (
          <span className="text-error">▼ -{formatCurrency(change.amount)}</span>
        )}
      </td>
    </>
  );
}
