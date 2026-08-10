# 26. Move and manage multi-slot art

**Status:** Done (2026-08-02 22:00 EDT)

#### Acceptance criteria

- Hovering over multi-slot art displays edit, delete, and duplicate actions comparable to the existing card actions.
- Selecting edit opens the same modal used to add multi-slot art, populated with the art's saved title, description, image, dimensions, positioning, scaling, rotation, aspect-ratio adjustments, and style overrides.
- Saving an edit updates the multi-slot art in the database through the backend.
- Selecting delete removes the multi-slot art from the layout or unplaced art section and deletes it from the database through the backend.
- Selecting duplicate creates a new, independent multi-slot art entry in the database through the backend and adds it to the unplaced art section.
- Multi-slot art can be moved from the unplaced art section into the binder layout.
- The art occupies a rectangular group of slots matching its saved width and height in slots.
- A placement succeeds only when every slot in the art's target area is unoccupied.
- If any slot in the target area is occupied, the placement is rejected and the art remains in the unplaced art section with no saved position change.
- Multi-slot art cannot swap positions with a card or another piece of multi-slot art.
- Any move involving multi-slot art is rejected if one or more slots in its target area are occupied, regardless of the occupying item type.
- After a successful placement, the art is removed from the unplaced art section and its binder position is saved through the backend.
- Every slot covered by placed multi-slot art is considered occupied.
- Cards and other multi-slot art cannot be placed in any slot occupied by multi-slot art.
- Multi-slot art can be moved from the binder layout back into the unplaced art section.
- Moving art back to the unplaced art section clears all slots it occupied and saves it as unplaced through the backend.
- Dropping placed or unplaced art onto the unplaced cards section is still accepted and moves the art into the unplaced art section instead of rejecting the drop.
- Editing, deleting, duplicating, and moving multi-slot art use the shared save-status toast and restore the art's previous state or location if an operation fails.

#### Technical requirements

- Placed art stores one-based physical page, row, and column coordinates for its top-left slot; all covered coordinates are derived from that anchor and the art's saved slot width and height.
- Unplaced art has all three placement coordinates set to `null`, and a database check constraint requires the coordinate triple to be either entirely present or entirely null.
- Art must fit within one physical binder side and cannot span physical pages; the backend validates every derived covered coordinate against the binder's current width and height.
- Art movement uses `PATCH /art/{artId}` with expected and final nullable coordinate triples.
- The backend compares the expected placement and validates every destination slot in one transaction; stale placement or occupied coverage returns `409 Conflict` using Problem Details and changes nothing.
- A successful movement returns `200 OK` with the complete persisted art representation.
- Card and art moves share one binder-scoped movement queue; at most one layout move is in flight for a binder, and all card and art dragging is disabled until it settles.
- The unplaced cards section is also a valid dnd-kit drop target for an art drag; dropping art there routes it through the same unplaced-art move logic as dropping within the unplaced art section, rather than being rejected as an invalid target.
- Art dragging records the relative footprint cell under the initial pointer; the hovered destination slot aligns with that cell, and the client derives the destination top-left anchor by subtracting the grabbed row and column offsets.
- For unplaced-art thumbnails, the initial pointer's normalized position within the thumbnail maps to the corresponding footprint cell before dragging begins.
- During an art drag, the client highlights every slot in the derived candidate footprint and uses distinct valid and blocked styles.
- Any out-of-bounds coordinate or slot occupied by a card or other art marks the complete candidate footprint as blocked.
- Dropping on a client-known blocked footprint cancels locally, restores the source presentation, and sends no request or toast; backend `409 Conflict` handling still protects against stale occupancy data.
- A valid drop optimistically applies the art's final placement in the binder context and captures its complete pre-move state for rollback.
- Success replaces the optimistic art with the returned representation; failure restores the snapshot and uses the shared failed toast.
- If an edit changes placed art so its current footprint would be out of bounds or overlap another item, Save opens a nested confirmation dialog offering Cancel or Save and Move to Unplaced.
- Confirming applies the art edits and clears all placement coordinates in one database transaction; cancellation returns to the populated editor without changing the art.
- All art edits use multipart `PATCH /art/{artId}` containing normalized metadata and an optional replacement image part.
- Metadata, transforms, style overrides, optional image replacement, and any confirmed placement clearing are validated and committed as one logical operation.
- A successful edit returns `200 OK` with the complete persisted art representation.
- Saving closes the editor and optimistically applies all submitted art fields and any confirmed unplacement in the binder context while disabling further actions on that art.
- Success replaces the optimistic art with the response; failure restores the previous art and reopens the editor with the complete attempted image, metadata, dimensions, rotation, transforms, and style choices preserved.
- Selecting Delete immediately and optimistically removes the art without a confirmation dialog, retaining its complete prior state and list position for rollback.
- `DELETE /art/{artId}` permanently deletes the art and returns `204 No Content` whether it existed or was already absent; malformed UUIDs receive request-validation Problem Details.
- Failure restores the art and all covered slots and displays the shared failed toast.
- Art deletion removes its image reference in the same database transaction; shared image assets remain while referenced by any card or other art.
- When the final reference is removed, source and derivative image metadata are deleted transactionally and physical file cleanup runs after commit.
- File-cleanup failure does not change the `204 No Content` response and is persisted as pending cleanup work for backend retry.
- Art duplication copies title, description, slot dimensions, rotation, transforms, and nullable style overrides into a new backend-generated art UUID with all-null placement coordinates.
- The duplicate references the source art's existing immutable source and normalized image assets rather than copying image files.
- `POST /art/{artId}/duplicate` reads the authoritative source art and returns `201 Created`, a `Location` header, and the complete unplaced duplicate representation.
- Each duplicate action uses a client-generated UUID idempotency key; retries reuse that key, and the backend retains and replays the outcome for the shared 24-hour mutation-idempotency period.
- Selecting Duplicate optimistically inserts a disabled unplaced copy with a client-generated temporary ID and the source art's existing image URL, ordered by the unplaced art section's established ordering rules.
- Success replaces the optimistic copy with the response; failure removes it and displays the shared failed toast.
- Art actions are revealed by pointer hover only in the initial desktop-supported version; keyboard and touch action disclosure remain deferred.
- Edit, Delete, and Duplicate use Lucide icons in stable icon-button hit areas with accessible labels and hover tooltips.
- `GET /art/{artId}/image` resolves and streams the art's normalized rendering image with its detected `Content-Type`; storage IDs, filenames, and paths are not exposed.
- Missing art, image metadata, or local rendering files return `404 Not Found` using Problem Details.
- Art image responses use long-lived immutable caching, and the persisted art representation supplies a different image URL whenever its underlying rendering asset changes.
