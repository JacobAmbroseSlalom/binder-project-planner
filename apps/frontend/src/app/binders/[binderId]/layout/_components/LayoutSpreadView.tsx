'use client';

import { ChevronLeft, ChevronRight } from 'lucide-react';

import type { Art, Binder, Card } from '@/lib/api';

import type { BinderSpread } from '../layoutSpread';
import { getNextPhysicalPage, getPreviousPhysicalPage } from '../layoutSpread';
import { BinderSide } from './BinderSide';

// Shared styling for the previous/next icon buttons, matching the app's
// disabled-state convention (reduced opacity + not-allowed cursor).
const ARROW_BUTTON_CLASS_NAME =
  'cursor-pointer rounded-full p-2 text-neutral-100 hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50';

// The "Edit Layout" tab's spread visualization (stories 8, 9, 14, 26):
// the previous/next chevron buttons flanking the current spread's left
// and right `BinderSide`s (or blank placeholders for a single-sided first/
// last spread). Extracted from `BinderLayoutView` since this is a large,
// purely presentational block driven entirely by props rather than owning
// any state of its own.
export function LayoutSpreadView({
  binder,
  cards,
  art,
  pendingPlacementKeys,
  spread,
  physicalPage,
  maxPhysicalPage,
  isFirstSpread,
  isLastSpread,
  isDragActive,
  navigateToPhysicalPage,
  onSlotClick,
  onRemoveCard,
  pendingCardDeletionIds,
  onEditVariation,
  pendingCardVariationEditIds,
  onDuplicateCard,
  pendingCardDuplicateIds,
  onToggleAcquired,
  pendingCardAcquiredToggleIds,
  acquisitionVisible,
  variationsVisible,
  pendingArtEditIds,
  pendingArtDeletionIds,
  pendingArtDuplicateIds,
  onEditArt,
  onRemoveArt,
  onDuplicateArt,
  isMovePending,
  michiIndicatorsVisible,
  slotAspectRatio,
  dragCandidateFootprint,
}: {
  binder: Binder;
  cards: Card[];
  art: Art[];
  pendingPlacementKeys: Set<string>;
  spread: BinderSpread;
  physicalPage: number;
  maxPhysicalPage: number;
  isFirstSpread: boolean;
  isLastSpread: boolean;
  isDragActive: boolean;
  navigateToPhysicalPage: (targetPage: number) => void;
  onSlotClick: (physicalPage: number, row: number, column: number) => void;
  onRemoveCard: (cardId: string) => void;
  pendingCardDeletionIds: Set<string>;
  onEditVariation: (card: Card) => void;
  pendingCardVariationEditIds: Set<string>;
  onDuplicateCard: (cardId: string) => void;
  pendingCardDuplicateIds: Set<string>;
  onToggleAcquired: (cardId: string) => void;
  pendingCardAcquiredToggleIds: Set<string>;
  acquisitionVisible: boolean;
  variationsVisible: boolean;
  pendingArtEditIds: Set<string>;
  pendingArtDeletionIds: Set<string>;
  pendingArtDuplicateIds: Set<string>;
  onEditArt: (art: Art) => void;
  onRemoveArt: (artId: string) => void;
  onDuplicateArt: (artId: string) => void;
  isMovePending: boolean;
  michiIndicatorsVisible: boolean;
  slotAspectRatio: number;
  dragCandidateFootprint: {
    physicalPage: number;
    anchorRow: number;
    anchorColumn: number;
    widthSlots: number;
    heightSlots: number;
    valid: boolean;
  } | null;
}) {
  return (
    // Two nested containers split "claim the leftover height" from "center
    // the visible content": the OUTER div reserves the tab's full
    // remaining height (`flex-1`) and pins its child to the TOP of it
    // (`items-start`), so the binder visualization renders right under the
    // label - any leftover height (the fitting area is often shorter than
    // the full remaining space) falls below the content rather than
    // pushing it down the tab. The INNER row is not stretched - it only
    // hugs its own real content height - so its own `items-center`
    // correctly centers the chevrons against the actual rendered grid
    // height, with no artificial extra space to throw that off.
    <div className="flex shrink-0 items-start justify-center">
      <div className="flex w-full items-center justify-center gap-4">
        <button
          type="button"
          aria-label="Previous page"
          disabled={isFirstSpread || isDragActive}
          onClick={() =>
            navigateToPhysicalPage(getPreviousPhysicalPage(physicalPage, maxPhysicalPage))
          }
          className={ARROW_BUTTON_CLASS_NAME}
        >
          <ChevronLeft className="size-6" />
        </button>

        {/* Only the active spread's data is mounted - the previous/next
            spreads are never rendered or retained as hidden elements. A
            tight gap keeps the two sides reading as one bound spread (like
            facing pages meeting at the spine), and the max-width cap keeps
            the overall visualization compact. Both flex slots always
            render (a blank, non-content placeholder standing in for the
            side missing on the first/last spread) so that single-sided
            spread reserves the exact same half-row share of space as a
            two-sided spread instead of its lone binder side stretching to
            fill the whole row. */}
        <div className="flex max-w-2xl flex-1 items-stretch justify-center gap-1">
          {spread.left !== null ? (
            <BinderSide
              side="left"
              width={binder.width}
              height={binder.height}
              physicalPage={spread.left}
              binder={binder}
              cards={cards}
              art={art}
              pendingPlacementKeys={pendingPlacementKeys}
              onSlotClick={(row, column) => onSlotClick(spread.left as number, row, column)}
              onRemoveCard={onRemoveCard}
              pendingCardDeletionIds={pendingCardDeletionIds}
              onEditVariation={onEditVariation}
              pendingCardVariationEditIds={pendingCardVariationEditIds}
              onDuplicateCard={onDuplicateCard}
              pendingCardDuplicateIds={pendingCardDuplicateIds}
              onToggleAcquired={onToggleAcquired}
              pendingCardAcquiredToggleIds={pendingCardAcquiredToggleIds}
              acquisitionVisible={acquisitionVisible}
              variationsVisible={variationsVisible}
              pendingArtEditIds={pendingArtEditIds}
              pendingArtDeletionIds={pendingArtDeletionIds}
              pendingArtDuplicateIds={pendingArtDuplicateIds}
              onEditArt={onEditArt}
              onRemoveArt={onRemoveArt}
              onDuplicateArt={onDuplicateArt}
              isMovePending={isMovePending}
              michiIndicatorsVisible={michiIndicatorsVisible}
              slotAspectRatio={slotAspectRatio}
              dragCandidateFootprint={dragCandidateFootprint}
            />
          ) : (
            <div className="w-full min-w-0 flex-1" aria-hidden="true" />
          )}
          {spread.right !== null ? (
            <BinderSide
              side="right"
              width={binder.width}
              height={binder.height}
              physicalPage={spread.right}
              binder={binder}
              cards={cards}
              art={art}
              pendingPlacementKeys={pendingPlacementKeys}
              onSlotClick={(row, column) => onSlotClick(spread.right as number, row, column)}
              onRemoveCard={onRemoveCard}
              pendingCardDeletionIds={pendingCardDeletionIds}
              onEditVariation={onEditVariation}
              pendingCardVariationEditIds={pendingCardVariationEditIds}
              onDuplicateCard={onDuplicateCard}
              pendingCardDuplicateIds={pendingCardDuplicateIds}
              onToggleAcquired={onToggleAcquired}
              pendingCardAcquiredToggleIds={pendingCardAcquiredToggleIds}
              acquisitionVisible={acquisitionVisible}
              variationsVisible={variationsVisible}
              pendingArtEditIds={pendingArtEditIds}
              pendingArtDeletionIds={pendingArtDeletionIds}
              pendingArtDuplicateIds={pendingArtDuplicateIds}
              onEditArt={onEditArt}
              onRemoveArt={onRemoveArt}
              onDuplicateArt={onDuplicateArt}
              isMovePending={isMovePending}
              michiIndicatorsVisible={michiIndicatorsVisible}
              slotAspectRatio={slotAspectRatio}
              dragCandidateFootprint={dragCandidateFootprint}
            />
          ) : (
            <div className="w-full min-w-0 flex-1" aria-hidden="true" />
          )}
        </div>

        <button
          type="button"
          aria-label="Next page"
          disabled={isLastSpread || isDragActive}
          onClick={() => navigateToPhysicalPage(getNextPhysicalPage(physicalPage, maxPhysicalPage))}
          className={ARROW_BUTTON_CLASS_NAME}
        >
          <ChevronRight className="size-6" />
        </button>
      </div>
    </div>
  );
}
