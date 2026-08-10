# 28. Undo and redo layout movements

**Status:** Done (2026-08-04 11:51 EDT)

#### Acceptance criteria

- The "Edit Layout" tab has undo and redo buttons.
- Each successful drag-and-drop movement of a card or multi-slot art is added to the layout movement history.
- A card swap is added to movement history as one action containing both cards' original and swapped positions.
- Movement history includes moves between binder slots and moves between the binder layout and the unplaced cards section or unplaced art section.
- Selecting undo returns every card or piece of multi-slot art affected by the most recent movement to its previous location and saves the restored positions through the backend.
- Undoing a card swap restores both cards to their original slots together.
- Selecting redo reapplies the most recently undone movement and saves all reapplied positions through the backend.
- Redoing a card swap reapplies both swapped card positions together.
- The undo button is disabled when there are no movements to undo.
- The redo button is disabled when there are no movements to redo.
- A rejected drag-and-drop attempt is not added to the movement history.
- Adding, editing, deleting, or duplicating cards and multi-slot art cannot be undone or redone with these controls.
- Undo and redo use the shared save-status toast and retain the current history position if saving fails.

#### Technical requirements

- Movement history is stored only in binder-scoped frontend React state and is not persisted by the backend or browser storage.
- History resets when the binder route context unmounts, the page refreshes, or binder data is fully reloaded.
- `LAYOUT_MOVEMENT_HISTORY_LIMIT` defaults to `50` in the canonical shared `defaults.ts`.
- Adding a movement when the undo stack is at the limit discards its oldest entry.
- A new successful drag after one or more undos clears the complete redo stack before adding the new movement to the undo stack.
- Undo and redo reuse the existing movement PATCH contracts: card moves and swaps use `PATCH /cards/{cardId}`, and art moves use `PATCH /art/{artId}`.
- An art movement history entry affects only one art record because art cannot swap with cards or other art; card-swap history entries retain both cards as one atomic PATCH operation.
- After a successful non-movement mutation modifies or deletes a card or art item, the client removes every undo or redo entry containing that item's UUID while preserving unrelated entries.
- Creating or duplicating an item does not prune existing entries because it does not modify their recorded items; binder width, height, or stored page-count changes clear both history stacks because coordinate validity changes globally.
- If an undo or redo returns `409 Conflict`, the client leaves the visible layout unchanged, discards only the failed action from the stack it was being applied from, preserves remaining history, and displays the shared failed toast.
- Undo and redo do not change visible item positions or transfer the action between history stacks until the movement PATCH succeeds.
- While an undo or redo request is pending, undo, redo, and all card and art dragging are disabled; success applies returned item representations and transfers the action to the opposite stack, while non-conflict failure leaves positions and stack ownership unchanged.
- After success, an action whose resulting placement is on a physical page updates the layout `page` query by history replacement to reveal that spread; an action whose result is unplaced keeps the current spread and scrolls the item into view in the unplaced panel.
- Card-swap history records the originally dragged card as its focal item, and that card's resulting placement determines post-undo or post-redo navigation.
- The initial story provides visible Undo and Redo icon buttons only; keyboard shortcuts are deferred.
- The buttons use Lucide icons, stable hit areas, accessible labels, and hover tooltips and reflect disabled history or pending-movement states.
