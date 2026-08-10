'use client';

import { ArrowDown, ArrowUp, Circle, CircleCheck } from 'lucide-react';

import { resolveCardImageUrl, type Card } from '@/lib/api';

import { ColumnFilterDropdown } from './ColumnFilterDropdown';
import {
  getDistinctColumnValues,
  type CardListColumnFilters,
  type CardListColumnKey,
  type CardListSortDirection,
  type CardListSortOption,
} from '../_lib/cardListDerivation';

// One column's own header config: its display label and how to read its
// value back off a card for display (not for sorting/filtering - that
// logic lives in `cardListDerivation.ts`).
const COLUMNS: { key: CardListColumnKey; label: string }[] = [
  { key: 'name', label: 'Name' },
  { key: 'set', label: 'Set' },
  { key: 'number', label: 'Number' },
  { key: 'acquisition', label: 'Acquisition' },
];

// Story 37's card list table: the tab's main content, combining each
// column's sortable header + filter dropdown with the currently
// search/sort/filter-derived rows, plus an empty-results state.
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
}) {
  return (
    <table className="w-full border-collapse text-left">
      <thead>
        <tr className="border-b border-neutral-700 text-caption text-neutral-500">
          {/* Thumbnail column has no sort/filter of its own. */}
          <th className="w-16 py-2 pr-2 font-regular">
            <span className="sr-only">Card image</span>
          </th>
          {COLUMNS.map((column) => {
            const isActive = sortOption === column.key;
            return (
              <th key={column.key} className="py-2 pr-4 font-regular">
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => onSortColumnClick(column.key)}
                    aria-label={`Sort by ${column.label}`}
                    className={`flex cursor-pointer items-center gap-1 rounded-standard px-1 py-0.5 hover:bg-neutral-700 ${
                      isActive ? 'text-primary' : ''
                    }`}
                  >
                    {column.label}
                    {isActive &&
                      (sortDirection === 'ascending' ? (
                        <ArrowUp className="size-3.5" aria-hidden="true" />
                      ) : (
                        <ArrowDown className="size-3.5" aria-hidden="true" />
                      ))}
                  </button>
                  <ColumnFilterDropdown
                    columnLabel={column.label}
                    options={getDistinctColumnValues(allCards, column.key)}
                    selected={columnFilters[column.key]}
                    onChange={(next) => onColumnFilterChange(column.key, next)}
                  />
                </div>
              </th>
            );
          })}
        </tr>
      </thead>
      <tbody>
        {visibleCards.length === 0 && (
          <tr>
            <td colSpan={COLUMNS.length + 1} className="py-8 text-center text-neutral-500">
              No cards match the current search and filters.
            </td>
          </tr>
        )}
        {visibleCards.map((card) => {
          const isTogglePending = pendingCardAcquiredToggleIds.has(card.id);
          return (
            <tr key={card.id} className="border-b border-neutral-800">
              <td className="py-2 pr-2">
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
              </td>
              <td className="py-2 pr-4">{card.name}</td>
              <td className="py-2 pr-4 text-neutral-500">{card.setName ?? '—'}</td>
              <td className="py-2 pr-4 text-neutral-500">{card.localNumber ?? '—'}</td>
              <td className="py-2 pr-4">
                {/* Story 37: reuses the same acquisition mutation and
                    optimistic-update/rollback behavior introduced by story
                    36 (`toggleCardAcquired`/`pendingCardAcquiredToggleIds`,
                    threaded down from `page.tsx`), and the same icon-swap
                    button styling used on the layout tab's `CardTile`,
                    rather than a second card-list-specific control. */}
                <button
                  type="button"
                  disabled={isTogglePending}
                  onClick={() => onToggleAcquired(card.id)}
                  aria-label={
                    card.acquired
                      ? `Mark ${card.name} as unacquired`
                      : `Mark ${card.name} as acquired`
                  }
                  title={card.acquired ? 'Mark as unacquired' : 'Mark as acquired'}
                  className="flex size-6 cursor-pointer items-center justify-center rounded-standard text-neutral-100 hover:bg-neutral-700 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {card.acquired ? (
                    <CircleCheck
                      className="size-4 fill-secondary text-background"
                      aria-hidden="true"
                    />
                  ) : (
                    <Circle className="size-4" aria-hidden="true" />
                  )}
                </button>
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
