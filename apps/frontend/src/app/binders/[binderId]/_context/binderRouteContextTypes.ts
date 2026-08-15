import type {
  Art,
  Binder,
  Card,
  CardSearchLanguage,
  CardSearchProvider,
  PlacementCoordinates,
  TcgDexCatalogCard,
  UpdateBinderResult,
  UpdateCardDetailsRequest,
} from '@/lib/api';
import type { Dispatch, SetStateAction } from 'react';

import type {
  BulkAddFailure,
  BulkSelectionRestore,
  CustomCardFormValues,
  ManualEntryRestore,
} from './useCardMutations';
import type { ArtCreateRestore, ArtEditRestore, ArtFormValues } from './useArtMutations';
import type { LayoutMovementResultFocus } from './useLayoutMovement';

// The shared binder route context value (story 7): the binder details,
// cards, and multi-slot art loaded in parallel by the route's provider, plus
// a setter the Edit Details tab uses to sync the context after a successful
// `PATCH` without forcing a full reload. Extracted from `BinderRouteContext`
// into its own file since this single interface documenting every field the
// context exposes is, on its own, a substantial share of that file's size.
export interface BinderRouteContextValue {
  binder: Binder;
  cards: Card[];
  // Story 38: lets the Card List tab's `useCardPriceReview` hook apply its
  // optimistic price updates (and roll them back on a failed save)
  // directly to the context's card array, the same way
  // `useCardMutations`/`useBulkCardAdd`/`useLayoutMovement` already do
  // internally - exposed here since price review runs from the tab page
  // itself rather than from a context-owned hook.
  setCards: Dispatch<SetStateAction<Card[]>>;
  art: Art[];
  // Replaces the context's binder with the backend's authoritative
  // representation, e.g. after the Edit Details tab's `PATCH` succeeds.
  updateBinder: (binder: Binder) => void;
  // Story 27: applies one successful `PATCH /binders/{binderId}` resize
  // result atomically in route context, including the updated binder and
  // every card/art representation moved to unplaced by that same
  // transaction.
  applyBinderResizeUpdate?: (
    result: Pick<UpdateBinderResult, 'binder' | 'movedCards' | 'movedArt'>,
  ) => void;
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
    acquired: boolean,
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
  // Saves a card's edited name/set/number/variation/price and optional
  // replacement image (story 49's Card List row "Edit" action) through
  // `PATCH /cards/{cardId}/details`. Returns the request's promise so the
  // row-edit UI can keep itself in the editing state on failure rather
  // than closing early. Not applied optimistically - see
  // `useCardMutations.ts`'s `editCardDetails` for why.
  editCardDetails: (cardId: string, values: UpdateCardDetailsRequest) => Promise<Card>;
  // The set of card ids with a details edit currently in flight, so the
  // Card List tab's row-edit UI can disable its own Save/Cancel buttons
  // until the request settles.
  pendingCardDetailsEditIds: Set<string>;
  // Toggles an existing card's acquired state (story 36): optimistically
  // flips the value immediately, then replaces it with the backend's
  // authoritative representation on success, or restores the prior value
  // on failure. Uses last-write-wins semantics, matching
  // `PATCH /cards/{cardId}`'s acquisition-update contract.
  toggleCardAcquired: (cardId: string) => void;
  // The set of card ids with an acquisition toggle currently in flight, so
  // the card tile can disable that one card's toggle action until the
  // request settles.
  pendingCardAcquiredToggleIds: Set<string>;
  // Bulk-toggles every listed card's acquired state to `acquired` in one
  // request (story 46, the Card List tab's select-all/deselect-all header
  // control): optimistically flips every listed card immediately, then
  // either confirms them with the backend's authoritative representation
  // on success, or restores every one of their prior values on failure
  // (all-or-nothing across the whole set, matching the bulk endpoint's
  // single request/response shape).
  toggleCardsAcquisition: (cardIds: string[], acquired: boolean) => void;
  // Whether a bulk acquisition toggle is currently in flight, so the Card
  // List tab's header control can disable itself until the request
  // settles - unlike `pendingCardAcquiredToggleIds`, this isn't scoped to
  // individual cards since the whole set is applied/rolled back together.
  isBulkAcquisitionPending: boolean;
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
  // Story 28: true when there is at least one successful movement action
  // available to undo.
  canUndoLayoutMovement?: boolean;
  // Story 28: true when there is at least one movement action in the redo
  // stack.
  canRedoLayoutMovement?: boolean;
  // Story 28: applies the newest undoable action through the existing
  // movement PATCH contract. Returns the focal item's resulting placement
  // only when the request succeeds.
  undoLayoutMovement?: () => Promise<LayoutMovementResultFocus | null>;
  // Story 28: reapplies the newest redoable action through the existing
  // movement PATCH contract. Returns the focal item's resulting placement
  // only when the request succeeds.
  redoLayoutMovement?: () => Promise<LayoutMovementResultFocus | null>;
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
  // Story 43's card-selection modal source dropdown (TCGdex or
  // pokemontcg.io): ephemeral React state with the same lifetime and reset
  // behavior as `cardSearchLanguage`/`includeTcgPocket` above - it's the
  // toggles above, not this field itself, that get hidden while
  // `pokemontcg` is selected.
  cardSearchProvider: CardSearchProvider;
  setCardSearchProvider: (provider: CardSearchProvider) => void;
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
