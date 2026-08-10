# 18. Bulk add cards

**Status:** Done (2026-08-03 17:05 EDT) - implemented together with story 17 as one combined delivery: `POST /binders/{binderId}/cards/bulk` is the sole TCGdex-card creation path, and the card-selection modal's checkbox multi-select, Select All, failure-details modal, and Retry All Failed are all in place.

#### Acceptance criteria

- Each card-selection modal search result displays a checkbox reflecting whether it is currently selected.
- Selecting a result's checkbox adds it to the current selection; deselecting its checkbox removes it. Any number of results can be selected at once.
- A search can be used to find groups such as every card in a set or every card for a particular Pokemon, then select some or all of the matching results before choosing Add Card or Add More.
- A Select All control selects every card in the complete current search-result set, including results not currently mounted by the virtualized grid.
- When every card in the current result set is already selected, the same control instead reads Deselect All and, when selected, deselects every card.
- Select All is unavailable when the current search has no results.
- The selection has an optional shared variation field.
- The variation field supports the same suggested and custom values as adding an individual card.
- When a variation is provided, it is applied to every card added by the same Add Card or Add More submission.
- Slot and unplaced-section targeting for a multi-card selection follow Story 17's Add Card/Add More placement rules.
- Every added card is saved as a new, independent card entry in the database through the backend.
- Each added card retains its own TCGdex identity fields, image, and source.
- Adding selected cards uses the shared save-status toast, and cards that fail to save are not displayed in the slot or unplaced cards section.
- Card searches while cards are selected continue to use the shared loading component and failed toast.
- Changing the search query or either search toggle (Story 41) clears the current selection along with the previous results.

#### Technical requirements

- Addition supports partial success: each selected card is persisted independently rather than in one all-or-nothing database transaction.
- Successful cards are added to the binder context following Story 17's slot-and-unplaced targeting rule; failed cards are omitted.
- The bulk response contains an outcome for every submitted card so the client can reconcile successful and failed creations.
- `POST /binders/{binderId}/cards/bulk` accepts the array of normalized TCGdex search results the user selected (in their original search-result order, one or more elements), one optional shared variation, and one optional target placement (physical page, row, and column) supplied only for a session's first submission when opened from an empty binder slot.
- The endpoint is the sole TCGdex-card creation path (Story 11's single-card JSON variant of `POST /binders/{binderId}/cards` is removed); a single selected card is submitted as a one-element array through this same endpoint rather than a separate single-card request.
- When no target placement is supplied, every created card uses all-null placement coordinates. When a target placement is supplied, only the first array element is attempted at that placement; every other array element uses all-null placement coordinates regardless of whether the first element succeeds.
- If the first element's placement attempt fails for any reason, including a coordinate conflict, no other submitted card is retargeted to that placement; the slot remains empty and the failure is reported through that card's normal bulk outcome entry.
- The endpoint returns `201 Created` when every card succeeds and `207 Multi-Status` when one or more processed cards fail, including a processed batch in which every card fails.
- Request-wide validation or infrastructure failures that prevent per-card processing return the applicable Problem Details response instead of a bulk outcome array.
- Selecting Add Card or Add More submits immediately from the search view without replacing the modal content or opening a confirmation dialog.
- The submitted array comes from the checked subset of the complete latest search response held in state, in that response's order, rather than only the rows currently mounted by the virtualized grid.
- Add Card closes the card-selection modal immediately and runs the request in the background while one shared saving toast tracks the batch; Add More keeps the modal open and, once the request succeeds, clears the query, results, and selection, while the same saving toast tracks the batch in the background.
- The slot and unplaced section are updated from successful per-card outcomes after the response arrives.
- Complete success replaces the saving toast with the shared saved toast; partial or complete card-level failure replaces it with a persistent failed-style toast showing added and failed counts.
- The failure toast includes an action that opens the shared custom modal shell with one entry per failed card, identified by card name, set, and local number and accompanied by its Problem Details message.
- The failure-details modal provides Retry All Failed, which resubmits only the failed normalized card payloads with the original shared variation to the same bulk endpoint.
- Cards that previously succeeded are not included in a retry request.
- If the original slot-targeted card is among the failed cards, Retry All Failed resubmits it as the first element of the retry array with the same target placement; every other retried card uses all-null placement.
- Retry All Failed closes the details modal immediately and runs the retry in the background using the same saving toast, outcome summary, and failure-details behavior as the initial request.
- The backend processes at most `BULK_CARD_CREATE_CONCURRENCY` card creations concurrently, which defaults to `5` in the canonical shared `defaults.ts`.
- Bulk outcome entries preserve submitted array order regardless of processing completion order.
- Every submitted array element creates an independent binder-owned card, including repeated TCGdex card IDs; repeated provider cards reuse their shared local image asset.
- Select All, Add Card, and Add More are enabled only when the current qualifying query has completed successfully with at least one result and no newer search is pending; Add Card and Add More additionally require at least one selected card or a valid custom-card form.
- Retained results from an older query or a current query below the minimum length remain visible but are not eligible for selection.
- At most one bulk-add request may run for a binder; the frontend keeps Add Card and Add More disabled for that binder until the active request settles, including after the card selector is reopened.
- The backend rejects an overlapping bulk request for the same binder with `409 Conflict` using Problem Details.
- After the backend accepts a bulk request, client disconnection does not cancel in-flight or remaining card processing.
- If the client does not receive the outcome response, the next normal binder-card load reconciles the persisted bulk-created cards.
- Each logical bulk attempt includes a client-generated UUID idempotency key; transport retries reuse that key.
- The backend persists the key and complete outcome scoped to the binder and returns the stored outcome for a repeated key without creating additional cards.
- Retry All Failed is a new logical bulk attempt and uses a new idempotency key for its failed-card subset.
- Completed mutation idempotency outcomes are retained for `MUTATION_IDEMPOTENCY_RETENTION_MS`, which defaults to `86400000` (24 hours) in the canonical shared `defaults.ts`.
- The backend removes expired idempotency records opportunistically during startup and bulk-request handling rather than requiring a background scheduler.
