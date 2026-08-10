Strong Recommendations

Undo and redo layout changes
Moving or deleting cards and multi-slot art will be easy to do accidentally. Undo/redo would be especially useful for drag-and-drop actions.

Handle binder dimension and page-count changes
Define what happens when width, height, or page count is reduced while cards or art occupy removed slots/pages. A safe approach is moving affected items into the unplaced section after confirmation.

Search and filter unplaced items
Once a binder contains many cards and art pieces, the unplaced section may become difficult to use. Search by card name, set, number, variation, or item type would help.

Save-state and error feedback
Show when changes are saving, saved, or failed. Failed drag-and-drop, card assignment, image upload, and lock operations should restore the previous state and explain what happened.

Backend card identity fields
In addition to the composed card name, save the TCGdex card ID, set ID, local card number, and source. This provides stable identity if names or image URLs change.

Jump directly to a binder page
Previous/next arrows become cumbersome for a 20-page binder. Add a page number input or page selector alongside the arrows.

Bulk card addition
Let users select several API search results or specify a quantity, adding them to the unplaced section. This complements duplicate-card functionality.

Print preview and PDF settings
Preview both PDF types before generation. Useful settings could include paper size, margins, spacing, crop marks, and whether variations are visible.

Useful Later Features

Binder search, sorting, and grouping on the home page.
Import/export binder data for backup and portability.
Automatic backups or revision history, especially for complex layouts.
Missing-card or collection checklist showing planned cards that have not been acquired.
Binder completion metrics, such as occupied slots, empty slots, and percentage complete.
Notes and tags for binders, cards, pages, and custom art.
Keyboard-accessible alternatives to drag-and-drop and touch controls for mobile/tablet use.
Image-quality warnings when uploaded art has insufficient resolution for its physical print size.
Crop marks and bleed settings for custom-art printing.
Archive binder as a softer alternative to deletion.
The most important unresolved product behavior is changing binder dimensions or page count after content exists. That can cause data loss unless it has an explicit relocation and confirmation workflow.

High Value

Manual/custom card entry: Allow cards missing from TCGdex to be added with a name, set, number, and image. The current workflow depends entirely on API search results.
Swap cards between occupied slots: Dropping onto an occupied slot currently rejects the move. A swap action would make reorganizing layouts much faster.

Insert, remove, and reorder binder pages: Page-count changes are covered, but managing pages in the middle of a binder is not.
Bulk checklist actions: Select multiple visible cards and mark them acquired or unacquired together. This would be especially helpful when updating a newly purchased batch.
Export an acquisition list: Generate a printable or downloadable list of unacquired cards using the checklist’s current search and filters.
Useful Later

Card condition tracking: Record conditions such as Near Mint or Lightly Played. This becomes especially relevant if API prices vary by condition.
Purchase history and cost basis: Store purchase price, purchase date, and seller separately from current market price.
Reusable binder templates: Save dimensions, page count, art settings, and other binder configuration for future binders.
Per-page financial summaries: Show the value and remaining acquisition cost for each page or spread.
Cross-binder collection behavior: Decide whether the same physical card used in multiple binder plans shares acquisition and financial information or remains independent.

I also found three existing backlog details worth clarifying before implementation:

Create a new binder says successful creation returns home, while Create the view/edit binder page says it opens the new binder’s Edit Layout tab.
Locked-binder behavior does not explicitly cover acquisition changes from Card List or manual/API price changes.
Add card finances should explicitly retain manual-only pricing if the API spike finds no suitable pricing service.
