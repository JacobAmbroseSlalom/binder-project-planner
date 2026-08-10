import { useDraggable } from '@dnd-kit/core';

import type { Card } from '@/lib/api';

import { CardTile } from './CardTile';

// One row in the unplaced-cards panel (story 15), extracted out of
// `UnplacedCardsPanel`'s virtualized-row render loop for the same reason
// `BinderSlot` was extracted out of `BinderSide` in story 14: calling
// `useDraggable` from within a `.map()` callback violates the rules of
// hooks. Unlike `BinderSlot`, this is draggable only - not droppable - the
// whole panel is the one drop target (see `UnplacedCardsPanel`), so an
// individual unplaced card is never itself something a drag can be
// dropped onto. Renders the same `CardTile` an occupied `BinderSlot` does
// (no name/set text, no bordered list row) so an unplaced card looks
// identical to how it would look once placed.
export function UnplacedCard({
  card,
  isRemovalPending,
  isPendingCreate,
  isMovePending,
  onRemoveCard,
  onEditVariation,
  isVariationEditPending,
  onDuplicateCard,
  isDuplicatePending,
  onToggleAcquired,
  isAcquiredTogglePending,
  acquisitionVisible = false,
  variationsVisible = false,
  slotAspectRatio,
}: {
  card: Card;
  // True while this card's own removal is in flight (story 13).
  isRemovalPending: boolean;
  // True while this specific card's own create request (assign to the
  // unplaced section) is in flight (story 15) - unlike a placed slot,
  // there's no slot to disable, so the card itself is disabled instead.
  isPendingCreate: boolean;
  // True while any move/swap request is in flight for the binder (story
  // 14) - disables dragging every card, placed or unplaced, until it
  // settles.
  isMovePending: boolean;
  onRemoveCard: (cardId: string) => void;
  // Opens the edit-variation modal for this card (story 16).
  onEditVariation: (card: Card) => void;
  isVariationEditPending: boolean;
  // Duplicates this card into the unplaced-cards section (story 19).
  onDuplicateCard: (cardId: string) => void;
  isDuplicatePending: boolean;
  // Toggles this card between acquired/unacquired (story 36).
  onToggleAcquired: (cardId: string) => void;
  isAcquiredTogglePending: boolean;
  // Story 36's layout-wide toggle, threaded down from `UnplacedCardsPanel`.
  acquisitionVisible?: boolean;
  // Story 16's layout-wide toggle, threaded down from `UnplacedCardsPanel`.
  variationsVisible?: boolean;
  // Story 24: the binder's configured single-slot width-to-height ratio,
  // threaded down from `BinderLayoutView` through `UnplacedCardsPanel`.
  slotAspectRatio: number;
}) {
  const {
    attributes,
    listeners,
    setNodeRef: setDraggableRef,
    isDragging,
  } = useDraggable({
    id: card.id,
    data: { card },
    // Disabling drag while `isDuplicatePending` (mirroring
    // `PlacedArtTile`/`UnplacedArt`'s own inclusion of `isDuplicatePending`
    // here) matters only for this optimistic duplicate copy itself - its
    // own id is what `pendingCardDuplicateIds` tracks while its create
    // request is in flight, so it can't be dragged before the backend's
    // authoritative replacement lands.
    disabled: isMovePending || isRemovalPending || isPendingCreate || isDuplicatePending,
  });

  return (
    <CardTile
      card={card}
      isDragging={isDragging}
      isRemovalPending={isRemovalPending}
      onRemoveCard={onRemoveCard}
      removeAriaLabel={`Remove ${card.name} from the unplaced section`}
      onEditVariation={onEditVariation}
      editVariationAriaLabel={`Edit variation for ${card.name}`}
      isVariationEditPending={isVariationEditPending}
      onDuplicateCard={onDuplicateCard}
      duplicateAriaLabel={`Duplicate ${card.name}`}
      isDuplicatePending={isDuplicatePending}
      onToggleAcquired={onToggleAcquired}
      toggleAcquiredAriaLabel={
        card.acquired ? `Mark ${card.name} as unacquired` : `Mark ${card.name} as acquired`
      }
      isAcquiredTogglePending={isAcquiredTogglePending}
      acquisitionVisible={acquisitionVisible}
      variationsVisible={variationsVisible}
      tileRef={setDraggableRef}
      dragAttributes={attributes}
      dragListeners={listeners}
      slotAspectRatio={slotAspectRatio}
    />
  );
}
