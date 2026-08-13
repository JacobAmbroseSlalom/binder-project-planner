'use client';

import { ChevronDown } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

import type { CardPriceVariant } from '@/lib/api';

// Story 38's per-row print-variant selector in the Card List's price-
// review table. Fully custom per styling.instructions.md's "Interactive
// components ... built fully custom" rule, mirroring `CostEntryDropdown`'s
// outside-click-to-close popover conventions, but sized for a compact
// table cell and without a trailing "add new" action.
export function VariantSelect({
  variants,
  selectedVariantKey,
  onChange,
  disabled,
}: {
  variants: readonly CardPriceVariant[];
  selectedVariantKey: string | null;
  onChange: (variantKey: string) => void;
  disabled?: boolean;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

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

  // No variant data at all (the card couldn't be matched to a
  // pokemontcg.io card, or that card has no price data) - nothing to pick
  // from, so this renders the same `--` placeholder as the rest of this
  // row's price columns rather than an empty, unusable dropdown.
  if (variants.length === 0) {
    return <span className="text-neutral-500">--</span>;
  }

  return (
    <div ref={containerRef} className="relative inline-block">
      <button
        type="button"
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        aria-label="Print variant"
        onClick={() => setIsOpen((open) => !open)}
        className="flex w-36 cursor-pointer items-center justify-between gap-1 rounded-standard border border-transparent bg-neutral-800 px-2 py-1 text-left text-caption focus:border-primary focus:outline-none disabled:cursor-not-allowed disabled:opacity-50"
      >
        <span className="truncate">{selectedVariantKey ?? '--'}</span>
        <ChevronDown className="size-3.5 shrink-0" aria-hidden="true" />
      </button>
      {isOpen && !disabled && (
        <ul
          role="listbox"
          aria-label="Print variant"
          className="absolute top-full left-0 z-20 mt-1 max-h-48 w-max min-w-full overflow-auto rounded-standard bg-neutral-800 shadow-modal"
        >
          {variants.map((variant) => (
            <li
              key={variant.variantKey}
              role="option"
              aria-selected={variant.variantKey === selectedVariantKey}
            >
              <button
                type="button"
                onClick={() => {
                  onChange(variant.variantKey);
                  setIsOpen(false);
                }}
                className={`w-full cursor-pointer px-3 py-2 text-left whitespace-nowrap text-caption hover:brightness-110 ${
                  variant.variantKey === selectedVariantKey ? 'text-primary' : ''
                }`}
              >
                {variant.variantKey}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
