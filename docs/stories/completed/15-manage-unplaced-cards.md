# 15. Manage unplaced cards

**Status:** Done (2026-08-02 01:17 EDT) - with one known gap: the "dropping a card onto the unplaced art section redirects it to the unplaced cards section" acceptance criterion was added after this story shipped, before story 25's separate unplaced art section existed, and is not yet implemented.

#### Acceptance criteria

- An unplaced cards section appears on the left side of the "Edit Layout" tab.
- A card can be moved from a binder slot into the unplaced cards section.
- Moving a card into the unplaced cards section clears its binder slot and saves the card as unplaced in the database through the backend.
- An unplaced card can be moved into an empty or card-occupied binder slot.
- Moving an unplaced card into an empty slot removes it from the unplaced cards section and saves its physical page, row, and column in the database through the backend.
- Moving an unplaced card into a card-occupied slot places the dragged card in the slot and moves the prior occupant into the unplaced cards section.
- Dropping a placed or unplaced card onto the unplaced art section is still accepted and moves the card into the unplaced cards section instead of rejecting the drop.
- The unplaced cards section has an add button that opens the existing card-selection modal.
- Selecting a card from the modal adds it to the unplaced cards section and saves it to the database through the backend.
- Hovering over an unplaced card displays the existing card actions to its right, with the X as the first action.
- Selecting the X removes the unplaced card from the section and deletes it from the database through the backend.
- Adding, moving, and deleting unplaced cards use the shared save-status toast and restore their previous locations if an operation fails.

#### Technical requirements

- Unplaced cards are ordered by creation timestamp descending and then card UUID ascending as a deterministic tie-breaker.
- The binder cards API returns this order, and optimistic client updates preserve it.
- The unplaced section is an independently scrolling virtualized list implemented with `@tanstack/react-virtual`; only visible list items and its overscan are mounted.
- The panel fills the available viewport height below the layout toolbar and uses its own vertical scroll container; its height does not depend on the rendered binder spread.
- The complete unplaced panel is one dnd-kit drop target; dropping a placed card anywhere within its bounds clears the card's physical page, row, and column.
- The unplaced art section is also a valid dnd-kit drop target for a card drag; dropping a card there routes it through the same unplaced-cards move or swap logic as dropping within the unplaced cards section, rather than being rejected as an invalid target.
- Pointer position does not define list order; the moved card is inserted according to the section's newest-first ordering.
- Moves into and out of the unplaced section use `PATCH /cards/{cardId}` with nullable expected and final coordinate triples and inherit the movement API's concurrency, transaction, response, and rollback requirements.
- An unplaced-to-occupied swap submits both cards: the dragged card changes from all-null coordinates to the destination coordinates, and the prior occupant changes from those coordinates to all null.
- dnd-kit auto-scroll is disabled for the unplaced panel; its scroll position remains stationary during a drag.
- After a card is created, moved, or swapped into the unplaced section, the virtualizer scrolls that card into view at its derived ordered position.
- The panel add button opens the shared card-selection modal with an all-null placement target; TCGdex and custom creation reuse the established optimistic create-card contracts.
- The unplaced-card X action reuses `DELETE /cards/{cardId}` and the established immediate optimistic permanent-deletion and rollback behavior.
- When no unplaced cards exist, the panel renders its normal add button without a separate empty-state message.
