'use client';

import { ChevronDown } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

import type { CardSearchProvider } from '@/lib/api';

// The fixed, human-readable label for each `CardSearchProvider` value -
// kept here (rather than inline at each call site) since both consumers of
// this dropdown need the exact same label text.
const PROVIDER_LABELS: Record<CardSearchProvider, string> = {
  tcgdex: 'TCGdex',
  pokemontcg: 'Pokémon TCG API',
};

// The card-search source dropdown (story 43): lets the user switch a card
// search between TCGdex (default) and pokemontcg.io. Shared by the
// card-selection modal's `SearchResultsView` and the watchlist's own
// `WatchlistCardSelectionModal`, both of which otherwise mirror story 41's
// language/TCG-Pocket toggle pattern. Fully custom-built (no native
// `<select>`) per styling.instructions.md's "Interactive components ...
// built fully custom" rule, mirroring `CostEntryDropdown`'s
// open/outside-click-close listbox pattern rather than that component's
// "+ Add new…" trailing action (which doesn't apply here - there are only
// ever exactly 2 fixed options).
export function CardSearchProviderSelect({
  id,
  value,
  onChange,
}: {
  id: string;
  value: CardSearchProvider;
  onChange: (provider: CardSearchProvider) => void;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Closes the dropdown on an outside click, matching normal listbox
  // behavior (this component doesn't use a native <select>, so there's no
  // built-in dismissal for free).
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

  return (
    <div ref={containerRef} className="relative shrink-0">
      <button
        id={id}
        type="button"
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        onClick={() => setIsOpen((open) => !open)}
        className="flex cursor-pointer items-center gap-2 rounded-standard border border-transparent bg-neutral-800 px-3 py-2 text-left focus:border-primary focus:outline-none"
      >
        <span>{PROVIDER_LABELS[value]}</span>
        <ChevronDown className="size-4 shrink-0" aria-hidden="true" />
      </button>
      {isOpen && (
        <ul
          role="listbox"
          aria-label="Card search source"
          className="absolute top-full right-0 z-20 mt-1 w-max min-w-full overflow-auto rounded-standard bg-neutral-800 shadow-modal"
        >
          {(Object.keys(PROVIDER_LABELS) as CardSearchProvider[]).map((provider) => (
            <li key={provider} role="option" aria-selected={provider === value}>
              <button
                type="button"
                onClick={() => {
                  onChange(provider);
                  setIsOpen(false);
                }}
                className={`w-full cursor-pointer px-3 py-2 text-left whitespace-nowrap hover:brightness-110 ${
                  provider === value ? 'text-primary' : ''
                }`}
              >
                {PROVIDER_LABELS[provider]}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
