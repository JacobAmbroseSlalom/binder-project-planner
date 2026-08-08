'use client';

import { LAYOUT_MOVEMENT_HISTORY_LIMIT } from '@binder-project-planner/shared';
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type Dispatch,
  type SetStateAction,
} from 'react';

import {
  moveArt as moveArtRequest,
  moveCards,
  type Art,
  type Card,
  type CardPositionUpdate,
  type PlacementCoordinates,
} from '@/lib/api';
import { useSaveStatusToast } from '@/shared/feedback';

interface CardMovementActionEntry {
  cardId: string;
  from: PlacementCoordinates;
  to: PlacementCoordinates;
}

type CardMovementActionEntries =
  [CardMovementActionEntry] | [CardMovementActionEntry, CardMovementActionEntry];

interface CardMovementHistoryAction {
  id: string;
  kind: 'card';
  // Story 28: a swap's focal item is the originally dragged card.
  focalCardId: string;
  updates: CardMovementActionEntries;
}

interface ArtMovementHistoryAction {
  id: string;
  kind: 'art';
  focalArtId: string;
  artId: string;
  from: PlacementCoordinates;
  to: PlacementCoordinates;
}

export type LayoutMovementHistoryAction = CardMovementHistoryAction | ArtMovementHistoryAction;

// Story 28: the focal item placement produced by one successful undo/redo
// action, used by the layout view to reveal the resulting page or unplaced
// panel location.
export interface LayoutMovementResultFocus {
  itemType: 'card' | 'art';
  itemId: string;
  placement: PlacementCoordinates;
}

function isConflictProblem(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const candidate = error as { status?: unknown };
  return candidate.status === 409;
}

function actionTouchesItem(action: LayoutMovementHistoryAction, itemId: string): boolean {
  if (action.kind === 'art') return action.artId === itemId;
  return action.updates.some((update) => update.cardId === itemId);
}

// Owns everything about "moving things around the layout" that spans both
// cards and art (stories 14/26/28): the single binder-scoped
// currently-in-flight flag `moveCard` (`useCardMutations`) and `moveArt`
// (`useArtMutations`) share (per story 14's "at most one movement request
// is ever in flight at a time" requirement), the undo/redo history stacks,
// and the shared executor that replays a stack entry through the same
// movement `PATCH` contract those two mutations themselves use. Extracted
// from `BinderRouteContext` since it's the one piece of movement logic
// neither `useCardMutations` nor `useArtMutations` can fully own alone - an
// undo/redo entry can be either a card or an art action, so replaying it
// needs to reach into both collections' setters, passed in here rather
// than owned by this hook.
export function useLayoutMovement({
  setCards,
  setArt,
}: {
  setCards: Dispatch<SetStateAction<Card[]>>;
  setArt: Dispatch<SetStateAction<Art[]>>;
}) {
  const { start } = useSaveStatusToast();

  // Story 14's single in-flight-movement flag, shared by `moveCard` and
  // `moveArt` and by the undo/redo executor below.
  const [isMovePending, setIsMovePending] = useState(false);

  // Story 28's binder-scoped movement history stacks.
  const [undoMovementStack, setUndoMovementStack] = useState<LayoutMovementHistoryAction[]>([]);
  const [redoMovementStack, setRedoMovementStack] = useState<LayoutMovementHistoryAction[]>([]);

  // Live refs let `applyLayoutHistoryAction` below avoid a large dependency
  // list while still reading the latest stack contents when it runs
  // (mirrors `BinderRouteContext`'s own `binderRef`/`cardsRef`/`artRef`
  // pattern).
  const undoStackRef = useRef<LayoutMovementHistoryAction[]>(undoMovementStack);
  const redoStackRef = useRef<LayoutMovementHistoryAction[]>(redoMovementStack);

  useEffect(() => {
    undoStackRef.current = undoMovementStack;
  }, [undoMovementStack]);

  useEffect(() => {
    redoStackRef.current = redoMovementStack;
  }, [redoMovementStack]);

  // Resets both history stacks, e.g. when the binder is reloaded or
  // resized in a way that invalidates every recorded movement's placement.
  const clearLayoutMovementHistory = useCallback(() => {
    setUndoMovementStack([]);
    setRedoMovementStack([]);
  }, []);

  // Pushes a freshly-succeeded move/swap onto the undo stack (bounded by
  // `LAYOUT_MOVEMENT_HISTORY_LIMIT`) and clears the redo stack, matching
  // standard undo/redo semantics: a new action invalidates any previously
  // undone redo history.
  const recordSuccessfulMovement = useCallback((action: LayoutMovementHistoryAction) => {
    setUndoMovementStack((previous) => {
      const next = [...previous, action];
      if (next.length <= LAYOUT_MOVEMENT_HISTORY_LIMIT) return next;
      return next.slice(next.length - LAYOUT_MOVEMENT_HISTORY_LIMIT);
    });
    setRedoMovementStack([]);
  }, []);

  // Drops every history entry that touches `itemId` (card or art) from
  // both stacks, e.g. once that item is deleted or its variation/metadata
  // edited outside the movement flow, so undo/redo never replays an action
  // against an item whose identity has since changed underneath it.
  const pruneHistoryEntriesForItem = useCallback((itemId: string) => {
    setUndoMovementStack((previous) =>
      previous.filter((action) => !actionTouchesItem(action, itemId)),
    );
    setRedoMovementStack((previous) =>
      previous.filter((action) => !actionTouchesItem(action, itemId)),
    );
  }, []);

  // Story 28 shared executor for undo/redo: applies one action from the
  // chosen source stack, mutates visible placement only on success, and
  // transfers stack ownership only after persistence succeeds.
  const applyLayoutHistoryAction = useCallback(
    async (direction: 'undo' | 'redo'): Promise<LayoutMovementResultFocus | null> => {
      if (isMovePending) return null;

      const sourceStack = direction === 'undo' ? undoStackRef.current : redoStackRef.current;
      const action = sourceStack[sourceStack.length - 1];
      if (!action) return null;

      setIsMovePending(true);
      const toast = start(`${direction}-layout-movement`);

      try {
        if (action.kind === 'card') {
          const updates: CardPositionUpdate[] = action.updates.map((update) => ({
            cardId: update.cardId,
            expectedPlacement: direction === 'undo' ? update.to : update.from,
            finalPlacement: direction === 'undo' ? update.from : update.to,
          }));

          const updatedCards = await moveCards(action.focalCardId, updates);
          const updatedCardsById = new Map(updatedCards.map((cardItem) => [cardItem.id, cardItem]));
          setCards((previous) =>
            previous.map((cardItem) => updatedCardsById.get(cardItem.id) ?? cardItem),
          );

          const focalUpdate = action.updates.find((update) => update.cardId === action.focalCardId);
          if (!focalUpdate) {
            throw new Error('Unable to resolve card movement focus for history action.');
          }

          const resultPlacement = direction === 'undo' ? focalUpdate.from : focalUpdate.to;
          if (direction === 'undo') {
            setUndoMovementStack((previous) => previous.filter((entry) => entry.id !== action.id));
            setRedoMovementStack((previous) => [...previous, action]);
          } else {
            setRedoMovementStack((previous) => previous.filter((entry) => entry.id !== action.id));
            setUndoMovementStack((previous) => {
              const next = [...previous, action];
              if (next.length <= LAYOUT_MOVEMENT_HISTORY_LIMIT) return next;
              return next.slice(next.length - LAYOUT_MOVEMENT_HISTORY_LIMIT);
            });
          }

          toast.markSaved();
          return {
            itemType: 'card',
            itemId: action.focalCardId,
            placement: resultPlacement,
          };
        }

        const expectedPlacement = direction === 'undo' ? action.to : action.from;
        const finalPlacement = direction === 'undo' ? action.from : action.to;
        const updatedArt = await moveArtRequest(action.artId, expectedPlacement, finalPlacement);
        setArt((previous) =>
          previous.map((artItem) => (artItem.id === action.artId ? updatedArt : artItem)),
        );

        if (direction === 'undo') {
          setUndoMovementStack((previous) => previous.filter((entry) => entry.id !== action.id));
          setRedoMovementStack((previous) => [...previous, action]);
        } else {
          setRedoMovementStack((previous) => previous.filter((entry) => entry.id !== action.id));
          setUndoMovementStack((previous) => {
            const next = [...previous, action];
            if (next.length <= LAYOUT_MOVEMENT_HISTORY_LIMIT) return next;
            return next.slice(next.length - LAYOUT_MOVEMENT_HISTORY_LIMIT);
          });
        }

        toast.markSaved();
        return {
          itemType: 'art',
          itemId: action.focalArtId,
          placement: finalPlacement,
        };
      } catch (error) {
        if (isConflictProblem(error)) {
          if (direction === 'undo') {
            setUndoMovementStack((previous) => previous.filter((entry) => entry.id !== action.id));
          } else {
            setRedoMovementStack((previous) => previous.filter((entry) => entry.id !== action.id));
          }
        }
        toast.markFailed(error);
        return null;
      } finally {
        setIsMovePending(false);
      }
    },
    [isMovePending, start, setArt, setCards],
  );

  // Applies the newest undoable movement action, or no-ops when none exist.
  const undoLayoutMovement = useCallback(
    () => applyLayoutHistoryAction('undo'),
    [applyLayoutHistoryAction],
  );

  // Reapplies the newest redoable movement action, or no-ops when none exist.
  const redoLayoutMovement = useCallback(
    () => applyLayoutHistoryAction('redo'),
    [applyLayoutHistoryAction],
  );

  return {
    isMovePending,
    setIsMovePending,
    undoMovementStack,
    redoMovementStack,
    clearLayoutMovementHistory,
    recordSuccessfulMovement,
    pruneHistoryEntriesForItem,
    undoLayoutMovement,
    redoLayoutMovement,
  };
}
