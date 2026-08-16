'use client';

import { Check, Tag as TagIcon } from 'lucide-react';
import { useState } from 'react';

import { Tooltip } from '@/shared/feedback';

// The home page's multi-select tag filter (story 51): a dropdown of
// checkboxes over `BinderList`'s own reported distinct tag options,
// applying OR-logic client-side filtering there. Renders nothing once
// there are no tags on any binder yet, matching this codebase's other
// "nothing to filter by" precedents. Fully custom-built (no native
// `<select multiple>`) per styling.instructions.md's "Interactive
// components ... built fully custom" rule.
export function TagFilterControl({
  availableTags,
  selectedTags,
  onSelectedTagsChange,
}: {
  availableTags: string[];
  selectedTags: string[];
  onSelectedTagsChange: (next: string[]) => void;
}) {
  const [isOpen, setIsOpen] = useState(false);

  function toggleTag(tag: string) {
    const normalized = tag.toLowerCase();
    const isSelected = selectedTags.some((selected) => selected.toLowerCase() === normalized);
    onSelectedTagsChange(
      isSelected
        ? selectedTags.filter((selected) => selected.toLowerCase() !== normalized)
        : [...selectedTags, tag],
    );
  }

  if (availableTags.length === 0) {
    return null;
  }

  return (
    // `relative` anchors the absolutely-positioned dropdown (z-20 per
    // styling.instructions.md's layering convention) directly below this
    // button.
    <div className="relative">
      <Tooltip label="Filter by tags">
        <button
          type="button"
          onClick={() => setIsOpen((previous) => !previous)}
          onBlur={() => setIsOpen(false)}
          aria-expanded={isOpen}
          aria-label={`Filter by tags${selectedTags.length > 0 ? ` (${selectedTags.length} selected)` : ''}`}
          className="flex h-10 cursor-pointer items-center gap-2 rounded-standard bg-neutral-800 px-4 font-bold hover:brightness-110"
        >
          <TagIcon className="size-4" aria-hidden="true" />
          {selectedTags.length > 0 ? `(${selectedTags.length})` : null}
        </button>
      </Tooltip>
      {isOpen && (
        <ul
          role="listbox"
          aria-multiselectable="true"
          // `w-max` (bounded by `min-w-48`) sizes the dropdown to its
          // longest tag so each option's `whitespace-nowrap` text below
          // never wraps to a second line.
          className="absolute top-full left-0 z-20 mt-1 max-h-64 w-max min-w-48 overflow-y-auto rounded-standard bg-neutral-800 shadow-modal"
        >
          {availableTags.map((tag) => {
            const isSelected = selectedTags.some(
              (selected) => selected.toLowerCase() === tag.toLowerCase(),
            );
            return (
              <li key={tag} role="option" aria-selected={isSelected}>
                <button
                  type="button"
                  // Prevents the toggle button from losing focus (and this
                  // dropdown from closing via its own `onBlur` above)
                  // before `onClick` fires, so multiple tags can be picked
                  // without the dropdown closing after each one.
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => toggleTag(tag)}
                  className="flex w-full cursor-pointer items-center gap-2 px-3 py-2 text-left whitespace-nowrap hover:brightness-110"
                >
                  <span className="relative inline-flex size-5 shrink-0 items-center justify-center rounded-standard border border-neutral-500 bg-neutral-900">
                    {isSelected && <Check className="size-4 text-primary" aria-hidden="true" />}
                  </span>
                  {tag}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
