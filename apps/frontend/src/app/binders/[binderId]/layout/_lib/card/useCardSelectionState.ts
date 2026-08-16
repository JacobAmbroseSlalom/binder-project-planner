'use client';

import { useState } from 'react';

import type { TcgDexCatalogCard } from '@/lib/api';

// Owns `CardSelectionModal`'s TCGdex result checkbox multi-select (stories
// 17/18, replacing story 11's exclusive single-select): which
// `providerCardId`s are checked, the Select All/Deselect All toggle, and
// the derived `selectedResults` list (in display order) both the
// Add-Card/Add-More submission handlers and the slot-targeting rule treat
// as "the" cards to submit.
export function useCardSelectionState({
  results,
  initialSelectionRestore,
}: {
  results: TcgDexCatalogCard[];
  // Set only when this modal is being reopened after an Add-Card TCGdex
  // submission had a failed card (story 17): seeds the selection so the
  // failed cards arrive pre-checked once the remembered-query search
  // effect re-fetches them.
  initialSelectionRestore?: { cards: TcgDexCatalogCard[]; variation: string | null };
}) {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(
    () => new Set((initialSelectionRestore?.cards ?? []).map((card) => card.providerCardId)),
  );

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

  // The currently checked results, in the same order they're displayed -
  // both `onAddCards`/`onAddMoreCards` calls and the slot-targeting rule
  // treat this array's first entry as "the" card eligible for
  // `initialTarget`.
  const selectedResults = results.filter((card) => selectedIds.has(card.providerCardId));

  return {
    selectedIds,
    setSelectedIds,
    toggleSelected,
    allResultsSelected,
    handleToggleSelectAll,
    selectedResults,
  };
}
