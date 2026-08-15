'use client';

import {
  CARD_SEARCH_INCLUDE_TCG_POCKET_DEFAULT,
  CARD_SEARCH_LANGUAGE_DEFAULT,
  CARD_SEARCH_PROVIDER_DEFAULT,
} from '@binder-project-planner/shared';
import { zodResolver } from '@hookform/resolvers/zod';
import { ArrowLeft, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useForm } from 'react-hook-form';

import {
  type CardSearchLanguage,
  type CardSearchProvider,
  type TcgDexCatalogCard,
} from '@/lib/api';
import { useModalFocusTrap } from '@/shared/hooks/useModalFocusTrap';
import { VariationCombobox } from '@/shared/forms';

import { ManualCardForm } from '../../binders/[binderId]/layout/_components/card/ManualCardForm';
import {
  defaultManualCardFormValues,
  manualCardSchema,
  type ManualCardFormValues,
} from '../../binders/[binderId]/layout/_components/card/manualCardSchema';
import { SearchResultsView } from '../../binders/[binderId]/layout/_components/card/SearchResultsView';
import { useCardCatalogSearch } from '../../binders/[binderId]/layout/_components/card/useCardCatalogSearch';
import { useCardSelectionState } from '../../binders/[binderId]/layout/_components/card/useCardSelectionState';

// Story 45's "Add card" modal for the What I'm Looking For page - reuses
// the binder Card List/Layout tab's own add-card modal machinery
// (`useCardCatalogSearch`, `useCardSelectionState`, `SearchResultsView`,
// `ManualCardForm`) verbatim, since none of those are binder/placement-
// coupled, per the story's "the same [add-card] modal" requirement. Only
// this outer shell differs from `CardSelectionModal`: no slot/session
// target-placement resolution (a standalone/binder-less entry never has a
// placement) and no "Acquired" checkbox (a standalone entry has no
// acquired state at all, per the story's technical requirements) - both
// dropped rather than kept and disabled, mirroring this codebase's
// existing precedent of omitting a control entirely when it has no
// meaning for a given context.
export function WatchlistCardSelectionModal({
  onClose,
  onAddCards,
  onAddMoreCards,
  onSubmitCustomCard,
  onSubmitCustomCardAddMore,
  isBulkAddPending,
}: {
  onClose: () => void;
  // Called with the full checkbox selection on "Add Card" - the caller
  // owns the request lifecycle and closes this modal right away, so this
  // fires-and-forgets rather than awaiting settlement (mirrors
  // `CardSelectionModal`'s own `onAddCards`).
  onAddCards: (cards: TcgDexCatalogCard[], variation: string | null) => void;
  // Called with the full checkbox selection on "Add More" - awaited so
  // this modal only clears its own query/results/selection/variation on
  // complete success, keeping them for correction on any failure (mirrors
  // `CardSelectionModal`'s own `onAddMoreCards`).
  onAddMoreCards: (cards: TcgDexCatalogCard[], variation: string | null) => Promise<boolean>;
  // Called with the manual-entry form's values and selected file on "Add
  // Card" - the caller closes this modal right away.
  onSubmitCustomCard: (
    values: {
      name: string;
      setName: string | null;
      localNumber: string | null;
      variation: string | null;
    },
    file: File,
  ) => void;
  // The manual-entry view's own "Add More", mirroring `onAddMoreCards`.
  onSubmitCustomCardAddMore: (
    values: {
      name: string;
      setName: string | null;
      localNumber: string | null;
      variation: string | null;
    },
    file: File,
  ) => Promise<boolean>;
  // True while a bulk create request is already in flight - disables
  // Select All, every result checkbox, and both Add Card/Add More buttons
  // in the search view until it settles.
  isBulkAddPending: boolean;
}) {
  // This page has no per-binder-visit context to persist the language/TCG
  // Pocket toggles (or story 43's source dropdown) in (unlike
  // `CardSelectionModal`, which lives inside `BinderRouteContext`) - local
  // state is enough here since this modal's own mount/unmount cycle is
  // this page's only lifetime that matters.
  const [cardSearchLanguage, setCardSearchLanguage] = useState<CardSearchLanguage>(
    CARD_SEARCH_LANGUAGE_DEFAULT,
  );
  const [includeTcgPocket, setIncludeTcgPocket] = useState(CARD_SEARCH_INCLUDE_TCG_POCKET_DEFAULT);
  const [cardSearchProvider, setCardSearchProvider] = useState<CardSearchProvider>(
    CARD_SEARCH_PROVIDER_DEFAULT,
  );

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
  } = useCardCatalogSearch({ cardSearchProvider, cardSearchLanguage, includeTcgPocket });

  const {
    selectedIds,
    setSelectedIds,
    toggleSelected,
    allResultsSelected,
    handleToggleSelectAll,
    selectedResults,
  } = useCardSelectionState({ results });

  // Story 16's shared variation field, used by both views - mirrors
  // `CardSelectionModal`'s own `variation` state.
  const [variation, setVariation] = useState('');
  const [isAddMoreSubmitting, setIsAddMoreSubmitting] = useState(false);
  const [isCustomAddMoreSubmitting, setIsCustomAddMoreSubmitting] = useState(false);

  const [viewMode, setViewMode] = useState<'search' | 'manual'>('search');
  const [customCardFile, setCustomCardFile] = useState<File | null>(null);
  const [fileError, setFileError] = useState<string | undefined>(undefined);
  const manualForm = useForm<ManualCardFormValues>({
    resolver: zodResolver(manualCardSchema),
    defaultValues: defaultManualCardFormValues,
  });

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
  const { handleTabTrap } = useModalFocusTrap(dialogRef);

  useEffect(() => {
    searchInputRef.current?.focus();
    searchInputRef.current?.select();
  }, []);

  function handleKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    if (event.key === 'Escape') {
      event.stopPropagation();
      onClose();
      return;
    }

    handleTabTrap(event);
  }

  const isSearchAddCardDisabled =
    selectedResults.length === 0 || isBulkAddPending || isAddMoreSubmitting;

  function handleAddCards() {
    if (selectedResults.length === 0) return;
    onAddCards(selectedResults, variation.trim() || null);
  }

  async function handleAddMoreCards() {
    if (selectedResults.length === 0 || isAddMoreSubmitting) return;
    setIsAddMoreSubmitting(true);
    try {
      const allSucceeded = await onAddMoreCards(selectedResults, variation.trim() || null);
      if (allSucceeded) {
        resetSearch();
        setSelectedIds(new Set());
        setVariation('');
        searchInputRef.current?.focus();
      }
    } finally {
      setIsAddMoreSubmitting(false);
    }
  }

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

  function handlePaste(event: React.ClipboardEvent<HTMLDivElement>) {
    if (viewMode !== 'manual') return;

    const items = event.clipboardData?.items;
    if (!items) return;

    for (const item of items) {
      if (item.kind !== 'file' || !item.type.startsWith('image/')) continue;
      const file = item.getAsFile();
      if (!file) continue;
      event.preventDefault();
      handleCustomCardFileChange(file);
      return;
    }
  }

  const handleManualSubmit = manualForm.handleSubmit((values) => {
    if (!customCardFile) {
      setFileError('An image is required.');
      return;
    }
    onSubmitCustomCard(
      {
        name: values.name,
        setName: values.setName.trim() || null,
        localNumber: values.localNumber.trim() || null,
        variation: variation.trim() || null,
      },
      customCardFile,
    );
  });

  const handleManualAddMore = manualForm.handleSubmit(async (values) => {
    if (!customCardFile) {
      setFileError('An image is required.');
      return;
    }
    if (isCustomAddMoreSubmitting) return;
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
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-8"
      onClick={onClose}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="watchlist-card-selection-modal-title"
        onClick={(event) => event.stopPropagation()}
        onKeyDown={handleKeyDown}
        onPaste={handlePaste}
        className="flex h-full max-h-[52rem] w-full max-w-5xl flex-col gap-4 rounded-standard bg-surface p-6 shadow-modal"
      >
        <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-4">
          <span aria-hidden="true" />
          <h2 id="watchlist-card-selection-modal-title" className="text-center">
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
            cardSearchProvider={cardSearchProvider}
            onCardSearchProviderChange={setCardSearchProvider}
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
            />
          </div>
        )}

        {viewMode === 'search' && (
          <div className="flex items-end gap-6">
            <div className="flex max-w-56 flex-col gap-1">
              <label htmlFor="watchlist-card-variation" className="text-caption text-neutral-500">
                Variation
              </label>
              <VariationCombobox
                id="watchlist-card-variation"
                value={variation}
                onChange={setVariation}
              />
            </div>
          </div>
        )}

        <div className="flex items-center justify-between gap-2">
          {viewMode === 'search' ? (
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
