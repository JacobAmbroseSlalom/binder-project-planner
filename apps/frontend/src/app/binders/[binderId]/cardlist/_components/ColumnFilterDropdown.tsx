'use client';

import { Check, ListFilter } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

import { Tooltip } from '@/shared/feedback';

import type { CardListFilterOption } from '../_lib/cardListDerivation';

// Story 37's per-column filter dropdown, used for each of the card list
// table's 4 columns (Name, Set, Number, Acquisition). Fully custom per
// styling.instructions.md's "Interactive components ... built fully
// custom" rule, mirroring `CostEntryDropdown`'s outside-click-to-close
// popover conventions.
export function ColumnFilterDropdown({
  columnLabel,
  options,
  selected,
  onChange,
}: {
  // The column's display name, used for the trigger button's accessible
  // label and the dropdown's own `aria-label`.
  columnLabel: string;
  // This column's full distinct-value list (from `getDistinctColumnValues`
  // - computed once from every binder card, not just the currently
  // filtered/visible subset).
  options: CardListFilterOption[];
  // This column's currently selected value set.
  selected: Set<string>;
  onChange: (next: Set<string>) => void;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);

  // Closes on an outside click, matching `CostEntryDropdown`.
  useEffect(() => {
    if (!isOpen) return;

    function handlePointerDown(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }

    document.addEventListener('mousedown', handlePointerDown);
    return () => document.removeEventListener('mousedown', handlePointerDown);
  }, [isOpen]);

  // The in-dropdown search (separate from the card list's own search
  // input) only narrows which of this column's *options* are shown -
  // it never itself changes the selection.
  const visibleOptions = options.filter((option) =>
    option.label.toLowerCase().includes(searchQuery.trim().toLowerCase()),
  );

  // Only counts against the column's *full* option list (not the narrowed
  // `visibleOptions`), so the trigger icon's "filtered" indicator reflects
  // the real applied filter, not the in-dropdown search's own narrowing.
  const isFiltered = selected.size < options.length;
  const allVisibleSelected =
    visibleOptions.length > 0 && visibleOptions.every((option) => selected.has(option.value));

  function toggleOption(value: string) {
    const next = new Set(selected);
    if (next.has(value)) {
      next.delete(value);
    } else {
      next.add(value);
    }
    onChange(next);
  }

  // Selects/deselects every currently-*visible* option (respecting the
  // in-dropdown search), leaving any already-selected value outside that
  // narrowed set untouched.
  function handleToggleSelectAllVisible() {
    const next = new Set(selected);
    for (const option of visibleOptions) {
      if (allVisibleSelected) {
        next.delete(option.value);
      } else {
        next.add(option.value);
      }
    }
    onChange(next);
  }

  // Resets this column back to every value selected (no filtering).
  function handleReset() {
    onChange(new Set(options.map((option) => option.value)));
  }

  return (
    <div ref={containerRef} className="relative inline-block">
      <Tooltip label={`Filter by ${columnLabel}`}>
        <button
          type="button"
          aria-haspopup="listbox"
          aria-expanded={isOpen}
          aria-label={`Filter by ${columnLabel}`}
          onClick={() => setIsOpen((open) => !open)}
          className={`flex size-6 cursor-pointer items-center justify-center rounded-standard hover:bg-neutral-700 ${
            isFiltered ? 'text-primary' : 'text-neutral-500'
          }`}
        >
          <ListFilter className="size-4" aria-hidden="true" />
        </button>
      </Tooltip>
      {isOpen && (
        <div
          role="listbox"
          aria-label={`Filter by ${columnLabel}`}
          aria-multiselectable="true"
          className="absolute top-full left-0 z-20 mt-1 flex w-56 flex-col gap-2 rounded-standard bg-neutral-800 p-2 text-left font-regular shadow-modal"
        >
          <input
            type="text"
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            placeholder={`Search ${columnLabel.toLowerCase()} values`}
            aria-label={`Search ${columnLabel} values`}
            className="rounded-standard border border-transparent bg-neutral-900 px-2 py-1 text-caption focus:border-primary focus:outline-none"
          />
          <div className="flex items-center justify-between gap-2 text-caption">
            <button
              type="button"
              onClick={handleToggleSelectAllVisible}
              className="cursor-pointer font-bold text-primary hover:brightness-110"
            >
              {allVisibleSelected ? 'Deselect All' : 'Select All'}
            </button>
            <button
              type="button"
              onClick={handleReset}
              disabled={!isFiltered}
              className={`font-bold text-primary hover:brightness-110 ${
                isFiltered ? 'cursor-pointer' : 'cursor-not-allowed opacity-50'
              }`}
            >
              Reset
            </button>
          </div>
          <ul className="flex max-h-64 flex-col overflow-auto">
            {visibleOptions.length === 0 && (
              <li className="px-2 py-1 text-caption text-neutral-500">No matching values</li>
            )}
            {visibleOptions.map((option) => (
              <li key={option.value} role="option" aria-selected={selected.has(option.value)}>
                <label className="flex cursor-pointer items-center gap-2 rounded-standard px-2 py-1 hover:bg-neutral-700">
                  <span className="relative inline-flex size-4 shrink-0 items-center justify-center">
                    <input
                      type="checkbox"
                      checked={selected.has(option.value)}
                      onChange={() => toggleOption(option.value)}
                      className="peer size-4 appearance-none rounded-standard border border-neutral-500 bg-neutral-900 checked:border-primary checked:bg-primary"
                    />
                    <Check className="pointer-events-none absolute size-3 text-background opacity-0 peer-checked:opacity-100" />
                  </span>
                  <span className="text-caption">{option.label}</span>
                </label>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
