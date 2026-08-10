# 36. Track card acquisition

**Status:** Done (2026-08-10 02:11 EDT)

#### Acceptance criteria

- Each card stores whether it has been acquired.
- A newly added card defaults to unacquired.
- The custom-card modal and the TCGdex search/bulk-add modal each have a checkbox for
  marking the card, or all cards in that bulk request, as acquired when added; the
  checkbox is unchecked by default.
- Hovering over a card displays an acquisition action with the existing card actions.
- The acquisition action indicates whether the card is currently acquired or unacquired.
- Selecting the acquisition action changes the card between acquired and unacquired.
- The card's acquisition state is saved to the database through the backend.
- The acquisition hover action is unavailable while the binder is locked, consistent
  with the other layout card actions (Story 32); acquisition can still be changed from
  the Card Checklist tab (Story 37) in that case.
- The "Edit Layout" tab has a toggle for showing or hiding card acquisition status.
- Turning the toggle on displays a badge only on each acquired card; unacquired cards
  show no badge.
- Turning the toggle off hides card acquisition status from the binder layout.
- The acquisition-visibility toggle preference is remembered across binders and reloads.
- Acquisition changes use the shared save-status toast and restore the card's previous acquisition state if saving fails.
- The home page's binder completion metrics (Story 22) additionally display each binder's card-acquisition percentage below the binder, alongside its existing slot-completion metrics, when completion metrics are shown.
- The card-acquisition percentage counts both placed and unplaced cards and excludes multi-slot art.
- When a binder has no card records, its card-acquisition percentage displays as `N/A`.
- The card-acquisition metric updates when card acquisition changes and when cards are added or removed.

#### Technical requirements

- `acquired` is a required boolean field on `Card`, stored directly on the existing
  `cards` table (not a separate record or history log), defaulting to `false`
  (unacquired) for new cards.
- The optional "Acquired" checkbox is included in the custom multipart
  `POST /binders/{binderId}/cards` request and the TCGdex JSON
  `POST /binders/{binderId}/cards/bulk` request (applied to every card in that bulk
  request, mirroring the shared variation field), so initial acquisition state persists
  atomically with card creation rather than requiring a separate follow-up update.
- The acquisition state is updated through the existing `PATCH /cards/{cardId}`
  endpoint with `{ "acquired": boolean }`, the same endpoint used for placement and
  variation edits, rather than a dedicated acquire/unacquire endpoint.
- The acquisition hover action is rendered and usable only while the binder is
  unlocked; while locked, it is omitted along with the layout's other restricted card
  actions (Story 32), rather than being shown disabled.
- The acquisition hover action is an icon-swap button matching the existing Lock/Unlock
  pattern (Story 32): Lucide `CircleCheck` when acquired, `Circle` when unacquired, with
  a stable hit area, an accessible label ("Mark as acquired" / "Mark as unacquired"),
  and a hover tooltip.
- When the acquisition-visibility toggle is on, a small filled Lucide `CircleCheck`
  badge overlays a corner of each acquired card's image, matching the variation-label
  overlay approach (Story 16) so toggling never resizes or repositions a slot;
  unacquired cards and empty slots render no badge.
- The acquired badge is purely decorative and noninteractive (`aria-hidden`, excluded
  from the tab order), matching the Michi-indicator precedent (Story 10); the hover
  action remains the accessible control for changing or announcing acquisition state.
- Acquisition-status visibility is a persisted preference remembered across binders and
  reloads via browser local storage, joining the same local-storage preference group as
  the Michi, variation, and notes toggles (Stories 10, 16, 23); it is not stored by the
  backend or a layout route query parameter, and defaults to hidden until a preference
  is saved.
- Selecting the acquisition hover action optimistically flips the card's `acquired`
  state in `BinderRouteContext` and swaps the icon immediately, while the shared
  save-status toast tracks the request, matching the existing optimistic-update and
  rollback pattern used for variation edits (Story 16); on success the returned card
  replaces the optimistic value, and on failure the previous state is restored.
- Card-acquisition percentage is `acquired card records / all card records associated with the binder x 100`; both placed and unplaced cards count, and multi-slot art is excluded.
- When a binder has no card records, its card-acquisition percentage is `null` and the client displays `N/A`.
- This story extends the Story 22 binder-summary metrics with `acquiredCards` and `totalCards` counts; the client derives the card-acquisition percentage (rounded to the nearest whole percent) from those counts without the API storing a rounded percentage.
- The card-acquisition metric reuses Story 22's existing completion-metrics visibility toggle and shared loading/failed-toast behavior rather than introducing a separate control.
