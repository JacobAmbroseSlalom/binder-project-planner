'use client';

import { useCallback, type Dispatch, type SetStateAction } from 'react';

import {
  moveCards,
  type Card,
  type CardPositionUpdate,
  type PlacementCoordinates,
} from '@/lib/api';
import { useSaveStatusToast } from '@/shared/feedback';

import { isLockedBinderConflict } from './lockedBinderConflict';
import type { LayoutMovementHistoryAction } from './useLayoutMovement';

interface CardMovementActionEntry {
  cardId: string;
  from: PlacementCoordinates;
  to: PlacementCoordinates;
}

type CardMovementActionEntries =
  [CardMovementActionEntry] | [CardMovementActionEntry, CardMovementActionEntry];

// Story 14/15's card move-or-swap mutation, extracted out of
// `useCardMutations` (which was growing past this house-cleaning pass's
// line-count threshold). Shares its "movement in flight" flag and undo/
// redo history recording with `useArtMutations` (per story 14/28's single
// binder-scoped movement queue), so both are passed in from the shared
// `useLayoutMovement` hook rather than owned here.
export function useCardMovement({
  cards,
  setCards,
  isMovePending,
  setIsMovePending,
  recordSuccessfulMovement,
  retry,
}: {
  cards: Card[];
  setCards: Dispatch<SetStateAction<Card[]>>;
  isMovePending: boolean;
  setIsMovePending: Dispatch<SetStateAction<boolean>>;
  recordSuccessfulMovement: (action: LayoutMovementHistoryAction) => void;
  retry: () => void;
}) {
  const { start } = useSaveStatusToast();

  // Moves (or swaps) a card to another slot in the same binder, or into the
  // unplaced section if `destination` is all-null (story 14; unplaced
  // destination/source added in story 15). `destination` always identifies
  // whatever the layout tab's drop target resolved to (a concrete slot or
  // the unplaced panel); a `null`/missing dragged card is unreachable in
  // practice (dragging only starts from an occupied slot or an unplaced
  // list item) but guarded rather than asserted. If another card already
  // occupies a *placed* `destination`, both cards trade placements (a
  // swap) in a single `PATCH` request; otherwise only the dragged card
  // moves. An all-null destination never has an "occupant" to swap with -
  // every unplaced card already shares that same null placement, and the
  // backend's unique-placement index is inert for null coordinates - so
  // the occupant lookup only ever runs against a placed destination.
  const moveCard = useCallback(
    (
      cardId: string,
      destination: { physicalPage: number | null; row: number | null; column: number | null },
    ) => {
      if (isMovePending) return;

      const draggedCard = cards.find((card) => card.id === cardId);
      if (!draggedCard) return;

      const occupyingCard =
        destination.physicalPage !== null
          ? cards.find(
              (card) =>
                card.id !== cardId &&
                card.placement.physicalPage === destination.physicalPage &&
                card.placement.row === destination.row &&
                card.placement.column === destination.column,
            )
          : undefined;

      const previousDraggedPlacement = draggedCard.placement;
      const previousOccupyingPlacement = occupyingCard?.placement ?? null;

      setCards((previous) =>
        previous.map((card) => {
          if (card.id === draggedCard.id) return { ...card, placement: destination };
          if (occupyingCard && card.id === occupyingCard.id) {
            return { ...card, placement: previousDraggedPlacement };
          }
          return card;
        }),
      );
      setIsMovePending(true);

      const updates: CardPositionUpdate[] = [
        {
          cardId: draggedCard.id,
          expectedPlacement: previousDraggedPlacement,
          finalPlacement: destination,
        },
      ];
      if (occupyingCard && previousOccupyingPlacement) {
        updates.push({
          cardId: occupyingCard.id,
          expectedPlacement: previousOccupyingPlacement,
          finalPlacement: previousDraggedPlacement,
        });
      }

      const toast = start(`move-card-${draggedCard.id}`);

      moveCards(draggedCard.id, updates)
        .then((updatedCards) => {
          setCards((previous) =>
            previous.map((card) => updatedCards.find((updated) => updated.id === card.id) ?? card),
          );
          const historyUpdates: CardMovementActionEntries = occupyingCard
            ? [
                { cardId: draggedCard.id, from: previousDraggedPlacement, to: destination },
                {
                  cardId: occupyingCard.id,
                  from: previousOccupyingPlacement!,
                  to: previousDraggedPlacement,
                },
              ]
            : [{ cardId: draggedCard.id, from: previousDraggedPlacement, to: destination }];
          recordSuccessfulMovement({
            id: crypto.randomUUID(),
            kind: 'card',
            focalCardId: draggedCard.id,
            updates: historyUpdates,
          });
          toast.markSaved();
        })
        .catch((error) => {
          // Rolls both cards back to their exact pre-drop placements
          // (rather than re-fetching the binder) so an unaffected slot's
          // optimistic state elsewhere in the grid is left untouched.
          setCards((previous) =>
            previous.map((card) => {
              if (card.id === draggedCard.id) {
                return { ...card, placement: previousDraggedPlacement };
              }
              if (occupyingCard && card.id === occupyingCard.id) {
                return { ...card, placement: previousOccupyingPlacement! };
              }
              return card;
            }),
          );
          toast.markFailed(error);
          // Story 32: reload the complete binder graph when this move was
          // rejected because the binder is now locked.
          if (isLockedBinderConflict(error)) retry();
        })
        .finally(() => {
          setIsMovePending(false);
        });
    },
    [cards, setCards, isMovePending, recordSuccessfulMovement, setIsMovePending, start, retry],
  );

  return { moveCard };
}
