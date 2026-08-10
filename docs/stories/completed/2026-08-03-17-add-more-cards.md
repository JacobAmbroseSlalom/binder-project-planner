# 17. Add more cards

**Status:** Done (2026-08-03 17:05 EDT)

#### Acceptance criteria

- The card-selection modal has Cancel, Add More, and Add Card buttons at the bottom.
- Search results are multi-selectable through the checkboxes described in Story 18; Add Card and Add More both act on the complete current selection, whether it holds one card or many.
- Neither button has a quantity field; each selected card creates exactly one independent card instance.
- Add Card adds every currently selected card and closes the modal.
- Add More adds every currently selected card, then clears the current card search and selection, and keeps the modal open for another search.
- When the modal was opened from an empty binder slot, the first selected card (in search-result order) from the session's first submission - whether that submission was Add Card or Add More - targets that original slot; every other selected card in that submission is added to the unplaced cards section.
- Every later submission in the same Add More session adds all of its selected cards to the unplaced cards section, even if the first submission's slot placement failed.
- When the modal was opened from the unplaced cards section, every added card from every submission is added to that section.
- Every added card is saved as a new, independent card entry in the database through the backend.
- Each added card retains its own TCGdex identity fields and the shared variation entered for that submission.
- Adding cards uses the shared save-status toast, and cards that fail to save are not displayed in the slot or unplaced cards section.
- Card searches during an Add More session continue to use the shared loading component and failed toast.
- A manually entered custom card (Story 12) is not part of the checkbox-selectable search results; Add Card and Add More continue to submit exactly that one custom card when the modal is in manual-entry mode.

#### Technical requirements

- Add Card and Add More submit the complete current checkbox selection of TCGdex search results through the `POST /binders/{binderId}/cards/bulk` contract (Story 18) regardless of whether one or many cards are selected; manual custom-card entry continues to use the single-card multipart `POST /binders/{binderId}/cards` contract.
- The single-card JSON TCGdex variant of `POST /binders/{binderId}/cards` (Story 11) is removed as part of implementing this story: `POST /binders/{binderId}/cards/bulk` becomes the sole TCGdex-card creation path, accepting arrays of one or more normalized results, and the backend code for the two paths is consolidated into the bulk handler. The multipart custom-card variant of `POST /binders/{binderId}/cards` (Story 12) is unaffected.
- Both buttons and every selection checkbox are disabled while a submission request is pending.
- The modal retains the current selection, shared variation, query, and results until the request succeeds.
- After an Add More submission succeeds, the modal clears the query, results, selection, and shared variation and returns focus to the search input for the next search.
- After an Add More submission fails for one or more cards, the modal retains the current query, results, selection, and variation for correction or retry; successful cards from a partially failed submission are still added to the binder context, and failed cards are not.
- Add Card closes the modal immediately and uses the established multi-card optimistic create and rollback behavior from Story 18: every selected card is optimistically inserted into its target slot or the unplaced section per the slot-targeting rule, and the bulk response reconciles per-card success and failure.
- If an Add Card submission has any failed card, the modal reopens with the query, results, selection, and variation from the failed submission preserved, limited to the cards that failed.
- The modal session marks its original slot target as consumed when the first submission (Add Card or Add More) is submitted, regardless of that submission's outcome; every card after the first in that submission, and every card in every later submission, uses all-null placement coordinates.
- Add Card and Add More are enabled only when at least one TCGdex result is selected or the custom-card form is valid, and both are disabled while a create-card request is pending.
- A valid manual custom-card form also offers Add More and submits exactly one multipart create-card request, unaffected by checkbox selection state.
- Custom Add More keeps the manual form and selected file while the request is pending; success clears the form, revokes its object URL, and returns to the search view, while failure retains the complete form for retry.
- Cancel, Escape, backdrop clicks, and the close control may dismiss the modal while an Add More or Add Card submission is pending; dismissal does not abort the create-card mutation.
- A dismissed pending request still adds every persisted successful card to the binder context and reports any card-level failures through the shared failed toast.
- If a dismissed submission has any failed card, the modal reopens automatically in its prior TCGdex-selection or custom-entry view with the failed cards' selection and values preserved; complete success leaves the modal closed.
