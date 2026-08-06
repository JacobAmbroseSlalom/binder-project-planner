# 36. Track card acquisition

**Status:** Not started

#### Acceptance criteria

- Each card stores whether it has been acquired.
- Hovering over a card displays an acquisition action with the existing card actions.
- The acquisition action indicates whether the card is currently acquired or unacquired.
- Selecting the acquisition action changes the card between acquired and unacquired.
- The card's acquisition state is saved to the database through the backend.
- The "Edit Layout" tab has a toggle for showing or hiding card acquisition status.
- Turning the toggle on displays whether each card is acquired or unacquired.
- Turning the toggle off hides card acquisition status from the binder layout.
- Acquisition changes use the shared save-status toast and restore the card's previous acquisition state if saving fails.
- The home page's binder completion metrics (Story 22) additionally display each binder's card-acquisition percentage below the binder, alongside its existing slot-completion metrics, when completion metrics are shown.
- The card-acquisition percentage counts both placed and unplaced cards and excludes multi-slot art.
- When a binder has no card records, its card-acquisition percentage displays as `N/A`.
- The card-acquisition metric updates when card acquisition changes and when cards are added or removed.

#### Technical requirements

- TBD: Define the acquisition data model, API contract, locked-binder exception, optimistic-update, and display-toggle behavior.
- Card-acquisition percentage is `acquired card records / all card records associated with the binder x 100`; both placed and unplaced cards count, and multi-slot art is excluded.
- When a binder has no card records, its card-acquisition percentage is `null` and the client displays `N/A`.
- This story extends the Story 22 binder-summary metrics with `acquiredCards` and `totalCards` counts; the client derives the card-acquisition percentage (rounded to the nearest whole percent) from those counts without the API storing a rounded percentage.
- The card-acquisition metric reuses Story 22's existing completion-metrics visibility toggle and shared loading/failed-toast behavior rather than introducing a separate control.
