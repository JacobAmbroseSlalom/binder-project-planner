'use client';

import {
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import { CARD_DRAG_ACTIVATION_DISTANCE_PX } from '@binder-project-planner/shared';
import { useState } from 'react';

import type { Art, Binder, Card, PlacementCoordinates } from '@/lib/api';

import { getFootprintCells, isFootprintBlocked, isFootprintInBounds } from '../artFootprint';

// Owns story 14/26's drag-and-drop lifecycle for `BinderLayoutView`: the
// currently-dragged card or art item (driving the `DragOverlay`'s content
// and disabling page navigation mid-drag), the live destination-footprint
// preview for an art drag, and the pointer sensor itself. Extracted from
// `BinderLayoutView` since this drag machinery is a large, self-contained
// concern independent of the rest of that component's state.
export function useLayoutDragAndDrop({
  binder,
  cards,
  art,
  moveCard,
  moveArt,
}: {
  binder: Binder;
  cards: Card[];
  art: Art[];
  moveCard: (cardId: string, destination: PlacementCoordinates) => void;
  moveArt: (artId: string, destination: PlacementCoordinates) => void;
}) {
  // The card currently being dragged (story 14), or `null` while no drag
  // is in progress - drives the `DragOverlay`'s content, the source slot's
  // empty-placeholder rendering (in `BinderSlot`), and disabling page
  // navigation while a drag is active.
  const [activeDragCard, setActiveDragCard] = useState<Card | null>(null);
  // The art item currently being dragged (story 26), alongside the grabbed
  // cell's offset from the art's own top-left anchor - captured once at
  // drag start (planning.md: "Art dragging records the relative footprint
  // cell under the initial pointer") and reused on every drag-over/drag-end
  // to derive the destination anchor from whichever cell is hovered/
  // dropped, by subtracting these offsets back off.
  const [activeDragArt, setActiveDragArt] = useState<{
    art: Art;
    rowOffset: number;
    columnOffset: number;
  } | null>(null);
  // The destination footprint currently being previewed during an art drag
  // (story 26), or `null` while no art drag is in progress or the pointer
  // isn't over any slot - computed in `handleDragOver` below and passed
  // down to whichever `BinderSide` matches its `physicalPage` for the
  // valid/blocked highlight overlay.
  const [dragCandidateFootprint, setDragCandidateFootprint] = useState<{
    physicalPage: number;
    anchorRow: number;
    anchorColumn: number;
    widthSlots: number;
    heightSlots: number;
    valid: boolean;
  } | null>(null);
  // Only a `PointerSensor` (mouse/touch pointer) is wired up for story 14
  // - keyboard dragging is explicitly deferred. `activationConstraint`
  // requires the pointer to move a few pixels before a drag starts, so an
  // ordinary click (e.g. a future card-details action) isn't mistaken for
  // a drag attempt.
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: CARD_DRAG_ACTIVATION_DISTANCE_PX },
    }),
  );

  // Tracks which card or art item is being dragged, once the pointer
  // sensor's activation distance is exceeded. For art (story 26), also
  // captures the grabbed cell's offset from the art's own top-left anchor:
  // the activator event's pointer position within the dragged tile's
  // initial rect, normalized to a 0-1 fraction and floored into a footprint
  // cell index (planning.md: "the initial pointer's normalized position
  // within the thumbnail maps to the corresponding footprint cell").
  function handleDragStart(event: DragStartEvent) {
    const card = event.active.data.current?.card as Card | undefined;
    const draggedArtItem = event.active.data.current?.art as Art | undefined;
    setActiveDragCard(card ?? null);

    if (!draggedArtItem) {
      setActiveDragArt(null);
      return;
    }

    const rect = event.active.rect.current.initial;
    let rowOffset = 0;
    let columnOffset = 0;
    if (rect && event.activatorEvent instanceof PointerEvent) {
      const normalizedX = (event.activatorEvent.clientX - rect.left) / rect.width;
      const normalizedY = (event.activatorEvent.clientY - rect.top) / rect.height;
      columnOffset = Math.min(
        Math.max(Math.floor(normalizedX * draggedArtItem.widthSlots), 0),
        draggedArtItem.widthSlots - 1,
      );
      rowOffset = Math.min(
        Math.max(Math.floor(normalizedY * draggedArtItem.heightSlots), 0),
        draggedArtItem.heightSlots - 1,
      );
    }
    setActiveDragArt({ art: draggedArtItem, rowOffset, columnOffset });
  }

  // Live-updates the candidate destination footprint while an art drag is
  // in progress (story 26: "the client highlights every slot in the
  // derived candidate footprint and uses distinct valid and blocked
  // styles"). The hovered slot minus the drag's own captured grab offset
  // gives the destination top-left anchor; out-of-bounds or occupied
  // cells (excluding the dragged art's own current footprint) mark it
  // blocked rather than valid. Hovering the unplaced panel or nothing at
  // all clears the highlight entirely, since dropping there never
  // conflicts with anything.
  function handleDragOver(event: DragOverEvent) {
    if (!activeDragArt) return;

    const overData = event.over?.data.current as
      { physicalPage: number; row: number; column: number } | { unplaced: true } | undefined;
    if (!overData || 'unplaced' in overData) {
      setDragCandidateFootprint(null);
      return;
    }

    const { art: draggedArtItem, rowOffset, columnOffset } = activeDragArt;
    const anchorRow = overData.row - rowOffset;
    const anchorColumn = overData.column - columnOffset;
    const inBounds = isFootprintInBounds(
      anchorRow,
      anchorColumn,
      draggedArtItem.widthSlots,
      draggedArtItem.heightSlots,
      binder.width,
      binder.height,
    );
    const blocked =
      !inBounds ||
      isFootprintBlocked(
        cards,
        art,
        overData.physicalPage,
        getFootprintCells(
          anchorRow,
          anchorColumn,
          draggedArtItem.widthSlots,
          draggedArtItem.heightSlots,
        ),
        draggedArtItem.id,
      );

    setDragCandidateFootprint({
      physicalPage: overData.physicalPage,
      anchorRow,
      anchorColumn,
      widthSlots: draggedArtItem.widthSlots,
      heightSlots: draggedArtItem.heightSlots,
      valid: !blocked,
    });
  }

  // Resolves a completed drag into a move/swap request (story 14), or a
  // silent no-op if dropped outside any drop target or back onto its own
  // current location - per the story's "dropping a card onto its own
  // source slot ends the drag without changing anything" requirement,
  // generalized to the unplaced panel too (story 15): a drop target's
  // `data.current` is either a concrete slot's `{ physicalPage, row,
  // column }` or the unplaced panel's `{ unplaced: true }` marker (see
  // `UnplacedCardsPanel`), which resolves to an all-null destination. Art
  // drags (story 26) are resolved the same way, but the destination
  // anchor is the hovered slot minus the drag's own captured grab offset
  // rather than the hovered slot itself; a client-known blocked drop
  // cancels silently (planning.md: "no request or toast") since
  // `dragCandidateFootprint` already reflects that.
  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    setActiveDragCard(null);

    const draggedArtItem = active.data.current?.art as Art | undefined;
    if (draggedArtItem) {
      const dragState = activeDragArt;
      setActiveDragArt(null);
      setDragCandidateFootprint(null);
      if (!dragState || !over) return;

      const overData = over.data.current as
        { physicalPage: number; row: number; column: number } | { unplaced: true } | undefined;
      if (!overData) return;

      const destination: {
        physicalPage: number | null;
        row: number | null;
        column: number | null;
      } =
        'unplaced' in overData
          ? { physicalPage: null, row: null, column: null }
          : {
              physicalPage: overData.physicalPage,
              row: overData.row - dragState.rowOffset,
              column: overData.column - dragState.columnOffset,
            };

      const source = draggedArtItem.placement;
      if (
        source.physicalPage === destination.physicalPage &&
        source.row === destination.row &&
        source.column === destination.column
      ) {
        return;
      }

      moveArt(draggedArtItem.id, destination);
      return;
    }

    const draggedCard = active.data.current?.card as Card | undefined;
    if (!draggedCard || !over) return;

    const overData = over.data.current as
      { physicalPage: number; row: number; column: number } | { unplaced: true } | undefined;
    if (!overData) return;

    const destination: { physicalPage: number | null; row: number | null; column: number | null } =
      'unplaced' in overData ? { physicalPage: null, row: null, column: null } : overData;

    const source = draggedCard.placement;
    if (
      source.physicalPage === destination.physicalPage &&
      source.row === destination.row &&
      source.column === destination.column
    ) {
      return;
    }

    moveCard(draggedCard.id, destination);
  }

  function handleDragCancel() {
    setActiveDragCard(null);
    setActiveDragArt(null);
    setDragCandidateFootprint(null);
  }

  return {
    activeDragCard,
    activeDragArt,
    dragCandidateFootprint,
    sensors,
    handleDragStart,
    handleDragOver,
    handleDragEnd,
    handleDragCancel,
  };
}
