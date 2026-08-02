import { useDraggable, useDroppable } from '@dnd-kit/core';
import { Plus } from 'lucide-react';

import type { Card } from '@/lib/api';

import { CardTile } from './CardTile';

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
  slotAspectRatio,
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
  // Story 24: the binder's configured single-slot width-to-height ratio,
  // threaded down from `BinderLayoutView` through `BinderSide`.
  slotAspectRatio: number;
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
    // Both the dragging placeholder and the real tile share the same
    // `CardTile` an unplaced card also uses - only the ref-combining
    // (droppable + draggable, since an occupied slot is simultaneously a
    // valid swap target for another drag) and the `isOver` highlight ring
    // are specific to being a binder slot rather than an unplaced card.
    return (
      <CardTile
        card={card}
        isDragging={isDragging}
        isRemovalPending={isRemovalPending}
        onRemoveCard={onRemoveCard}
        removeAriaLabel={`Remove ${card.name} from row ${row}, column ${column}`}
        highlightClassName={highlightClassName}
        tileRef={(node) => {
          setDroppableRef(node);
          setDraggableRef(node);
        }}
        dragAttributes={attributes}
        dragListeners={listeners}
        slotAspectRatio={slotAspectRatio}
      />
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
      style={{ aspectRatio: slotAspectRatio }}
    >
      <Plus className="size-6 text-neutral-500" aria-hidden="true" />
    </button>
  );
}
