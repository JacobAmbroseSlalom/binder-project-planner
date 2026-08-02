import type { DraggableAttributes, DraggableSyntheticListeners } from '@dnd-kit/core';
import { SLOT_HEIGHT_CM, SLOT_WIDTH_CM } from '@binder-project-planner/shared';
import { X } from 'lucide-react';

import { resolveCardImageUrl, type Card } from '@/lib/api';

// The shared visual tile both `BinderSlot` (an occupied binder slot) and
// `UnplacedCard` (a card in the unplaced-cards section, story 15) render
// for a card: an aspect-ratio-constrained image with a hover-revealed
// top-right X remove action. Extracted here once both call sites' markup
// turned out to be identical apart from how each attaches its own drag
// (and, for `BinderSlot` only, drop) ref/handlers and highlight styling -
// each caller keeps owning its own dnd-kit wiring (`useDraggable`, and for
// `BinderSlot`, `useDroppable`) and just passes the resulting
// ref/attributes/listeners straight through as props.
export function CardTile({
  card,
  isDragging,
  isRemovalPending,
  onRemoveCard,
  removeAriaLabel,
  highlightClassName = '',
  tileRef,
  dragAttributes,
  dragListeners,
}: {
  card: Card;
  // True while this specific card is the one currently being dragged -
  // renders an empty placeholder instead (the layout tab's `DragOverlay`
  // renders the actual dragged image), matching both call sites' prior
  // behavior.
  isDragging: boolean;
  isRemovalPending: boolean;
  onRemoveCard: (cardId: string) => void;
  // Differs by call site: `BinderSlot` names the row/column, `UnplacedCard`
  // names the unplaced section.
  removeAriaLabel: string;
  // `BinderSlot`'s drop-target highlight ring (story 14); unplaced cards
  // aren't drop targets themselves (the whole panel is - see
  // `UnplacedCardsPanel`), so `UnplacedCard` never supplies this.
  highlightClassName?: string;
  tileRef: (node: HTMLElement | null) => void;
  dragAttributes: DraggableAttributes;
  dragListeners: DraggableSyntheticListeners;
}) {
  if (isDragging) {
    return (
      <div
        ref={tileRef}
        className={`rounded-standard border border-neutral-700 bg-neutral-800 ${highlightClassName}`}
        style={{ aspectRatio: `${SLOT_WIDTH_CM} / ${SLOT_HEIGHT_CM}` }}
      />
    );
  }

  return (
    <div
      ref={tileRef}
      {...dragAttributes}
      {...dragListeners}
      className={`group relative touch-none ${highlightClassName}`}
      style={{ aspectRatio: `${SLOT_WIDTH_CM} / ${SLOT_HEIGHT_CM}` }}
    >
      <div className="flex h-full w-full items-center justify-center overflow-hidden rounded-standard border border-neutral-700 bg-neutral-800">
        {/* eslint-disable-next-line @next/next/no-img-element -- the card
            image comes from an arbitrary backend/provider origin, so
            next/image's fixed-domain optimization doesn't apply here. */}
        <img
          src={resolveCardImageUrl(card.imageUrl)}
          alt={card.name}
          draggable={false}
          className="h-full w-full object-contain"
        />
      </div>
      {/* Hover-revealed card actions (styling.instructions.md): hidden and
          nudged up/right until hovered, then settles into place over the
          card's top-right corner. `pointer-events-none` while hidden keeps
          it from intercepting clicks meant for the card underneath. */}
      <div className="pointer-events-none absolute top-0 right-0 z-10 flex -translate-y-1 translate-x-1 gap-1 opacity-0 transition-all duration-150 ease-out group-hover:pointer-events-auto group-hover:translate-x-0 group-hover:translate-y-0 group-hover:opacity-100">
        <button
          type="button"
          disabled={isRemovalPending}
          onClick={() => onRemoveCard(card.id)}
          aria-label={removeAriaLabel}
          title="Remove card"
          className="flex size-6 cursor-pointer items-center justify-center rounded-standard bg-neutral-700 text-neutral-100 hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <X className="size-4" aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}
