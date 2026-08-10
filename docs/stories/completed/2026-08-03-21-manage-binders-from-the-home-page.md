# 21. Manage binders from the home page

**Status:** Done (2026-08-03 00:25 EDT) - with one known gap: the "deleting a locked binder is rejected with a 409 Conflict" acceptance criterion (and any home-page Delete-menu omission for locked binders) isn't implemented yet because story 32 ("Lock a binder") hasn't been built - there's no `locked` column on the `binders` table at all yet. Every other acceptance criterion and technical requirement is implemented: hover delete/copy/edit actions, the delete confirmation modal, `POST /binders/{binderId}/duplicate` and `DELETE /binders/{binderId}` (both idempotency-aware/transactional with orphaned-asset file cleanup deferred to the existing maintenance sweep on delete-file-cleanup failure), the shared `generateUniqueBinderCopyName` copy-name algorithm (moved to `packages/shared` so frontend and backend agree on the same generated name), and optimistic copy/delete with the shared save-status toast and rollback on failure.

#### Acceptance criteria

- Hovering over a binder in the home page list displays delete, copy, and edit actions.
- The delete action is represented by an X.
- Selecting edit opens that binder's view/edit page with the "Edit Details" tab selected.
- Selecting copy creates a new binder in the database through the backend.
- Copying a binder creates new database entries for all entries belonging to the binder rather than references to the original entries.
- Selecting delete opens a confirmation modal.
- The delete confirmation modal has cancel and confirm delete actions.
- Selecting cancel closes the modal without deleting the binder.
- Selecting confirm delete deletes the binder from the database through the backend and removes it from the home page list.
- Binder copy and deletion use the shared save-status toast, and a binder remains in the list if deletion fails.

#### Technical requirements

- Binder copying creates new binder, card, multi-slot-art, and dependent database records while those new records reference the source records' existing immutable image assets and files.
- `POST /binders/{binderId}/duplicate` reads and deep-copies the authoritative binder graph without accepting copied binder data from the client.
- A successful copy returns `201 Created`, a `Location` header for the new binder, and its complete home-page binder summary.
- The backend names a copy by trying the source name plus ` Copy`, then ` Copy 2`, ` Copy 3`, and increasing integers until the case-insensitively normalized name is unique.
- The source-name portion is truncated as needed so the generated suffix fits within the 100-character binder-name limit.
- Selecting copy optimistically inserts a temporary binder summary using the first generated name available in the current client list and marks the temporary binder disabled while copying.
- Success replaces the temporary summary with the backend response and authoritative unique name; failure removes it and displays the shared failed toast.
- The new binder and every copied card, multi-slot-art, and dependent record are created in one database transaction; any record-copy failure rolls back the complete copied graph.
- Rollback does not modify the source binder or its shared image assets.
- Each binder-copy action includes a client-generated UUID idempotency key; retries of one action reuse its key, while separate copy actions use distinct keys.
- The backend persists the copied-binder outcome for the shared mutation idempotency-retention period and returns the same binder for a repeated key without copying it again.
- `DELETE /binders/{binderId}` permanently deletes the binder identified by its UUID.
- Deleting an existing or already absent binder returns `204 No Content`; a malformed binder UUID receives a request-validation Problem Details response.
- The delete confirmation uses the shared custom modal shell and identifies the binder by name.
- Confirm Delete closes the modal and optimistically removes the binder summary while retaining its prior list position for rollback.
- A `204 No Content` response finalizes removal; failure restores the binder summary and displays the shared failed toast.
- Binder deletion removes the binder and all binder-owned dependent records in one database transaction.
- Image assets shared with other binders remain intact; image metadata and local files are cleaned up only after their final card or art reference is removed.
- Filesystem cleanup runs after the database transaction commits; a file-deletion failure does not fail or reverse the binder deletion.
- Failed file deletions are persisted as pending cleanup work and retried by the backend, while the delete request still returns `204 No Content`.
- Deleting a locked binder is rejected with a `409 Conflict` Problem Details response identifying the locked-binder conflict; the client restores an optimistically removed binder.
- The home-page action menu omits Delete for binders known by the client to be locked; backend conflict enforcement protects stale clients and direct requests.
