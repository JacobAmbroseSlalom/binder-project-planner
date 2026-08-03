'use client';

import {
  CARD_SEARCH_INCLUDE_TCG_POCKET_DEFAULT,
  CARD_SEARCH_LANGUAGE_DEFAULT,
} from '@binder-project-planner/shared';
import { useRouter } from 'next/navigation';
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

import {
  createArt as createArtRequest,
  createCardsBulk,
  createCustomCard,
  deleteArt as deleteArtRequest,
  deleteCard,
  duplicateArt as duplicateArtRequest,
  duplicateCard as duplicateCardRequest,
  getBinder,
  listBinderArt,
  listBinderCards,
  moveArt as moveArtRequest,
  moveCards,
  updateArt as updateArtRequest,
  updateCardVariation as updateCardVariationRequest,
  type Art,
  type Binder,
  type Card,
  type CardPositionUpdate,
  type CardSearchLanguage,
  type TcgDexCatalogCard,
  type PlacementCoordinates,
} from '@/lib/api';
import {
  LoadingIndicator,
  toProblemDetailsInfo,
  useDelayedLoading,
  useSaveStatusToast,
  useToastContext,
} from '@/shared/feedback';

import { getFootprintCells, isFootprintBlocked } from './artFootprint';
import { BinderTabs } from './BinderTabs';

// Builds the key used to look up a card by slot, and to track a slot's
// pending-assignment state, from its placement coordinates (story 11). All
// 3 coordinates are always populated together for a placed card (see the
// `PlacementCoordinates` schema), so this never needs to handle a partially
// null placement.
function placementKey(placement: { physicalPage: number; row: number; column: number }): string {
  return `${placement.physicalPage}-${placement.row}-${placement.column}`;
}

// The manual-entry form's text-field values (story 12) - excludes the
// image file (handled separately as a `File`). `variation` (story 16) is
// entered through the same shared add-card modal field the TCGdex search
// view uses, rather than a separate manual-entry-only field.
export interface CustomCardFormValues {
  name: string;
  setName: string | null;
  localNumber: string | null;
  variation: string | null;
}

// A one-shot signal set by `assignCustomCard` when a custom-card submission
// fails (story 12: "the manual-entry view reopens ... with the entered
// values and selected file preserved"). `BinderLayoutView` consumes this
// exactly once (reopening the card-selection modal pre-filled, then
// clearing it via `clearManualEntryRestore`) rather than it living as
// persistent state, so a later unrelated modal open never accidentally
// restores a stale failed attempt.
export interface ManualEntryRestore {
  placement: { physicalPage: number; row: number; column: number } | null;
  values: CustomCardFormValues;
  file: File;
}

// One failed card from the most recent bulk-add batch (stories 17/18),
// preserved for the failure-details modal's per-card listing and the
// shared failed toast's "View details" action.
export interface BulkAddFailedCard {
  card: TcgDexCatalogCard;
  detail: string;
  httpStatus?: number;
  problemType?: string;
  // The target placement this specific card was attempted at, or `null`
  // if it was submitted to the unplaced section - only ever populated for
  // the batch's first entry (the only one eligible for a real slot
  // target; see `assignCards`'s doc comment below).
  targetPlacement: { physicalPage: number; row: number; column: number } | null;
}

// The most recent bulk-add batch's unresolved failure summary (stories
// 17/18), surfaced through the shared failed toast's "View details" action
// and the `BulkAddFailuresModal`. `null` whenever there's no unresolved
// batch failure to show - cleared by `clearBulkAddFailure` (dismiss) or by
// `retryFailedBulkCards`, which clears it immediately (before the retry
// request even settles), since Retry All Failed always closes the details
// modal right away.
export interface BulkAddFailure {
  items: BulkAddFailedCard[];
  variation: string | null;
}

// A one-shot signal set by `assignCards` when an Add-Card (closes-
// immediately) bulk submission has any failed card (story 17), mirroring
// `ManualEntryRestore`'s "reopen pre-filled" behavior: the layout tab
// reopens the card-selection modal pre-filled with just the failed cards'
// selection and shared variation, rather than losing the whole batch to a
// background toast alone. Never set for an Add-More submission, since that
// view stays open on its own and needs no restore signal.
export interface BulkSelectionRestore {
  placement: { physicalPage: number; row: number; column: number } | null;
  cards: TcgDexCatalogCard[];
  variation: string | null;
}

// The create-art modal's non-image field values (story 25) - excludes the
// image file (handled separately as a `File`).
export interface ArtFormValues {
  title: string;
  description: string | null;
  widthSlots: number;
  heightSlots: number;
  imageRotationDegrees: 0 | 90 | 180 | 270;
  focalX: number;
  focalY: number;
  scaleX: number;
  scaleY: number;
  borderColor: string | null;
  borderRadius: number | null;
  borderWidth: number | null;
}

// A one-shot signal set by `createArt` when a create-art submission fails
// (story 25: "reopens the editor with the image, metadata, dimensions,
// rotation, transforms, and style choices preserved"). `previewUrl` is the
// same object URL the failed optimistic item used - retained (not
// revoked) so the reopened editor can reuse it without recreating one -
// until `clearArtCreateRestore` revokes it once the editor no longer needs
// it.
export interface ArtCreateRestore {
  values: ArtFormValues;
  file: File;
  previewUrl: string;
}

// A one-shot signal set by `editArt` when an edit submission fails (story
// 26, mirroring `ArtCreateRestore`'s "reopen pre-filled" behavior). `file`/
// `previewUrl` are `null` when the failed edit didn't replace the image -
// the edit modal then keeps showing the art's existing (unchanged) image.
export interface ArtEditRestore {
  artId: string;
  values: ArtFormValues;
  file: File | null;
  previewUrl: string | null;
}

// Fixed (not per-attempt-random) toast id, matching the pattern established
// by BinderList's `LIST_BINDERS_TOAST_ID`: a later attempt (retry, or a
// fresh mount after the redirect-home case below) replaces this operation's
// own toast rather than stacking a new one on top of a still-visible one.
const OPEN_BINDER_TOAST_ID = 'open-binder';

// The 3 states one binder-load attempt can be in (mirrors BinderList's
// `BinderListStatus`, extended here with the redirect-triggering 404/400
// handling in the effect below rather than as a 4th status).
type BinderLoadStatus = 'loading' | 'success' | 'error';

// The shared binder route context value (story 7): the binder details,
// cards, and multi-slot art loaded in parallel by the route's provider, plus
// a setter the Edit Details tab uses to sync the context after a successful
// `PATCH` without forcing a full reload.
interface BinderRouteContextValue {
  binder: Binder;
  cards: Card[];
  art: Art[];
  // Replaces the context's binder with the backend's authoritative
  // representation, e.g. after the Edit Details tab's `PATCH` succeeds.
  updateBinder: (binder: Binder) => void;
  // The most recently displayed one-based physical page on the "Edit
  // Layout" tab (story 8), or `null` if that tab hasn't been visited yet
  // this route mount. Retained here (rather than in the layout tab's own
  // state) so it survives switching to another tab and back without
  // needing to reload binder data.
  layoutFocalPage: number | null;
  setLayoutFocalPage: (page: number) => void;
  // Submits one or more selected TCGdex catalog cards to a binder slot, or
  // to the unplaced section if `targetPlacement` is `null` (stories 11, 17,
  // 18 - the sole TCGdex-card assignment path; a single-card selection is
  // just a one-element array). Inserts an optimistic `Card` per selected
  // card immediately, then replaces or removes each one individually as
  // the bulk endpoint's per-card outcomes come back. Only the array's
  // first element is ever attempted at `targetPlacement`; every other
  // element - and the first when `targetPlacement` is itself `null` -
  // lands in the unplaced section, matching the backend bulk endpoint's
  // own slot-targeting rule. `reopenOnFailure` is `true` only for an
  // Add-Card (closes-immediately) submission (story 17): if any card
  // fails, it seeds `bulkSelectionRestore` so the layout tab can reopen the
  // modal pre-filled, mirroring `assignCustomCard`'s `manualEntryRestore`.
  // Returns whether every card in the batch succeeded, so an Add-More
  // submission can await it to decide whether to clear its own search
  // state.
  assignCards: (
    cards: TcgDexCatalogCard[],
    variation: string | null,
    targetPlacement: { physicalPage: number; row: number; column: number } | null,
    reopenOnFailure: boolean,
  ) => Promise<boolean>;
  // True while a bulk card-add request is in flight for this binder (story
  // 18's per-binder overlapping-request guard mirrored client-side): the
  // layout tab disables Select All/checkboxes/Add Card/Add More until it
  // settles, matching the backend's own 409 rejection of an overlapping
  // request.
  isBulkAddPending: boolean;
  // The most recent bulk-add batch's unresolved failure summary (stories
  // 17/18), or `null`. Surfaced by the shared failed toast's "View
  // details" action and the `BulkAddFailuresModal`.
  bulkAddFailure: BulkAddFailure | null;
  clearBulkAddFailure: () => void;
  // Resubmits every card from `bulkAddFailure` through `assignCards` and
  // clears `bulkAddFailure` immediately (story 18: "Retry All Failed
  // closes the details modal right away and runs the retry in the
  // background"). If the original slot-targeted card is among the failed
  // cards, it's resubmitted first at the same target placement; every
  // other retried card uses an all-null (unplaced) placement.
  retryFailedBulkCards: () => void;
  // Set only by `assignCards` when an Add-Card submission fails (story
  // 17), mirroring `manualEntryRestore`. Consumed exactly once via
  // `clearBulkSelectionRestore`.
  bulkSelectionRestore: BulkSelectionRestore | null;
  clearBulkSelectionRestore: () => void;
  // Assigns a manually-entered custom card to a binder slot (story 12),
  // mirroring `assignCards`'s optimistic-insert/replace-or-remove
  // lifecycle. `placement` is `null` for an unplaced-section target
  // (story 15's panel add button). Returns whether the submission
  // succeeded, so an Add-More custom-card submission can await it to
  // decide whether to clear its own form state (story 17/18).
  assignCustomCard: (
    values: CustomCardFormValues,
    file: File,
    placement: { physicalPage: number; row: number; column: number } | null,
    reopenOnFailure: boolean,
  ) => Promise<boolean>;
  // The set of optimistic card ids for a card currently being created
  // directly into the unplaced section (story 15) - either through
  // `assignCards` or `assignCustomCard` with an all-null placement target -
  // so the unplaced panel can disable that one pending card's own actions
  // until its create request settles. Keyed by id (not `placementKey`,
  // which needs concrete coordinates that an unplaced card never has).
  pendingUnplacedCardIds: Set<string>;
  // Set once by `assignCustomCard` when a submission fails, so the layout
  // tab can reopen the card-selection modal pre-filled with the failed
  // attempt's values/file rather than losing them. Consumed exactly once
  // via `clearManualEntryRestore`.
  manualEntryRestore: ManualEntryRestore | null;
  clearManualEntryRestore: () => void;
  // The set of `placementKey`-formatted slots with an assignment currently
  // in flight, so the layout tab can disable those slots against further
  // clicks until the request settles.
  pendingPlacementKeys: Set<string>;
  // Permanently removes a card from its binder slot (story 13):
  // optimistically removes it from context immediately, restoring it to
  // its exact prior list index if the backend delete fails.
  removeCard: (cardId: string) => void;
  // The set of card ids with a removal currently in flight, so the layout
  // tab can disable that card's own actions (permitting no further actions
  // on it) until the request settles.
  pendingCardDeletionIds: Set<string>;
  // Edits an existing card's saved variation (story 16): optimistically
  // applies the new value immediately, then replaces it with the backend's
  // authoritative representation on success, or restores the prior value
  // on failure. Uses last-write-wins semantics (no expected prior value is
  // sent), matching `PATCH /cards/{cardId}`'s variation-update contract.
  editCardVariation: (cardId: string, variation: string | null) => void;
  // The set of card ids with a variation edit currently in flight, so the
  // edit-variation modal/card tile can disable that one card's own actions
  // until the request settles.
  pendingCardVariationEditIds: Set<string>;
  // Duplicates a card into the unplaced-cards section (story 19): inserts
  // an optimistic copy immediately, then replaces it with the backend's
  // authoritative representation on success, or removes it on failure.
  duplicateCard: (cardId: string) => void;
  // The set of optimistic card ids currently being duplicated, so the card
  // tile can disable that one pending item until its request settles.
  pendingCardDuplicateIds: Set<string>;
  // Moves (or, if `destination` is already occupied, swaps with) a card to
  // another slot on the same binder (story 14): optimistically applies the
  // new placement(s) immediately, then replaces the affected cards with
  // the backend's authoritative representation on success, or restores
  // both cards' exact prior placements on failure (e.g. a `409 Conflict`
  // from a stale expected position or an occupied destination).
  moveCard: (
    cardId: string,
    destination: { physicalPage: number | null; row: number | null; column: number | null },
  ) => void;
  // True while a move/swap request is in flight for this binder. Per story
  // 14's serialization requirement, at most one movement request is ever
  // in flight at a time, so this single flag (rather than a per-card set)
  // is enough for the layout tab to disable all card dragging in the
  // binder until it settles - new movement operations are never queued
  // behind it.
  isMovePending: boolean;
  // Story 41's card-selection modal language toggle: ephemeral React state
  // that lives above the modal so it survives the modal closing and
  // reopening within the same binder visit, but resets (back to
  // `CARD_SEARCH_LANGUAGE_DEFAULT`) whenever this route context itself
  // remounts (a fresh binder visit or a page reload) - it's never persisted
  // to the backend or browser storage.
  cardSearchLanguage: CardSearchLanguage;
  setCardSearchLanguage: (language: CardSearchLanguage) => void;
  // Story 41's card-selection modal TCG Pocket toggle: ephemeral React
  // state with the same lifetime and reset behavior as `cardSearchLanguage`
  // above.
  includeTcgPocket: boolean;
  setIncludeTcgPocket: (includeTcgPocket: boolean) => void;
  // Creates multi-slot art directly into the unplaced-art section (story
  // 25): inserts an optimistic `Art` item immediately using an object-URL
  // image preview, then replaces it with the backend's authoritative
  // representation on success, or removes it and preserves the failed
  // attempt via `artCreateRestore` on failure.
  createArt: (values: ArtFormValues, file: File) => void;
  // The set of optimistic art ids currently being created, so the
  // unplaced-art panel can disable that one pending item until its create
  // request settles - mirrors `pendingUnplacedCardIds`.
  pendingUnplacedArtIds: Set<string>;
  // Set once by `createArt` when a submission fails, so the create-art
  // modal can reopen pre-filled with the failed attempt's values/file
  // rather than losing them. Consumed exactly once via
  // `clearArtCreateRestore`.
  artCreateRestore: ArtCreateRestore | null;
  clearArtCreateRestore: () => void;
  // Moves multi-slot art to another placement, or to the unplaced-art
  // section if `destination` is all-null (story 26). Mirrors `moveCard`'s
  // optimistic-apply/rollback lifecycle, but never swaps (art can only
  // move into empty, in-bounds space). If the destination footprint is
  // already known (client-side, from current `art`/`cards` state) to be
  // occupied, this cancels silently - no optimistic update, no request, no
  // toast (planning.md: "Dropping on a client-known blocked footprint
  // cancels locally"). Shares `isMovePending` with `moveCard` (story 26:
  // "Card and art moves share one binder-scoped movement queue").
  moveArt: (artId: string, destination: PlacementCoordinates) => void;
  // Edits an existing art item's metadata, transform, style overrides, and
  // (optionally) its image (story 26): optimistically applies the changes
  // immediately, then replaces with the backend's authoritative
  // representation on success, or restores the prior values and sets
  // `artEditRestore` on failure. `moveToUnplacedOnConflict` confirms
  // saving edited dimensions that no longer fit the art's current
  // placement by moving it to the unplaced-art section in the same
  // request.
  editArt: (
    artId: string,
    values: ArtFormValues,
    file: File | null,
    moveToUnplacedOnConflict?: boolean,
  ) => void;
  // The set of art ids with an edit currently in flight, so the layout tab
  // can disable that one item's own actions until the request settles.
  pendingArtEditIds: Set<string>;
  // Set once by `editArt` when a submission fails, so the edit modal can
  // reopen pre-filled with the failed attempt's values/file rather than
  // losing them. Consumed exactly once via `clearArtEditRestore`.
  artEditRestore: ArtEditRestore | null;
  clearArtEditRestore: () => void;
  // Permanently removes an art item from the binder (story 26), mirroring
  // `removeCard`'s optimistic-remove/restore-on-failure lifecycle.
  removeArt: (artId: string) => void;
  // The set of art ids with a removal currently in flight, so the layout
  // tab can disable that item's own actions until the request settles.
  pendingArtDeletionIds: Set<string>;
  // Duplicates an art item into the unplaced-art section (story 26):
  // inserts an optimistic copy immediately, then replaces it with the
  // backend's authoritative representation on success, or removes it on
  // failure.
  duplicateArt: (artId: string) => void;
  // The set of optimistic art ids currently being duplicated, so the panel
  // can disable that one pending item until its request settles.
  pendingArtDuplicateIds: Set<string>;
}

const BinderRouteContext = createContext<BinderRouteContextValue | null>(null);

// Reads the binder route context, throwing if called outside a
// `BinderRouteProvider` so a tab rendered without the provider mounted above
// it (a programming error) fails loudly rather than silently.
export function useBinderRouteContext(): BinderRouteContextValue {
  const context = useContext(BinderRouteContext);
  if (!context) {
    throw new Error('useBinderRouteContext must be used within a BinderRouteProvider.');
  }
  return context;
}

// Mounted once per binder route (from `[binderId]/layout.tsx`) and remains
// mounted while the user switches between its nested tabs, so tab
// navigation never refetches unchanged binder data or discards local
// updates (story 7). Loads the binder's details, cards, and art through 3
// parallel requests and only publishes them - and only renders the tab nav
// and `children` - once every request has succeeded, so nested tabs never
// receive a partially loaded binder graph.
export function BinderRouteProvider({
  binderId,
  children,
}: {
  binderId: string;
  children: React.ReactNode;
}) {
  const router = useRouter();
  const { markFailed, dismiss } = useToastContext();
  const { start } = useSaveStatusToast();

  const [status, setStatus] = useState<BinderLoadStatus>('loading');
  const [binder, setBinder] = useState<Binder | null>(null);
  const [cards, setCards] = useState<Card[]>([]);
  const [art, setArt] = useState<Art[]>([]);
  // The slots (by `placementKey`) with an assignment currently in flight
  // (story 11), so the layout tab can disable them until the request
  // settles.
  const [pendingPlacementKeys, setPendingPlacementKeys] = useState<Set<string>>(new Set());
  // Bumped by the retry button to re-run the load effect below without
  // needing a separate imperative "reload" function threaded through state.
  const [retryToken, setRetryToken] = useState(0);
  // Story 8's retained layout focal page; `null` means the layout tab
  // hasn't been visited yet during this route mount, so it should still
  // default to physical page 1 without adding `?page=1` to the URL.
  const [layoutFocalPage, setLayoutFocalPage] = useState<number | null>(null);
  // Story 41's card-selection modal language toggle - ephemeral, scoped to
  // this route mount (see the context value's own doc comment above).
  const [cardSearchLanguage, setCardSearchLanguage] = useState<CardSearchLanguage>(
    CARD_SEARCH_LANGUAGE_DEFAULT,
  );
  // Story 41's card-selection modal TCG Pocket toggle - ephemeral, scoped
  // the same way as `cardSearchLanguage` above.
  const [includeTcgPocket, setIncludeTcgPocket] = useState<boolean>(
    CARD_SEARCH_INCLUDE_TCG_POCKET_DEFAULT,
  );
  // Story 12's one-shot restore signal (see the context value type's doc
  // comment above) - `null` whenever there's no failed custom-card
  // submission awaiting correction.
  const [manualEntryRestore, setManualEntryRestore] = useState<ManualEntryRestore | null>(null);
  // True while a bulk card-add request is in flight for this binder
  // (stories 17/18) - see the context value's own doc comment above.
  const [isBulkAddPending, setIsBulkAddPending] = useState(false);
  // The most recent bulk-add batch's unresolved failure summary (stories
  // 17/18) - `null` whenever there's no unresolved batch failure to show.
  const [bulkAddFailure, setBulkAddFailure] = useState<BulkAddFailure | null>(null);
  // Story 17's one-shot Add-Card restore signal, mirroring
  // `manualEntryRestore` above.
  const [bulkSelectionRestore, setBulkSelectionRestore] = useState<BulkSelectionRestore | null>(
    null,
  );
  // Story 13's in-flight card removals, by card id - lets the layout tab
  // disable a pending card's own actions until its delete request settles.
  const [pendingCardDeletionIds, setPendingCardDeletionIds] = useState<Set<string>>(new Set());
  // Story 14's single in-flight-movement flag (see the context value's own
  // doc comment above for why one flag suffices instead of a per-card set).
  const [isMovePending, setIsMovePending] = useState(false);
  // Story 15's in-flight-unplaced-create ids (see the context value's own
  // doc comment above).
  const [pendingUnplacedCardIds, setPendingUnplacedCardIds] = useState<Set<string>>(new Set());
  // Story 25's in-flight-art-create ids, mirroring
  // `pendingUnplacedCardIds`.
  const [pendingUnplacedArtIds, setPendingUnplacedArtIds] = useState<Set<string>>(new Set());
  // Story 25's one-shot create-art failure restore signal (see the context
  // value type's own doc comment above) - `null` whenever there's no
  // failed art submission awaiting correction.
  const [artCreateRestore, setArtCreateRestore] = useState<ArtCreateRestore | null>(null);
  // Story 26's in-flight-art-edit/deletion/duplication ids, mirroring
  // `pendingCardDeletionIds`/`pendingUnplacedArtIds`.
  const [pendingArtEditIds, setPendingArtEditIds] = useState<Set<string>>(new Set());
  const [pendingArtDeletionIds, setPendingArtDeletionIds] = useState<Set<string>>(new Set());
  const [pendingArtDuplicateIds, setPendingArtDuplicateIds] = useState<Set<string>>(new Set());
  // Story 26's one-shot edit-art failure restore signal, mirroring
  // `artCreateRestore` - `null` whenever there's no failed art edit
  // awaiting correction.
  const [artEditRestore, setArtEditRestore] = useState<ArtEditRestore | null>(null);
  // Story 16's in-flight-card-variation-edit ids, mirroring
  // `pendingCardDeletionIds`.
  const [pendingCardVariationEditIds, setPendingCardVariationEditIds] = useState<Set<string>>(
    new Set(),
  );
  // Story 19's in-flight-card-duplication ids (optimistic ids only),
  // mirroring `pendingArtDuplicateIds`.
  const [pendingCardDuplicateIds, setPendingCardDuplicateIds] = useState<Set<string>>(new Set());

  const showLoading = useDelayedLoading(status === 'loading');

  useEffect(() => {
    const controller = new AbortController();

    async function load() {
      setStatus('loading');
      try {
        // Story 7 requires all 3 requests to run in parallel and to publish
        // together only once every one succeeds, so a consumer never sees
        // e.g. cards without matching binder details.
        const [binderResult, cardsResult, artResult] = await Promise.all([
          getBinder(binderId, controller.signal),
          listBinderCards(binderId, controller.signal),
          listBinderArt(binderId, controller.signal),
        ]);
        setBinder(binderResult);
        setCards(cardsResult);
        setArt(artResult);
        setStatus('success');
        dismiss(OPEN_BINDER_TOAST_ID);
      } catch (error) {
        // An aborted request's rejection isn't a real failure - it means this
        // attempt was superseded (e.g. the user navigated away), so it's
        // ignored rather than reported as an error.
        if (controller.signal.aborted) return;

        const info = toProblemDetailsInfo(error);
        if (info.httpStatus === 404 || info.httpStatus === 400) {
          // Missing binder (404) or malformed binderId (400, rejected by
          // request validation before the database lookup) both use the
          // same redirect-home-and-toast behavior per story 7's acceptance
          // criteria. `replace` (not `push`) so the invalid binder URL isn't
          // left in browser history.
          markFailed(OPEN_BINDER_TOAST_ID, info);
          router.replace('/');
          return;
        }

        setStatus('error');
        markFailed(OPEN_BINDER_TOAST_ID, info);
      }
    }

    load();

    return () => {
      controller.abort();
    };
  }, [binderId, retryToken, router, markFailed, dismiss]);

  // Lets the Edit Details tab sync the context with the backend's
  // authoritative binder after a successful `PATCH`, without re-fetching
  // cards/art or discarding the rest of the loaded route state.
  const updateBinder = useCallback((updated: Binder) => {
    setBinder(updated);
  }, []);

  // A failed (non-404/400) load's retry action: re-runs all 3 requests per
  // story 7's "retry starts all three requests again".
  const retry = useCallback(() => {
    setRetryToken((token) => token + 1);
  }, []);

  // Submits one or more selected TCGdex catalog cards to a binder slot, or
  // to the unplaced section (stories 11, 17, 18 - see the context value's
  // own doc comment above for the full contract). Each selected card gets
  // its own optimistic `Card` up front, independent of the others, since
  // the backend persists (and can fail) each one independently too. Only
  // the first entry ever uses `targetPlacement`; every other entry - and
  // the first when `targetPlacement` is itself `null` - is unplaced.
  const assignCards = useCallback(
    (
      selection: TcgDexCatalogCard[],
      variation: string | null,
      targetPlacement: { physicalPage: number; row: number; column: number } | null,
      reopenOnFailure: boolean,
    ): Promise<boolean> => {
      if (selection.length === 0) return Promise.resolve(true);

      const idempotencyKey = crypto.randomUUID();
      const now = new Date().toISOString();

      const entries = selection.map((catalogCard, index) => {
        const placement =
          index === 0 && targetPlacement
            ? targetPlacement
            : { physicalPage: null, row: null, column: null };
        const optimisticId = `optimistic-${crypto.randomUUID()}`;
        const optimisticCard: Card = {
          id: optimisticId,
          binderId,
          name: catalogCard.name,
          setName: catalogCard.setName,
          localNumber: catalogCard.localNumber,
          source: 'tcgdex',
          providerCardId: catalogCard.providerCardId,
          providerSetId: catalogCard.providerSetId,
          variation,
          placement,
          // The provider's own image URL stands in until the backend's
          // representation (pointing at its own `/cards/{cardId}/image`
          // endpoint) replaces this optimistic entry.
          imageUrl: catalogCard.imageUrl,
          createdAt: now,
          updatedAt: now,
        };
        return { catalogCard, optimisticCard, placement };
      });

      setCards((previous) => [...previous, ...entries.map((entry) => entry.optimisticCard)]);
      const placedKey = targetPlacement ? placementKey(targetPlacement) : null;
      if (placedKey) {
        setPendingPlacementKeys((previous) => new Set(previous).add(placedKey));
      }
      setPendingUnplacedCardIds((previous) => {
        const next = new Set(previous);
        for (const entry of entries) {
          if (entry.placement.physicalPage === null) next.add(entry.optimisticCard.id);
        }
        return next;
      });
      setIsBulkAddPending(true);

      // Shared across every card in the batch (rather than one toast per
      // card), matching story 18's "one shared saving toast for the whole
      // batch" requirement.
      const toast = start(`bulk-add-cards-${idempotencyKey}`);

      function settle() {
        if (placedKey) {
          setPendingPlacementKeys((previous) => {
            const next = new Set(previous);
            next.delete(placedKey);
            return next;
          });
        }
        setPendingUnplacedCardIds((previous) => {
          const next = new Set(previous);
          for (const entry of entries) next.delete(entry.optimisticCard.id);
          return next;
        });
        setIsBulkAddPending(false);
      }

      return createCardsBulk(
        binderId,
        {
          cards: selection.map(
            ({ name, setName, localNumber, providerCardId, providerSetId, imageUrl }) => ({
              name,
              setName,
              localNumber,
              providerCardId,
              providerSetId,
              imageUrl,
            }),
          ),
          variation,
          targetPlacement: targetPlacement ?? undefined,
        },
        idempotencyKey,
      )
        .then((outcomes) => {
          const failed: BulkAddFailedCard[] = [];

          setCards((previous) => {
            let next = previous;
            outcomes.forEach((outcome, index) => {
              const entry = entries[index]!;
              if (outcome.status === 'created' && outcome.card) {
                const created = outcome.card;
                next = next.map((existing) =>
                  existing.id === entry.optimisticCard.id ? created : existing,
                );
              } else {
                next = next.filter((existing) => existing.id !== entry.optimisticCard.id);
                failed.push({
                  card: entry.catalogCard,
                  detail: outcome.problem?.detail ?? 'This card failed to save.',
                  httpStatus: outcome.problem?.status,
                  problemType: outcome.problem?.type,
                  targetPlacement:
                    entry.placement.physicalPage !== null
                      ? (entry.placement as { physicalPage: number; row: number; column: number })
                      : null,
                });
              }
            });
            return next;
          });

          settle();

          if (failed.length === 0) {
            toast.markSaved();
            return true;
          }

          const successCount = outcomes.length - failed.length;
          markFailed(toast.operationId, {
            detail: `Added ${successCount} card${successCount === 1 ? '' : 's'}; ${failed.length} card${failed.length === 1 ? '' : 's'} failed to save.`,
            action: {
              label: 'View details',
              onClick: () => setBulkAddFailure({ items: failed, variation }),
            },
          });
          setBulkAddFailure({ items: failed, variation });
          if (reopenOnFailure) {
            setBulkSelectionRestore({
              placement: targetPlacement,
              cards: failed.map((item) => item.card),
              variation,
            });
          }
          return false;
        })
        .catch((error) => {
          // A request-wide failure (e.g. a network error, or a 4xx/5xx
          // rejecting the whole batch before any per-card outcome exists) -
          // every optimistic card in this batch is rolled back, not just
          // some of them.
          setCards((previous) =>
            previous.filter(
              (card) => !entries.some((entry) => entry.optimisticCard.id === card.id),
            ),
          );
          settle();
          toast.markFailed(error);
          if (reopenOnFailure) {
            setBulkSelectionRestore({ placement: targetPlacement, cards: selection, variation });
          }
          return false;
        });
    },
    [binderId, start, markFailed],
  );

  // Assigns a manually-entered custom card to a binder slot (story 12).
  // Mirrors `assignCards`'s optimistic lifecycle, but creates its own
  // object-URL preview from the uploaded `file` for the optimistic card's
  // `imageUrl` (independent of the card-selection modal's own preview
  // object URL - each owns and revokes its own). Revoking it
  // unconditionally in `.finally()` is safe either way: by the time
  // `.finally()` runs, the `.then()`/`.catch()` above has already replaced
  // or removed the optimistic card from `cards`, so nothing continues to
  // reference this URL regardless of outcome. `reopenOnFailure` mirrors
  // `assignCards`'s own parameter (story 17): `true` only for an Add-Card
  // (closes-immediately) submission, so an Add-More custom-card submission
  // - whose view stays open on its own - never sets `manualEntryRestore`.
  // Returns whether the submission succeeded, so an Add-More caller can
  // await it to decide whether to clear its own form state.
  const assignCustomCard = useCallback(
    (
      values: CustomCardFormValues,
      file: File,
      placement: { physicalPage: number; row: number; column: number } | null,
      reopenOnFailure: boolean,
    ): Promise<boolean> => {
      const key = placement ? placementKey(placement) : `unplaced-${crypto.randomUUID()}`;
      const optimisticId = `optimistic-${crypto.randomUUID()}`;
      const previewUrl = URL.createObjectURL(file);
      const now = new Date().toISOString();
      const optimisticCard: Card = {
        id: optimisticId,
        binderId,
        name: values.name,
        setName: values.setName,
        localNumber: values.localNumber,
        source: 'custom',
        providerCardId: null,
        providerSetId: null,
        variation: values.variation,
        placement: placement ?? { physicalPage: null, row: null, column: null },
        imageUrl: previewUrl,
        createdAt: now,
        updatedAt: now,
      };

      setCards((previous) => [...previous, optimisticCard]);
      if (placement) {
        setPendingPlacementKeys((previous) => new Set(previous).add(key));
      } else {
        setPendingUnplacedCardIds((previous) => new Set(previous).add(optimisticId));
      }

      const toast = start(`assign-custom-card-${key}`);

      return createCustomCard(binderId, { ...values, placement, image: file })
        .then((created) => {
          setCards((previous) =>
            previous.map((card) => (card.id === optimisticId ? created : card)),
          );
          toast.markSaved();
          return true;
        })
        .catch((error) => {
          setCards((previous) => previous.filter((card) => card.id !== optimisticId));
          // Preserves the failed attempt's values/file so the layout tab
          // can reopen the modal pre-filled (see `ManualEntryRestore`'s doc
          // comment above) instead of the user having to re-enter
          // everything.
          if (reopenOnFailure) setManualEntryRestore({ placement, values, file });
          toast.markFailed(error);
          return false;
        })
        .finally(() => {
          URL.revokeObjectURL(previewUrl);
          if (placement) {
            setPendingPlacementKeys((previous) => {
              const next = new Set(previous);
              next.delete(key);
              return next;
            });
          } else {
            setPendingUnplacedCardIds((previous) => {
              const next = new Set(previous);
              next.delete(optimisticId);
              return next;
            });
          }
        });
    },
    [binderId, start],
  );

  // Clears the one-shot restore signal once `BinderLayoutView` has consumed
  // it (copied it into its own local state and reopened the modal).
  const clearManualEntryRestore = useCallback(() => {
    setManualEntryRestore(null);
  }, []);

  // Dismisses the bulk-add failure summary without retrying (story 18).
  const clearBulkAddFailure = useCallback(() => {
    setBulkAddFailure(null);
  }, []);

  // Consumed exactly once by the layout tab after it reopens the
  // card-selection modal pre-filled from `bulkSelectionRestore` (story 17).
  const clearBulkSelectionRestore = useCallback(() => {
    setBulkSelectionRestore(null);
  }, []);

  // Resubmits every failed card from the most recent bulk-add batch
  // (story 18's "Retry All Failed"). Clears `bulkAddFailure` immediately -
  // before the retry even starts - since the details modal always closes
  // right away regardless of the retry's eventual outcome.
  const retryFailedBulkCards = useCallback(() => {
    setBulkAddFailure((current) => {
      if (!current || current.items.length === 0) return current;

      // If the original slot-targeted card is among the failed cards, it's
      // resubmitted first at the same target placement; every other
      // retried card - including any that themselves failed at a target
      // placement, which by construction can only be this same one entry -
      // uses an all-null (unplaced) placement.
      const slotTargetedIndex = current.items.findIndex((item) => item.targetPlacement !== null);
      const orderedItems =
        slotTargetedIndex > 0
          ? [
              current.items[slotTargetedIndex]!,
              ...current.items.filter((_, index) => index !== slotTargetedIndex),
            ]
          : current.items;
      const targetPlacement = slotTargetedIndex >= 0 ? orderedItems[0]!.targetPlacement : null;

      void assignCards(
        orderedItems.map((item) => item.card),
        current.variation,
        targetPlacement,
        false,
      );
      return null;
    });
  }, [assignCards]);

  // Creates multi-slot art directly into the unplaced-art section (story
  // 25), mirroring `assignCustomCard`'s optimistic-insert/replace-or-remove
  // lifecycle. New art always starts unplaced (all-null placement) -
  // placing it on the layout is story 26's scope.
  const createArt = useCallback(
    (values: ArtFormValues, file: File) => {
      const optimisticId = `optimistic-${crypto.randomUUID()}`;
      const previewUrl = URL.createObjectURL(file);
      const now = new Date().toISOString();
      const optimisticArt: Art = {
        id: optimisticId,
        binderId,
        title: values.title,
        description: values.description,
        widthSlots: values.widthSlots,
        heightSlots: values.heightSlots,
        placement: { physicalPage: null, row: null, column: null },
        imageUrl: previewUrl,
        imageRotationDegrees: values.imageRotationDegrees,
        focalX: values.focalX,
        focalY: values.focalY,
        scaleX: values.scaleX,
        scaleY: values.scaleY,
        borderColor: values.borderColor,
        borderRadius: values.borderRadius,
        borderWidth: values.borderWidth,
        createdAt: now,
        updatedAt: now,
      };

      setArt((previous) => [...previous, optimisticArt]);
      setPendingUnplacedArtIds((previous) => new Set(previous).add(optimisticId));

      const toast = start(`create-art-${optimisticId}`);

      createArtRequest(binderId, { ...values, image: file })
        .then((created) => {
          setArt((previous) => previous.map((item) => (item.id === optimisticId ? created : item)));
          toast.markSaved();
          // The backend's own `/art/{artId}/image` endpoint replaces this
          // optimistic entry, so the object-URL preview is no longer
          // referenced by anything.
          URL.revokeObjectURL(previewUrl);
        })
        .catch((error) => {
          setArt((previous) => previous.filter((item) => item.id !== optimisticId));
          // Retains `previewUrl` (rather than revoking it here) so the
          // reopened editor can reuse it without recreating one; it's
          // revoked once `clearArtCreateRestore` runs (planning.md).
          setArtCreateRestore({ values, file, previewUrl });
          toast.markFailed(error);
        })
        .finally(() => {
          setPendingUnplacedArtIds((previous) => {
            const next = new Set(previous);
            next.delete(optimisticId);
            return next;
          });
        });
    },
    [binderId, start],
  );

  // Clears the one-shot art-create restore signal once the create-art
  // modal has consumed it, revoking its retained object URL now that the
  // restored preview no longer needs it.
  const clearArtCreateRestore = useCallback(() => {
    setArtCreateRestore((previous) => {
      if (previous) URL.revokeObjectURL(previous.previewUrl);
      return null;
    });
  }, []);

  // Moves multi-slot art to a new placement, or to the unplaced-art
  // section (story 26). Cancels silently before any state change if the
  // destination footprint is already known - from the current `art`/
  // `cards` state - to be occupied, matching planning.md's "Dropping on a
  // client-known blocked footprint cancels locally ... sends no request or
  // toast" (the backend's own occupancy check still guards against a
  // destination that changed since this client last loaded it).
  const moveArt = useCallback(
    (artId: string, destination: PlacementCoordinates) => {
      const draggedArt = art.find((item) => item.id === artId);
      if (!draggedArt) return;

      if (
        destination.physicalPage !== null &&
        destination.row !== null &&
        destination.column !== null
      ) {
        const footprintCells = getFootprintCells(
          destination.row,
          destination.column,
          draggedArt.widthSlots,
          draggedArt.heightSlots,
        );
        if (isFootprintBlocked(cards, art, destination.physicalPage, footprintCells, artId)) return;
      }

      const previousPlacement = draggedArt.placement;
      setArt((previous) =>
        previous.map((item) => (item.id === artId ? { ...item, placement: destination } : item)),
      );
      setIsMovePending(true);

      const toast = start(`move-art-${artId}`);

      moveArtRequest(artId, previousPlacement, destination)
        .then((updated) => {
          setArt((previous) => previous.map((item) => (item.id === artId ? updated : item)));
          toast.markSaved();
        })
        .catch((error) => {
          setArt((previous) =>
            previous.map((item) =>
              item.id === artId ? { ...item, placement: previousPlacement } : item,
            ),
          );
          toast.markFailed(error);
        })
        .finally(() => {
          setIsMovePending(false);
        });
    },
    [art, cards, start],
  );

  // Edits an existing art item's metadata, transform, style overrides, and
  // (optionally) its image (story 26), mirroring `assignCustomCard`'s
  // optimistic-apply/restore-on-failure lifecycle. `file` is `null` when
  // the edit keeps the art's current image.
  const editArt = useCallback(
    (
      artId: string,
      values: ArtFormValues,
      file: File | null,
      moveToUnplacedOnConflict?: boolean,
    ) => {
      const existing = art.find((item) => item.id === artId);
      if (!existing) return;

      const previousArt = existing;
      const previewUrl = file ? URL.createObjectURL(file) : null;

      setArt((previous) =>
        previous.map((item) =>
          item.id === artId
            ? {
                ...item,
                title: values.title,
                description: values.description,
                widthSlots: values.widthSlots,
                heightSlots: values.heightSlots,
                imageRotationDegrees: values.imageRotationDegrees,
                focalX: values.focalX,
                focalY: values.focalY,
                scaleX: values.scaleX,
                scaleY: values.scaleY,
                borderColor: values.borderColor,
                borderRadius: values.borderRadius,
                borderWidth: values.borderWidth,
                imageUrl: previewUrl ?? item.imageUrl,
              }
            : item,
        ),
      );
      setPendingArtEditIds((previous) => new Set(previous).add(artId));

      const toast = start(`edit-art-${artId}`);

      updateArtRequest(artId, {
        ...values,
        moveToUnplacedOnConflict,
        ...(file ? { image: file } : {}),
      })
        .then((updated) => {
          setArt((previous) => previous.map((item) => (item.id === artId ? updated : item)));
          toast.markSaved();
          if (previewUrl) URL.revokeObjectURL(previewUrl);
        })
        .catch((error) => {
          setArt((previous) => previous.map((item) => (item.id === artId ? previousArt : item)));
          // Retains `previewUrl` (rather than revoking it here) so the
          // reopened edit modal can reuse it, mirroring
          // `ArtCreateRestore`'s own comment above - revoked once
          // `clearArtEditRestore` runs.
          setArtEditRestore({ artId, values, file, previewUrl });
          toast.markFailed(error);
        })
        .finally(() => {
          setPendingArtEditIds((previous) => {
            const next = new Set(previous);
            next.delete(artId);
            return next;
          });
        });
    },
    [art, start],
  );

  // Clears the one-shot edit-art restore signal once the edit modal has
  // consumed it, revoking its retained object URL (if any) now that the
  // restored preview no longer needs it.
  const clearArtEditRestore = useCallback(() => {
    setArtEditRestore((previous) => {
      if (previous?.previewUrl) URL.revokeObjectURL(previous.previewUrl);
      return null;
    });
  }, []);

  // Permanently removes an art item from the binder (story 26), mirroring
  // `removeCard`'s exact-list-index restore-on-failure lifecycle.
  const removeArt = useCallback(
    (artId: string) => {
      const index = art.findIndex((item) => item.id === artId);
      if (index === -1) return;
      const removedArt = art[index];

      setArt((previous) => previous.filter((item) => item.id !== artId));
      setPendingArtDeletionIds((previous) => new Set(previous).add(artId));

      const toast = start(`remove-art-${artId}`);

      deleteArtRequest(artId)
        .then(() => {
          toast.markSaved();
        })
        .catch((error) => {
          setArt((previous) => {
            const restored = [...previous];
            restored.splice(index, 0, removedArt);
            return restored;
          });
          toast.markFailed(error);
        })
        .finally(() => {
          setPendingArtDeletionIds((previous) => {
            const next = new Set(previous);
            next.delete(artId);
            return next;
          });
        });
    },
    [art, start],
  );

  // Duplicates an art item into the unplaced-art section (story 26),
  // mirroring `createArt`'s optimistic-insert/replace-or-remove lifecycle.
  // A fresh `crypto.randomUUID()` idempotency key accompanies the request
  // (not reused across retries within this simple fire-once action) so a
  // dropped response the backend actually processed is still replayed
  // rather than silently duplicated if this action is ever retried.
  const duplicateArt = useCallback(
    (artId: string) => {
      const source = art.find((item) => item.id === artId);
      if (!source) return;

      const optimisticId = `optimistic-${crypto.randomUUID()}`;
      const idempotencyKey = crypto.randomUUID();
      const now = new Date().toISOString();
      const optimisticArt: Art = {
        ...source,
        id: optimisticId,
        placement: { physicalPage: null, row: null, column: null },
        createdAt: now,
        updatedAt: now,
      };

      setArt((previous) => [...previous, optimisticArt]);
      setPendingArtDuplicateIds((previous) => new Set(previous).add(optimisticId));

      const toast = start(`duplicate-art-${optimisticId}`);

      duplicateArtRequest(artId, idempotencyKey)
        .then((created) => {
          setArt((previous) => previous.map((item) => (item.id === optimisticId ? created : item)));
          toast.markSaved();
        })
        .catch((error) => {
          setArt((previous) => previous.filter((item) => item.id !== optimisticId));
          toast.markFailed(error);
        })
        .finally(() => {
          setPendingArtDuplicateIds((previous) => {
            const next = new Set(previous);
            next.delete(optimisticId);
            return next;
          });
        });
    },
    [art, start],
  );

  // Permanently removes a card from a binder slot (story 13). Sending X
  // immediately: no confirmation dialog. Captures the card's current list
  // index and full record before removing it so a failed delete restores
  // it to the exact same spot rather than appending it back at the end -
  // this list itself is what already encodes each card's slot, so there's
  // no separate placement state to roll back alongside it.
  const removeCard = useCallback(
    (cardId: string) => {
      const index = cards.findIndex((card) => card.id === cardId);
      if (index === -1) return;
      const removedCard = cards[index];

      setCards((previous) => previous.filter((card) => card.id !== cardId));
      setPendingCardDeletionIds((previous) => new Set(previous).add(cardId));

      const toast = start(`remove-card-${cardId}`);

      deleteCard(cardId)
        .then(() => {
          toast.markSaved();
        })
        .catch((error) => {
          setCards((previous) => {
            const restored = [...previous];
            restored.splice(index, 0, removedCard);
            return restored;
          });
          toast.markFailed(error);
        })
        .finally(() => {
          setPendingCardDeletionIds((previous) => {
            const next = new Set(previous);
            next.delete(cardId);
            return next;
          });
        });
    },
    [cards, start],
  );

  // Edits an existing card's saved variation (story 16), mirroring
  // `removeCard`'s optimistic-apply/restore-on-failure lifecycle:
  // optimistically applies the new value immediately, then either confirms
  // it with the backend's authoritative representation or restores the
  // card's prior variation on failure.
  const editCardVariation = useCallback(
    (cardId: string, variation: string | null) => {
      const existing = cards.find((card) => card.id === cardId);
      if (!existing) return;

      const previousVariation = existing.variation;

      setCards((previous) =>
        previous.map((card) => (card.id === cardId ? { ...card, variation } : card)),
      );
      setPendingCardVariationEditIds((previous) => new Set(previous).add(cardId));

      const toast = start(`edit-card-variation-${cardId}`);

      updateCardVariationRequest(cardId, variation)
        .then((updated) => {
          setCards((previous) => previous.map((card) => (card.id === cardId ? updated : card)));
          toast.markSaved();
        })
        .catch((error) => {
          setCards((previous) =>
            previous.map((card) =>
              card.id === cardId ? { ...card, variation: previousVariation } : card,
            ),
          );
          toast.markFailed(error);
        })
        .finally(() => {
          setPendingCardVariationEditIds((previous) => {
            const next = new Set(previous);
            next.delete(cardId);
            return next;
          });
        });
    },
    [cards, start],
  );

  // Duplicates a card into the unplaced-cards section (story 19),
  // mirroring `duplicateArt`'s optimistic-insert/replace-or-remove
  // lifecycle exactly: the copy always lands unplaced (even when the
  // source card is currently placed), sharing the source's existing image
  // asset/URL rather than triggering any new upload. A fresh
  // `crypto.randomUUID()` idempotency key accompanies the request (not
  // reused across retries within this simple fire-once action) so a
  // dropped response the backend actually processed is still replayed
  // rather than silently duplicated if this action is ever retried.
  const duplicateCard = useCallback(
    (cardId: string) => {
      const source = cards.find((card) => card.id === cardId);
      if (!source) return;

      const optimisticId = `optimistic-${crypto.randomUUID()}`;
      const idempotencyKey = crypto.randomUUID();
      const now = new Date().toISOString();
      const optimisticCard: Card = {
        ...source,
        id: optimisticId,
        placement: { physicalPage: null, row: null, column: null },
        createdAt: now,
        updatedAt: now,
      };

      setCards((previous) => [...previous, optimisticCard]);
      setPendingCardDuplicateIds((previous) => new Set(previous).add(optimisticId));

      const toast = start(`duplicate-card-${optimisticId}`);

      duplicateCardRequest(cardId, idempotencyKey)
        .then((created) => {
          setCards((previous) =>
            previous.map((card) => (card.id === optimisticId ? created : card)),
          );
          toast.markSaved();
        })
        .catch((error) => {
          setCards((previous) => previous.filter((card) => card.id !== optimisticId));
          toast.markFailed(error);
        })
        .finally(() => {
          setPendingCardDuplicateIds((previous) => {
            const next = new Set(previous);
            next.delete(optimisticId);
            return next;
          });
        });
    },
    [cards, start],
  );

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
        })
        .finally(() => {
          setIsMovePending(false);
        });
    },
    [cards, start],
  );

  // Only meaningful once `status === 'success'`; computed unconditionally
  // (rather than after an early return) so hook call order stays stable
  // across renders.
  const value = useMemo<BinderRouteContextValue | null>(() => {
    if (!binder) return null;
    return {
      binder,
      cards,
      art,
      updateBinder,
      layoutFocalPage,
      setLayoutFocalPage,
      assignCards,
      isBulkAddPending,
      bulkAddFailure,
      clearBulkAddFailure,
      retryFailedBulkCards,
      bulkSelectionRestore,
      clearBulkSelectionRestore,
      pendingPlacementKeys,
      assignCustomCard,
      pendingUnplacedCardIds,
      manualEntryRestore,
      clearManualEntryRestore,
      removeCard,
      pendingCardDeletionIds,
      editCardVariation,
      pendingCardVariationEditIds,
      duplicateCard,
      pendingCardDuplicateIds,
      moveCard,
      isMovePending,
      cardSearchLanguage,
      setCardSearchLanguage,
      includeTcgPocket,
      setIncludeTcgPocket,
      createArt,
      pendingUnplacedArtIds,
      artCreateRestore,
      clearArtCreateRestore,
      moveArt,
      editArt,
      pendingArtEditIds,
      artEditRestore,
      clearArtEditRestore,
      removeArt,
      pendingArtDeletionIds,
      duplicateArt,
      pendingArtDuplicateIds,
    };
  }, [
    binder,
    cards,
    art,
    updateBinder,
    layoutFocalPage,
    assignCards,
    isBulkAddPending,
    bulkAddFailure,
    clearBulkAddFailure,
    retryFailedBulkCards,
    bulkSelectionRestore,
    clearBulkSelectionRestore,
    pendingPlacementKeys,
    assignCustomCard,
    pendingUnplacedCardIds,
    manualEntryRestore,
    clearManualEntryRestore,
    removeCard,
    pendingCardDeletionIds,
    editCardVariation,
    pendingCardVariationEditIds,
    duplicateCard,
    pendingCardDuplicateIds,
    moveCard,
    isMovePending,
    cardSearchLanguage,
    includeTcgPocket,
    createArt,
    pendingUnplacedArtIds,
    artCreateRestore,
    clearArtCreateRestore,
    moveArt,
    editArt,
    pendingArtEditIds,
    artEditRestore,
    clearArtEditRestore,
    removeArt,
    pendingArtDeletionIds,
    duplicateArt,
    pendingArtDuplicateIds,
  ]);

  if (status === 'loading') {
    return showLoading ? <LoadingIndicator label="Loading binder…" size="10" /> : null;
  }

  if (status === 'error') {
    return (
      <div className="flex flex-col items-center gap-4 p-8">
        <p className="text-body text-neutral-500">The binder could not be loaded.</p>
        <button
          type="button"
          onClick={retry}
          className="cursor-pointer rounded-standard bg-primary px-4 py-2 font-bold hover:brightness-110"
        >
          Retry
        </button>
      </div>
    );
  }

  // Unreachable in practice (status is only 'success' once `binder` is set),
  // but keeps the render function total instead of asserting `value!` below.
  if (!value) return null;

  return (
    <BinderRouteContext.Provider value={value}>
      <h1 className="pt-4 text-center">{value.binder.name}</h1>
      <BinderTabs binderId={binderId} />
      {/* `flex-1 min-h-0`: gives the active tab a definite, fill-remaining-
          space container to grow into. Tabs that don't need it (Edit
          Details, View Financials) just render their normal top-aligned
          content inside it, identical to before; the Edit Layout tab (story
          8) uses it to size its binder-side grids to the viewport without
          scrolling. */}
      <div className="flex min-h-0 flex-1 flex-col">{children}</div>
    </BinderRouteContext.Provider>
  );
}
