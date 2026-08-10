import { financeInputClassName, FinanceField } from './FinanceField';

// The "Cards" section placeholder (story 34): static, zeroed totals with no
// query against card data, since neither the `acquired` field (story 36)
// nor card pricing (story 38) exist yet. Wiring this up to real totals is
// explicitly out of scope here and belongs to story 38.
export function CardsPlaceholderSection() {
  return (
    <section className="flex flex-col gap-3">
      <div className="grid grid-cols-[1fr_auto_1fr] items-center">
        <div aria-hidden="true" />
        <h2 className="text-center text-heading font-bold">Cards</h2>
        {/* Invisible, non-interactive clone of Time-based costs' "Wage per
            hour" field (same height-determining markup, hidden via
            `invisible`), sitting side-by-side with this section in the
            Finances tab's layout - keeps this header row exactly as tall
            as that one, so the two sections' blue content areas start at
            the same height. */}
        <div className="invisible max-w-40 justify-self-end" aria-hidden="true">
          <FinanceField label="Wage per hour" htmlFor="cards-header-spacer">
            <input
              id="cards-header-spacer"
              className={financeInputClassName}
              disabled
              tabIndex={-1}
            />
          </FinanceField>
        </div>
      </div>
      <div className="flex gap-4 rounded-standard bg-surface p-4 shadow-panel">
        <p className="text-body text-neutral-500">
          All cards total: <span className="font-bold text-neutral-100">$0.00</span>
        </p>
        <p className="text-body text-neutral-500">
          Unacquired cards total: <span className="font-bold text-neutral-100">$0.00</span>
        </p>
      </div>
    </section>
  );
}
