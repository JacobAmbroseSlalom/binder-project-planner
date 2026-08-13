# 46. Bulk acquire cards

**Status:** Done (2026-08-12 21:59 EDT)

#### Acceptance criteria

- The Card List tab's (Story 37) Acquisition column header has a select all/deselect
  all control.
- The control only affects cards currently displayed by the active search and column
  filters - never cards hidden by the current search/filters.
- When at least one currently displayed card is unacquired, the control shows its
  empty (unacquired) icon; selecting it marks every currently displayed card as
  acquired.
- When every currently displayed card is already acquired, the control shows its
  checked (acquired) icon; selecting it marks every currently displayed card as
  unacquired.
- Hovering the control shows a tooltip describing what it does.
- Bulk acquisition changes made from this control are saved to the database through
  the backend.
- While a bulk change is saving, the same save-status feedback used elsewhere in the
  binder (e.g. Story 36's single-card acquisition toggle) communicates progress and
  any failure - no separate confirmation step before a bulk deselect.
- This bulk-acquire control is scoped only to the Card List tab (Story 37); it does
  not add an equivalent select-all/deselect-all control anywhere else (e.g. the Layout
  tab's unplaced-cards panel).

#### Technical requirements

- The header control reuses the same `Circle`/`CircleCheck` icon convention as each
  row's own per-card acquisition toggle (Story 36), so it reads as the same control
  scaled up to every visible row.
- The control's icon state is derived from the currently visible (filtered/searched)
  card set only: it shows the acquired icon only when every visible card is acquired,
  otherwise the unacquired icon - matching Story 37's existing `deriveVisibleCards`
  filtering.
- The backend doesn't yet support multi-card acquisition updates - `PATCH
/cards/{cardId}` (Story 36) only ever updates one card at a time. This story needs a
  new bulk endpoint (e.g. `PATCH /binders/{binderId}/cards/acquisition` accepting `{
"cardIds": string[], "acquired": boolean }`), mirroring the existing bulk-create
  contract (`POST /binders/{binderId}/cards/bulk`, Stories 17/18) rather than the
  client looping individual `PATCH /cards/{cardId}` requests.
- Applying the bulk change reuses the same `useSaveStatusToast` save-status feedback
  pattern as Story 36's single-card acquisition toggle, rather than a dedicated
  confirmation dialog or a separate feedback treatment.
- This bulk action is allowed while the binder is locked, matching Story 36's
  single-card acquisition toggle and the rest of the Card List tab's existing
  lock-state exemption (Story 37) - not gated by lock state on the client side, since
  the backend's own `409` conflict response still enforces any restriction and
  triggers the same retry-on-conflict handling as every other restricted mutation.
- The whole affected set applies optimistically together: every currently visible
  card immediately flips to the target `acquired` value the moment the control is
  selected, and if the bulk request fails, every one of those cards rolls back to its
  prior value (all-or-nothing, matching the single request/response shape of the new
  bulk endpoint) - not applied card-by-card with individual rollback.
