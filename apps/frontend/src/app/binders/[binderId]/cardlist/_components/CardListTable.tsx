'use client';

import type { Card, UpdateCardDetailsRequest } from '@/lib/api';

import { getTotalColumnCount } from '../_lib/cardListColumns';
import type {
  CardListColumnFilters,
  CardListColumnKey,
  CardListSortDirection,
  CardListSortOption,
} from '../_lib/cardListDerivation';
import { useCardDetailsRowEditing } from '../useCardDetailsRowEditing';
import { CardListTableHeader } from './CardListTableHeader';
import { CardListTableRow, type PriceReviewTableProps } from './CardListTableRow';

// Story 37's card list table: the tab's main content, combining each
// column's sortable header + filter dropdown (in `CardListTableHeader`)
// with the currently search/sort/filter-derived rows (in
// `CardListTableRow`), plus an empty-results state. Column order (left to
// right): Acquisition, thumbnail, Name, Variation, Set, Number, Price,
// Price updated (story 38) - Acquisition leads since it's the tab's
// primary action, and is centered over its icon-only body cells unlike
// the left-aligned text columns; Variation sits fourth, directly after
// Name. Price and Price updated get the same sort/filter treatment as the
// other 5 columns (added after the fact, once users started wanting to
// sort/find cards by saved price). While `priceReview` is active, 6 more
// columns (Variant, Market price, Low price, TCGplayer, New price,
// Change) appear after Price updated, per that story's "expands"
// requirement. Story 49's row-edit state is owned by
// `useCardDetailsRowEditing` and threaded down to each row rather than
// kept inline here, so this component stays focused on orchestrating the
// header/rows.
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
  isBinderLocked,
  onEditCardDetails,
  pendingCardDetailsEditIds,
  onEditingRowChange,
  onAddToWatchlist,
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
  // Story 49: hides every row's "Edit" action while the binder is locked,
  // mirroring this codebase's existing precedent (e.g. `PlacedArtTile`)
  // of hiding rather than merely disabling a restricted action.
  isBinderLocked: boolean;
  // Saves a row's edited details through `PATCH /cards/{cardId}/details`.
  // Returns its request promise so this table can keep the row in its
  // editing state (rather than closing early) on failure.
  onEditCardDetails: (cardId: string, values: UpdateCardDetailsRequest) => Promise<Card>;
  pendingCardDetailsEditIds: ReadonlySet<string>;
  // Notified whenever a row's inline edit starts or stops (including
  // while its save request is still in flight), so the Card List tab can
  // disable its "Fetch card prices" button for the same reason the price
  // review disables this table's own Edit buttons below - editing a row
  // and reviewing prices shouldn't ever overlap.
  onEditingRowChange?: (isEditingRow: boolean) => void; // Story 45's Card List row action: adds this card to the shared What
  // I'm Looking For list (idempotent on the backend, so this table never
  // needs to know whether the card is already listed).
  onAddToWatchlist: (cardId: string) => void;
  // The header's bulk variant: adds every currently visible (search/sort/
  // filter-derived) card to the watchlist in one request.
  onBulkAddToWatchlist: (cardIds: string[]) => void;
  isBulkAddingToWatchlist: boolean;
}) {
  const {
    editingCardId,
    editValues,
    editNameError,
    startEditingCard,
    cancelEditingCard,
    changeEditingCardImage,
    updateEditField,
    saveEditingCard,
  } = useCardDetailsRowEditing(onEditCardDetails, onEditingRowChange);

  return (
    <table className="w-full border-collapse text-left">
      <CardListTableHeader
        allCards={allCards}
        visibleCards={visibleCards}
        sortOption={sortOption}
        sortDirection={sortDirection}
        onSortColumnClick={onSortColumnClick}
        columnFilters={columnFilters}
        onColumnFilterChange={onColumnFilterChange}
        onToggleAllAcquisition={onToggleAllAcquisition}
        isBulkAcquisitionPending={isBulkAcquisitionPending}
        priceReview={priceReview}
        isBinderLocked={isBinderLocked}
        onBulkAddToWatchlist={onBulkAddToWatchlist}
        isBulkAddingToWatchlist={isBulkAddingToWatchlist}
      />
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
        {visibleCards.map((card) => (
          <CardListTableRow
            key={card.id}
            card={card}
            isTogglePending={pendingCardAcquiredToggleIds.has(card.id)}
            onToggleAcquired={onToggleAcquired}
            priceReview={priceReview}
            isBinderLocked={isBinderLocked}
            editingCardId={editingCardId}
            isEditingThisRow={editingCardId === card.id}
            isSavingThisRow={pendingCardDetailsEditIds.has(card.id)}
            editValues={editValues}
            editNameError={editNameError}
            onStartEdit={startEditingCard}
            onCancelEdit={cancelEditingCard}
            onSaveEdit={saveEditingCard}
            onChangeImage={changeEditingCardImage}
            onUpdateField={updateEditField}
            onAddToWatchlist={onAddToWatchlist}
          />
        ))}
      </tbody>
    </table>
  );
}
