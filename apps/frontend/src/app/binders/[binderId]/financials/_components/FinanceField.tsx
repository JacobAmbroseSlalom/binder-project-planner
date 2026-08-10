// A labeled input wrapper shared across the Finances tab's small forms
// (cost-entry create/edit fields, finance-settings fields), mirroring the
// `Field` pattern already used by `BinderDetailsForm` but kept local to
// this route since nothing outside the Finances tab needs it yet.
export function FinanceField({
  label,
  htmlFor,
  error,
  className,
  children,
}: {
  label: string;
  htmlFor: string;
  error?: string | null;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={`flex flex-col gap-1 ${className ?? ''}`}>
      <label htmlFor={htmlFor} className="text-caption text-neutral-500">
        {label}
      </label>
      {children}
      {error && (
        <p role="alert" className="text-caption text-error">
          {error}
        </p>
      )}
    </div>
  );
}

// The filled-input treatment documented in styling.instructions.md's "Forms
// & inputs" section, shared by every Finances-tab text/number input.
const financeInputBaseClassName =
  'rounded-standard border border-transparent bg-neutral-800 py-2 placeholder:text-neutral-500 focus:border-primary focus:outline-none disabled:cursor-not-allowed disabled:opacity-50';

export const financeInputClassName = `${financeInputBaseClassName} px-3`;

export const financeErrorInputClassName = `${financeInputClassName} border-error bg-error/10 ring-2 ring-error`;

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

// A `financeInputClassName` input with a fixed, non-interactive "$" prefix,
// for the Finances tab's dollar-amount fields (prices, wage per hour). Its
// own left padding (`pl-6`, wider than `financeInputClassName`'s `px-3`)
// keeps typed digits from starting underneath the prefix.
export function FinanceMoneyInput({
  id,
  value,
  onChange,
  onBlur,
  disabled,
  hasError,
  placeholder,
  min = 0.01,
  step = 0.01,
}: {
  id: string;
  value: string;
  onChange: (event: React.ChangeEvent<HTMLInputElement>) => void;
  onBlur?: () => void;
  disabled?: boolean;
  hasError?: boolean;
  placeholder?: string;
  min?: number;
  step?: number;
}) {
  return (
    <div className="relative">
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

// Shared root className for the Physical costs section's 3 cost-entry
// cards (Binder, Printing, Holographic Paper). `min-h-[13rem]` reserves
// the same height a card takes up once an entry is selected (title +
// dropdown + one row of fields + a cost caption), so the 3 cards stay a
// consistent height even before anything's been selected in one of them.
export const physicalCostCardClassName =
  'flex min-h-[13rem] flex-col gap-3 rounded-standard bg-surface p-4 shadow-panel';
