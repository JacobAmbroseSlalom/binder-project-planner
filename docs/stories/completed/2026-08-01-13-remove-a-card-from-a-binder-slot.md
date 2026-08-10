# 13. Remove a card from a binder slot

**Status:** Done (2026-08-01 23:05 EDT)

#### Acceptance criteria

- Hovering over a card displays card actions over the card's top-right corner.
- The first action is an X button.
- Selecting the X removes the card from its binder slot on the page.
- Selecting the X deletes the binder-owned card record from the database through the backend.
- Card removal uses the shared save-status toast and restores the card to its slot if deletion fails.

#### Technical requirements

- The X action permanently deletes the binder-owned card record rather than clearing its coordinates or moving it to the unplaced-card section.
- Selecting X sends the delete request immediately without a confirmation dialog or undo delay.
- The client optimistically removes the card from the binder context, retains its previous list position and placement for rollback, and permits no further actions on that pending card.
- `DELETE /cards/{cardId}` permanently deletes the binder-owned card identified by its UUID.
- A successful deletion returns `204 No Content`.
- Deleting an already absent card also returns `204 No Content`; a malformed card UUID receives a request-validation Problem Details response.
- Card-owned variation, acquisition, checklist-association, manual-pricing, and other dependent records cascade-delete with the card in the same database transaction.
- If deletion removes the final card reference to an image asset, the backend immediately deletes the image-asset record and local file; assets with remaining card references are retained.
- Failure to delete an unreferenced local file does not roll back the committed database deletion or change the `204 No Content` response; the backend logs the orphaned path and cleanup error for maintenance.
- Card actions are revealed by pointer hover only in the initial desktop-supported version; keyboard and touch action disclosure is deferred.
- The X action is an icon-only HTML button with a stable hit area, an accessible delete label, and a tooltip naming the action.
- The frontend uses `lucide-react` for the X action and other familiar interface icons.
