'use client';

import { addBinderTag, BINDER_TAG_MAX_LENGTH } from '@binder-project-planner/shared';
import { X } from 'lucide-react';
import { useState } from 'react';

// The binder tags field's editable combobox plus pill list (story 51),
// matching the existing card-variation combobox pattern (story 16,
// `VariationCombobox`) for the text input/suggestion-dropdown half, with an
// explicit "Add" button (selecting a suggestion only fills the text field;
// it doesn't add a tag by itself) and a pill per already-added tag with its
// own "x" remove control. Fully custom-built per
// styling.instructions.md's "Interactive components ... built fully
// custom" rule, rather than a native multi-select or a third-party
// combobox/tag library.
export function TagsInput({
  id,
  value,
  onChange,
  suggestions,
  disabled = false,
  error,
}: {
  id: string;
  // This binder's currently added tags, in display order.
  value: string[];
  // Called with the complete next tag array on every add/remove - a full
  // replacement, matching the backend's own "PATCH replaces the whole
  // array" contract.
  onChange: (next: string[]) => void;
  // The combobox's suggestion list - the distinct tag text currently used
  // by any binder (`GET /tags`), fetched once by the caller.
  suggestions: string[];
  disabled?: boolean;
  error?: string;
}) {
  // The in-progress text typed into the combobox, not yet added as a tag.
  const [inputValue, setInputValue] = useState('');
  const [isOpen, setIsOpen] = useState(false);

  const trimmedInput = inputValue.trim();
  const normalizedExisting = new Set(value.map((tag) => tag.toLowerCase()));
  // Suggestions already added to this binder are hidden - selecting one
  // again would just be a no-op per `addBinderTag`'s own dedupe rule.
  const filteredSuggestions = suggestions.filter(
    (suggestion) =>
      !normalizedExisting.has(suggestion.toLowerCase()) &&
      suggestion.toLowerCase().includes(trimmedInput.toLowerCase()),
  );

  function handleSelectSuggestion(suggestion: string) {
    setInputValue(suggestion);
    setIsOpen(false);
  }

  // Adds the currently typed text as a tag (trimmed, case-insensitively
  // deduped against this binder's existing tags via the shared
  // `addBinderTag` helper) and clears the input. Blurring the button
  // afterward (mirroring `ResetButton` in `BinderDetailsForm.tsx`) bubbles
  // a `blur` event up to the Edit Details tab's form-level handler so this
  // add is saved immediately, matching story 51's "Add ... immediately
  // trigger the tab's existing save flow" requirement.
  function handleAdd(event: React.MouseEvent<HTMLButtonElement>) {
    if (trimmedInput.length > 0) {
      onChange(addBinderTag(value, trimmedInput));
      setInputValue('');
    }
    event.currentTarget.blur();
  }

  // Removes one tag from this binder's tag list, then blurs itself for the
  // same immediate-save reason as `handleAdd`.
  function handleRemove(tag: string, event: React.MouseEvent<HTMLButtonElement>) {
    onChange(value.filter((existing) => existing !== tag));
    event.currentTarget.blur();
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex gap-2">
        {/* `relative` anchors the absolutely-positioned dropdown (z-20 per
            styling.instructions.md's layering convention) directly below
            this input. */}
        <div className="relative flex-1">
          <input
            id={id}
            type="text"
            role="combobox"
            aria-expanded={isOpen && filteredSuggestions.length > 0}
            aria-autocomplete="list"
            aria-controls={`${id}-listbox`}
            autoComplete="off"
            maxLength={BINDER_TAG_MAX_LENGTH}
            disabled={disabled}
            value={inputValue}
            onChange={(event) => setInputValue(event.target.value)}
            onFocus={() => setIsOpen(true)}
            onBlur={() => setIsOpen(false)}
            onKeyDown={(event) => {
              if (event.key === 'Escape') setIsOpen(false);
            }}
            placeholder="e.g. Holo"
            className="w-full rounded-standard border border-transparent bg-neutral-800 px-3 py-2 placeholder:text-neutral-500 focus:border-primary focus:outline-none disabled:cursor-not-allowed disabled:opacity-50"
          />
          {isOpen && filteredSuggestions.length > 0 && (
            <ul
              id={`${id}-listbox`}
              role="listbox"
              className="absolute top-full left-0 z-20 mt-1 w-full overflow-hidden rounded-standard bg-neutral-800 shadow-modal"
            >
              {filteredSuggestions.map((suggestion) => (
                <li key={suggestion} role="option" aria-selected={inputValue === suggestion}>
                  <button
                    type="button"
                    // Fires selection on mousedown (before the input's own
                    // blur handler) so the dropdown's blur-to-close doesn't
                    // close it out from under the click before `onClick`
                    // ever fires.
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
        <button
          type="button"
          disabled={disabled || trimmedInput.length === 0}
          onClick={handleAdd}
          className="cursor-pointer rounded-standard bg-neutral-800 px-4 py-2 font-bold hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
        >
          Add
        </button>
      </div>
      {error && (
        <p role="alert" className="text-caption text-error">
          {error}
        </p>
      )}
      {value.length > 0 && (
        <ul className="flex flex-wrap gap-2">
          {value.map((tag) => (
            <li
              key={tag}
              // `bg-secondary` per story 51 pill styling; secondary is a
              // light gold tone, so the pill's text/icon use dark
              // `neutral-900` (rather than the app's default light text)
              // to keep readable contrast against it.
              className="flex items-center gap-1 rounded-standard bg-secondary py-1 pr-1 pl-3 text-neutral-900"
            >
              <span>{tag}</span>
              <button
                type="button"
                disabled={disabled}
                onClick={(event) => handleRemove(tag, event)}
                aria-label={`Remove tag ${tag}`}
                className="cursor-pointer p-1 text-neutral-900/60 hover:text-neutral-900 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <X className="size-4" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
