# 19. Duplicate a card

**Status:** Done (2026-08-03 18:07 EDT)

#### Acceptance criteria

- Hovering over a card displays a duplicate-card action with the existing card actions.
- Selecting the duplicate-card action creates a new, independent card entry in the database through the backend.
- The duplicated card is added to the unplaced cards section.
- The original card remains in its current location and is unchanged.
- Card duplication uses the shared save-status toast and does not display a duplicate if creation fails.

#### Technical requirements

- Duplication copies all card-owned data, including source and provider fields, custom metadata, variation, acquisition state, and saved pricing data.
- The duplicate receives a new backend-generated card UUID and UTC timestamps, belongs to the same binder, and has all-null placement coordinates.
- The duplicate references the original card's existing image asset rather than creating or copying an image file.
- `POST /cards/{cardId}/duplicate` reads the authoritative source card and creates its duplicate without accepting copied card fields from the client.
- A successful duplication returns `201 Created`, a `Location` header for the duplicate card, and its complete persisted representation.
- Selecting duplicate optimistically inserts an unplaced copy into the binder context with a client-generated temporary ID and the original card's image URL.
- The optimistic duplicate is disabled while saving; success replaces it with the returned card, while failure removes it and displays the shared failed toast.
- The unplaced virtualizer scrolls the optimistic duplicate into view using the established newly-added-card behavior.
- The source card's duplicate action remains available while prior duplicate requests are pending; each request has an independent temporary card, operation ID, toast, and rollback path.
- Each duplicate action includes a client-generated UUID idempotency key; retries of one action reuse its key, while separate actions use distinct keys.
- The backend persists each duplication outcome for the shared mutation idempotency-retention period and returns the same created card for a repeated key without duplicating it again.
