'use client';

import type { ChangeEvent } from 'react';

// The filled-input treatment documented in styling.instructions.md's "Forms
// & inputs" section, shared by every dollar-amount and plain numeric/text
// input across the Finances tab and Card List's price review.
export const financeInputBaseClassName =
  'rounded-standard border border-transparent bg-neutral-800 py-2 placeholder:text-neutral-500 focus:border-primary focus:outline-none disabled:cursor-not-allowed disabled:opacity-50';

// Strips a redundant leading zero from a numeric input's typed value (e.g.
// starting from a stored "0" and typing "5" naturally produces "05" via
// the DOM, which this turns into "5") without touching decimals like
// "0.5" or an intentionally blank value.
export function stripLeadingZero(value: string): string {
  if (/^0\d/.test(value)) {
    return value.replace(/^0+/, '') || '0';
  }
  return value;
}

// A `financeInputBaseClassName` input with a fixed, non-interactive "$"
// prefix, for any dollar-amount field (cost-entry prices, wage per hour,
// story 38's price-review "New price" column). Its own left padding
// (`pl-6`, wider than the plain text/number inputs' `px-3`) keeps typed
// digits from starting underneath the prefix.
export function MoneyInput({
  id,
  value,
  onChange,
  onBlur,
  disabled,
  hasError,
  placeholder,
  ariaLabel,
  min = 0.01,
  step = 0.01,
  className,
}: {
  id?: string;
  value: string;
  onChange: (event: ChangeEvent<HTMLInputElement>) => void;
  onBlur?: () => void;
  disabled?: boolean;
  hasError?: boolean;
  placeholder?: string;
  ariaLabel?: string;
  min?: number;
  step?: number;
  className?: string;
}) {
  return (
    <div className={`relative ${className ?? ''}`}>
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-y-0 left-3 flex items-center"
      >
        $
      </span>
      <input
        id={id}
        type="number"
        min={min}
        step={step}
        value={value}
        disabled={disabled}
        aria-label={ariaLabel}
        onChange={(event) => {
          // Mutate the event's value in place before handing it to the
          // caller's onChange, so every money field gets the leading-zero
          // fix for free without each call site needing its own wrapper.
          event.target.value = stripLeadingZero(event.target.value);
          onChange(event);
        }}
        onBlur={onBlur}
        placeholder={placeholder}
        className={`${financeInputBaseClassName} w-full pr-3 pl-6 ${
          hasError ? 'border-error bg-error/10 ring-2 ring-error' : ''
        }`}
      />
    </div>
  );
}
