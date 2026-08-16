import {
  financeInputBaseClassName,
  MoneyInput,
  stripLeadingZero,
} from '@/shared/finance/MoneyInput';

// Re-exported so the Finances tab's existing call sites don't need to
// change their import path now that the underlying input moved to
// `@/shared/finance/MoneyInput` for reuse outside this route (story 38's
// Card List price-review "New price" column).
export { stripLeadingZero };
export const FinanceMoneyInput = MoneyInput;

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
export const financeInputClassName = `${financeInputBaseClassName} px-3`;

export const financeErrorInputClassName = `${financeInputClassName} border-error bg-error/10 ring-2 ring-error`;

// Shared root className for the Physical costs section's 3 cost-entry
// cards (Binder, Printing, Holographic Paper). Deliberately has no
// hardcoded min-height: a fixed `min-h-[...]` value here previously drifted
// out of sync with the actual content height (most recently once the
// Finances Preview page's Binder card grew a second row of fields for
// width/height/pages, story 54). The parent grid's default
// `align-items: stretch` already makes every card in the same row match
// the row's tallest card automatically, so relying on that keeps the 3
// cards a consistent height however tall any one of them actually renders.
export const physicalCostCardClassName =
  'flex flex-col gap-3 rounded-standard bg-surface p-4 shadow-panel';
