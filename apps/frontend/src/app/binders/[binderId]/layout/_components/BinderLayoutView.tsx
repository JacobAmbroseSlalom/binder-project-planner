'use client';

import {
  DndContext,
  DragOverlay,
  pointerWithin,
  useSensor,
  useSensors,
  PointerSensor,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import { CARD_DRAG_ACTIVATION_DISTANCE_PX } from '@binder-project-planner/shared';
import { Check, ChevronLeft, ChevronRight } from 'lucide-react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';

import { resolveCardImageUrl, type Card, type TcgDexCatalogCard } from '@/lib/api';
import { useSaveStatusToast } from '@/shared/feedback';

import { useBinderRouteContext, type CustomCardFormValues } from '../../BinderRouteContext';
import {
  getMaxPhysicalPage,
  getNextPhysicalPage,
  getPreviousPhysicalPage,
  getSpreadLabel,
  parsePhysicalPageInput,
  resolvePhysicalPageParam,
  resolveSpread,
} from '../layoutSpread';
import { BinderSide } from './BinderSide';
import { CardSelectionModal } from './CardSelectionModal';
import { UnplacedCardsPanel } from './UnplacedCardsPanel';

// The slot (or unplaced-panel target) currently targeted by an open
// card-selection modal (story 11; unplaced target added in story 15):
// `null` while no modal is open. Physical page is captured alongside
// row/column (rather than re-derived from the spread at selection time) so
// the modal's target stays fixed even if the user could somehow navigate
// spreads while it's open. All 3 fields are `null` together for the
// unplaced panel's own add button - never partially null - mirroring the
// backend's own all-or-none placement shape.
interface SelectedSlot {
  physicalPage: number | null;
  row: number | null;
  column: number | null;
}

// The unplaced panel's add-button target (story 15): reused as-is by both
// `handleSelectCard` and `handleSubmitCustomCard` below, since its shape
// already matches a concrete slot's, so neither handler needs a separate
// branch for "no slot at all."
const UNPLACED_SLOT_TARGET: SelectedSlot = { physicalPage: null, row: null, column: null };

// Shared styling for the previous/next icon buttons, matching the app's
// disabled-state convention (reduced opacity + not-allowed cursor).
const ARROW_BUTTON_CLASS_NAME =
  'cursor-pointer rounded-full p-2 text-neutral-100 hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50';

// The direct page-number input's styling: the same filled-input treatment
// documented in styling.instructions.md's "Forms & inputs" section
// (neutral-800 fill, primary border on focus), sized narrow and centered
// for a short numeric value rather than a full-width form field.
const PAGE_INPUT_CLASS_NAME =
  'w-20 rounded-standard border border-transparent bg-neutral-800 px-2 py-1 text-center focus:border-primary focus:outline-none';

// The "Edit Layout" tab's real content (stories 8 and 9): visualizes the
// binder as a sequence of displayed spreads - the first showing only the
// right side, the last only the left side, and every one in between
// showing both - navigated with the arrow controls or the direct
// page-number input in the toolbar above. The current spread is tracked
// by the route's `page` query parameter (a one-based physical page) so
// refreshes and copied URLs retain it; see `layoutSpread.ts` for the
// physical-page/spread math this component drives.
export function BinderLayoutView() {
  const {
    binder,
    layoutFocalPage,
    setLayoutFocalPage,
    cards,
    pendingPlacementKeys,
    assignCard,
    assignCustomCard,
    manualEntryRestore,
    clearManualEntryRestore,
    removeCard,
    pendingCardDeletionIds,
    moveCard,
    isMovePending,
    pendingUnplacedCardIds,
  } = useBinderRouteContext();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { start } = useSaveStatusToast();

  // Story 24: the binder's configured one-slot width/height (per-slot cm
  // formulas resolved to a single slot's actual size) define the on-screen
  // slot/card aspect ratio everywhere in this tab, replacing the old fixed
  // `SLOT_WIDTH_CM`/`SLOT_HEIGHT_CM` ratio. CSS `aspect-ratio` accepts a
  // unitless number directly, so this is computed once here and threaded
  // down as a single prop rather than each component re-deriving it.
  const slotAspectRatio =
    (binder.widthPerSlot + binder.widthBase) / (binder.heightPerSlot + binder.heightBase);

  // The slot (if any) currently targeted by an open card-selection modal
  // (story 11).
  const [selectedSlot, setSelectedSlot] = useState<SelectedSlot | null>(null);
  // The card currently being dragged (story 14), or `null` while no drag
  // is in progress - drives the `DragOverlay`'s content, the source slot's
  // empty-placeholder rendering (in `BinderSlot`), and disabling page
  // navigation while a drag is active.
  const [activeDragCard, setActiveDragCard] = useState<Card | null>(null);
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

  // Tracks which card is being dragged, once the pointer sensor's
  // activation distance is exceeded.
  function handleDragStart(event: DragStartEvent) {
    const card = event.active.data.current?.card as Card | undefined;
    setActiveDragCard(card ?? null);
  }

  // Resolves a completed drag into a move/swap request (story 14), or a
  // silent no-op if dropped outside any drop target or back onto its own
  // current location - per the story's "dropping a card onto its own
  // source slot ends the drag without changing anything" requirement,
  // generalized to the unplaced panel too (story 15): a drop target's
  // `data.current` is either a concrete slot's `{ physicalPage, row,
  // column }` or the unplaced panel's `{ unplaced: true }` marker (see
  // `UnplacedCardsPanel`), which resolves to an all-null destination.
  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    setActiveDragCard(null);

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
  }

  // The manual-entry values/file to seed the modal with, only set while
  // reopening it to correct a failed custom-card submission (story 12) -
  // `null` for a normal (blank) modal open.
  const [manualEntryDraft, setManualEntryDraft] = useState<{
    values: CustomCardFormValues;
    file: File;
  } | null>(null);

  // Auto-reopens the card-selection modal, pre-filled, once a custom-card
  // submission fails (story 12). Derived during render (comparing against
  // the last-seen restore signal), matching this file's own
  // `lastSyncedPhysicalPage` convention below, rather than in a `useEffect`
  // - React's documented "adjusting state when a prop changes" pattern -
  // since `manualEntryRestore` is an ordinary context value, not a
  // subscription to an external system. A `null` `placement` reopens
  // targeting the unplaced panel (story 15) rather than being skipped, now
  // that section exists in the UI.
  const [lastSeenManualEntryRestore, setLastSeenManualEntryRestore] = useState(manualEntryRestore);
  if (manualEntryRestore !== lastSeenManualEntryRestore) {
    setLastSeenManualEntryRestore(manualEntryRestore);
    if (manualEntryRestore) {
      setSelectedSlot(manualEntryRestore.placement ?? UNPLACED_SLOT_TARGET);
      setManualEntryDraft({
        values: manualEntryRestore.values,
        file: manualEntryRestore.file,
      });
    }
  }

  // Clears the one-shot restore signal once this component has consumed it
  // above - a genuine "notify an external owner" side effect (rather than
  // local state), so it belongs in an effect unlike the derivation above.
  useEffect(() => {
    if (manualEntryRestore) clearManualEntryRestore();
  }, [manualEntryRestore, clearManualEntryRestore]);

  // Assigns the chosen catalog card to the currently selected slot (or the
  // unplaced panel - story 15) and closes the modal immediately -
  // `selectedSlot` already matches `CreateCardRequest['placement']`'s
  // nullable-triple shape either way - the route context's `assignCard`
  // owns the optimistic-update/request lifecycle from here (see
  // `BinderRouteContext.tsx`).
  function handleSelectCard(card: TcgDexCatalogCard) {
    if (!selectedSlot) return;
    assignCard({
      ...card,
      variation: null,
      placement: selectedSlot,
    });
    setSelectedSlot(null);
  }

  // Submits the manual-entry form's custom card to the currently selected
  // slot or the unplaced panel (story 12; unplaced target added in story
  // 15) and closes the modal immediately, mirroring `handleSelectCard`
  // above. `assignCustomCard`'s `placement` parameter is `null` only as a
  // whole (never partially), so a placed `selectedSlot`'s numeric fields
  // are passed through together.
  function handleSubmitCustomCard(values: CustomCardFormValues, file: File) {
    if (!selectedSlot) return;
    const placement =
      selectedSlot.physicalPage !== null
        ? {
            physicalPage: selectedSlot.physicalPage,
            row: selectedSlot.row as number,
            column: selectedSlot.column as number,
          }
        : null;
    assignCustomCard(values, file, placement);
    setSelectedSlot(null);
    setManualEntryDraft(null);
  }

  const maxPhysicalPage = getMaxPhysicalPage(binder.pages);
  const rawPage = searchParams.get('page');
  const { physicalPage, replacementPage } = resolvePhysicalPageParam(
    rawPage,
    maxPhysicalPage,
    layoutFocalPage,
  );

  // Story 10's Michi-indicator toggle: `michi=true` enables the
  // indicators; any other value (or its absence) is disabled. An invalid
  // non-`true` value still needs the same URL cleanup the malformed `page`
  // value gets below, so both corrections are folded into the one effect
  // that follows rather than risking two separate `router.replace` calls
  // stomping on each other's stale `searchParams` snapshot.
  const rawMichi = searchParams.get('michi');
  const michiIndicatorsVisible = rawMichi === 'true';
  const michiNeedsCleanup = rawMichi !== null && !michiIndicatorsVisible;

  // Keeps the URL in sync: replaces (never pushes, so navigating spreads
  // never grows browser history) the `page` query parameter whenever the
  // requested value needed correcting, or to restore a focal page retained
  // from a previous visit to this tab; and/or drops an invalid `michi`
  // value. `page` is only ever (re)written when a page replacement is
  // actually needed - an unrelated `michi` cleanup must not add `?page=1`
  // when the parameter was legitimately absent.
  useEffect(() => {
    if (replacementPage === undefined && !michiNeedsCleanup) return;

    const params = new URLSearchParams(searchParams);
    if (replacementPage !== undefined) params.set('page', String(replacementPage));
    if (michiNeedsCleanup) params.delete('michi');
    router.replace(`${pathname}?${params.toString()}`);
  }, [replacementPage, michiNeedsCleanup, pathname, router, searchParams]);

  // Records the displayed physical page as the route's retained layout
  // focal page, but only once it's explicit in the URL - the very first,
  // param-less visit is left untouched so it keeps defaulting to physical
  // page 1 without ever adding `?page=1` to the URL (story 8).
  useEffect(() => {
    if (rawPage !== null) {
      setLayoutFocalPage(physicalPage);
    }
  }, [rawPage, physicalPage, setLayoutFocalPage]);

  const spread = resolveSpread(physicalPage, maxPhysicalPage);
  const isFirstSpread = spread.left === null;
  const isLastSpread = spread.right === null;

  function navigateToPhysicalPage(targetPage: number) {
    const params = new URLSearchParams(searchParams);
    params.set('page', String(targetPage));
    router.replace(`${pathname}?${params.toString()}`);
  }

  // The direct page-number input's own text state (story 9), separate from
  // `physicalPage` so keystrokes don't navigate until the value commits on
  // blur/Enter. Re-synced whenever `physicalPage` changes for any other
  // reason (arrows, URL edits) by comparing against the last-seen value
  // during render (React's documented "adjusting state when a prop
  // changes" pattern) rather than in an effect, which would cause an extra
  // render pass after every navigation.
  const [lastSyncedPhysicalPage, setLastSyncedPhysicalPage] = useState(physicalPage);
  const [pageInputValue, setPageInputValue] = useState(() => String(physicalPage));
  if (physicalPage !== lastSyncedPhysicalPage) {
    setLastSyncedPhysicalPage(physicalPage);
    setPageInputValue(String(physicalPage));
  }

  // Commits the page input's current text (story 9): a valid in-range
  // integer navigates to that physical page's spread; anything else
  // (empty, non-integer, out-of-range) leaves the spread unchanged, shows
  // the shared failed toast, and resets the input back to the current
  // focal physical page.
  function commitPageInput() {
    const parsed = parsePhysicalPageInput(pageInputValue, maxPhysicalPage);
    if (parsed === null) {
      start().markFailed({
        detail: `Enter a page number between 1 and ${maxPhysicalPage}.`,
      });
      setPageInputValue(String(physicalPage));
      return;
    }
    navigateToPhysicalPage(parsed);
  }

  // Flips the Michi-indicator toggle (story 10): history replacement (never
  // a push) and copying the current `searchParams` as the base preserves
  // every other query parameter, including `page`.
  function toggleMichiIndicators() {
    const params = new URLSearchParams(searchParams);
    if (michiIndicatorsVisible) {
      params.delete('michi');
    } else {
      params.set('michi', 'true');
    }
    router.replace(`${pathname}?${params.toString()}`);
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={pointerWithin}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onDragCancel={handleDragCancel}
      // Story 15: the unplaced panel's own scroll position must stay
      // stationary during a drag rather than dnd-kit auto-scrolling it (or
      // any other ancestor) toward the pointer.
      autoScroll={false}
    >
      {/* A 3-column grid: the unplaced-cards panel, the centered
          toolbar+spread content, and a fixed-width invisible spacer
          (story 15) - in that order. The spacer's width always mirrors
          the panel's own fixed width, so the middle column is centered on
          the *entire* tab's width exactly as it was before the panel
          existed, rather than being re-centered only within the leftover
          space next to the panel. A single explicit row
          (`grid-rows-[minmax(0,1fr)]`) fills the tab's full height and
          stretches every column - including the panel - to it, so the
          panel's top edge lines up with the toolbar row above the spread
          instead of starting only alongside the spread. */}
      <div className="grid h-full min-h-0 flex-1 grid-cols-[24rem_1fr_24rem] grid-rows-[minmax(0,1fr)] gap-8 p-8">
        <UnplacedCardsPanel
          cards={cards}
          pendingCardDeletionIds={pendingCardDeletionIds}
          pendingUnplacedCardIds={pendingUnplacedCardIds}
          isMovePending={isMovePending}
          onRemoveCard={removeCard}
          onAddCard={() => setSelectedSlot(UNPLACED_SLOT_TARGET)}
          slotAspectRatio={slotAspectRatio}
        />

        <div className="flex h-full min-h-0 flex-col gap-4">
          {/* The Michi-indicator toggle (story 10) and the direct page-number
              input (story 9), side by side on their own row above the binder
              visualization. */}
          <div className="flex items-center justify-center gap-10">
            {/* Story 10's toggle: custom-styled checkbox matching the app's
              checkbox convention (styling.instructions.md's "Forms & inputs"
              section). Defaults to off since `michiIndicatorsVisible` is only
              true when the URL explicitly has `michi=true`. The label is
              forced onto 2 short lines (rather than one long line) so this
              control stays narrow next to the page input. */}
            <label htmlFor="michi-indicators-toggle" className="flex items-center gap-2">
              <span className="relative inline-flex size-5 shrink-0 items-center justify-center">
                <input
                  id="michi-indicators-toggle"
                  type="checkbox"
                  checked={michiIndicatorsVisible}
                  onChange={toggleMichiIndicators}
                  className="peer size-5 appearance-none rounded-standard border border-neutral-500 bg-neutral-800 checked:border-primary checked:bg-primary"
                />
                <Check className="pointer-events-none absolute size-4 text-background opacity-0 peer-checked:opacity-100" />
              </span>
              <span className="flex flex-col text-caption leading-tight text-neutral-500">
                <span>Show Michi</span>
                <span>slot indicators</span>
              </span>
            </label>

            <div className="flex flex-col items-center gap-1">
              <label htmlFor="layout-page-input" className="text-caption text-neutral-500">
                Go to page
              </label>
              <input
                id="layout-page-input"
                type="number"
                min={1}
                max={maxPhysicalPage}
                step={1}
                value={pageInputValue}
                onChange={(event) => setPageInputValue(event.target.value)}
                onBlur={commitPageInput}
                onKeyDown={(event) => {
                  // Commits on Enter by blurring, which routes through the same
                  // `commitPageInput` handler instead of duplicating its logic.
                  if (event.key === 'Enter') event.currentTarget.blur();
                }}
                className={PAGE_INPUT_CLASS_NAME}
              />
            </div>
          </div>

          {/* The current spread's label (story 9) lives on its own row,
              centered above the binder visualization. */}
          <p className="text-center text-caption text-neutral-500">{getSpreadLabel(spread)}</p>

          {/* Two nested containers split "claim the leftover height" from
              "center the visible content": the OUTER div reserves the tab's
              full remaining height (`flex-1`) and pins its child to the TOP
              of it (`items-start`), so the binder visualization renders
              right under the label - any leftover height (the fitting area
              is often shorter than the full remaining space) falls below
              the content rather than pushing it down the tab. The INNER row
              is not stretched - it only hugs its own real content height -
              so its own `items-center` correctly centers the chevrons
              against the actual rendered grid height, with no artificial
              extra space to throw that off. */}
          <div className="flex h-full min-h-0 flex-1 items-start justify-center">
            <div className="flex w-full items-center justify-center gap-4">
              <button
                type="button"
                aria-label="Previous page"
                disabled={isFirstSpread || activeDragCard !== null}
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
                    cards={cards}
                    pendingPlacementKeys={pendingPlacementKeys}
                    onSlotClick={(row, column) =>
                      setSelectedSlot({ physicalPage: spread.left as number, row, column })
                    }
                    onRemoveCard={removeCard}
                    pendingCardDeletionIds={pendingCardDeletionIds}
                    isMovePending={isMovePending}
                    michiIndicatorsVisible={michiIndicatorsVisible}
                    slotAspectRatio={slotAspectRatio}
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
                    cards={cards}
                    pendingPlacementKeys={pendingPlacementKeys}
                    onSlotClick={(row, column) =>
                      setSelectedSlot({ physicalPage: spread.right as number, row, column })
                    }
                    onRemoveCard={removeCard}
                    pendingCardDeletionIds={pendingCardDeletionIds}
                    isMovePending={isMovePending}
                    michiIndicatorsVisible={michiIndicatorsVisible}
                    slotAspectRatio={slotAspectRatio}
                  />
                ) : (
                  <div className="w-full min-w-0 flex-1" aria-hidden="true" />
                )}
              </div>

              <button
                type="button"
                aria-label="Next page"
                disabled={isLastSpread || activeDragCard !== null}
                onClick={() =>
                  navigateToPhysicalPage(getNextPhysicalPage(physicalPage, maxPhysicalPage))
                }
                className={ARROW_BUTTON_CLASS_NAME}
              >
                <ChevronRight className="size-6" />
              </button>
            </div>
          </div>
        </div>

        <div aria-hidden="true" />
      </div>

      {/* The drag overlay (story 14): renders the dragged card's image
          following the pointer, sized to match the original slot's
          rendered dimensions automatically (dnd-kit sizes `DragOverlay`'s
          content to the original draggable node's measured rect). */}
      <DragOverlay>
        {activeDragCard && (
          <div
            className="flex h-full w-full items-center justify-center overflow-hidden rounded-standard border border-neutral-700 bg-neutral-800"
            style={{ aspectRatio: slotAspectRatio }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element -- mirrors
                the same arbitrary-origin image handling as `BinderSlot`. */}
            <img
              src={resolveCardImageUrl(activeDragCard.imageUrl)}
              alt={activeDragCard.name}
              className="h-full w-full object-contain"
            />
          </div>
        )}
      </DragOverlay>

      {selectedSlot && (
        <CardSelectionModal
          onClose={() => {
            setSelectedSlot(null);
            setManualEntryDraft(null);
          }}
          onSelectCard={handleSelectCard}
          onSubmitCustomCard={handleSubmitCustomCard}
          initialManualEntry={manualEntryDraft ?? undefined}
        />
      )}
    </DndContext>
  );
}
