import { getTotalSlots } from '@binder-project-planner/shared';
import { Check } from 'lucide-react';

import type { Art, Binder, Card } from '@/lib/api';
import { Tooltip } from '@/shared/feedback';

// Compact metric token with the shared instant tooltip (hover/focus),
// without changing the token's own visual styling. The wrapping `span`
// (rather than a button) carries its own `tabIndex`/`aria-label` since
// there's no other interactive element here to hang them on.
function MetricAbbr({
  value,
  suffix,
  tooltip,
}: {
  value: number;
  suffix: string;
  tooltip: string;
}) {
  return (
    <Tooltip label={tooltip}>
      <span tabIndex={0} aria-label={`${value} ${tooltip}`}>
        {value}
        {suffix}
      </span>
    </Tooltip>
  );
}

// The "Edit Layout" tab's summary stats line (story 40), rendered directly
// above the spread page label. Computed entirely client-side from the cards
// and art already loaded in the binder route context plus the binder's
// dimensions - no backend request and no new binder-summary field. It
// surfaces how full the binder is and, crucially, whether everything still
// sitting in the unplaced sections can even fit in the remaining empty
// slots.
export function BinderLayoutSummaryStats({
  binder,
  cards,
  art,
}: {
  binder: Binder;
  cards: Card[];
  art: Art[];
}) {
  // Total slots across every physical page, from the shared helper (story
  // 22) rather than recomputing `width * height * 2 * pages` inline.
  const totalSlots = getTotalSlots(binder.width, binder.height, binder.pages);

  // Distinct filled slots, deduplicated across overlaps and keyed by
  // physical page + coordinate - mirroring the backend's `countOccupiedSlots`
  // (a card contributes its single placed cell; an art item contributes
  // every cell in its footprint). Unplaced items (all-null placement) never
  // contribute.
  const occupiedKeys = new Set<string>();
  for (const card of cards) {
    const { physicalPage, row, column } = card.placement;
    if (physicalPage === null || row === null || column === null) continue;
    occupiedKeys.add(`${physicalPage}-${row}-${column}`);
  }
  for (const item of art) {
    const { physicalPage, row, column } = item.placement;
    if (physicalPage === null || row === null || column === null) continue;
    for (let r = row; r < row + item.heightSlots; r++) {
      for (let c = column; c < column + item.widthSlots; c++) {
        occupiedKeys.add(`${physicalPage}-${r}-${c}`);
      }
    }
  }
  const occupiedSlots = occupiedKeys.size;
  const emptySlots = totalSlots - occupiedSlots;
  const slotCompletionPercent = Math.round((occupiedSlots / totalSlots) * 100);
  const isFull = occupiedSlots === totalSlots;
  const placedCards = cards.filter((card) => card.placement.physicalPage !== null).length;
  const placedArtItems = art.filter((item) => item.placement.physicalPage !== null);
  const placedArt = placedArtItems.length;
  const placedArtSlots = placedArtItems.reduce(
    (sum, item) => sum + item.widthSlots * item.heightSlots,
    0,
  );

  // Unplaced items are those with an all-null placement.
  const unplacedCards = cards.filter((card) => card.placement.physicalPage === null);
  const unplacedArt = art.filter((item) => item.placement.physicalPage === null);

  // Slots the unplaced items would need if placed: one per unplaced card,
  // plus each unplaced art item's full footprint area. Cards and art are
  // counted together against the single remaining-empty-slots figure.
  const artSlotsNeeded = unplacedArt.reduce(
    (sum, item) => sum + item.widthSlots * item.heightSlots,
    0,
  );
  const slotsNeeded = unplacedCards.length + artSlotsNeeded;
  const overCapacity = slotsNeeded > emptySlots;

  // Abbreviated metric tokens stay compact in the UI while exposing their
  // full meaning on hover.
  const placedTooltip = 'Placed';
  const unplacedTooltip = 'Unplaced';
  const slotsTooltip = 'Slots';

  return (
    <div className="flex flex-wrap items-center justify-center gap-x-1 text-center text-caption">
      {/* Slots-filled figure: success-tinted with a checkmark when the
          binder is completely full, otherwise the muted secondary tone. */}
      <span className={`flex items-center gap-1 ${isFull ? 'text-success' : 'text-neutral-500'}`}>
        {isFull && <Check className="size-4" aria-hidden="true" />}
        Slots: {occupiedSlots}/{totalSlots} ({slotCompletionPercent}%)
      </span>
      <span className="text-neutral-500" aria-hidden="true">
        ·
      </span>
      <span className="text-neutral-500">
        Cards: <MetricAbbr value={placedCards} suffix="P" tooltip={placedTooltip} /> -{' '}
        <MetricAbbr value={unplacedCards.length} suffix="U" tooltip={unplacedTooltip} />
      </span>
      <span className="text-neutral-500" aria-hidden="true">
        ·
      </span>
      {/* Unplaced figure: error-tinted (with the shortfall) when the
          unplaced cards and art together need more slots than remain
          empty, otherwise the same muted tone. */}
      <span className={overCapacity ? 'text-error' : 'text-neutral-500'}>
        Art: <MetricAbbr value={placedArt} suffix="P" tooltip={placedTooltip} /> (
        <MetricAbbr value={placedArtSlots} suffix="s" tooltip={slotsTooltip} />) -{' '}
        <MetricAbbr value={unplacedArt.length} suffix="U" tooltip={unplacedTooltip} /> (
        <MetricAbbr value={artSlotsNeeded} suffix="s" tooltip={slotsTooltip} />)
      </span>
    </div>
  );
}
