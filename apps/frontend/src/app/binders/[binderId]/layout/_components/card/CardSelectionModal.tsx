'use client';

import {
  CARD_SEARCH_DEBOUNCE_MS,
  CARD_SEARCH_MIN_QUERY_LENGTH,
} from '@binder-project-planner/shared';
import { zodResolver } from '@hookform/resolvers/zod';
import { useVirtualizer } from '@tanstack/react-virtual';
import { ArrowLeft, Check, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useForm } from 'react-hook-form';

import { resolveCardImageUrl, searchCardCatalog, type TcgDexCatalogCard } from '@/lib/api';
import {
  LoadingIndicator,
  toProblemDetailsInfo,
  useDelayedLoading,
  useToastContext,
} from '@/shared/feedback';
import { VariationCombobox } from '@/shared/forms';

import { useBinderRouteContext, type CustomCardFormValues } from '../../../BinderRouteContext';
import { ManualCardForm } from './ManualCardForm';
import {
  defaultManualCardFormValues,
  manualCardSchema,
  type ManualCardFormValues,
} from './manualCardSchema';

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

// Remembers the results list's scroll offset alongside `lastSearchQuery`
// above, for the same reason (the modal fully unmounts on close, so
// component state can't survive a reopen) - lets a reopened modal restore
// the user's previous scroll position instead of resetting to the top.
let lastScrollOffset = 0;

// The selectors `focusableSelector` below considers tabbable, for the
// modal's own focus trap (styling.instructions.md requires interactive
// components to be fully custom-built, including dialog focus trapping).
const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

// The custom card-selection modal (stories 11 and 12): searches the TCGdex
// catalog through a debounced, cancellable search box and lets the user
// pick one result, or switches to a manual-entry view for a custom card -
// either way assigning the result to the binder slot that opened it.
// Rendered by `BinderLayoutView` only while a slot is selected; unmounting
// it (on close or successful selection) is what restores focus to the
// triggering slot button below.
export function CardSelectionModal({
  onClose,
  initialTarget,
  onAddCards,
  onAddMoreCards,
  onSubmitCustomCard,
  onSubmitCustomCardAddMore,
  isBulkAddPending,
  initialManualEntry,
  initialSelectionRestore,
}: {
  onClose: () => void;
  // The slot (or unplaced-panel target) this modal session originally
  // opened for (stories 11, 15). This modal - not its caller - owns the
  // "only the session's first submission may use this target" rule (story
  // 17: "every later submission in the same session adds to the unplaced
  // section, even if the first submission's slot placement failed"), via
  // `hasSubmittedRef` below, since that rule spans both the search view's
  // Add Card/Add More and the manual-entry view's Add Card/Add More.
  initialTarget: { physicalPage: number | null; row: number | null; column: number | null };
  // Called with the full checkbox selection on "Add Card" (stories 17/18,
  // replacing the old single-card `onSelectCard`) - the caller
  // (BinderLayoutView, via the route context's `assignCards`) owns the
  // optimistic-update/request lifecycle and closes this modal right away,
  // so this fires-and-forgets rather than awaiting settlement.
  // `targetPlacement` is this session's resolved target (see
  // `initialTarget` above), already `null` if this is a later submission
  // in the session. `variation` (story 16) is the trimmed value of this
  // modal's shared variation field, or `null` if left blank.
  onAddCards: (
    cards: TcgDexCatalogCard[],
    variation: string | null,
    targetPlacement: { physicalPage: number; row: number; column: number } | null,
  ) => void;
  // Called with the full checkbox selection on "Add More" (story 18) -
  // unlike `onAddCards`, this modal awaits the returned promise so it can
  // decide whether to clear its own query/results/selection/variation
  // (only on complete success) or retain them for correction (on any
  // failure), and keeps this session open rather than closing it.
  onAddMoreCards: (
    cards: TcgDexCatalogCard[],
    variation: string | null,
    targetPlacement: { physicalPage: number; row: number; column: number } | null,
  ) => Promise<boolean>;
  // Called with the manual-entry form's values, selected file, and this
  // session's resolved target on "Add Card" (story 12) - like
  // `onAddCards`, the caller owns the lifecycle from here and this modal
  // closes right away.
  onSubmitCustomCard: (
    values: CustomCardFormValues,
    file: File,
    targetPlacement: { physicalPage: number; row: number; column: number } | null,
  ) => void;
  // The manual-entry view's own "Add More" (story 18), mirroring
  // `onAddMoreCards`: awaited so the form only clears (and its file input
  // resets) on success, keeping the entered values/file for correction on
  // failure.
  onSubmitCustomCardAddMore: (
    values: CustomCardFormValues,
    file: File,
    targetPlacement: { physicalPage: number; row: number; column: number } | null,
  ) => Promise<boolean>;
  // True while a bulk card-add request is in flight for this binder
  // (stories 17/18's per-binder overlapping-request guard, mirrored
  // client-side) - disables Select All, every result checkbox, and both
  // Add Card/Add More buttons in the search view until it settles.
  isBulkAddPending: boolean;
  // Set only when this modal is being reopened to let the user correct a
  // custom card whose submission just failed (story 12): seeds the
  // manual-entry view (rather than the search view) with the previously
  // entered text values and selected file, instead of starting blank.
  initialManualEntry?: { values: CustomCardFormValues; file: File };
  // Set only when this modal is being reopened after an Add-Card TCGdex
  // submission had a failed card (story 17): seeds the search view's
  // selection and shared variation field from the failed attempt, so the
  // user can correct/retry just the cards that failed rather than losing
  // the whole batch. The failed cards' own data isn't re-seeded into
  // `results` directly - the existing remembered-query search effect below
  // re-fetches the same results these selections came from, and this
  // restore's ids simply arrive pre-checked among them.
  initialSelectionRestore?: { cards: TcgDexCatalogCard[]; variation: string | null };
}) {
  const { markFailed, dismiss } = useToastContext();
  // Story 41's language toggle lives in the route context (rather than as
  // local state) so it survives this modal's own mount/unmount cycle within
  // the same binder visit. The TCG Pocket inclusion toggle lives there for
  // the same reason.
  const { cardSearchLanguage, setCardSearchLanguage, includeTcgPocket, setIncludeTcgPocket } =
    useBinderRouteContext();

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
  // Stories 17/18: a set of `providerCardId`s (rather than a single
  // selected card) - checkbox multi-select replaces story 11's exclusive
  // single-select. Seeded from `initialSelectionRestore` (if this modal is
  // reopening after a failed Add-Card submission) so the failed cards
  // arrive pre-checked once the remembered-query search effect below
  // re-fetches them.
  const [selectedIds, setSelectedIds] = useState<Set<string>>(
    () => new Set((initialSelectionRestore?.cards ?? []).map((card) => card.providerCardId)),
  );
  // Story 16: a single shared field for the selected/created card's
  // variation, used by both the search view (TCGdex selection) and the
  // manual-entry view - the story's acceptance criteria describe one
  // variation field on the add-card modal, not two per-view ones. Local
  // `useState` (not React Hook Form-managed like the manual form's other
  // fields) since it applies identically regardless of which view is
  // showing.
  const [variation, setVariation] = useState(
    initialManualEntry?.values.variation ?? initialSelectionRestore?.variation ?? '',
  );
  // Story 18's Add-More flow: tracked locally (rather than through the
  // shared `isBulkAddPending` context flag) so an Add-More submission
  // disables this modal's own controls while awaited, independent of
  // whatever other pending state the binder context tracks.
  const [isAddMoreSubmitting, setIsAddMoreSubmitting] = useState(false);
  // Mirrors `isAddMoreSubmitting` for the manual-entry view's own Add More
  // (story 18) - a separate flag since the two views' submissions are
  // mutually exclusive but not the same request type.
  const [isCustomAddMoreSubmitting, setIsCustomAddMoreSubmitting] = useState(false);
  // Story 17's session-scoped slot-consumption tracking: `true` once any
  // submission (Add Card or Add More, from either view) has been made in
  // this modal session, regardless of outcome - every later submission
  // targets the unplaced section instead of `initialTarget`, even if the
  // very first submission's own slot placement ultimately failed. A ref
  // (not state) since it's read only inside event handlers, never
  // rendered.
  const hasSubmittedRef = useRef(false);

  // Story 12's manual-entry view: replaces the search content in place
  // (never a nested modal) rather than being a separate component
  // instance, so switching back to search (the Back action) preserves the
  // query/results state above instead of losing it to an unmount.
  // Defaults to the manual view, pre-filled, only when this modal is being
  // reopened to correct a failed custom-card submission.
  const [viewMode, setViewMode] = useState<'search' | 'manual'>(
    initialManualEntry ? 'manual' : 'search',
  );
  const [customCardFile, setCustomCardFile] = useState<File | null>(
    initialManualEntry?.file ?? null,
  );
  // Shown only after a submit attempt without a file selected yet
  // (planning.md: "An image is required before a custom card can be
  // added").
  const [fileError, setFileError] = useState<string | undefined>(undefined);
  const manualForm = useForm<ManualCardFormValues>({
    resolver: zodResolver(manualCardSchema),
    defaultValues: initialManualEntry
      ? {
          name: initialManualEntry.values.name,
          setName: initialManualEntry.values.setName ?? '',
          localNumber: initialManualEntry.values.localNumber ?? '',
        }
      : defaultManualCardFormValues,
  });

  // A local object-URL preview of the selected file (decoupled from the
  // separate object URL the route context creates for the optimistic
  // card's `imageUrl` once submitted) - created whenever `customCardFile`
  // changes and revoked on the next change or on unmount, so this modal's
  // own preview never leaks a blob URL.
  const [customCardPreviewUrl, setCustomCardPreviewUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!customCardFile) {
      setCustomCardPreviewUrl(null);
      return;
    }
    const url = URL.createObjectURL(customCardFile);
    setCustomCardPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [customCardFile]);

  const showLoading = useDelayedLoading(isSearching);

  const dialogRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  // The element focused immediately before this modal mounted (the slot
  // button that opened it), restored on unmount so keyboard/screen-reader
  // users land back where they started.
  const previouslyFocusedElementRef = useRef<HTMLElement | null>(null);
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

    searchCardCatalog(trimmed, cardSearchLanguage, includeTcgPocket, controller.signal)
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
    // `cardSearchLanguage`/`includeTcgPocket` in the dependency array is
    // what satisfies planning.md's "changing either toggle immediately
    // re-searches the current trimmed query... without waiting for
    // CARD_SEARCH_DEBOUNCE_MS" - a toggle flip re-runs this effect using
    // whatever `debouncedQuery` already holds, rather than waiting for a new
    // debounce cycle.
  }, [debouncedQuery, cardSearchLanguage, includeTcgPocket, markFailed, dismiss]);

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

  // Resolves this session's target placement for the *next* submission
  // (story 17): the original `initialTarget` only for the session's first
  // submission (whichever view/button makes it), `null` (unplaced) for
  // every later one - see `hasSubmittedRef`'s own doc comment above.
  function resolveTargetPlacement(): {
    physicalPage: number;
    row: number;
    column: number;
  } | null {
    if (hasSubmittedRef.current) return null;
    if (initialTarget.physicalPage === null) return null;
    return {
      physicalPage: initialTarget.physicalPage,
      row: initialTarget.row as number,
      column: initialTarget.column as number,
    };
  }

  // The currently checked results, in the same order they're displayed -
  // both `onAddCards`/`onAddMoreCards` calls below and the slot-targeting
  // rule above treat this array's first entry as "the" card eligible for
  // `initialTarget`.
  const selectedResults = results.filter((card) => selectedIds.has(card.providerCardId));

  function toggleSelected(providerCardId: string) {
    setSelectedIds((previous) => {
      const next = new Set(previous);
      if (next.has(providerCardId)) {
        next.delete(providerCardId);
      } else {
        next.add(providerCardId);
      }
      return next;
    });
  }

  // Story 18: toggles between selecting every currently loaded result and
  // clearing the selection entirely, rather than two separate buttons.
  const allResultsSelected =
    results.length > 0 && results.every((card) => selectedIds.has(card.providerCardId));
  function handleToggleSelectAll() {
    setSelectedIds(
      allResultsSelected ? new Set() : new Set(results.map((card) => card.providerCardId)),
    );
  }

  // "Add Card" (stories 17/18): fires-and-forgets the full checkbox
  // selection - the caller closes this modal right away, so there's
  // nothing further for this handler to await.
  function handleAddCards() {
    if (selectedResults.length === 0) return;
    const targetPlacement = resolveTargetPlacement();
    hasSubmittedRef.current = true;
    onAddCards(selectedResults, variation.trim() || null, targetPlacement);
  }

  // "Add More" (story 18): keeps this modal open, awaiting settlement so
  // the query/results/selection/variation only clear on complete success -
  // any failure (partial or complete) leaves them in place for correction,
  // matching planning.md's Add-More acceptance criteria.
  async function handleAddMoreCards() {
    if (selectedResults.length === 0 || isAddMoreSubmitting) return;
    const targetPlacement = resolveTargetPlacement();
    hasSubmittedRef.current = true;
    setIsAddMoreSubmitting(true);
    try {
      const allSucceeded = await onAddMoreCards(
        selectedResults,
        variation.trim() || null,
        targetPlacement,
      );
      if (allSucceeded) {
        setQuery('');
        setDebouncedQuery('');
        setResults([]);
        setHasCompletedSearch(false);
        setSelectedIds(new Set());
        setVariation('');
        searchInputRef.current?.focus();
      }
    } finally {
      setIsAddMoreSubmitting(false);
    }
  }

  // Switches from the search view to the manual-entry view in place
  // (planning.md: "replaces the search content within the existing
  // card-selection modal ... it does not open a nested modal"). The query
  // and results state above are untouched, so the Back action below can
  // restore them exactly.
  function handleSwitchToManual() {
    setViewMode('manual');
  }

  function handleBackToSearch() {
    setViewMode('search');
  }

  function handleCustomCardFileChange(nextFile: File | null) {
    setCustomCardFile(nextFile);
    if (nextFile) setFileError(undefined);
  }

  // Lets the user paste a copied image directly into the manual-entry
  // view's image field (e.g. Cmd/Ctrl+V after copying an image from
  // another app or browser tab), as an alternative to browsing for a file.
  // Attached to the dialog's outer div (rather than one specific input) so
  // it fires regardless of which control inside the modal currently has
  // focus - the paste event still bubbles up to it either way.
  function handlePaste(event: React.ClipboardEvent<HTMLDivElement>) {
    if (viewMode !== 'manual') return;

    const items = event.clipboardData?.items;
    if (!items) return;

    for (const item of items) {
      if (item.kind !== 'file' || !item.type.startsWith('image/')) continue;
      const file = item.getAsFile();
      if (!file) continue;
      // Prevents the browser from also trying to paste the image (or its
      // filename) as text into whichever field happens to be focused.
      event.preventDefault();
      handleCustomCardFileChange(file);
      return;
    }
  }

  // Submits the manual-entry form's "Add Card" (story 12). A file is
  // required independently of the RHF/Zod-validated text fields (see
  // `manualCardSchema.ts`'s comment), so it's checked here rather than
  // through the form's own validation.
  const handleManualSubmit = manualForm.handleSubmit((values) => {
    if (!customCardFile) {
      setFileError('An image is required.');
      return;
    }
    const targetPlacement = resolveTargetPlacement();
    hasSubmittedRef.current = true;
    onSubmitCustomCard(
      {
        name: values.name,
        setName: values.setName.trim() || null,
        localNumber: values.localNumber.trim() || null,
        variation: variation.trim() || null,
      },
      customCardFile,
      targetPlacement,
    );
  });

  // The manual-entry view's own "Add More" (story 18), mirroring
  // `handleAddMoreCards`: awaited so the form (and its selected file) only
  // clears on complete success, keeping everything in place for
  // correction on failure.
  const handleManualAddMore = manualForm.handleSubmit(async (values) => {
    if (!customCardFile) {
      setFileError('An image is required.');
      return;
    }
    if (isCustomAddMoreSubmitting) return;
    const targetPlacement = resolveTargetPlacement();
    hasSubmittedRef.current = true;
    setIsCustomAddMoreSubmitting(true);
    try {
      const succeeded = await onSubmitCustomCardAddMore(
        {
          name: values.name,
          setName: values.setName.trim() || null,
          localNumber: values.localNumber.trim() || null,
          variation: variation.trim() || null,
        },
        customCardFile,
        targetPlacement,
      );
      if (succeeded) {
        manualForm.reset(defaultManualCardFormValues);
        setCustomCardFile(null);
        setVariation('');
        setFileError(undefined);
      }
    } finally {
      setIsCustomAddMoreSubmitting(false);
    }
  });

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
        onPaste={handlePaste}
        className="flex h-full max-h-[52rem] w-full max-w-5xl flex-col gap-4 rounded-standard bg-surface p-6 shadow-modal"
      >
        {/* A 3-column grid (rather than `justify-between`) so the heading
            can be truly centered on the modal instead of centered only in
            the leftover space next to the close button. The empty first
            column mirrors the close button's width, keeping the heading
            centered. */}
        <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-4">
          <span aria-hidden="true" />
          <h2 id="card-selection-modal-title" className="text-center">
            {viewMode === 'search' ? 'Add a card' : 'Add a custom card'}
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

        {viewMode === 'search' ? (
          <>
            <div className="flex items-center gap-4">
              <input
                ref={searchInputRef}
                type="text"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search for a card by name…"
                aria-label="Search for a card by name"
                className="flex-1 rounded-standard border border-transparent bg-neutral-800 px-3 py-2 focus:border-primary focus:outline-none"
              />

              {/* Story 41's language toggle: matches the Michi-indicator
              checkbox convention (styling.instructions.md's "Forms &
              inputs" section). Defaults to English (`cardSearchLanguage`
              starts at `CARD_SEARCH_LANGUAGE_DEFAULT`); checking it
              switches to searching TCGdex's Japanese catalog. */}
              <label
                htmlFor="card-search-language-toggle"
                className="flex shrink-0 items-center gap-2"
              >
                <span className="relative inline-flex size-5 shrink-0 items-center justify-center">
                  <input
                    id="card-search-language-toggle"
                    type="checkbox"
                    checked={cardSearchLanguage === 'ja'}
                    onChange={(event) => setCardSearchLanguage(event.target.checked ? 'ja' : 'en')}
                    className="peer size-5 appearance-none rounded-standard border border-neutral-500 bg-neutral-800 checked:border-primary checked:bg-primary"
                  />
                  <Check className="pointer-events-none absolute size-4 text-background opacity-0 peer-checked:opacity-100" />
                </span>
                <span className="text-caption text-neutral-500">Japanese</span>
              </label>

              {/* Story 41's TCG Pocket inclusion toggle: same checkbox
              convention as the language toggle above. Defaults to excluded
              (`includeTcgPocket` starts at
              `CARD_SEARCH_INCLUDE_TCG_POCKET_DEFAULT`); checking it
              includes Pokémon TCG Pocket cards in results. */}
              <label
                htmlFor="card-search-include-tcg-pocket-toggle"
                className="flex shrink-0 items-center gap-2"
              >
                <span className="relative inline-flex size-5 shrink-0 items-center justify-center">
                  <input
                    id="card-search-include-tcg-pocket-toggle"
                    type="checkbox"
                    checked={includeTcgPocket}
                    onChange={(event) => setIncludeTcgPocket(event.target.checked)}
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
                No Japanese translation was found for “{debouncedQuery.trim()}”; showing results for
                the entered text instead.
              </p>
            )}

            {/* Stories 17/18: Select All/Deselect All plus a running
            selection count, replacing story 11's single-select. Disabled
            whenever there are no loaded results to select, or while a bulk
            request for this binder is already in flight. */}
            <div className="flex items-center justify-between gap-2">
              <button
                type="button"
                onClick={handleToggleSelectAll}
                disabled={results.length === 0 || isBulkAddPending || isAddMoreSubmitting}
                className="cursor-pointer rounded-standard px-2 py-1 font-bold text-primary hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {allResultsSelected ? 'Deselect All' : 'Select All'}
              </button>
              <span className="text-caption text-neutral-500">{selectedIds.size} selected</span>
            </div>

            <div
              ref={scrollContainerRef}
              onScroll={(event) => {
                lastScrollOffset = event.currentTarget.scrollTop;
              }}
              className="min-h-0 flex-1 overflow-y-auto"
            >
              {showLoading ? (
                <LoadingIndicator label="Searching for cards…" size="8" />
              ) : hasCompletedSearch && results.length === 0 ? (
                // Only reached once a qualifying search has actually completed
                // successfully with zero matches (see `hasCompletedSearch`
                // above) - never shown for the modal's initial empty state or
                // while a search is still loading.
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
                        gridTemplateColumns: `repeat(${RESULTS_PER_ROW}, 1fr)`,
                      }}
                    >
                      {rows[virtualRow.index].map((card) => {
                        const isSelected = selectedIds.has(card.providerCardId);
                        return (
                          <button
                            key={card.providerCardId}
                            type="button"
                            onClick={() => toggleSelected(card.providerCardId)}
                            disabled={isBulkAddPending || isAddMoreSubmitting}
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
                            // Selection is indicated solely by the border/
                            // background treatment below (stories 17/18) -
                            // no separate checkbox glyph is overlaid on the
                            // tile.
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
          </>
        ) : (
          <div className="min-h-0 flex-1 overflow-y-auto">
            <ManualCardForm
              form={manualForm}
              previewUrl={customCardPreviewUrl}
              fileName={customCardFile?.name ?? null}
              onFileChange={handleCustomCardFileChange}
              fileError={fileError}
              variation={variation}
              onVariationChange={setVariation}
            />
          </div>
        )}

        {/* Story 16's shared variation field: the manual-entry view gets
            its own inline copy in `ManualCardForm`'s Set/Number row
            instead, so this standalone block only renders for the search
            view (see the `variation` state comment above). Label stacked
            above the input, styled like every other form field's label in
            this codebase (e.g. `ManualCardForm`'s `Field` wrapper). */}
        {viewMode === 'search' && (
          <div className="flex max-w-56 flex-col gap-1">
            <label htmlFor="card-variation" className="text-caption text-neutral-500">
              Variation
            </label>
            <VariationCombobox id="card-variation" value={variation} onChange={setVariation} />
          </div>
        )}

        <div className="flex items-center justify-between gap-2">
          {viewMode === 'search' ? (
            // Always available regardless of search/result state
            // (planning.md: "remains available when a TCGdex search
            // returns no matches or fails").
            <button
              type="button"
              onClick={handleSwitchToManual}
              className="cursor-pointer rounded-standard px-4 py-2 font-bold text-neutral-500 hover:brightness-110"
            >
              Add a custom card
            </button>
          ) : (
            <button
              type="button"
              onClick={handleBackToSearch}
              className="flex cursor-pointer items-center gap-1 rounded-standard px-4 py-2 font-bold hover:brightness-110"
            >
              <ArrowLeft className="size-4" aria-hidden="true" />
              Back
            </button>
          )}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onClose}
              className="cursor-pointer rounded-standard px-4 py-2 font-bold hover:brightness-110"
            >
              Cancel
            </button>
            {viewMode === 'search' ? (
              <>
                <button
                  type="button"
                  disabled={selectedResults.length === 0 || isBulkAddPending || isAddMoreSubmitting}
                  onClick={handleAddMoreCards}
                  className="cursor-pointer rounded-standard border border-primary px-4 py-2 font-bold text-primary hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {/* Pluralized once more than one result is checked (stories
                  17/18's multi-select), so the label reflects the actual
                  number of cards the click will submit. */}
                  {selectedResults.length > 1 ? 'Add More Cards' : 'Add More'}
                </button>
                <button
                  type="button"
                  disabled={selectedResults.length === 0 || isBulkAddPending || isAddMoreSubmitting}
                  onClick={handleAddCards}
                  className="cursor-pointer rounded-standard bg-primary px-4 py-2 font-bold hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {selectedResults.length > 1 ? 'Add Cards' : 'Add Card'}
                </button>
              </>
            ) : (
              <>
                <button
                  type="button"
                  disabled={!customCardFile || isCustomAddMoreSubmitting}
                  onClick={handleManualAddMore}
                  className="cursor-pointer rounded-standard border border-primary px-4 py-2 font-bold text-primary hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Add More
                </button>
                <button
                  type="button"
                  disabled={!customCardFile || isCustomAddMoreSubmitting}
                  onClick={handleManualSubmit}
                  className="cursor-pointer rounded-standard bg-primary px-4 py-2 font-bold hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Add Card
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
