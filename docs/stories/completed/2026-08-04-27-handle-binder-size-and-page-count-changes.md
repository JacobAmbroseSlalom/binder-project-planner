# 27. Handle binder size and page-count changes

**Status:** Done (2026-08-04 11:30 EDT)

#### Acceptance criteria

- Increasing the binder's width, height, or page count preserves all existing card and multi-slot art placements.
- Before reducing the binder's width, height, or page count, the app identifies every card and piece of multi-slot art whose placement would no longer exist or fit.
- Multi-slot art is affected if any slot in its occupied area falls outside the reduced binder layout.
- If no placed items are affected, the reduced binder details can be saved without a relocation confirmation.
- If placed items are affected, saving opens a confirmation modal that identifies how many cards and pieces of multi-slot art will be moved to the unplaced cards section or unplaced art section, respectively.
- Selecting cancel closes the confirmation modal without changing the binder or any item positions.
- Confirming the change moves every affected card to the unplaced cards section and every affected piece of multi-slot art to the unplaced art section.
- The binder detail changes and all affected item relocations are saved together through the backend.
- If any part of the update fails, the binder details and item positions remain unchanged.
- Binder size and page-count changes use the shared save-status toast.

#### Technical requirements

- Before a potentially reducing update, the client sends the proposed width, height, and stored page count to read-only `POST /binders/{binderId}/resize-preview`.
- The client calls resize preview only when width, height, or stored page count decreases; physical centimeter formulas and border settings do not affect slot coverage and use the normal details-save path.
- The dry run validates the proposed dimensions against current persisted placements and returns the affected card and art UUIDs plus separate counts without changing data.
- The final update recomputes affected items inside its database transaction rather than trusting the prior dry-run result.
- When the triggering blur includes other currently valid dirty binder fields, the final confirmed PATCH atomically saves the complete dirty-field set together with any required relocations.
- The existing binder partial-update request includes `moveAffectedItemsToUnplaced: true` only after the user confirms relocation.
- If the final update finds affected placements and relocation consent is false or absent, it returns `409 Conflict` Problem Details with current affected card and art counts and changes nothing.
- Confirmed relocation consent covers every card and art item affected when the final transaction runs, even when that set differs from the earlier preview; the backend clears all affected placements atomically with the binder update.
- After confirmation, the relocation modal remains open with its controls disabled while the final update runs; the client does not optimistically change binder dimensions or item placements.
- Success closes the modal and replaces binder and item state from the response; failure leaves the prior state intact, re-enables the modal, and displays the shared failed toast.
- A successful affecting resize returns `200 OK` with complete updated binder details and complete representations of every card and art item moved to unplaced, allowing direct binder-context reconciliation without refetching.
- If the new page count invalidates `previewPhysicalPage`, the same transaction resets it to `DEFAULT_BINDER_PREVIEW_PHYSICAL_PAGE` (`2`) and returns that value in the updated binder details.
