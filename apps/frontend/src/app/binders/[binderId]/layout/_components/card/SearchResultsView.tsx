'use client';

import { Check } from 'lucide-react';
import type { RefObject } from 'react';

import { resolveCardImageUrl, type CardSearchLanguage, type TcgDexCatalogCard } from '@/lib/api';
import { LoadingIndicator } from '@/shared/feedback';

import type { useCardCatalogSearch } from './useCardCatalogSearch';

// `CardSelectionModal`'s search view (stories 11, 17, 18, 41): the search
// input and its language/TCG-Pocket toggles, the translation-miss warning,
// the Select All/Deselect All row, and the row-virtualized results grid
// itself. Extracted from `CardSelectionModal` since this is a large,
// purely presentational block driven entirely by props (mostly the return
// value of `useCardCatalogSearch` and `useCardSelectionState`) rather than
// owning any state of its own.
export function SearchResultsView({
  cardSearchLanguage,
  onCardSearchLanguageChange,
  includeTcgPocket,
  onIncludeTcgPocketChange,
  query,
  onQueryChange,
  searchInputRef,
  translationWarning,
  debouncedQuery,
  allResultsSelected,
  onToggleSelectAll,
  selectedCount,
  isSelectAllDisabled,
  scrollContainerRef,
  onScroll,
  showLoading,
  hasCompletedSearch,
  results,
  rowVirtualizer,
  rows,
  selectedIds,
  onToggleSelected,
  onEnterSelectedTile,
  isTileDisabled,
}: {
  cardSearchLanguage: CardSearchLanguage;
  onCardSearchLanguageChange: (language: CardSearchLanguage) => void;
  includeTcgPocket: boolean;
  onIncludeTcgPocketChange: (include: boolean) => void;
  query: string;
  onQueryChange: (query: string) => void;
  searchInputRef: RefObject<HTMLInputElement | null>;
  translationWarning: boolean;
  debouncedQuery: string;
  allResultsSelected: boolean;
  onToggleSelectAll: () => void;
  selectedCount: number;
  isSelectAllDisabled: boolean;
  scrollContainerRef: RefObject<HTMLDivElement | null>;
  onScroll: (event: React.UIEvent<HTMLDivElement>) => void;
  showLoading: boolean;
  hasCompletedSearch: boolean;
  results: TcgDexCatalogCard[];
  rowVirtualizer: ReturnType<typeof useCardCatalogSearch>['rowVirtualizer'];
  rows: TcgDexCatalogCard[][];
  selectedIds: Set<string>;
  onToggleSelected: (providerCardId: string) => void;
  onEnterSelectedTile: () => void;
  isTileDisabled: boolean;
}) {
  return (
    <>
      <div className="flex items-center gap-4">
        <input
          ref={searchInputRef}
          type="text"
          value={query}
          onChange={(event) => onQueryChange(event.target.value)}
          placeholder="Search for a card by name…"
          aria-label="Search for a card by name"
          className="flex-1 rounded-standard border border-transparent bg-neutral-800 px-3 py-2 focus:border-primary focus:outline-none"
        />

        {/* Story 41's language toggle: matches the Michi-indicator
        checkbox convention (styling.instructions.md's "Forms & inputs"
        section). Defaults to English (`cardSearchLanguage` starts at
        `CARD_SEARCH_LANGUAGE_DEFAULT`); checking it switches to searching
        TCGdex's Japanese catalog. */}
        <label htmlFor="card-search-language-toggle" className="flex shrink-0 items-center gap-2">
          <span className="relative inline-flex size-5 shrink-0 items-center justify-center">
            <input
              id="card-search-language-toggle"
              type="checkbox"
              checked={cardSearchLanguage === 'ja'}
              onChange={(event) => onCardSearchLanguageChange(event.target.checked ? 'ja' : 'en')}
              className="peer size-5 appearance-none rounded-standard border border-neutral-500 bg-neutral-800 checked:border-primary checked:bg-primary"
            />
            <Check className="pointer-events-none absolute size-4 text-background opacity-0 peer-checked:opacity-100" />
          </span>
          <span className="text-caption text-neutral-500">Japanese</span>
        </label>

        {/* Story 41's TCG Pocket inclusion toggle: same checkbox
        convention as the language toggle above. Defaults to excluded
        (`includeTcgPocket` starts at
        `CARD_SEARCH_INCLUDE_TCG_POCKET_DEFAULT`); checking it includes
        Pokémon TCG Pocket cards in results. */}
        <label
          htmlFor="card-search-include-tcg-pocket-toggle"
          className="flex shrink-0 items-center gap-2"
        >
          <span className="relative inline-flex size-5 shrink-0 items-center justify-center">
            <input
              id="card-search-include-tcg-pocket-toggle"
              type="checkbox"
              checked={includeTcgPocket}
              onChange={(event) => onIncludeTcgPocketChange(event.target.checked)}
              className="peer size-5 appearance-none rounded-standard border border-neutral-500 bg-neutral-800 checked:border-primary checked:bg-primary"
            />
            <Check className="pointer-events-none absolute size-4 text-background opacity-0 peer-checked:opacity-100" />
          </span>
          <span className="text-caption text-neutral-500">TCG Pocket</span>
        </label>
      </div>

      {/* Nonblocking translation-miss warning (story 41): rendered inline
      per styling.instructions.md's "Non-blocking warnings" guidance,
      never as a toast, and never in place of the results/loading/
      empty-state content below. */}
      {translationWarning && (
        <p className="text-caption text-warning">
          No Japanese translation was found for “{debouncedQuery.trim()}”; showing results for the
          entered text instead.
        </p>
      )}

      {/* Stories 17/18: Select All/Deselect All plus a running selection
      count, replacing story 11's single-select. Disabled whenever there
      are no loaded results to select, or while a bulk request for this
      binder is already in flight. */}
      <div className="flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={onToggleSelectAll}
          disabled={isSelectAllDisabled}
          className="cursor-pointer rounded-standard px-2 py-1 font-bold text-primary hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {allResultsSelected ? 'Deselect All' : 'Select All'}
        </button>
        <span className="text-caption text-neutral-500">{selectedCount} selected</span>
      </div>

      <div ref={scrollContainerRef} onScroll={onScroll} className="min-h-0 flex-1 overflow-y-auto">
        {showLoading ? (
          <LoadingIndicator label="Searching for cards…" size="8" />
        ) : hasCompletedSearch && results.length === 0 ? (
          // Only reached once a qualifying search has actually completed
          // successfully with zero matches (see `hasCompletedSearch` above)
          // - never shown for the modal's initial empty state or while a
          // search is still loading.
          <p className="text-center text-neutral-500">No cards were found.</p>
        ) : (
          <div style={{ height: `${rowVirtualizer.getTotalSize()}px`, position: 'relative' }}>
            {rowVirtualizer.getVirtualItems().map((virtualRow) => (
              <div
                key={virtualRow.key}
                data-index={virtualRow.index}
                // `measureElement` (rather than a fixed `height`) lets the
                // virtualizer read each row's *actual* rendered height via
                // ResizeObserver, so row-to-row spacing always matches the
                // real card content instead of a guessed pixel constant.
                // `pb-3` below supplies the vertical gap itself (there's no
                // row-to-row CSS `gap` between these separately positioned
                // row divs), matching the `gap-3` used for the horizontal
                // gap between cards in the same row.
                ref={rowVirtualizer.measureElement}
                className="absolute top-0 left-0 grid w-full gap-3 pb-3"
                style={{
                  transform: `translateY(${virtualRow.start}px)`,
                  gridTemplateColumns: `repeat(4, 1fr)`,
                }}
              >
                {rows[virtualRow.index].map((card) => {
                  const isSelected = selectedIds.has(card.providerCardId);
                  return (
                    <button
                      key={card.providerCardId}
                      type="button"
                      onClick={() => onToggleSelected(card.providerCardId)}
                      onKeyDown={(event) => {
                        if (event.key !== 'Enter') return;
                        // Once a tile has been selected, Enter should
                        // submit via Add Card (if available) rather than
                        // re-activating this same tile button, which would
                        // otherwise toggle it back off.
                        event.preventDefault();
                        onEnterSelectedTile();
                      }}
                      disabled={isTileDisabled}
                      aria-pressed={isSelected}
                      // `self-start` guards against the grid default
                      // (`stretch`) if a row ever contains cards of
                      // differing content height, so shorter cards hug
                      // their own content rather than stretching to match
                      // the row's tallest item. `min-w-0` overrides the
                      // grid item's default `min-width: auto`, which would
                      // otherwise size the column to fit the truncated
                      // (nowrap) text's full unwrapped width and cause
                      // horizontal overflow/scrolling. Selection is
                      // indicated solely by the border/background
                      // treatment below (stories 17/18) - no separate
                      // checkbox glyph is overlaid on the tile.
                      className={`flex min-w-0 flex-col items-center gap-1 self-start rounded-standard border p-2 text-center hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50 ${
                        isSelected
                          ? 'border-primary bg-neutral-800'
                          : 'border-neutral-700 bg-neutral-800'
                      }`}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element -- an
                      arbitrary provider-hosted image, not eligible for
                      next/image's fixed-domain optimization. */}
                      <img
                        src={resolveCardImageUrl(card.imageUrl)}
                        alt={card.name}
                        loading="lazy"
                        className="h-32 w-24 object-contain"
                      />
                      {/* `min-w-0` on the name lets it truncate instead of
                      forcing the row wider, while the local-number span
                      uses `shrink-0` so it's never itself truncated
                      away. */}
                      <span className="flex w-full min-w-0 items-baseline justify-center gap-1">
                        <span className="min-w-0 truncate text-caption">{card.name}</span>
                        {card.localNumber && (
                          <span className="shrink-0 text-caption text-neutral-500">
                            #{card.localNumber}
                          </span>
                        )}
                      </span>
                      {card.setName && (
                        <span className="w-full truncate text-caption text-neutral-500">
                          {card.setName}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  );
}
