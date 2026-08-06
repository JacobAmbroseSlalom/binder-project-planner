# 37. Add a card checklist

**Status:** Not started

#### Acceptance criteria

- The binder view/edit page has a "Card Checklist" tab.
- The checklist lists every card in the binder, including placed and unplaced cards.
- A progress tracker appears at the top of the checklist.
- The progress tracker displays the number of acquired cards, the total number of cards, and the percentage acquired.
- The progress tracker includes every card in the binder and is not changed by checklist search, sorting, or visibility controls.
- Changing a card's acquisition state immediately updates the progress tracker.
- The acquired-card percentage is also used as the binder's card-acquisition completion metric on the home page.
- When home-page completion metrics are visible, the card-acquisition percentage appears below the binder with its slot-completion metrics.
- Each checklist entry displays the card and whether it is acquired or unacquired.
- The acquisition state of a card can be changed from its checklist entry.
- Acquisition changes made from the checklist are saved to the database through the backend.
- The checklist has controls for independently showing or hiding acquired cards and unacquired cards.
- Changing the acquisition visibility controls immediately updates the displayed checklist entries.
- The checklist has controls for sorting its cards.
- Selecting a sort option updates the order of the displayed checklist entries.
- The checklist has a search field for narrowing the displayed cards.
- Cards can be found by card name, set, number, or variation.
- Search, sorting, and acquisition visibility controls can be used together.
- Clearing search and acquisition visibility filters restores all checklist entries while retaining the selected sort order.
- When no cards match the active search and filters, the checklist displays an empty-results state.
- The Card Checklist has an export action.
- Exporting creates a downloadable PDF checklist that is suitable for printing.
- The export includes only cards matching the checklist's active search and acquisition visibility controls.
- Exported cards appear in the checklist's selected sort order.
- Each exported entry includes only the card's image and variation.
- The export action is unavailable when no cards match the active search and filters.
- Card Checklist export remains available when the binder is locked.
- Acquisition changes use the shared save-status toast and restore the card's previous acquisition state if saving fails.

#### Technical requirements

- TBD: Define the checklist route, client filtering and sorting, acquisition updates, PDF-export contract, and locked-binder behavior.
