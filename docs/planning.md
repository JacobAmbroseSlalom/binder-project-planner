# Project Planning — Card Binder Planner

This doc is the starting point for planning and tracking development. Update it as the
product direction and backlog evolve.

## Product vision
An app that helps collectors plan how to organize their trading/collectible cards into
binders — e.g. deciding page layouts, assigning cards to pages/slots, and tracking what's
been placed vs. still needs a home.

## Tech stack (planned)
- Frontend: React (Next.js)
- Backend: Node.js
- Database / auth / hosting: **TBD** — decide and record here before building those
  pieces.

## Story backlog
Stories are listed below with their acceptance criteria (ACs).

### Project setup
- The repository contains separate frontend and backend applications.
- A frontend app (React with Next.js and TypeScript) is scaffolded and runs locally.
- A backend app (Node.js with Express and TypeScript) is scaffolded and runs locally.
- An initial database is created using the database technology selected for the project.
- The backend is configured to connect to the initial database successfully.
- The frontend can successfully make a request to the backend (e.g. a basic health-check endpoint).

### Add reusable save-status feedback
- A reusable toast component appears at the bottom of the page to communicate backend operation status.
- A saving toast appears when an operation begins and remains visible until the operation succeeds or fails.
- When the operation succeeds, the saving toast is replaced by a green saved toast.
- Saving and saved toasts dismiss automatically after a configured short amount of time.
- When the operation fails, the saving toast is replaced by a red failed toast that includes the provided error message.
- Failed toasts remain visible until the user dismisses them with an X.
- When a failed operation changed the visible interface before backend confirmation, the interface returns to its previous state.
- Stories that save, update, move, duplicate, delete, lock, or unlock data use this shared toast component.

### Create a new binder
- The home page has a button to create a new binder.
- Selecting the button navigates to the new binder page.
- The new binder page has fields for name, width, height, and pages.
- Width defaults to 3.
- Height defaults to 3.
- Cancel and Start New buttons appear at the bottom of the page.
- Cancel returns to the home page without creating a binder.
- Start New saves the binder through the backend to a database.
- After the binder is saved, the user returns to the home page.
- Binder creation uses the shared save-status toast and remains on the completed form if saving fails.

### List binders
- The home page displays a list of binders.
- The binder list is retrieved from the backend.
- The home page uses the shared loading component while the binder list is being retrieved.
- The empty binder-list state is not displayed until loading completes successfully with no binders.
- If the binder list fails to load, the loading component is removed and the provided error is displayed using the shared failed toast.

### Add reusable loading feedback
- A reusable loading component communicates when the app is waiting for data from the backend.
- The loading component uses a consistent visual treatment, such as a spinner or loading toast, wherever it appears.
- The loading component remains visible until the request succeeds or fails.
- Loaded content replaces the loading component when the request succeeds.
- If the request fails, the loading component is removed and the provided error is displayed using the shared failed toast.
- Loading feedback prevents empty, incomplete, or stale content from being presented as the completed result.
- Future stories that retrieve data from the backend use this shared loading component.

### Create styling documentation
- Styling documents are created for the frontend.
- The documents record the agreed visual and UI standards for the app.
- The documents are organized so developers can reference and update them as the app evolves.

### Create the view/edit binder page
- A view/edit binder page is created.
- Tabs appear at the top of the page.
- The tabs are labeled "Edit Details", "Edit Layout", and "View Financials".
- The new binder page and the "Edit Details" tab use the same reusable binder-details form component.
- Fields added to the reusable binder-details form appear on both the new binder page and the "Edit Details" tab.
- After a new binder is saved, the user is taken to its view/edit page with the "Edit Layout" tab selected.
- Selecting a binder from the home page list opens its view/edit page with the "Edit Layout" tab selected.
- Opening a binder uses the shared loading component until its details, cards, and multi-slot art are available or the request fails.
- If the binder fails to load, the loading component is removed and the provided error is displayed using the shared failed toast.

### Visualize a basic binder layout
- The "Edit Layout" tab displays a visual representation of the binder.
- Each binder side displays a grid based on the binder's width and height.
- A 3-by-3 binder side displays 9 slots.
- The first displayed page shows only the right binder side. For a 3-by-3 binder, it displays 9 slots.
- Each intermediate displayed page shows both the left and right binder sides. For a 3-by-3 binder, it displays 18 slots.
- The last displayed page shows only the left binder side. For a 3-by-3 binder, it displays 9 slots.
- The number of displayed pages is one greater than the number of pages stored in the binder data. For example, a binder with 20 stored pages has 21 displayed pages.
- Left and right arrow controls navigate backward and forward through the displayed pages.
- The left arrow is disabled on the first displayed page.
- The right arrow is disabled on the last displayed page.
- A physical card slot is 7 cm wide by 9.5 cm high.
- Binder slots and displayed cards preserve the corresponding 7:9.5 width-to-height ratio.
- The on-screen dimensions may scale responsively and do not need to equal the physical size.

### Jump directly to a binder page
- The current physical page number or page-number range appears above the binder visualization.
- A page number input or selector appears alongside the previous and next arrows.
- Physical page numbers account for both sides represented by each stored binder page.
- A binder with 20 stored pages has physical page numbers 1 through 40.
- Physical page 1 is displayed by itself on the right side.
- Selecting the right arrow from physical page 1 displays the spread containing physical pages 2 and 3.
- Intermediate spreads are labeled with their even-numbered left page and odd-numbered right page, such as "Pages 4–5".
- The final physical page, page 40 in a 20-page binder, is displayed by itself on the left side.
- Entering either page number from an intermediate spread navigates to that complete spread.
- Entering page 5 displays physical pages 4 and 5 together.
- The page input only accepts physical page numbers that exist in the binder.
- Using the arrows updates the page input and current-page label, and entering a page updates the displayed binder spread.

### Show Michi slot indicators
- The "Edit Layout" tab has a toggle for showing Michi slot indicators.
- The toggle defaults to off.
- When the toggle is on, the layout displays the left and right binder sides together as
  a spread so the Michi placements can be understood across both sides.
- A Michi indicator appears above each gap between paired columns whose slot openings
  face toward each other.
- Columns are numbered from left to right across the complete binder spread.
- On each binder side, columns are paired from the outside edge toward the binder spine.
- For an odd binder width, the column nearest the spine on each side is not paired.
- A 3-wide binder displays indicators between columns 1 and 2 and between columns 5 and
  6.
- A 5-wide binder displays indicators between columns 1 and 2, 3 and 4, 7 and 8, and 9
  and 10.
- For an even binder width, every column is paired.
- A 4-wide binder displays indicators between columns 1 and 2, 3 and 4, 5 and 6, and 7
  and 8.
- Turning the toggle off hides all Michi indicators.

### Select a card for a binder slot
- Each unoccupied binder slot displays a + icon centered in the slot.
- Selecting a binder slot opens a card-selection modal for that slot.
- The modal includes a search bar that searches for cards using the TCGdex cards API (`https://tcgdex.dev/rest/cards`).
- Card searches use the shared loading component while waiting for the TCGdex API response.
- Previous search results are not presented as results for a new search while it is loading.
- If a card search fails, the loading component is removed and the provided error is displayed using the shared failed toast.
- Search results display the card images returned by the API.
- Selecting a card adds it to the binder slot that originally opened the modal.
- The selected card is saved through the backend to the database.
- The saved record identifies the binder, page, and slot number.
- The saved card name includes the card's name, number, and set.
- The saved record includes the selected card's image.
- The saved record includes the TCGdex card ID, set ID, and local card number.
- The saved record includes a source identifying TCGdex as the card-data provider.
- Card assignment uses the shared save-status toast and restores the slot to its previous state if saving fails.

### Add a custom card manually
- The card-selection modal has an option to add a custom card without selecting a TCGdex search result.
- The manual-entry option remains available when a TCGdex search returns no matches or fails.
- Selecting the manual-entry option displays fields for the card's name, set, number, and image.
- Name is required before a custom card can be added.
- The custom card image can be uploaded from the user's computer.
- A custom card opened from an empty binder slot is added to the slot that originally opened the modal.
- A custom card opened from the unplaced cards section is added to that section.
- The custom card is saved through the backend to the database as a new, independent card entry.
- The saved record includes the entered name, set, number, and image.
- The saved record identifies the card as manually entered and does not assign TCGdex identity fields.
- Custom cards support the same later variation, acquisition, checklist, movement, duplication, and manual-pricing behavior as TCGdex cards.
- Adding a custom card uses the shared save-status toast and retains the entered fields for correction if saving fails.

### Remove a card from a binder slot
- Hovering over a card displays card actions to the right of the card.
- The first action is an X button.
- Selecting the X removes the card from its binder slot on the page.
- Selecting the X deletes the card's binder-slot record from the database through the backend.
- Card removal uses the shared save-status toast and restores the card to its slot if deletion fails.

### Move a card to a different binder slot
- A card can be dragged from its current binder slot and dropped into a different slot.
- After the card is dropped into an empty slot, the binder layout displays it in the destination slot and clears its original slot.
- The card's new page and slot position are saved to the database through the backend.
- If the destination slot contains another card, the two cards swap positions.
- Both card positions in a swap are saved together through the backend.
- If either position in a swap fails to save, neither saved position changes and both cards return to their original slots.
- If the destination slot is occupied by multi-slot art, the card returns to its original slot and its saved position does not change.
- Card movement and swapping use the shared save-status toast and restore all affected cards to their original slots if saving fails.

### Manage unplaced cards
- An unplaced cards section appears on the right side of the "Edit Layout" tab.
- A card can be moved from a binder slot into the unplaced cards section.
- Moving a card into the unplaced cards section clears its binder slot and saves the card as unplaced in the database through the backend.
- An unplaced card can be moved into an empty binder slot.
- Moving an unplaced card into a binder slot removes it from the unplaced cards section and saves its page and slot position in the database through the backend.
- The unplaced cards section has an add button that opens the existing card-selection modal.
- Selecting a card from the modal adds it to the unplaced cards section and saves it to the database through the backend.
- Hovering over an unplaced card displays the existing card actions to its right, with the X as the first action.
- Selecting the X removes the unplaced card from the section and deletes it from the database through the backend.
- Adding, moving, and deleting unplaced cards use the shared save-status toast and restore their previous locations if an operation fails.

### Add card variations
- The add-card modal has a field for adding a variation to the selected card.
- The variation field allows the user to select "Reverse Holo", "Non-Holo", "1st Edition", or "Expansion Stamp".
- The variation field also allows the user to enter a custom value that is not in the suggested list.
- The selected or entered variation is saved with the card information in the database through the backend.
- Hovering over a card displays an edit action with the existing card actions to its right.
- Selecting the edit action opens a modal for editing the card's variation.
- Saving the edit updates the card's variation in the database through the backend.
- The "Edit Layout" tab has a toggle for showing or hiding card variations.
- Card variations are hidden by default.
- Turning the toggle on displays each card's variation on the binder layout.
- Turning the toggle off hides card variations on the binder layout.
- Adding or editing a variation uses the shared save-status toast and preserves the entered value for correction if saving fails.

### Add more cards
- The card-selection modal has Cancel, Add More, and Add Card buttons at the bottom.
- The modal allows a quantity to be specified for the selected card.
- Add Card adds the selected quantity and closes the modal.
- Add More adds the selected quantity, clears the current card search and selection, and keeps the modal open for another search.
- When the modal was opened from an empty binder slot, the first card added is placed in that original slot.
- Additional copies from the selected quantity and all cards added afterward in the same Add More session are added to the unplaced cards section.
- When the modal was opened from the unplaced cards section, every added card is added to that section.
- Every added copy is saved as a new, independent card entry in the database through the backend.
- Each added card retains the selected card's TCGdex identity fields and variation.
- Adding more cards uses the shared save-status toast, and cards that fail to save are not displayed in the slot or unplaced cards section.
- Card searches during an Add More session continue to use the shared loading component and failed toast.

### Bulk add cards
- The card-selection modal has a Bulk Add option for adding every card that matches the current TCGdex search.
- A bulk-add search can be used to find groups such as every card in a set or every card for a particular Pokemon.
- Bulk Add includes the complete set of matching search results rather than only the results currently visible in the modal.
- The number of cards that will be added is displayed before the bulk addition is confirmed.
- Bulk Add is unavailable when the current search has no results.
- The bulk-add workflow has an optional variation field.
- The variation field supports the same suggested and custom values as adding an individual card.
- When a variation is provided, it is applied to every card created by the bulk addition.
- Every bulk-added card is added to the unplaced cards section, including when the card-selection modal was opened from a binder slot.
- Every bulk-added card is saved as a new, independent card entry in the database through the backend.
- Each bulk-added card retains its own TCGdex identity fields, image, and source.
- Bulk addition uses the shared save-status toast, and cards that fail to save are not displayed in the unplaced cards section.
- Bulk-add searches use the shared loading component and failed toast.

### Duplicate a card
- Hovering over a card displays a duplicate-card action with the existing card actions.
- Selecting the duplicate-card action creates a new, independent card entry in the database through the backend.
- The duplicated card is added to the unplaced cards section.
- The original card remains in its current location and is unchanged.
- Card duplication uses the shared save-status toast and does not display a duplicate if creation fails.

### Add a binder preview
- Each binder in the home page list displays a preview of one of its pages.
- The preview shows how the selected binder page and its cards appear in the binder layout.
- The reusable binder-details form on the new binder page and the "Edit Details" tab has a field for selecting which displayed page is used by the preview.
- The preview page defaults to page 2.
- The selected preview page is saved with the binder through the backend.
- The home page list uses the binder's saved preview page when displaying the preview.
- Saving the preview page uses the shared save-status toast and restores the previous selection if saving fails.

### Manage binders from the home page
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

### Show binder completion metrics
- The top of the home page binder list has a toggle for showing or hiding binder completion metrics.
- When the toggle is on, completion metrics appear below each binder in the list.
- Each binder displays its number of occupied slots and empty slots.
- A slot containing a card is counted as occupied.
- Every slot covered by placed multi-slot art is counted as occupied.
- Unplaced cards and multi-slot art do not count as occupied slots.
- Each binder displays a slot-completion percentage calculated as `(occupied slots / total binder slots) x 100`.
- Each binder also displays its card-acquisition percentage.
- When the toggle is off, the completion metrics are hidden.
- Completion metrics update when cards or multi-slot art are added, removed, moved, or when card acquisition changes.
- Loading binder completion metrics uses the shared loading component, and a failure removes the loading state and displays the provided error using the shared failed toast.

### Add binder notes
- The binder view/edit page has a toggle for showing or hiding a notes section.
- The notes section appears on the left side of the screen when it is visible.
- The notes toggle defaults to on for an unlocked binder.
- The notes toggle defaults to off for a locked binder.
- The notes section contains a large text box for free-form notes and to-do items.
- The binder's saved notes are loaded from the database through the backend.
- The notes text box is editable when the binder is unlocked.
- The notes text box is read-only when the binder is locked.
- When the notes text box loses focus after its contents change, the updated notes are saved to the database through the backend.
- Notes loading uses the shared loading component and displays the provided error using the shared failed toast if loading fails.
- Notes saving uses the shared save-status toast and preserves the entered text for correction if saving fails.

### Configure card and multi-slot art dimensions
- The reusable binder-details form on the new binder page and the "Edit Details" tab has editable fields for the width per slot and width base values.
- Width per slot defaults to 7 cm and width base defaults to 0 cm.
- Displayed width is calculated as `(number of slots x width per slot) + width base`.
- With the default width values, widths of 1, 2, and 3 slots are 7 cm, 14 cm, and 21 cm.
- The reusable binder-details form has editable fields for the height per slot and height base values on both pages.
- Height per slot defaults to 10 cm and height base defaults to -0.5 cm.
- Displayed height is calculated as `(number of slots x height per slot) + height base`.
- With the default height values, heights of 1, 2, and 3 slots are 9.5 cm, 19.5 cm, and 29.5 cm.
- The reusable binder-details form has editable multi-slot art fields for border color, border radius, and border width on both pages.
- Border color defaults to `#FFCB05`.
- Border radius defaults to 38%.
- Border width defaults to 11%.
- The dimension and multi-slot art values are saved with the binder through the backend.
- TBD: Verify all supplied default values during implementation before finalizing them.
- Saving dimension and multi-slot art settings uses the shared save-status toast and preserves the entered values for correction if saving fails.

### Add multi-slot art
- The unplaced cards section has an add-art button that opens a modal for creating multi-slot art.
- The modal allows the user to upload an image from the computer's files.
- The modal also accepts an image pasted from the clipboard with Cmd+V.
- The modal has fields for the multi-slot art's title and description.
- The modal has a grid selector whose columns and rows match the binder's width and height.
- A 4-by-4 binder displays a 4-by-4 selector containing 16 cells.
- Hovering over a cell highlights the rectangle from the top-left cell through the hovered cell.
- Selecting a cell sets the art's width and height in slots from that highlighted rectangle.
- Selecting row 1, column 2 creates art that is 2 slots wide and 1 slot high.
- With the default dimension settings, art that is 2 slots wide and 1 slot high measures 14 cm by 9.5 cm.
- The modal has fields for art-specific border color, border radius, and border width.
- Each art-specific border field can either use the binder's setting or define a custom value.
- When an art-specific field uses the binder's setting, its override is stored as null in the database so later binder-setting changes apply to the art.
- The modal displays an editable preview of the uploaded image inside a border frame sized from the selected slot dimensions and border settings.
- The border frame remains fixed while the image can be repositioned within it.
- The image can be resized while preserving its aspect ratio.
- The image can also be stretched or compressed horizontally and vertically when needed.
- The preview reflects the image's position, scale, aspect-ratio adjustments, and border settings.
- The modal evaluates the uploaded image's pixel dimensions against the art's selected physical print dimensions using a documented minimum print-resolution threshold.
- Image quality is reevaluated when the uploaded image or selected slot dimensions change.
- When the image does not meet the minimum resolution for its physical print size, a warning appears in the modal.
- The warning explains that the image may appear blurry or pixelated when printed and displays the image's available resolution and the required resolution.
- The image-quality warning does not prevent the user from saving the multi-slot art.
- The title, description, original uploaded image, selected slot dimensions, image-editing specifications, and art-specific style overrides are saved through the backend.
- Outside the editor, the art renders with the saved positioning, scaling, aspect-ratio adjustments, and border settings.
- After it is added, the multi-slot art appears in the unplaced cards section at a size proportional to the binder slots it occupies.
- Placement and other interactions for multi-slot art on the binder layout will be defined in the next story.
- Image upload and multi-slot art creation use the shared save-status toast, and the modal retains its image and entered settings if either operation fails.

### Move and manage multi-slot art
- Hovering over multi-slot art displays edit, delete, and duplicate actions comparable to the existing card actions.
- Selecting edit opens the same modal used to add multi-slot art, populated with the art's saved title, description, image, dimensions, positioning, scaling, aspect-ratio adjustments, and style overrides.
- Saving an edit updates the multi-slot art in the database through the backend.
- Selecting delete removes the multi-slot art from the layout or unplaced cards section and deletes it from the database through the backend.
- Selecting duplicate creates a new, independent multi-slot art entry in the database through the backend and adds it to the unplaced cards section.
- Multi-slot art can be moved from the unplaced cards section into the binder layout.
- The art occupies a rectangular group of slots matching its saved width and height in slots.
- A placement succeeds only when every slot in the art's target area is unoccupied.
- If any slot in the target area is occupied, the placement is rejected and the art remains in the unplaced cards section with no saved position change.
- Multi-slot art cannot swap positions with a card or another piece of multi-slot art.
- Any move involving multi-slot art is rejected if one or more slots in its target area are occupied, regardless of the occupying item type.
- After a successful placement, the art is removed from the unplaced cards section and its binder position is saved through the backend.
- Every slot covered by placed multi-slot art is considered occupied.
- Cards and other multi-slot art cannot be placed in any slot occupied by multi-slot art.
- Multi-slot art can be moved from the binder layout back into the unplaced cards section.
- Moving art back to the unplaced cards section clears all slots it occupied and saves it as unplaced through the backend.
- Editing, deleting, duplicating, and moving multi-slot art use the shared save-status toast and restore the art's previous state or location if an operation fails.

### Handle binder size and page-count changes
- Increasing the binder's width, height, or page count preserves all existing card and multi-slot art placements.
- Before reducing the binder's width, height, or page count, the app identifies every card and piece of multi-slot art whose placement would no longer exist or fit.
- Multi-slot art is affected if any slot in its occupied area falls outside the reduced binder layout.
- If no placed items are affected, the reduced binder details can be saved without a relocation confirmation.
- If placed items are affected, saving opens a confirmation modal that identifies how many cards and pieces of multi-slot art will be moved to the unplaced cards section.
- Selecting cancel closes the confirmation modal without changing the binder or any item positions.
- Confirming the change moves every affected card and piece of multi-slot art to the unplaced cards section.
- The binder detail changes and all affected item relocations are saved together through the backend.
- If any part of the update fails, the binder details and item positions remain unchanged.
- Binder size and page-count changes use the shared save-status toast.

### Undo and redo layout movements
- The "Edit Layout" tab has undo and redo buttons.
- Each successful drag-and-drop movement of a card or multi-slot art is added to the layout movement history.
- A card swap is added to movement history as one action containing both cards' original and swapped positions.
- Movement history includes moves between binder slots and moves between the binder layout and the unplaced cards section.
- Selecting undo returns every card or piece of multi-slot art affected by the most recent movement to its previous location and saves the restored positions through the backend.
- Undoing a card swap restores both cards to their original slots together.
- Selecting redo reapplies the most recently undone movement and saves all reapplied positions through the backend.
- Redoing a card swap reapplies both swapped card positions together.
- The undo button is disabled when there are no movements to undo.
- The redo button is disabled when there are no movements to redo.
- A rejected drag-and-drop attempt is not added to the movement history.
- Adding, editing, deleting, or duplicating cards and multi-slot art cannot be undone or redone with these controls.
- Undo and redo use the shared save-status toast and retain the current history position if saving fails.

### Export a binder as a PDF
- The binder has a print-to-PDF button that generates a PDF of its layout.
- Each displayed binder page is rendered as one PDF page in binder-page order.
- First and last displayed pages retain their single-sided layouts in the PDF.
- Intermediate displayed pages retain their complete left-and-right spread on one PDF page.
- The binder layout is scaled to fit the PDF page and is not rendered at its physical size.
- For a 3-by-3 binder, all 18 slots in an intermediate spread appear together on one PDF page.
- Cards and multi-slot art appear in their assigned positions in the generated PDF.

### Export multi-slot art for printing
- The binder has a print-art PDF button that generates a PDF containing all of its multi-slot art and no cards.
- PDF pages use a landscape orientation.
- Each piece of art is rendered at its configured physical dimensions rather than scaled to fit a binder view.
- With the default dimension settings, each slot occupied by art represents 7 cm of width and 9.5 cm of height, adjusted by the configured multi-slot dimension formulas.
- Each piece of art retains its saved image positioning, scaling, aspect-ratio adjustments, and border settings.
- White space separates each piece of art from other art and from the page edges.
- Art edges are aligned where possible to make physical cutting easier.
- Art is arranged across PDF pages to minimize unused space while preserving its physical dimensions and required spacing.
- A page can generally fit two 2-by-2 pieces of art.
- A page can generally fit four 2-by-1 pieces of art.
- A page can generally fit eight 1-by-1 pieces of art.
- When the art does not fit on one page, the remaining art is efficiently arranged on additional landscape pages.

### Search and filter unplaced items
- The unplaced cards section has a search field for narrowing the displayed items.
- Cards can be found by card name, set, number, or variation.
- Multi-slot art can be found by title or description.
- The unplaced cards section can be filtered by item type to show all items, cards only, or multi-slot art only.
- Search and item-type filters can be used together.
- Clearing the search and filters restores all unplaced items.
- When no unplaced items match, the section displays an empty-results state.

### Lock a binder
- Hovering over a binder in the home page list displays a lock or unlock action with the existing binder actions.
- Selecting the lock action locks the binder and saves its locked state through the backend.
- The action reflects whether the binder is currently locked or unlocked.
- Selecting the unlock action unlocks the binder and saves its unlocked state through the backend.
- A locked binder can still be opened and viewed.
- The "Edit Details" tab is read-only while the binder is locked.
- The "Edit Layout" tab is read-only while the binder is locked.
- Controls that add, remove, duplicate, edit variations, or move cards or multi-slot art are unavailable while the binder is locked.
- Card acquisition status can still be changed while the binder is locked.
- API-fetched and manually entered card prices can still be updated while the binder is locked.
- The delete X is hidden from the home page hover actions while the binder is locked.
- A locked binder cannot be deleted, and the backend rejects deletion requests for it.
- A locked binder can still be duplicated, and the new binder is created unlocked.
- The backend rejects changes to the details or layout of a locked binder.
- The backend accepts card acquisition and price updates for a locked binder.
- Unlocking the binder restores its editing controls and allows details and layout changes again.
- Locking and unlocking use the shared save-status toast and restore the previous lock state if the operation fails.

### Export and import all application data
- The application has actions for exporting and importing all application data.
- Exporting creates a single portable archive that can be moved to another application instance or data-storage location.
- The export archive includes all contents of the application database.
- The export archive includes every application-managed image file, including original images uploaded for custom cards and multi-slot art.
- The export preserves record identifiers and image references so imported records remain connected to the correct image files.
- The export includes a manifest identifying the archive format and data-schema version.
- Secrets and environment-specific configuration are not included in the export archive.
- Importing accepts an archive created by the application's full-data export.
- Before changing current data, the import validates the archive format, schema compatibility, database contents, required image files, and image references.
- An invalid or incomplete archive is rejected without changing the current database or image files.
- A valid import displays a confirmation that importing will add the archive's database contents and image files to the current application data.
- Cancelling the confirmation leaves all current data unchanged.
- Confirming the import adds every database record and image file from the archive without overwriting or deleting existing records or files.
- Existing application elements remain unchanged even when imported elements contain matching identifiers, names, or image filenames.
- Imported record identifiers are remapped when needed, and all relationships between imported records are updated to use the remapped identifiers.
- Imported image filenames or storage paths are remapped when needed, and imported records continue to reference the correct imported images.
- Imported elements are added as new elements rather than merged with equivalent existing elements.
- Database records and image files are added as one atomic operation.
- If any part of the import fails, no imported records or image files are added and all existing data remains unchanged.
- Locked binders and their complete data are included in exports and can be added through import without changing existing binders.
- Export and import use the shared loading component while processing and the shared save-status toast when the operation succeeds or fails.

### Add custom art finances

### Add art production time statistics

### Track card acquisition
- Each card stores whether it has been acquired.
- Hovering over a card displays an acquisition action with the existing card actions.
- The acquisition action indicates whether the card is currently acquired or unacquired.
- Selecting the acquisition action changes the card between acquired and unacquired.
- The card's acquisition state is saved to the database through the backend.
- The "Edit Layout" tab has a toggle for showing or hiding card acquisition status.
- Turning the toggle on displays whether each card is acquired or unacquired.
- Turning the toggle off hides card acquisition status from the binder layout.
- Acquisition changes use the shared save-status toast and restore the card's previous acquisition state if saving fails.

### Add a card checklist
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

### Add card finances
- A technical spike determines whether a suitable card-pricing API is available and can provide prices for the cards supported by the app.
- The spike documents the evaluated API, card-matching approach, price data available, usage limits, and any cards for which prices cannot be retrieved.
- Automated card pricing is implemented only if the spike confirms that a suitable API integration is possible.
- If the spike does not identify a suitable pricing API, card finances remain available in a manual-only pricing mode.
- Manual-only pricing continues to support checklist prices, financial totals, and manual price updates without displaying automated price-refresh controls.
- When a card is loaded, its latest available price is fetched from the pricing API.
- The fetched price and the time it was retrieved are saved with the card through the backend.
- The Card Checklist displays the saved price for each card.
- The Card Checklist displays totals at the top for all cards, unacquired cards, and cards matching the active checklist search and filters.
- Changing a card's acquisition state or the active checklist filters updates the applicable totals.
- The "View Financials" tab displays the totals for all cards, unacquired cards, and filtered cards.
- The Card Checklist has a button that fetches updated prices for its cards from the pricing API.
- Price refresh uses the shared loading component until all requested prices have either loaded or failed.
- After price fetching completes, an overview displays an old price, new price, and change amount for each card.
- The old-price column displays the card's currently saved price.
- The new-price column displays the price returned by the pricing API.
- The change column displays the difference between the old and new prices when both prices are available.
- If a price cannot be fetched for a card, its new price and change amount are blank while its old price remains visible.
- A request-level price refresh failure removes the loading state and displays the provided error using the shared failed toast.
- Fetched prices are not persisted until the price overview is available for review.
- TBD: During implementation, determine whether reviewed prices are persisted with an explicit save action or automatically after the overview is displayed.
- A card's price can be entered or edited manually.
- A manually entered price is saved with the card through the backend and is identified as a manual price.
- Manual prices are visually distinct from API-fetched prices on the Card Checklist and the "View Financials" tab.
- Automatically refreshing prices does not overwrite manually entered prices.
- Fetched and manually entered price changes use the shared save-status toast and restore the previous saved price if saving fails.

Add new stories as they come up, following the same format.

## Definition of done (draft)
- Story's acceptance criteria are all met.
- No console errors/warnings introduced.
- Basic tests added/updated if a test setup exists.

## Next steps
1. Define the core data model and how its pieces relate.
2. Decide on database and auth approach; record the decision here.
3. Scaffold the Next.js + Node project structure.
4. Add the first stories to the backlog above.
