'use client';

import { useDraggable } from '@dnd-kit/core';

import type { Art, Binder } from '@/lib/api';

import { ArtActionsOverlay } from './ArtActionsOverlay';
import { ArtTile } from './ArtTile';

// One placed multi-slot art item's tile, rendered by `BinderSide` as a
// grid-spanning overlay on top of the (covered, card-free) `BinderSlot`
// cells its footprint occupies (story 26). Draggable so it can be moved
// to another placement or to the unplaced-art section - `BinderLayoutView`
// computes the actual destination anchor from wherever the drag ends up,
// using the pointer's initial grabbed-cell offset within this tile (see
// its own `handleDragStart`) - and reveals the same hover actions
// (edit/delete/duplicate) `UnplacedArt` does.
export function PlacedArtTile({
  art,
  binder,
  isMovePending,
  isEditPending,
  isDeletionPending,
  isDuplicatePending,
  highlightClassName = '',
  onEditArt,
  onRemoveArt,
  onDuplicateArt,
}: {
  art: Art;
  binder: Binder;
  // True while any card/art move or swap is in flight for the binder
  // (story 26: "Card and art moves share one binder-scoped movement
  // queue") - disables dragging this tile until it settles.
  isMovePending: boolean;
  isEditPending: boolean;
  isDeletionPending: boolean;
  isDuplicatePending: boolean;
  // Story 26's shared destination-highlight style, mirroring
  // `BinderSlot`'s own - applied here (rather than to the covered slots
  // underneath) since this tile visually covers them.
  highlightClassName?: string;
  onEditArt: (art: Art) => void;
  onRemoveArt: (artId: string) => void;
  onDuplicateArt: (artId: string) => void;
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: art.id,
    data: { art },
    disabled:
      isMovePending || isEditPending || isDeletionPending || isDuplicatePending || binder.locked,
  });

  const isActionDisabled = isEditPending || isDeletionPending || isDuplicatePending;

  if (isDragging) {
    // Mirrors `CardTile`'s own dragging placeholder - the `DragOverlay`
    // in `BinderLayoutView` renders the actual art image following the
    // pointer instead.
    return (
      <div
        ref={setNodeRef}
        className={`h-full w-full rounded-standard border border-neutral-700 bg-neutral-800 ${highlightClassName}`}
      />
    );
  }

  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      className={`group relative h-full w-full touch-none ${highlightClassName}`}
    >
      <ArtTile art={art} binder={binder} isPendingCreate={false} />
      {/* Story 32: the whole hover-action overlay is omitted (not merely
          disabled) while the binder is locked. */}
      {!binder.locked && (
        <ArtActionsOverlay
          title={art.title}
          isEditDisabled={isActionDisabled}
          isDeleteDisabled={isActionDisabled}
          isDuplicateDisabled={isActionDisabled}
          onEdit={() => onEditArt(art)}
          onDelete={() => onRemoveArt(art.id)}
          onDuplicate={() => onDuplicateArt(art.id)}
        />
      )}
    </div>
  );
}
