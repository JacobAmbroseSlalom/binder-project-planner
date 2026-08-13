import type { DraggableAttributes, DraggableSyntheticListeners } from '@dnd-kit/core';
import { Circle, CircleCheck, Copy, Pencil, Trash2 } from 'lucide-react';

import { resolveCardImageUrl, type Card } from '@/lib/api';
import { Tooltip } from '@/shared/feedback';

// The shared visual tile both `BinderSlot` (an occupied binder slot) and
// `UnplacedCard` (a card in the unplaced-cards section, story 15) render
// for a card: an aspect-ratio-constrained image with hover-revealed
// top-right actions (remove, story 16's edit-variation, and story 19's
// duplicate). Extracted here once both call sites' markup turned out to
// be identical apart from how each attaches its own drag (and, for
// `BinderSlot` only, drop)
// ref/handlers and highlight styling - each caller keeps owning its own
// dnd-kit wiring (`useDraggable`, and for `BinderSlot`, `useDroppable`)
// and just passes the resulting ref/attributes/listeners straight through
// as props.
export function CardTile({
  card,
  isDragging,
  isRemovalPending,
  onRemoveCard,
  removeAriaLabel,
  onEditVariation,
  editVariationAriaLabel,
  isVariationEditPending,
  onDuplicateCard,
  duplicateAriaLabel,
  isDuplicatePending,
  onToggleAcquired,
  toggleAcquiredAriaLabel,
  isAcquiredTogglePending,
  acquisitionVisible = false,
  variationsVisible = false,
  highlightClassName = '',
  tileRef,
  dragAttributes,
  dragListeners,
  slotAspectRatio,
  gridRow,
  gridColumn,
  isLocked = false,
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
  // Opens the edit-variation modal for this card (story 16), rendered as a
  // second hover action to the left of the remove action.
  onEditVariation: (card: Card) => void;
  editVariationAriaLabel: string;
  isVariationEditPending: boolean;
  // Duplicates this card into the unplaced-cards section (story 19),
  // rendered as a third hover action alongside remove/edit-variation -
  // available on both placed (`BinderSlot`) and unplaced (`UnplacedCard`)
  // cards, since the duplicate always lands unplaced regardless of where
  // its source card currently sits.
  onDuplicateCard: (cardId: string) => void;
  duplicateAriaLabel: string;
  isDuplicatePending: boolean;
  // Story 36: toggles this card between acquired/unacquired, rendered as a
  // fourth hover action alongside edit-variation/duplicate/remove -
  // available on both placed (`BinderSlot`) and unplaced (`UnplacedCard`)
  // cards.
  onToggleAcquired: (cardId: string) => void;
  toggleAcquiredAriaLabel: string;
  isAcquiredTogglePending: boolean;
  // Story 36's layout-wide toggle: when true, shows a small filled
  // `CircleCheck` badge overlaid on a corner of this tile's image for an
  // acquired card (nothing rendered for an unacquired one) - purely
  // decorative/noninteractive (`aria-hidden`), matching the Michi-
  // indicator precedent; the hover action above remains the accessible
  // control for changing or announcing acquisition state.
  acquisitionVisible?: boolean;
  // Story 16's layout-wide toggle: when true, shows a semi-transparent
  // label overlaid on the bottom edge of this tile's image with its
  // `variation` (only rendered when this card actually has one) - an
  // overlay rather than reserved space below the image, so toggling it
  // never changes any slot's size or the binder side's overall
  // dimensions.
  variationsVisible?: boolean;
  // `BinderSlot`'s drop-target highlight ring (story 14); unplaced cards
  // aren't drop targets themselves (the whole panel is - see
  // `UnplacedCardsPanel`), so `UnplacedCard` never supplies this.
  highlightClassName?: string;
  tileRef: (node: HTMLElement | null) => void;
  dragAttributes: DraggableAttributes;
  dragListeners: DraggableSyntheticListeners;
  // Story 24: the binder's configured single-slot width-to-height ratio,
  // replacing the old fixed `SLOT_WIDTH_CM`/`SLOT_HEIGHT_CM` ratio.
  slotAspectRatio: number;
  // Story 26: this occupied slot's explicit (1-based) grid position,
  // supplied only by `BinderSlot` (never by `UnplacedCard`, which isn't in
  // a grid at all) - needed now that placed multi-slot art tiles are
  // explicitly positioned in the same grid, and CSS Grid places explicitly
  // positioned items before any auto-placed ones regardless of DOM order,
  // which would otherwise shift every subsequent auto-placed slot forward
  // past cells the art already claimed.
  gridRow?: number;
  gridColumn?: number;
  // Story 32: when true, this card's remove/edit-variation/duplicate
  // hover actions are omitted entirely (not merely disabled) - the binder
  // is locked, so none of them are available.
  isLocked?: boolean;
}) {
  if (isDragging) {
    return (
      <div
        ref={tileRef}
        className={`rounded-standard border border-neutral-700 bg-neutral-800 ${highlightClassName}`}
        style={{ aspectRatio: slotAspectRatio, gridRow, gridColumn }}
      />
    );
  }

  return (
    <div
      ref={tileRef}
      {...dragAttributes}
      {...dragListeners}
      className={`group relative touch-none ${highlightClassName}`}
      style={{ aspectRatio: slotAspectRatio, gridRow, gridColumn }}
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
          nudged up until hovered, then settles into place as a single grey
          bar spanning the card's full top edge (rather than floating
          individual buttons in one corner), matching the variation
          label's own full-width bar convention below. `pointer-events-none`
          while hidden keeps it from intercepting clicks meant for the card
          underneath. Story 32: omitted entirely while the binder is
          locked. */}
      {!isLocked && (
        <div className="pointer-events-none absolute inset-x-0 top-0 z-10 flex -translate-y-1 items-center justify-evenly rounded-t-standard bg-black/60 px-1 py-1 opacity-0 transition-all duration-150 ease-out group-hover:pointer-events-auto group-hover:translate-y-0 group-hover:opacity-100">
          <Tooltip label={card.acquired ? 'Mark as unacquired' : 'Mark as acquired'}>
            <button
              type="button"
              disabled={isAcquiredTogglePending}
              onClick={() => onToggleAcquired(card.id)}
              aria-label={toggleAcquiredAriaLabel}
              className="flex size-6 cursor-pointer items-center justify-center rounded-standard text-neutral-100 hover:bg-neutral-600 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {card.acquired ? (
                <CircleCheck className="size-3.5" aria-hidden="true" />
              ) : (
                <Circle className="size-3.5" aria-hidden="true" />
              )}
            </button>
          </Tooltip>
          <Tooltip label="Edit variation">
            <button
              type="button"
              disabled={isVariationEditPending}
              onClick={() => onEditVariation(card)}
              aria-label={editVariationAriaLabel}
              className="flex size-6 cursor-pointer items-center justify-center rounded-standard text-neutral-100 hover:bg-neutral-600 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Pencil className="size-3.5" aria-hidden="true" />
            </button>
          </Tooltip>
          <Tooltip label="Duplicate card">
            <button
              type="button"
              disabled={isDuplicatePending}
              onClick={() => onDuplicateCard(card.id)}
              aria-label={duplicateAriaLabel}
              className="flex size-6 cursor-pointer items-center justify-center rounded-standard text-neutral-100 hover:bg-neutral-600 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Copy className="size-3.5" aria-hidden="true" />
            </button>
          </Tooltip>
          <Tooltip label="Remove card">
            <button
              type="button"
              disabled={isRemovalPending}
              onClick={() => onRemoveCard(card.id)}
              aria-label={removeAriaLabel}
              className="flex size-6 cursor-pointer items-center justify-center rounded-standard text-neutral-100 hover:bg-neutral-600 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Trash2 className="size-3.5" aria-hidden="true" />
            </button>
          </Tooltip>
        </div>
      )}
      {/* Story 16's variation label - overlaid directly on the card image's
          own bottom edge (rather than reserved space below it), so
          toggling variations on/off never changes any slot's size or the
          binder side's overall dimensions. Only rendered when this card
          actually has a variation - there's no layout reason to reserve
          the space otherwise, since the overlay never affects sizing.
          Truncated to one line with an ellipsis; `title` exposes the
          complete value in a native hover tooltip. Uses a smaller-than-
          `text-caption` arbitrary size (rather than one of the 4 documented
          type steps) as a deliberate, narrow exception: this badge sits
          over a card image at whatever width the binder's configured slot
          size happens to render at, which is often too narrow for even
          `text-caption` to fit the longest built-in suggestion,
          "Expansion Stamp", without truncating it. */}
      {variationsVisible && card.variation && (
        <div
          className="pointer-events-none absolute right-0 bottom-0 left-0 overflow-hidden rounded-b-standard bg-black/60 px-1 py-0.5 text-center text-[0.6rem] leading-tight text-neutral-100"
          title={card.variation}
        >
          <span className="block truncate">{card.variation}</span>
        </div>
      )}
      {/* Story 36's acquired badge - a small filled `CircleCheck` overlaid
          on the image's top-left corner (rather than the bottom edge,
          which the variation label above already occupies), so both
          overlays can show at once without colliding. Purely decorative:
          `aria-hidden` and never part of the tab order, since the hover
          action above is the accessible control for this state; rendered
          only for an acquired card, matching the variation label's own
          "nothing to show" convention when unset. */}
      {acquisitionVisible && card.acquired && (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute top-0 left-0 flex items-center justify-center rounded-br-standard rounded-tl-standard bg-black/60 p-0.5"
        >
          <CircleCheck className="size-3.5 fill-secondary text-background" />
        </div>
      )}
    </div>
  );
}
