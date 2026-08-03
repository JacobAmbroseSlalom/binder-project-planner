'use client';

import {
  CARD_VARIATION_MAX_LENGTH,
  CARD_VARIATION_SUGGESTIONS,
} from '@binder-project-planner/shared';
import { useState, type Ref } from 'react';

// The card variation field's editable combobox (story 16: "Add card
// variations"), shared by the add-card modal and the edit-variation modal.
// A plain text input (so a custom, unmatched value is always accepted
// as-is per the story's acceptance criteria) paired with a filtered
// suggestion dropdown - fully custom-built per
// styling.instructions.md's "Interactive components ... built fully
// custom" rule, rather than a native `<datalist>` or a third-party
// combobox library.
export function VariationCombobox({
  id,
  value,
  onChange,
  disabled = false,
  inputRef,
}: {
  id: string;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  // Lets a caller (e.g. the edit-variation modal, which focuses this field
  // on open) reach the underlying `<input>` directly, mirroring the
  // pattern other bespoke modals in this codebase use for their own
  // focus-on-mount `useRef`.
  inputRef?: Ref<HTMLInputElement>;
}) {
  // Whether the suggestion dropdown is currently shown - opened on focus,
  // closed on blur/Escape/selecting an option.
  const [isOpen, setIsOpen] = useState(false);

  const trimmedValue = value.trim().toLowerCase();
  const filteredSuggestions = CARD_VARIATION_SUGGESTIONS.filter((suggestion) =>
    suggestion.toLowerCase().includes(trimmedValue),
  );

  function handleSelectSuggestion(suggestion: string) {
    onChange(suggestion);
    setIsOpen(false);
  }

  return (
    // `relative` anchors the absolutely-positioned dropdown (z-20 per
    // styling.instructions.md's layering convention for
    // comboboxes/dropdowns) directly below this input.
    <div className="relative">
      <input
        id={id}
        ref={inputRef}
        type="text"
        role="combobox"
        aria-expanded={isOpen && filteredSuggestions.length > 0}
        aria-autocomplete="list"
        aria-controls={`${id}-listbox`}
        autoComplete="off"
        maxLength={CARD_VARIATION_MAX_LENGTH}
        disabled={disabled}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onFocus={() => setIsOpen(true)}
        onBlur={() => setIsOpen(false)}
        onKeyDown={(event) => {
          if (event.key === 'Escape') setIsOpen(false);
        }}
        placeholder="e.g. Reverse Holo"
        className="w-full rounded-standard border border-transparent bg-neutral-800 px-3 py-2 placeholder:text-neutral-500 focus:border-primary focus:outline-none disabled:cursor-not-allowed disabled:opacity-50"
      />
      {isOpen && filteredSuggestions.length > 0 && (
        <ul
          id={`${id}-listbox`}
          role="listbox"
          className="absolute top-full left-0 z-20 mt-1 w-full overflow-hidden rounded-standard bg-neutral-800 shadow-modal"
        >
          {filteredSuggestions.map((suggestion) => (
            <li key={suggestion} role="option" aria-selected={value === suggestion}>
              <button
                type="button"
                // Fires selection on mousedown (before the input's own blur
                // handler) so the dropdown's blur-to-close doesn't close it
                // out from under the click before `onClick` ever fires.
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => handleSelectSuggestion(suggestion)}
                className="w-full cursor-pointer px-3 py-2 text-left hover:brightness-110"
              >
                {suggestion}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
