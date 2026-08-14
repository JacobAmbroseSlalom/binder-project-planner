import { DEFAULT_TOP_PRICED_CARDS_COUNT } from '@binder-project-planner/shared';

import { resolveCardImageUrl, type Card } from '@/lib/api';
import { computeCardPriceTotal } from '@/shared/finance/computeCardPriceTotal';
import { computeOldestPriceRefresh } from '@/shared/finance/computeOldestPriceRefresh';
import { computeTopPricedCards } from '@/shared/finance/computeTopPricedCards';
import { formatCurrency } from '@/shared/finance/formatCurrency';

import { financeInputClassName, FinanceField } from './FinanceField';

// One group's stat: label-over-bold-value, matching the sticky totals
// bar's own stat layout above this section (story 50 - previously this
// section rendered its 2 totals as plain inline sentences with less
// visual weight than the Physical costs/Time-based costs sections beside
// it). Also shows the group's card count and (story 50, revising story
// 38's original decision to omit it here) its missing-price count,
// matching the Card List tab's own totals row.
function CardsTotalStat({ label, cards }: { label: string; cards: readonly Card[] }) {
  const { sum, missingPriceCount } = computeCardPriceTotal(cards);
  return (
    <div className="flex flex-col items-center justify-end gap-1 text-center">
      <span className="text-caption text-neutral-500">{label}</span>
      <span className="text-subheading font-bold">{formatCurrency(sum)}</span>
      <span className="text-caption text-neutral-500">
        {cards.length} card{cards.length === 1 ? '' : 's'}
        {missingPriceCount > 0 &&
          ` · ${missingPriceCount} missing price${missingPriceCount === 1 ? '' : 's'}`}
      </span>
    </div>
  );
}

// The oldest saved-price refresh date across the whole binder (story 50),
// so the user can judge how stale the totals above might be before
// trusting them. Displays `--` when no card in the binder has ever had a
// saved price.
function OldestRefreshStat({ cards }: { cards: readonly Card[] }) {
  const oldest = computeOldestPriceRefresh(cards);
  return (
    <div className="flex flex-col items-center justify-end gap-1 text-center">
      <span className="text-caption text-neutral-500">Prices oldest refresh</span>
      <span className="text-subheading font-bold">
        {oldest ? new Date(oldest).toLocaleDateString() : '--'}
      </span>
      {/* Blank filler line, matching `CardsTotalStat`'s 3rd (card-count/
          missing-price) line so all 3 stats in the row stay the same
          height even though this stat has nothing to show there. */}
      <span className="text-caption">&nbsp;</span>
    </div>
  );
}

// The "Top Priced Cards" grid (story 50): the highest-priced cards across
// the whole binder, regardless of acquisition status, so the user can see
// at a glance which cards make up the bulk of their collection's value.
// Laid out 3-per-row (2 rows for the default 6-card count) rather than a
// single-column list, with a thumbnail large enough on its own that,
// unlike the Card List tab's own row thumbnail, it skips the hover
// enlargement (`ImagePreview`) entirely. Cards without a saved price
// never appear here; renders nothing (not even the heading) when no card
// in the binder has one yet.
function TopPricedCardsList({ cards }: { cards: readonly Card[] }) {
  const topCards = computeTopPricedCards(cards, DEFAULT_TOP_PRICED_CARDS_COUNT);
  if (topCards.length === 0) return null;

  return (
    <div className="flex flex-col gap-3 rounded-standard bg-surface p-4 shadow-panel">
      <h3 className="text-center font-bold">Top Priced Cards</h3>
      <ul className="grid grid-cols-3 gap-4">
        {topCards.map((card) => (
          <li key={card.id} className="flex flex-col items-center gap-2 text-center">
            <div className="flex flex-col items-center">
              <span>{card.name}</span>
              <span className="text-caption text-neutral-500">
                {card.setName ?? '—'} · {card.localNumber ?? '—'}
              </span>
            </div>
            <span className="font-bold">{formatCurrency(card.price as number)}</span>
            <div className="flex h-[10.5rem] w-[7.875rem] items-center justify-center overflow-hidden rounded-standard border border-neutral-700 bg-neutral-800">
              {/* eslint-disable-next-line @next/next/no-img-element -- the
                  card image comes from an arbitrary backend/provider
                  origin, so next/image's fixed-domain optimization
                  doesn't apply here. */}
              <img
                src={resolveCardImageUrl(card.imageUrl)}
                alt={card.name}
                className="h-full w-full object-contain"
              />
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

// The "Cards" section (story 38, previously story 34's static
// `CardsPlaceholderSection` placeholder): shows the binder's all-cards and
// unacquired-cards saved-price totals, an oldest-refresh staleness
// indicator, and a top-priced-cards list (story 50). Per the product
// decision made for story 38, this section intentionally has no "filtered
// cards" total - that distinction only applies to the Card List tab's own
// totals row, which has direct access to the currently active search/
// sort/filter state that this tab doesn't share.
export function CardsFinanceSection({ cards }: { cards: readonly Card[] }) {
  const unacquiredCards = cards.filter((card) => !card.acquired);

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
      <div className="grid grid-cols-3 gap-4 rounded-standard bg-surface p-4 shadow-panel">
        <CardsTotalStat label="All cards total" cards={cards} />
        <CardsTotalStat label="Unacquired cards total" cards={unacquiredCards} />
        <OldestRefreshStat cards={cards} />
      </div>
      <TopPricedCardsList cards={cards} />
    </section>
  );
}
