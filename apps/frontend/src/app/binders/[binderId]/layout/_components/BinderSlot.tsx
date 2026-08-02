import { useDraggable, useDroppable } from '@dnd-kit/core';
import { SLOT_HEIGHT_CM, SLOT_WIDTH_CM } from '@binder-project-planner/shared';
import { Plus, X } from 'lucide-react';

import { resolveCardImageUrl, type Card } from '@/lib/api';

// One binder slot (story 11), extracted out of `BinderSide`'s render loop
// so `useDraggable`/`useDroppable` (story 14) can be called once per slot
// rather than inside a `.map()` callback - calling a hook from within a
// loop body violates the rules of hooks even when, as here, the loop
// always iterates a fixed `width * height` number of times.
export function BinderSlot({
  physicalPage,
  row,
  column,
  card,
  isPendingPlacement,
  isRemovalPending,
  isMovePending,
  onSlotClick,
  onRemoveCard,
}: {
  physicalPage: number;
  row: number;
  column: number;
  card: Card | undefined;
  // True while this (currently empty) slot has a card assignment in
  // flight (story 11) - irrelevant for an occupied slot, which uses
  // `isRemovalPending`/`isMovePending` instead.
  isPendingPlacement: boolean;
  // True while this slot's own occupying card has a removal in flight
  // (story 13).
  isRemovalPending: boolean;
  // True while any move/swap request is in flight for the binder (story
  // 14) - disables dragging and dropping on every slot until it settles,
  // per the story's single in-flight-movement-per-binder requirement.
  isMovePending: boolean;
  onSlotClick: (row: number, column: number) => void;
  onRemoveCard: (cardId: string) => void;
}) {
  // Every slot - occupied or empty - is a drop target (a drop onto an
  // occupied slot swaps the two cards). `id` matches the coordinate shape
  // `BinderLayoutView`'s drag-end handler expects to read back off
  // `over.data.current`.
  const { setNodeRef: setDroppableRef, isOver } = useDroppable({
    id: `${physicalPage}-${row}-${column}`,
    data: { physicalPage, row, column },
    disabled: isMovePending,
  });

  // Only an occupied slot's card itself is draggable; disabled while its
  // own removal or any binder-wide move/swap is in flight so it can't be
  // picked up mid-request.
  const {
    attributes,
    listeners,
    setNodeRef: setDraggableRef,
    isDragging,
  } = useDraggable({
    id: card?.id ?? `empty-${physicalPage}-${row}-${column}`,
    data: card ? { card } : undefined,
    disabled: !card || isMovePending || isRemovalPending,
  });

  // Story 14's single destination-highlight style: applied to whichever
  // slot collision detection currently selects, regardless of whether the
  // eventual drop would be a move, a swap, or (once multi-slot art exists)
  // blocked - the technical requirements call for one style that doesn't
  // distinguish those cases.
  const highlightClassName = isOver ? 'ring-2 ring-inset ring-primary' : '';

  if (card) {
    // While this card is being dragged, its own slot shows an empty
    // placeholder (the `DragOverlay` in `BinderLayoutView` renders the
    // actual dragged image) rather than the card twice on screen at once.
    if (isDragging) {
      return (
        <div
          ref={setDroppableRef}
          className={`rounded-standard border border-neutral-700 bg-neutral-800 ${highlightClassName}`}
          style={{ aspectRatio: `${SLOT_WIDTH_CM} / ${SLOT_HEIGHT_CM}` }}
        />
      );
    }

    return (
      // `group relative` lets the hover-revealed X action below sit in
      // this slot's own top-right corner (as a sibling of the clipped
      // image div, not a child of it), overlapping the card so it stays
      // within the slot's clickable bounds rather than sliding out over a
      // neighboring slot. Both the draggable and droppable refs land on
      // this same outer node, since an occupied slot is simultaneously
      // the thing being dragged and a valid swap target for another drag.
      <div
        ref={(node) => {
          setDroppableRef(node);
          setDraggableRef(node);
        }}
        {...attributes}
        {...listeners}
        className={`group relative touch-none ${highlightClassName}`}
        style={{ aspectRatio: `${SLOT_WIDTH_CM} / ${SLOT_HEIGHT_CM}` }}
      >
        <div className="flex h-full w-full items-center justify-center overflow-hidden rounded-standard border border-neutral-700 bg-neutral-800">
          {/* eslint-disable-next-line @next/next/no-img-element -- the
              card image comes from an arbitrary backend/provider origin,
              so next/image's fixed-domain optimization doesn't apply
              here. */}
          <img
            src={resolveCardImageUrl(card.imageUrl)}
            alt={card.name}
            // Disables the browser's native HTML5 image dragging (story
            // 14's technical requirement) so it never competes with
            // dnd-kit's own pointer-based dragging on the same element.
            draggable={false}
            className="h-full w-full object-contain"
          />
        </div>
        {/* Hover-revealed card actions (styling.instructions.md): hidden
            and nudged up/right until hovered, then settles into place
            over the card's top-right corner. `pointer-events-none` while
            hidden keeps it from intercepting clicks meant for the card
            underneath. */}
        <div className="pointer-events-none absolute top-0 right-0 z-10 flex -translate-y-1 translate-x-1 gap-1 opacity-0 transition-all duration-150 ease-out group-hover:pointer-events-auto group-hover:translate-x-0 group-hover:translate-y-0 group-hover:opacity-100">
          <button
            type="button"
            disabled={isRemovalPending}
            onClick={() => onRemoveCard(card.id)}
            aria-label={`Remove ${card.name} from row ${row}, column ${column}`}
            title="Remove card"
            className="flex size-6 cursor-pointer items-center justify-center rounded-standard bg-neutral-700 text-neutral-100 hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <X className="size-4" aria-hidden="true" />
          </button>
        </div>
      </div>
    );
  }

  return (
    <button
      ref={setDroppableRef}
      type="button"
      disabled={isPendingPlacement}
      onClick={() => onSlotClick(row, column)}
      aria-label={`Add a card to row ${row}, column ${column}`}
      className={`flex cursor-pointer items-center justify-center rounded-standard border border-neutral-700 bg-neutral-800 hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50 ${highlightClassName}`}
      style={{ aspectRatio: `${SLOT_WIDTH_CM} / ${SLOT_HEIGHT_CM}` }}
    >
      <Plus className="size-6 text-neutral-500" aria-hidden="true" />
    </button>
  );
}
