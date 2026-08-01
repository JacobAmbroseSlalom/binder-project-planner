'use client';

import {
  CARD_SEARCH_DEBOUNCE_MS,
  CARD_SEARCH_MIN_QUERY_LENGTH,
} from '@binder-project-planner/shared';
import { useVirtualizer } from '@tanstack/react-virtual';
import { X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';

import { resolveCardImageUrl, searchCardCatalog, type TcgDexCatalogCard } from '@/lib/api';
import {
  LoadingIndicator,
  toProblemDetailsInfo,
  useDelayedLoading,
  useToastContext,
} from '@/shared/feedback';

// The number of results per virtualized row. Not a shared/application
// default (per coding-conventions.instructions.md, `defaults.ts` only holds
// application-owned values) - it's purely a presentation detail of this
// modal's own grid.
const RESULTS_PER_ROW = 4;

// Only an initial guess for the virtualizer's scrollbar/offset math before
// a row has actually been measured (see `measureElement` below) - actual
// row heights are measured from real rendered content, so this no longer
// needs to precisely match the card's content height.
const ESTIMATED_RESULT_ROW_HEIGHT_PX = 190;

// Fixed toast id for search failures (story 11), matching the pattern
// established elsewhere (e.g. `OPEN_BINDER_TOAST_ID`): a later attempt
// replaces this operation's own toast rather than stacking a new one.
const CARD_SEARCH_TOAST_ID = 'card-catalog-search';

// Remembers the last-typed search query across the modal's mount/unmount
// lifecycle - the modal fully unmounts on close (see the component comment
// below), so component state alone can't survive a reopen. A module-level
// variable is enough here since only one instance of this modal is ever
// open at a time; it naturally resets on a full page reload, which is an
// acceptable scope for "remember the last search".
let lastSearchQuery = '';

// The selectors `focusableSelector` below considers tabbable, for the
// modal's own focus trap (styling.instructions.md requires interactive
// components to be fully custom-built, including dialog focus trapping).
const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

// The custom card-selection modal (story 11): searches the TCGdex catalog
// through a debounced, cancellable search box, and lets the user pick one
// result to assign to the binder slot that opened it. Rendered by
// `BinderLayoutView` only while a slot is selected; unmounting it (on close
// or successful selection) is what restores focus to the triggering slot
// button below.
export function CardSelectionModal({
  onClose,
  onSelectCard,
}: {
  onClose: () => void;
  // Called with the chosen catalog card immediately on "Add Card" - the
  // caller (BinderLayoutView, via the route context's `assignCard`) owns
  // the actual optimistic-update/request lifecycle from that point on, so
  // this modal closes right away rather than waiting on the assignment.
  onSelectCard: (card: TcgDexCatalogCard) => void;
}) {
  const { markFailed, dismiss } = useToastContext();

  // Both seeded from the remembered last query (rather than empty) so a
  // reopened modal shows and re-searches the previous query right away
  // instead of waiting out the debounce delay.
  const [query, setQuery] = useState(lastSearchQuery);
  const [debouncedQuery, setDebouncedQuery] = useState(lastSearchQuery);
  const [results, setResults] = useState<TcgDexCatalogCard[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [selectedCard, setSelectedCard] = useState<TcgDexCatalogCard | null>(null);

  const showLoading = useDelayedLoading(isSearching);

  const dialogRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  // The element focused immediately before this modal mounted (the slot
  // button that opened it), restored on unmount so keyboard/screen-reader
  // users land back where they started.
  const previouslyFocusedElementRef = useRef<HTMLElement | null>(null);

  // Focuses the search input on mount and restores focus to the triggering
  // element on unmount (close or selection), per the story's dialog
  // accessibility requirements. `select()` (rather than just `focus()`)
  // highlights any remembered query text, so if the user immediately starts
  // typing it overwrites the previous search instead of being inserted into
  // it.
  useEffect(() => {
    previouslyFocusedElementRef.current = document.activeElement as HTMLElement | null;
    searchInputRef.current?.focus();
    searchInputRef.current?.select();
    return () => {
      previouslyFocusedElementRef.current?.focus();
    };
  }, []);

  // Keeps the module-level `lastSearchQuery` in sync so the next time this
  // modal is opened, it can seed itself from the most recent query.
  useEffect(() => {
    lastSearchQuery = query;
  }, [query]);

  // Debounces the raw query text into `debouncedQuery`, which the search
  // effect below actually acts on - so fast typing never fires a request
  // per keystroke.
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(query), CARD_SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [query]);

  // Runs the actual search once the debounced query reaches the configured
  // minimum length; a shorter (including empty) query just clears any
  // previous results rather than searching. Cancels a still-in-flight
  // search via `AbortController` as soon as a newer query supersedes it.
  useEffect(() => {
    const trimmed = debouncedQuery.trim();
    if (trimmed.length < CARD_SEARCH_MIN_QUERY_LENGTH) {
      setResults([]);
      setIsSearching(false);
      return;
    }

    const controller = new AbortController();
    setIsSearching(true);

    searchCardCatalog(trimmed, controller.signal)
      .then((catalogCards) => {
        setResults(catalogCards);
        setIsSearching(false);
        dismiss(CARD_SEARCH_TOAST_ID);
      })
      .catch((error) => {
        if (controller.signal.aborted) return;
        setIsSearching(false);
        markFailed(CARD_SEARCH_TOAST_ID, toProblemDetailsInfo(error));
      });

    return () => {
      controller.abort();
    };
  }, [debouncedQuery, markFailed, dismiss]);

  // Chunks the flat results list into fixed-size rows for the virtualizer,
  // which measures whole rows rather than individual cards.
  const rows = useMemo(() => {
    const chunked: TcgDexCatalogCard[][] = [];
    for (let index = 0; index < results.length; index += RESULTS_PER_ROW) {
      chunked.push(results.slice(index, index + RESULTS_PER_ROW));
    }
    return chunked;
  }, [results]);

  const rowVirtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollContainerRef.current,
    estimateSize: () => ESTIMATED_RESULT_ROW_HEIGHT_PX,
    overscan: 3,
  });

  // Escape closes the modal; Tab/Shift+Tab is trapped within the dialog so
  // focus never escapes to the page behind the backdrop.
  function handleKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    if (event.key === 'Escape') {
      event.stopPropagation();
      onClose();
      return;
    }

    if (event.key !== 'Tab') return;

    const container = dialogRef.current;
    if (!container) return;

    const focusable = Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR));
    if (focusable.length === 0) return;

    const first = focusable[0];
    const last = focusable[focusable.length - 1];

    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  function handleAddCard() {
    if (!selectedCard) return;
    onSelectCard(selectedCard);
  }

  return (
    // The dimmed backdrop (styling.instructions.md's "Elevation & surfaces"
    // section): clicking it closes the modal, but clicking the panel itself
    // must not (the inner `stopPropagation` below).
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-8"
      onClick={onClose}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="card-selection-modal-title"
        onClick={(event) => event.stopPropagation()}
        onKeyDown={handleKeyDown}
        className="flex h-full max-h-[40rem] w-full max-w-3xl flex-col gap-4 rounded-standard bg-surface p-6 shadow-modal"
      >
        {/* A 3-column grid (rather than `justify-between`) so the heading
            can be truly centered on the modal instead of centered only in
            the leftover space next to the close button. The empty first
            column mirrors the close button's width, keeping the heading
            centered. */}
        <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-4">
          <span aria-hidden="true" />
          <h2 id="card-selection-modal-title" className="text-center">
            Add a card
          </h2>
          <button
            type="button"
            aria-label="Close"
            onClick={onClose}
            className="cursor-pointer justify-self-end rounded-full p-1 hover:brightness-110"
          >
            <X className="size-5" aria-hidden="true" />
          </button>
        </div>

        <input
          ref={searchInputRef}
          type="text"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search for a card by name…"
          aria-label="Search for a card by name"
          className="rounded-standard border border-transparent bg-neutral-800 px-3 py-2 focus:border-primary focus:outline-none"
        />

        <div ref={scrollContainerRef} className="min-h-0 flex-1 overflow-y-auto">
          {showLoading ? (
            <LoadingIndicator label="Searching for cards…" size="8" />
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
                    gridTemplateColumns: `repeat(${RESULTS_PER_ROW}, 1fr)`,
                  }}
                >
                  {rows[virtualRow.index].map((card) => {
                    const isSelected = selectedCard?.providerCardId === card.providerCardId;
                    return (
                      <button
                        key={card.providerCardId}
                        type="button"
                        onClick={() => setSelectedCard(card)}
                        aria-pressed={isSelected}
                        // `self-start` guards against the grid default
                        // (`stretch`) if a row ever contains cards of
                        // differing content height, so shorter cards hug
                        // their own content rather than stretching to match
                        // the row's tallest item. `min-w-0` overrides the
                        // grid item's default `min-width: auto`, which
                        // would otherwise size the column to fit the
                        // truncated (nowrap) text's full unwrapped width
                        // and cause horizontal overflow/scrolling.
                        className={`flex min-w-0 flex-col items-center gap-1 self-start rounded-standard border p-2 text-center hover:brightness-110 ${
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
                            forcing the row wider, while the local-number
                            span uses `shrink-0` so it's never itself
                            truncated away. */}
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

        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="cursor-pointer rounded-standard px-4 py-2 font-bold hover:brightness-110"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={!selectedCard}
            onClick={handleAddCard}
            className="cursor-pointer rounded-standard bg-primary px-4 py-2 font-bold hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Add Card
          </button>
        </div>
      </div>
    </div>
  );
}
