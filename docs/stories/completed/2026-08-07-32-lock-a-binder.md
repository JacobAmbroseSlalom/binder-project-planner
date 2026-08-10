# 32. Lock a binder

**Status:** Done (2026-08-07 12:45 EDT)

#### Acceptance criteria

- Hovering over a binder in the home page list displays a lock or unlock action with the existing binder actions.
- Selecting the lock action locks the binder and saves its locked state through the backend.
- The action reflects whether the binder is currently locked or unlocked.
- Selecting the unlock action unlocks the binder and saves its unlocked state through the backend.
- A locked binder can still be opened and viewed.
- The "Edit Details" tab is read-only while the binder is locked.
- The "Edit Layout" tab is read-only while the binder is locked.
- Controls that add, remove, duplicate, edit variations, or move cards or multi-slot art are unavailable while the binder is locked.
- Card acquisition status can still be changed while the binder is locked, but only from the Card List tab (Story 37); the layout's acquisition hover action (Story 36) does not appear while the binder is locked.
- API-fetched and manually entered card prices can still be updated while the binder is locked, from the Card List tab (Story 38); card price is never edited from the layout, regardless of lock state.
- The delete X is hidden from the home page hover actions while the binder is locked.
- A locked binder cannot be deleted, and the backend rejects deletion requests for it.
- A locked binder can still be duplicated, and the new binder is created unlocked.
- The backend rejects changes to the details or layout of a locked binder.
- The backend accepts card acquisition and price updates for a locked binder.
- Unlocking the binder restores its editing controls and allows details and layout changes again.
- Locking and unlocking use the shared save-status toast and restore the previous lock state if the operation fails.

#### Technical requirements

- Lock and unlock use the existing partial binder update endpoint with a `locked` boolean field rather than dedicated command endpoints.
- Selecting Lock or Unlock sends the update immediately without a confirmation dialog; the opposite action remains available after a successful state change.
- Home-page Lock and Unlock actions are icon-only buttons using Lucide `Lock` and `LockOpen` icons, stable hit areas, accessible labels, and hover tooltips.
- The home-page binder row shows no persistent lock icon or text badge; its Lock or Unlock hover action is the lock-state indicator.
- The backend permits an update containing only the `locked` field regardless of the binder's current lock state, so a locked binder can be unlocked through the same contract.
- A successful lock-state update returns `200 OK` with the complete persisted binder representation.
- A successful lock-state update changes the binder's backend-managed `updatedAt` timestamp, so the existing newest-updated-first home-page ordering reflects lock and unlock operations.
- Lock-state updates use last-write-wins semantics: requests contain only the desired `locked` value and do not include an expected prior state, version, or timestamp.
- A transport retry resends the same desired `locked` value without a UUID idempotency key; desired-state lock updates are inherently idempotent.
- Binder duplication explicitly sets the new binder's `locked` value to `false` and never copies the source binder's lock state.
- A lock request does not cancel a details or layout mutation that the backend has already accepted; that mutation may complete, and restricted mutations accepted after the lock update commits are rejected.
- A restricted details, layout, card, or art mutation for a locked binder returns `409 Conflict` using a stable locked-binder Problem Details type; allowed acquisition, price, and lock-state updates are not rejected for that reason.
- After a restricted mutation receives the locked-binder conflict, the client completes that mutation's established rollback behavior, displays the shared failed toast, and reloads the complete binder graph to synchronize the lock state and read-only interface.
- `DEFAULT_BINDER_LOCKED` defaults to `false` in the canonical shared `defaults.ts`, and binder creation does not expose or accept a client-selected initial lock state.
- The database persists `locked` as a required boolean with a default of `false`, and binder-detail, binder-summary, and full-data-export contracts include that boolean without a nullable or inferred state.
- The Edit Details tab retains the reusable binder-details form while locked and disables every editable form control, including dimension, style, and preview-page controls; the saved values remain visible.
- The locked-binder behavior for notes remains the existing rule: the notes toggle and content are not mounted.
- A locked binder's view/edit page displays a compact persistent Lucide `Lock` icon followed by `Locked` near the page header or tab navigation rather than a full-width read-only banner.
- When the binder is locked, the layout does not render add, drag, edit, delete, duplicate, variation-edit, or movement controls for cards or art; the binder grid and its content remain viewable.
- While locked, the layout hides Undo and Redo but retains its binder-scoped movement-history stacks; unlocking restores those controls with any entries not pruned by the established history rules.
- The layout never renders a price control in any lock state; card price is edited
  exclusively from the Card List tab (Story 38). The layout's acquisition hover
  action (Story 36) is rendered and usable only while the binder is unlocked; while
  locked, it is omitted along with the other restricted layout controls, and
  acquisition changes are only available from the Card List tab (Story 37).
- Locked binders retain layout page navigation and presentation-only controls, including Michi, variation-label, and acquisition-status visibility toggles, because they do not mutate persisted binder data.
- Selecting lock or unlock optimistically replaces the binder summary's lock state and disables every home-page action for that binder until the update settles; actions for other binders remain available.
- A successful response replaces the optimistic summary with the complete backend representation. A failure restores the prior summary and re-enables its actions while the shared failed toast reports the Problem Details `detail`.
