import { computeCardPriceTotal } from '@/shared/finance/computeCardPriceTotal';
import { formatCurrency } from '@/shared/finance/formatCurrency';
import type { Card } from '@/lib/api';

import { financeInputClassName, FinanceField } from './FinanceField';

// The "Cards" section (story 38, previously story 34's static
// `CardsPlaceholderSection` placeholder): shows the binder's all-cards and
// unacquired-cards saved-price totals. Per the product decision made for
// this story, this section intentionally has no "filtered cards" total -
// that distinction only applies to the Card List tab's own totals row,
// which has direct access to the currently active search/sort/filter
// state that this tab doesn't share.
export function CardsFinanceSection({ cards }: { cards: readonly Card[] }) {
  const allCardsTotal = computeCardPriceTotal(cards);
  const unacquiredCardsTotal = computeCardPriceTotal(cards.filter((card) => !card.acquired));

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
          All cards total:{' '}
          <span className="font-bold text-neutral-100">{formatCurrency(allCardsTotal.sum)}</span>
        </p>
        <p className="text-body text-neutral-500">
          Unacquired cards total:{' '}
          <span className="font-bold text-neutral-100">
            {formatCurrency(unacquiredCardsTotal.sum)}
          </span>
        </p>
      </div>
    </section>
  );
}
