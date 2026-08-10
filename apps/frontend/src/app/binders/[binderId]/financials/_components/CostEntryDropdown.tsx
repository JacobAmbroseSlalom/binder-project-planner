'use client';

import { ChevronDown } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

export interface CostEntryDropdownItem {
  id: string;
  name: string;
}

// The shared "+ Add new…"-terminated dropdown used by each of the 3
// Physical costs catalogs (story 34). Fully custom per
// styling.instructions.md's "Interactive components ... built fully
// custom" rule - a native `<select>` can't style a trailing action
// distinctly from its real options, and this app avoids third-party
// component libraries for this kind of interactive behavior.
export function CostEntryDropdown({
  id,
  label,
  items,
  selectedId,
  placeholder,
  disabled,
  onSelectExisting,
  onSelectAddNew,
}: {
  id: string;
  label: string;
  items: CostEntryDropdownItem[];
  selectedId: string | null;
  placeholder: string;
  disabled?: boolean;
  onSelectExisting: (id: string) => void;
  onSelectAddNew: () => void;
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

  const selectedItem = items.find((item) => item.id === selectedId) ?? null;

  return (
    <div ref={containerRef} className="relative">
      <button
        id={id}
        type="button"
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        onClick={() => setIsOpen((open) => !open)}
        className="flex w-full cursor-pointer items-center justify-between gap-2 rounded-standard border border-transparent bg-neutral-800 px-3 py-2 text-left focus:border-primary focus:outline-none disabled:cursor-not-allowed disabled:opacity-50"
      >
        <span className={selectedItem ? '' : 'text-neutral-500'}>
          {selectedItem ? selectedItem.name : placeholder}
        </span>
        <ChevronDown className="size-4 shrink-0" aria-hidden="true" />
      </button>
      {isOpen && (
        <ul
          role="listbox"
          aria-label={label}
          className="absolute top-full left-0 z-20 mt-1 max-h-64 w-full overflow-auto rounded-standard bg-neutral-800 shadow-modal"
        >
          {items.map((item) => (
            <li key={item.id} role="option" aria-selected={item.id === selectedId}>
              <button
                type="button"
                onClick={() => {
                  onSelectExisting(item.id);
                  setIsOpen(false);
                }}
                className={`w-full cursor-pointer px-3 py-2 text-left hover:brightness-110 ${
                  item.id === selectedId ? 'text-primary' : ''
                }`}
              >
                {item.name}
              </button>
            </li>
          ))}
          <li role="option" aria-selected={false}>
            <button
              type="button"
              onClick={() => {
                onSelectAddNew();
                setIsOpen(false);
              }}
              className="w-full cursor-pointer border-t border-neutral-700 px-3 py-2 text-left text-primary hover:brightness-110"
            >
              + Add new…
            </button>
          </li>
        </ul>
      )}
    </div>
  );
}
