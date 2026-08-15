'use client';

import { ArrowDown, ArrowUp, ArrowUpDown, Bookmark, Circle, CircleCheck } from 'lucide-react';

import type { Card } from '@/lib/api';
import { Tooltip } from '@/shared/feedback';

import { ColumnFilterDropdown } from './ColumnFilterDropdown';
import type { PriceReviewTableProps } from './CardListTableRow';
import {
  getDistinctColumnValues,
  type CardListColumnFilters,
  type CardListColumnKey,
  type CardListSortDirection,
  type CardListSortOption,
} from '../_lib/cardListDerivation';
import { COLUMN_LABELS } from '../_lib/cardListColumns';

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

// Story 37's Card List table header row: each sortable column's header +
// filter dropdown, story 46's select-all/deselect-all acquisition
// control, story 38's 6 expanded price-review columns (only while
// active), and story 45's bulk "Add to What I'm Looking For" control -
// extracted out of `CardListTable` so that component can stay focused on
// row rendering and edit-state orchestration.
export function CardListTableHeader({
  allCards,
  visibleCards,
  sortOption,
  sortDirection,
  onSortColumnClick,
  columnFilters,
  onColumnFilterChange,
  onToggleAllAcquisition,
  isBulkAcquisitionPending,
  priceReview,
  isBinderLocked,
  onBulkAddToWatchlist,
  isBulkAddingToWatchlist,
}: {
  // Every binder card, used only to compute each column's full
  // distinct-value list for its filter dropdown - never rendered
  // directly.
  allCards: readonly Card[];
  // The already search/sort/filter-derived cards to render as rows.
  visibleCards: readonly Card[];
  sortOption: CardListSortOption;
  sortDirection: CardListSortDirection;
  onSortColumnClick: (column: CardListColumnKey) => void;
  columnFilters: CardListColumnFilters;
  onColumnFilterChange: (column: CardListColumnKey, next: Set<string>) => void;
  onToggleAllAcquisition: (acquired: boolean) => void;
  isBulkAcquisitionPending: boolean;
  // Story 38: present only while the price-review state is active. Its
  // mere presence (rather than a separate boolean) both disables the
  // search/sort/filter controls and switches the header into its
  // expanded review-column rendering.
  priceReview: PriceReviewTableProps | null;
  isBinderLocked: boolean;
  // The bulk variant of each row's "Add to What I'm Looking For" action:
  // adds every currently visible (search/sort/filter-derived) card to the
  // watchlist in one request.
  onBulkAddToWatchlist: (cardIds: string[]) => void;
  isBulkAddingToWatchlist: boolean;
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
        {/* Story 49's trailing Edit/Save/Cancel actions column - no
            sort/filter of its own, aside from this header-level bulk
            "Add to What I'm Looking For" control (every currently
            displayed card at once), placed above each row's own
            individual version of the same action below. */}
        <th className="py-2 pl-4 text-right font-regular">
          <span className="sr-only">Row actions</span>
          {/* Matches each row's own `flex justify-end gap-2` actions
              group (Bookmark + Edit, both `size-9`) below, including a
              same-sized invisible spacer standing in for the Edit
              button's column when it's present, so this header's
              Bookmark button lines up directly over each row's -
              without it, being the only item here would instead hug
              the column's right edge, right where Edit sits. */}
          <div className="flex justify-end gap-2">
            <Tooltip label="Add every displayed card to What I'm Looking For">
              <button
                type="button"
                disabled={controlsDisabled || isBulkAddingToWatchlist || visibleCards.length === 0}
                onClick={() => onBulkAddToWatchlist(visibleCards.map((card) => card.id))}
                aria-label="Add every displayed card to What I'm Looking For"
                className="flex size-9 cursor-pointer items-center justify-center rounded-standard text-neutral-100 hover:bg-neutral-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Bookmark className="size-4" aria-hidden="true" />
              </button>
            </Tooltip>
            {!isBinderLocked && <div className="size-9" aria-hidden="true" />}
          </div>
        </th>
      </tr>
    </thead>
  );
}
