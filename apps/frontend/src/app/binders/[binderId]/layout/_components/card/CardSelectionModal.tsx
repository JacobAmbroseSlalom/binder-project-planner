'use client';

import { DEFAULT_CARD_ACQUIRED } from '@binder-project-planner/shared';
import { zodResolver } from '@hookform/resolvers/zod';
import { ArrowLeft, Check, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useForm } from 'react-hook-form';

import { type TcgDexCatalogCard } from '@/lib/api';
import { useModalFocusTrap } from '@/shared/hooks/useModalFocusTrap';
import { VariationCombobox } from '@/shared/forms';

import { useBinderRouteContext, type CustomCardFormValues } from '../../../BinderRouteContext';
import { ManualCardForm } from './ManualCardForm';
import {
  defaultManualCardFormValues,
  manualCardSchema,
  type ManualCardFormValues,
} from './manualCardSchema';
import { SearchResultsView } from './SearchResultsView';
import { useCardCatalogSearch } from './useCardCatalogSearch';
import { useCardSelectionState } from './useCardSelectionState';

// The custom card-selection modal (stories 11 and 12): searches the TCGdex
// catalog through a debounced, cancellable search box and lets the user
// pick one result, or switches to a manual-entry view for a custom card -
// either way assigning the result to the binder slot that opened it.
// Rendered by `BinderLayoutView` only while a slot is selected; unmounting
// it (on close or successful selection) is what restores focus to the
// triggering slot button below.
//
// The catalog search/virtualized-results machinery and the checkbox
// multi-select state are each owned by their own extracted hook (see the
// `use*` imports above), and the search view's own large JSX block lives
// in `SearchResultsView` - this component composes them and owns what's
// left: the manual-entry view's form state, the shared variation field,
// this session's target-placement/submission-tracking rules (story 17),
// and the dialog's own focus/keyboard handling.
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
  // modal's shared variation field, or `null` if left blank. `acquired`
  // (story 36) is this modal's shared "Acquired" checkbox value, applied
  // to every card in the selection.
  onAddCards: (
    cards: TcgDexCatalogCard[],
    variation: string | null,
    acquired: boolean,
    targetPlacement: { physicalPage: number; row: number; column: number } | null,
  ) => void;
  // Called with the full checkbox selection on "Add More" (story 18) -
  // unlike `onAddCards`, this modal awaits the returned promise so it can
  // decide whether to clear its own query/results/selection/variation/
  // acquired (only on complete success) or retain them for correction (on
  // any failure), and keeps this session open rather than closing it.
  onAddMoreCards: (
    cards: TcgDexCatalogCard[],
    variation: string | null,
    acquired: boolean,
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
  initialSelectionRestore?: {
    cards: TcgDexCatalogCard[];
    variation: string | null;
    acquired: boolean;
  };
}) {
  // Story 41's language toggle lives in the route context (rather than as
  // local state) so it survives this modal's own mount/unmount cycle within
  // the same binder visit. The TCG Pocket inclusion toggle lives there for
  // the same reason.
  const { cardSearchLanguage, setCardSearchLanguage, includeTcgPocket, setIncludeTcgPocket } =
    useBinderRouteContext();

  // The TCGdex catalog search itself - see `useCardCatalogSearch`.
  const {
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
  } = useCardCatalogSearch({ cardSearchLanguage, includeTcgPocket });

  // The results checkbox multi-select - see `useCardSelectionState`.
  const {
    selectedIds,
    setSelectedIds,
    toggleSelected,
    allResultsSelected,
    handleToggleSelectAll,
    selectedResults,
  } = useCardSelectionState({ results, initialSelectionRestore });

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
  // Story 36: mirrors `variation` above - a single shared "Acquired"
  // checkbox value used by both views, unchecked by default.
  const [acquired, setAcquired] = useState(
    initialManualEntry?.values.acquired ??
      initialSelectionRestore?.acquired ??
      DEFAULT_CARD_ACQUIRED,
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
  // card's `imageUrl` once submitted), so this modal's own preview never
  // leaks a blob URL. `URL.createObjectURL` is a pure, synchronous
  // derivation of `customCardFile`, so it's computed via `useMemo` (not
  // `useEffect` + `useState`) - storing it as effect-driven state would
  // trip React Compiler's `react-hooks/set-state-in-effect` rule, since
  // nothing here is actually waiting on an external async event. A
  // separate cleanup-only effect (no `setState` call of its own) revokes
  // each created url once it's no longer the current one or on unmount.
  const customCardPreviewUrl = useMemo(
    () => (customCardFile ? URL.createObjectURL(customCardFile) : null),
    [customCardFile],
  );
  useEffect(() => {
    return () => {
      if (customCardPreviewUrl) URL.revokeObjectURL(customCardPreviewUrl);
    };
  }, [customCardPreviewUrl]);

  const dialogRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  // The dialog's shared focus-capture/restore-on-unmount lifecycle and
  // Tab-trap - see `useModalFocusTrap`.
  const { handleTabTrap } = useModalFocusTrap(dialogRef);

  // Focuses the search input on mount, per the story's dialog
  // accessibility requirements. `select()` (rather than just `focus()`)
  // highlights any remembered query text, so if the user immediately starts
  // typing it overwrites the previous search instead of being inserted into
  // it.
  useEffect(() => {
    searchInputRef.current?.focus();
    searchInputRef.current?.select();
  }, []);

  // Escape closes the modal; Tab/Shift+Tab is delegated to the shared
  // focus-trap hook so focus never escapes to the page behind the
  // backdrop.
  function handleKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    if (event.key === 'Escape') {
      event.stopPropagation();
      onClose();
      return;
    }

    handleTabTrap(event);
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

  // Shared disabled-state gate for the search view's Add Card action,
  // reused by both the footer button and the result-tile Enter shortcut
  // below so they stay behaviorally aligned.
  const isSearchAddCardDisabled =
    selectedResults.length === 0 || isBulkAddPending || isAddMoreSubmitting;

  // "Add Card" (stories 17/18): fires-and-forgets the full checkbox
  // selection - the caller closes this modal right away, so there's
  // nothing further for this handler to await.
  function handleAddCards() {
    if (selectedResults.length === 0) return;
    const targetPlacement = resolveTargetPlacement();
    hasSubmittedRef.current = true;
    onAddCards(selectedResults, variation.trim() || null, acquired, targetPlacement);
  }

  // "Add More" (story 18): keeps this modal open, awaiting settlement so
  // the query/results/selection/variation/acquired only clear on complete
  // success - any failure (partial or complete) leaves them in place for
  // correction, matching planning.md's Add-More acceptance criteria.
  async function handleAddMoreCards() {
    if (selectedResults.length === 0 || isAddMoreSubmitting) return;
    const targetPlacement = resolveTargetPlacement();
    hasSubmittedRef.current = true;
    setIsAddMoreSubmitting(true);
    try {
      const allSucceeded = await onAddMoreCards(
        selectedResults,
        variation.trim() || null,
        acquired,
        targetPlacement,
      );
      if (allSucceeded) {
        resetSearch();
        setSelectedIds(new Set());
        setVariation('');
        setAcquired(DEFAULT_CARD_ACQUIRED);
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
  // through the form's own validation. `hasSubmittedRef` (read via
  // `resolveTargetPlacement()` and written below) is only ever touched once
  // this callback actually runs, on a real form submission triggered by a
  // click handler - never during render, so the disable below silences a
  // false positive from the compiler's conservative analysis of
  // `react-hook-form`'s `handleSubmit` wrapper.
  // eslint-disable-next-line react-hooks/refs
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
        acquired,
      },
      customCardFile,
      targetPlacement,
    );
  });

  // The manual-entry view's own "Add More" (story 18), mirroring
  // `handleAddMoreCards`: awaited so the form (and its selected file) only
  // clears on complete success, keeping everything in place for
  // correction on failure. See the matching comment on `handleManualSubmit`
  // above; the same false positive applies here.
  // eslint-disable-next-line react-hooks/refs
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
          acquired,
        },
        customCardFile,
        targetPlacement,
      );
      if (succeeded) {
        manualForm.reset(defaultManualCardFormValues);
        setCustomCardFile(null);
        setVariation('');
        setAcquired(DEFAULT_CARD_ACQUIRED);
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
          <SearchResultsView
            cardSearchLanguage={cardSearchLanguage}
            onCardSearchLanguageChange={setCardSearchLanguage}
            includeTcgPocket={includeTcgPocket}
            onIncludeTcgPocketChange={setIncludeTcgPocket}
            query={query}
            onQueryChange={setQuery}
            searchInputRef={searchInputRef}
            translationWarning={translationWarning}
            debouncedQuery={debouncedQuery}
            allResultsSelected={allResultsSelected}
            onToggleSelectAll={handleToggleSelectAll}
            selectedCount={selectedIds.size}
            isSelectAllDisabled={results.length === 0 || isBulkAddPending || isAddMoreSubmitting}
            scrollContainerRef={scrollContainerRef}
            onScroll={handleScroll}
            showLoading={showLoading}
            hasCompletedSearch={hasCompletedSearch}
            results={results}
            rowVirtualizer={rowVirtualizer}
            rows={rows}
            selectedIds={selectedIds}
            onToggleSelected={toggleSelected}
            onEnterSelectedTile={() => {
              if (!isSearchAddCardDisabled) handleAddCards();
            }}
            isTileDisabled={isBulkAddPending || isAddMoreSubmitting}
          />
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
              acquired={acquired}
              onAcquiredChange={setAcquired}
            />
          </div>
        )}

        {/* Story 16's shared variation field: the manual-entry view gets
            its own inline copy in `ManualCardForm`'s Set/Number row
            instead, so this standalone block only renders for the search
            view (see the `variation` state comment above). Label stacked
            above the input, styled like every other form field's label in
            this codebase (e.g. `ManualCardForm`'s `Field` wrapper). Story
            36's shared "Acquired" checkbox joins it here, mirroring
            `ManualCardForm`'s own checkbox+label pair. */}
        {viewMode === 'search' && (
          <div className="flex items-end gap-6">
            <div className="flex max-w-56 flex-col gap-1">
              <label htmlFor="card-variation" className="text-caption text-neutral-500">
                Variation
              </label>
              <VariationCombobox id="card-variation" value={variation} onChange={setVariation} />
            </div>
            <label
              htmlFor="card-acquired"
              className="flex h-[42px] cursor-pointer items-center gap-2"
            >
              <span className="relative inline-flex size-5 shrink-0 items-center justify-center">
                <input
                  id="card-acquired"
                  type="checkbox"
                  checked={acquired}
                  onChange={(event) => setAcquired(event.target.checked)}
                  className="peer size-5 appearance-none rounded-standard border border-neutral-500 bg-neutral-800 checked:border-primary checked:bg-primary"
                />
                <Check className="pointer-events-none absolute size-4 text-background opacity-0 peer-checked:opacity-100" />
              </span>
              <span>Acquired</span>
            </label>
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
                  disabled={isSearchAddCardDisabled}
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
