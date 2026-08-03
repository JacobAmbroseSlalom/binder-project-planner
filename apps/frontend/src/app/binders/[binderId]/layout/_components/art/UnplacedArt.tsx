'use client';

import { useDraggable } from '@dnd-kit/core';

import type { Art, Binder } from '@/lib/api';

import { ArtActionsOverlay } from './ArtActionsOverlay';
import { ArtTile } from './ArtTile';

// One row in the unplaced-art section (story 26), extracted out of
// `UnplacedArtPanel`'s virtualized-row render loop for the same reason
// `UnplacedCard` was extracted out of `UnplacedCardsPanel` in story 15:
// calling `useDraggable` from within a `.map()` callback violates the
// rules of hooks. Unlike `PlacedArtTile`, this is draggable only - not
// droppable - the whole panel is the one drop target (see
// `UnplacedArtPanel`) - and reveals the same hover actions
// (edit/delete/duplicate) `PlacedArtTile` does.
export function UnplacedArt({
  art,
  binder,
  widthPx,
  isPendingCreate,
  isMovePending,
  isEditPending,
  isDeletionPending,
  isDuplicatePending,
  onEditArt,
  onRemoveArt,
  onDuplicateArt,
}: {
  art: Art;
  binder: Binder;
  widthPx: number;
  isPendingCreate: boolean;
  isMovePending: boolean;
  isEditPending: boolean;
  isDeletionPending: boolean;
  isDuplicatePending: boolean;
  onEditArt: (art: Art) => void;
  onRemoveArt: (artId: string) => void;
  onDuplicateArt: (artId: string) => void;
}) {
  const isActionDisabled =
    isPendingCreate || isEditPending || isDeletionPending || isDuplicatePending;

  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: art.id,
    data: { art },
    disabled: isMovePending || isActionDisabled,
  });

  if (isDragging) {
    return (
      <div
        ref={setNodeRef}
        className="shrink-0 rounded-standard border border-neutral-700 bg-neutral-800"
        style={{
          width: widthPx,
          aspectRatio:
            (art.widthSlots * binder.widthPerSlot + binder.widthBase) /
            (art.heightSlots * binder.heightPerSlot + binder.heightBase),
        }}
      />
    );
  }

  return (
    <div ref={setNodeRef} {...attributes} {...listeners} className="group relative touch-none">
      <ArtTile art={art} binder={binder} isPendingCreate={isPendingCreate} widthPx={widthPx} />
      <ArtActionsOverlay
        title={art.title}
        isEditDisabled={isActionDisabled}
        isDeleteDisabled={isActionDisabled}
        isDuplicateDisabled={isActionDisabled}
        onEdit={() => onEditArt(art)}
        onDelete={() => onRemoveArt(art.id)}
        onDuplicate={() => onDuplicateArt(art.id)}
      />
    </div>
  );
}
