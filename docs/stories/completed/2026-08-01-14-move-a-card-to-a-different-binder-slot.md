# 14. Move a card to a different binder slot

**Status:** Done (2026-08-01 23:39 EDT) - with one known gap: the "if the destination slot is occupied by multi-slot art, the card returns to its original slot" acceptance criterion isn't enforceable yet because story 25 ("Add multi-slot art") hasn't been built - there's no art table or route, and `listBinderArt` always returns `[]`. Every other acceptance criterion (drag/drop move, swap, transactional save, rollback on failure, shared save-status toast) is fully implemented end to end.

#### Acceptance criteria

- A card can be dragged from its current binder slot and dropped into a different slot.
- After the card is dropped into an empty slot, the binder layout displays it in the destination slot and clears its original slot.
- The card's new physical page, row, and column are saved to the database through the backend.
- If the destination slot contains another card, the two cards swap positions.
- Both card positions in a swap are saved together through the backend.
- If either position in a swap fails to save, neither saved position changes and both cards return to their original slots.
- If the destination slot is occupied by multi-slot art, the card returns to its original slot and its saved position does not change.
- Card movement and swapping use the shared save-status toast and restore all affected cards to their original slots if saving fails.

#### Technical requirements

- The frontend uses `@dnd-kit/core` for card dragging, application-defined slot collision detection, and the drag overlay.
- The dnd-kit pointer sensor uses a movement-distance activation constraint from `CARD_DRAG_ACTIVATION_DISTANCE_PX`, which defaults to `8` in the canonical shared `defaults.ts`.
- The initial movement workflow enables dnd-kit's pointer sensor only; keyboard and touch card movement are deferred.
- Card images set native HTML dragging to disabled so browser image dragging does not compete with dnd-kit.
- Collision detection selects a destination only when the pointer is within a binder slot's bounds.
- Dropping over a gap, control, or other non-slot region cancels the drag without changing client or persisted card positions.
- The drag overlay displays the card image at the rendered slot dimensions, and the source slot displays an empty placeholder while dragging.
- The binder context does not update card positions until a valid drop completes.
- The slot currently selected by collision detection uses one target-highlight style; the highlight does not distinguish moves, swaps, or multi-slot-art blocks.
- Card movement and swapping use `PATCH /cards/{cardId}` rather than a command-specific endpoint.
- The PATCH body contains a position update for the dragged card on a simple move and position updates for both affected card IDs on a swap; each update supplies the card's final physical page, row, and column.
- The path `cardId` must identify the dragged card included in the request body.
- Each position update also contains the card's expected current physical page, row, and column.
- The backend compares all expected positions and applies all final positions in one database transaction; any mismatch returns `409 Conflict` using Problem Details and changes no card positions.
- A successful movement PATCH returns `200 OK` with the complete persisted representation of every card updated by the move or swap.
- A valid drop optimistically applies every affected final position to the binder context and captures one pre-drop snapshot for the complete operation.
- Every card affected by a pending move or swap is disabled until the request settles; failure restores the complete snapshot, and success replaces optimistic cards with the returned representations.
- Move and swap requests are serialized within each binder; at most one movement request is in flight for a binder.
- While a movement request is in flight, all card dragging in that binder is disabled and new movement operations are not queued.
- The client uses loaded multi-slot-art coverage to cancel a blocked drop without sending a PATCH.
- The backend validates all submitted destination coordinates against current persisted multi-slot-art coverage; a blocked destination returns `409 Conflict` using Problem Details and applies no position changes.
- Dropping a card onto its source slot ends the drag without changing state, sending a request, or displaying a toast.
- Drag targets are limited to slots on the currently mounted spread; page controls and layout edges do not navigate while a drag is active.
