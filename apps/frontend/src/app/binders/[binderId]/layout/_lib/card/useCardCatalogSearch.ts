'use client';

import {
  CARD_SEARCH_DEBOUNCE_MS,
  CARD_SEARCH_MIN_QUERY_LENGTH,
} from '@binder-project-planner/shared';
import { useVirtualizer } from '@tanstack/react-virtual';
import { useEffect, useMemo, useRef, useState, type UIEvent } from 'react';

import {
  searchCardCatalog,
  type CardSearchLanguage,
  type CardSearchProvider,
  type TcgDexCatalogCard,
} from '@/lib/api';
import { toProblemDetailsInfo, useDelayedLoading, useToastContext } from '@/shared/feedback';

// The number of results per virtualized row. Not a shared/application
// default (per coding-conventions.instructions.md, `defaults.ts` only holds
// application-owned values) - it's purely a presentation detail of this
// modal's own grid.
const RESULTS_PER_ROW = 4;

// Only an initial guess for the virtualizer's scrollbar/offset math before
// a row has actually been measured (see `measureElement` in
// `SearchResultsView`) - actual row heights are measured from real
// rendered content, so this no longer needs to precisely match the card's
// content height.
const ESTIMATED_RESULT_ROW_HEIGHT_PX = 190;

// Fixed toast id for search failures (story 11), matching the pattern
// established elsewhere (e.g. `OPEN_BINDER_TOAST_ID`): a later attempt
// replaces this operation's own toast rather than stacking a new one.
const CARD_SEARCH_TOAST_ID = 'card-catalog-search';

// Remembers the last-typed search query across `CardSelectionModal`'s
// mount/unmount lifecycle - the modal fully unmounts on close, so
// component state alone can't survive a reopen. A module-level variable is
// enough here since only one instance of this modal is ever open at a
// time; it naturally resets on a full page reload, which is an acceptable
// scope for "remember the last search".
let lastSearchQuery = '';

// Remembers the results list's scroll offset alongside `lastSearchQuery`
// above, for the same reason (the modal fully unmounts on close, so
// component state can't survive a reopen) - lets a reopened modal restore
// the user's previous scroll position instead of resetting to the top.
let lastScrollOffset = 0;

// Owns `CardSelectionModal`'s TCGdex catalog search (stories 11, 17, 18,
// 41): the debounced/cancellable search request itself, the remembered
// query/scroll-offset restore across a reopened modal, and the
// row-virtualized results grid's chunking/measurement. Extracted from
// `CardSelectionModal` since this search machinery is a large,
// self-contained concern independent of the rest of that component's
// state (selection, manual entry, submission).
export function useCardCatalogSearch({
  cardSearchProvider,
  cardSearchLanguage,
  includeTcgPocket,
}: {
  cardSearchProvider: CardSearchProvider;
  cardSearchLanguage: CardSearchLanguage;
  includeTcgPocket: boolean;
}) {
  const { markFailed, dismiss } = useToastContext();

  // Both seeded from the remembered last query (rather than empty) so a
  // reopened modal shows and re-searches the previous query right away
  // instead of waiting out the debounce delay.
  const [query, setQuery] = useState(lastSearchQuery);
  const [debouncedQuery, setDebouncedQuery] = useState(lastSearchQuery);
  const [results, setResults] = useState<TcgDexCatalogCard[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  // Set only when a `language=ja` search's PokéAPI translation attempt
  // missed and TCGdex was searched using the original entered text instead
  // (story 41) - rendered as a nonblocking inline warning, never the shared
  // failed toast.
  const [translationWarning, setTranslationWarning] = useState(false);
  // Tracks whether the *current* qualifying query has a completed,
  // successful search behind it - distinct from `results.length === 0`,
  // which is also true before any search has ever run. Gates the no-results
  // message (planning.md story 11: "it is not shown before the first
  // qualifying search or while a search is loading") so an empty initial
  // state or an empty in-flight state never renders it.
  const [hasCompletedSearch, setHasCompletedSearch] = useState(false);

  const showLoading = useDelayedLoading(isSearching);

  const scrollContainerRef = useRef<HTMLDivElement>(null);
  // Guards the scroll-restore effect below so it only ever applies once per
  // mount, rather than re-snapping the list back on every later results
  // update.
  const hasRestoredScrollRef = useRef(false);
  // Captured once at mount: the scroll-restore effect below only restores
  // `lastScrollOffset` while the query is still this remembered initial
  // one. If the user starts a new search before the old results repopulate,
  // restoring the old offset against the new (unrelated) results would be
  // confusing, so restoring is skipped instead.
  const initialQueryRef = useRef(query);

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
      setHasCompletedSearch(false);
      setTranslationWarning(false);
      return;
    }

    const controller = new AbortController();
    setIsSearching(true);
    // Cleared immediately (rather than only on success) so a query change
    // can never leave a stale no-results message visible during the gap
    // before `showLoading` itself flips true.
    setHasCompletedSearch(false);

    searchCardCatalog(
      trimmed,
      cardSearchProvider,
      cardSearchLanguage,
      includeTcgPocket,
      controller.signal,
    )
      .then(({ results: catalogCards, translationWarning: missedTranslation }) => {
        setResults(catalogCards);
        setTranslationWarning(missedTranslation);
        setIsSearching(false);
        setHasCompletedSearch(true);
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
    // `cardSearchProvider`/`cardSearchLanguage`/`includeTcgPocket` in the
    // dependency array is what satisfies planning.md's "changing either
    // toggle immediately re-searches the current trimmed query... without
    // waiting for CARD_SEARCH_DEBOUNCE_MS" - a toggle flip (or a source
    // switch, story 43) re-runs this effect using whatever `debouncedQuery`
    // already holds, rather than waiting for a new debounce cycle.
  }, [
    debouncedQuery,
    cardSearchProvider,
    cardSearchLanguage,
    includeTcgPocket,
    markFailed,
    dismiss,
  ]);

  // Chunks the flat results list into fixed-size rows for the virtualizer,
  // which measures whole rows rather than individual cards.
  const rows = useMemo(() => {
    const chunked: TcgDexCatalogCard[][] = [];
    for (let index = 0; index < results.length; index += RESULTS_PER_ROW) {
      chunked.push(results.slice(index, index + RESULTS_PER_ROW));
    }
    return chunked;
  }, [results]);

  // Accepted lint warning (story 48): TanStack Virtual's `useVirtualizer()`
  // returns functions that aren't safely memoizable, so the React Compiler
  // reports `react-hooks/incompatible-library` and skips optimizing this
  // hook. There's no library-side fix available, and the hook works
  // correctly unoptimized, so this warning is intentionally accepted.
  const rowVirtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollContainerRef.current,
    estimateSize: () => ESTIMATED_RESULT_ROW_HEIGHT_PX,
    overscan: 3,
  });

  // Restores the previous scroll offset once the reopened modal's results
  // have repopulated - restoring before any rows exist would just clamp
  // back to 0, so this waits for `rows` to actually contain something, then
  // only ever fires once per mount (see `hasRestoredScrollRef` above).
  useEffect(() => {
    if (hasRestoredScrollRef.current) return;
    if (query !== initialQueryRef.current) {
      // The user has already changed the search since this modal opened;
      // give up on restoring rather than applying a stale offset later.
      hasRestoredScrollRef.current = true;
      return;
    }
    if (rows.length === 0) return;

    hasRestoredScrollRef.current = true;
    scrollContainerRef.current?.scrollTo({ top: lastScrollOffset });
  }, [rows.length, query]);

  // Records the results list's live scroll offset into the module-level
  // remembered value above, for the next time this modal is reopened.
  function handleScroll(event: UIEvent<HTMLDivElement>) {
    lastScrollOffset = event.currentTarget.scrollTop;
  }

  // Clears the query/results immediately (story 18's Add-More success
  // path) rather than letting the debounce/search effects above catch up
  // on their own - an immediate reset is what makes the results list
  // disappear right away instead of lingering for
  // `CARD_SEARCH_DEBOUNCE_MS`.
  function resetSearch() {
    setQuery('');
    setDebouncedQuery('');
    setResults([]);
    setHasCompletedSearch(false);
  }

  return {
    query,
    setQuery,
    debouncedQuery,
    results,
    translationWarning,
    hasCompletedSearch,
    showLoading,
    rows,
    rowVirtualizer,
    scrollContainerRef,
    handleScroll,
    resetSearch,
  };
}
