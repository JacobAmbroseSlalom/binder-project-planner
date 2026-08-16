'use client';

import { Plus, Trash2 } from 'lucide-react';

import {
  FinanceField,
  financeInputClassName,
} from '../../binders/[binderId]/financials/_components/FinanceField';
import { parseCardCount } from '../_lib/cardsArtCalculations';
import type { CardCountRow } from '../_lib/previewTypes';

// Rounds a slot count to a whole-number percentage of `totalSlots`, or 0
// when there are no slots yet (no Binder cost entry selected) to avoid
// dividing by zero.
function toPercent(count: number, totalSlots: number): number {
  if (totalSlots <= 0) return 0;
  return Math.round((count / totalSlots) * 100);
}

// One totals stat - label-over-bold-value-over-caption, matching the real
// "View Financials" tab's own `CardsTotalStat` layout so this section's
// totals look the same even though the underlying data here is cosmetic
// label/count rows rather than real priced cards. `valueClassName` lets
// the Art slots stat opt into story 40's over-capacity error color.
function CardsArtTotalStat({
  label,
  value,
  detail,
  valueClassName,
}: {
  label: string;
  value: number;
  detail: string;
  valueClassName?: string;
}) {
  return (
    <div className="flex flex-col items-center justify-end gap-1 text-center">
      <span className="text-caption text-neutral-500">{label}</span>
      <span className={`text-subheading font-bold ${valueClassName ?? ''}`}>{value}</span>
      <span className="text-caption text-neutral-500">{detail}</span>
    </div>
  );
}

// The Finances Preview page's "Cards & Art" section (story 54): repeatable
// cosmetic label+count rows (e.g. "Base set — 100") that sum to a total
// card count, plus a summary of how that count (and the remaining "art"
// slots) compares to the total slots the selected/created Binder cost
// entry provides. Over-capacity (more cards than total slots) reuses story
// 40's layout-summary error-color convention rather than blocking input -
// there's no hard cap here.
export function PreviewCardsArtSection({
  rows,
  onRowsChange,
  totalSlots,
}: {
  rows: CardCountRow[];
  onRowsChange: (rows: CardCountRow[]) => void;
  totalSlots: number;
}) {
  const totalCards = rows.reduce((sum, row) => sum + parseCardCount(row.count), 0);
  const artSlots = totalSlots - totalCards;
  const overCapacity = totalCards > totalSlots;

  function handleAddRow() {
    onRowsChange([...rows, { id: crypto.randomUUID(), label: '', count: '' }]);
  }

  function handleRemoveRow(id: string) {
    onRowsChange(rows.filter((row) => row.id !== id));
  }

  function handleLabelChange(id: string, label: string) {
    onRowsChange(rows.map((row) => (row.id === id ? { ...row, label } : row)));
  }

  function handleCountChange(id: string, count: string) {
    onRowsChange(rows.map((row) => (row.id === id ? { ...row, count } : row)));
  }

  return (
    <section className="flex flex-col gap-3">
      <div className="grid grid-cols-[1fr_auto_1fr] items-center">
        <div aria-hidden="true" />
        <h2 className="text-center text-heading font-bold">Cards &amp; Art</h2>
        {/* Invisible clone of Time-based costs' "Wage per hour" field
            (same height-determining markup, hidden via `invisible`) so
            this section's header row matches that one's height when the
            two sit side by side, mirroring the real "View Financials"
            tab's Time-based costs/Cards layout. */}
        <div className="invisible max-w-40 justify-self-end" aria-hidden="true">
          <FinanceField label="Wage per hour" htmlFor="cards-art-header-spacer">
            <input
              id="cards-art-header-spacer"
              className={financeInputClassName}
              disabled
              tabIndex={-1}
            />
          </FinanceField>
        </div>
      </div>
      {/* Totals grid mirroring the real Cards section's own 3-stat grid
          (`CardsFinanceSection`'s `grid-cols-3` panel). */}
      <div className="grid grid-cols-3 gap-4 rounded-standard bg-surface p-4 shadow-panel">
        <CardsArtTotalStat label="Total slots" value={totalSlots} detail="cards + art" />
        <CardsArtTotalStat
          label="Total cards"
          value={totalCards}
          detail={`${toPercent(totalCards, totalSlots)}% of slots`}
        />
        <CardsArtTotalStat
          label="Art slots"
          value={artSlots}
          detail={`${toPercent(artSlots, totalSlots)}% of slots`}
          valueClassName={overCapacity ? 'text-error' : undefined}
        />
      </div>
      <div className="flex flex-col gap-3 rounded-standard bg-surface p-4 shadow-panel">
        <div className="flex flex-col gap-3">
          {rows.map((row, index) => (
            <div key={row.id} className="flex items-end gap-3">
              <FinanceField label="Label" htmlFor={`card-count-label-${row.id}`} className="flex-1">
                <input
                  id={`card-count-label-${row.id}`}
                  type="text"
                  placeholder="e.g. Base set"
                  value={row.label}
                  onChange={(event) => handleLabelChange(row.id, event.target.value)}
                  className={financeInputClassName}
                />
              </FinanceField>
              <FinanceField
                label="Card Count"
                htmlFor={`card-count-value-${row.id}`}
                className="w-32"
              >
                <input
                  id={`card-count-value-${row.id}`}
                  type="number"
                  min={0}
                  step={1}
                  value={row.count}
                  onChange={(event) => handleCountChange(row.id, event.target.value)}
                  className={`w-full ${financeInputClassName}`}
                />
              </FinanceField>
              <button
                type="button"
                aria-label={`Remove row ${index + 1}`}
                onClick={() => handleRemoveRow(row.id)}
                className="cursor-pointer rounded-standard p-2 text-neutral-500 hover:brightness-110"
              >
                <Trash2 className="size-5" aria-hidden="true" />
              </button>
            </div>
          ))}
        </div>
        <div>
          <button
            type="button"
            onClick={handleAddRow}
            className="flex cursor-pointer items-center gap-2 rounded-standard bg-neutral-800 px-4 py-2 font-bold hover:brightness-110"
          >
            <Plus className="size-4" aria-hidden="true" />
            Add
          </button>
        </div>
      </div>
    </section>
  );
}
