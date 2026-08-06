# 16. Add card variations

**Status:** Done (2026-08-03 14:20 EDT)

#### Acceptance criteria

- The add-card modal has a field for adding a variation to the selected card.
- The variation field allows the user to select "Reverse Holo", "Non-Holo", "1st Edition", or "Expansion Stamp".
- The variation field also allows the user to enter a custom value that is not in the suggested list.
- The selected or entered variation is saved with the card information in the database through the backend.
- Hovering over a card displays an edit action with the existing card actions to its right.
- Selecting the edit action opens a modal for editing the card's variation.
- Saving the edit updates the card's variation in the database through the backend.
- The "Edit Layout" tab has a toggle for showing or hiding card variations.
- Card variations are hidden by default.
- Turning the toggle on displays each card's variation on the binder layout.
- Turning the toggle off hides card variations on the binder layout.
- Adding or editing a variation uses the shared save-status toast and preserves the entered value for correction if saving fails.

#### Technical requirements

- Each card stores one nullable variation string; assigning another value replaces the existing variation.
- Variation entry uses an editable combobox that filters suggested values and accepts unmatched custom text in the same input.
- The immutable `CARD_VARIATION_SUGGESTIONS` tuple is exported from the canonical shared `defaults.ts` with `Reverse Holo`, `Non-Holo`, `1st Edition`, and `Expansion Stamp`.
- Variation text is trimmed, blank input is stored as `null`, and nonblank values are limited to 50 characters by the frontend schema, OpenAPI contract, and backend validation.
- The optional variation is included in the TCGdex JSON or custom multipart `POST /binders/{binderId}/cards` request so card creation and its initial variation persist atomically.
- The edit action opens the shared custom modal shell with only the editable variation combobox and Save and Cancel commands, prefilled from the card's current variation.
- Variation edits use `PATCH /cards/{cardId}` with a nullable `variation` field.
- A successful variation update returns `200 OK` with the complete persisted card representation.
- Saving closes the modal and optimistically updates the card's variation in the binder context while the shared save-status toast tracks the request.
- On success, the returned card replaces the optimistic value; on failure, the previous card is restored and the modal reopens with the attempted variation preserved.
- Variation updates use last-write-wins semantics and do not include an expected prior value or card timestamp.
- Variation-label visibility is a persisted preference remembered across binders and
  reloads via browser local storage (matching the later notes-visibility precedent,
  Story 23), not a layout route query parameter; it is not stored by the backend and
  defaults to hidden until a preference is saved.
- Toggling variation labels updates the persisted local-storage preference; it has no
  effect on the route's query parameters.
- Any invalid stored value is treated as hidden.
- When visible, a variation label overlays the bottom edge of its card's own image (rather than reserving space below it), so toggling labels never resizes or repositions any slot, card image, or the binder side's overall dimensions.
- The overlay is only rendered for an occupied slot whose card has a non-null variation; empty slots and cards without one render nothing extra.
- Variation labels remain on one line at the slot width, truncate overflow with an ellipsis, and expose the complete value in a hover tooltip.
