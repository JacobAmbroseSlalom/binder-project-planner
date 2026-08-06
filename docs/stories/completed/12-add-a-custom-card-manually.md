# 12. Add a custom card manually

**Status:** Done (2026-08-01 22:41 EDT) - with one known gap: the "opened from the unplaced cards section" acceptance criterion isn't reachable through the UI yet because story 15 ("Manage unplaced cards") hasn't been built, so there's no unplaced-cards-section UI anywhere in the app to open the manual-entry modal from. The backend/contract/context layer fully supports a `null` placement end to end (an unplaced custom card can be created and optimistically tracked); only the frontend trigger for that specific entry point is still missing, pending story 15.

#### Acceptance criteria

- The card-selection modal has an option to add a custom card without selecting a TCGdex search result.
- The manual-entry option remains available when a TCGdex search returns no matches or fails.
- Selecting the manual-entry option displays fields for the card's name, set, number, and image.
- Name is required before a custom card can be added.
- An image is required before a custom card can be added.
- The custom card image can be uploaded from the user's computer.
- A custom card opened from an empty binder slot is added to the slot that originally opened the modal.
- A custom card opened from the unplaced cards section is added to that section.
- The custom card is saved through the backend to the database as a new, independent card entry.
- The saved record includes the entered name, set, number, and image.
- The saved record identifies the card as manually entered and does not assign TCGdex identity fields.
- Custom cards support the same later variation, acquisition, checklist, movement, duplication, and manual-pricing behavior as TCGdex cards.
- Adding a custom card uses the shared save-status toast and retains the entered fields for correction if saving fails.

#### Technical requirements

- Manual entry replaces the search content within the existing card-selection modal and provides a Back action that returns to the search view; it does not open a nested modal.
- Switching to manual entry preserves the current query and latest completed search results for the Back action; closing the modal still discards both views' state.
- The manual-entry form uses React Hook Form with a Zod schema.
- Custom card names are trimmed, required after trimming, and limited to 100 characters by the frontend schema, OpenAPI contract, and backend validation.
- Custom card set and number are optional trimmed strings; blank values are stored as `null`, set is limited to 100 characters, and number is limited to 50 characters across frontend and backend validation.
- The manual-entry form requires one image file before submission.
- Custom uploads accept JPEG, PNG, and WebP files; the file input's `accept` value advertises those formats, and the backend validates the file signature rather than trusting its name or multipart MIME type.
- An unsupported upload receives `415 Unsupported Media Type` using Problem Details and preserves the entered form fields for correction.
- Custom image uploads have no application-level byte-size limit, and the backend streams multipart file content to temporary storage rather than buffering the complete upload in memory.
- `POST /binders/{binderId}/cards` accepts a multipart form-data request for custom cards in addition to its JSON TCGdex-card request variant.
- The multipart fields contain the custom metadata and optional placement coordinates, the file part contains the required image, and the backend assigns the `custom` source server-side.
- The backend calculates a SHA-256 digest while streaming a custom upload, and custom cards with identical image bytes share one image-asset record and file.
- A database uniqueness constraint on the image digest prevents concurrent identical custom uploads from creating duplicate assets.
- Submitting a valid custom card closes the modal and optimistically adds it to the target slot or unplaced-card section using an object URL for the selected local image while the multipart request runs.
- The pending custom card is disabled until the request settles; success replaces it with the backend representation and revokes the object URL.
- Failure removes the optimistic card, reopens the manual-entry view with all text values and the selected `File` preserved, displays the shared failed toast, and revokes the object URL only when that preview is no longer used.
- An unplaced card remains a binder-owned card whose physical page, row, and column are all `null`.
- A database check constraint requires placement coordinates to be either all non-null or all null; sentinel coordinate values are not used.
- Placed and unplaced custom-card requests return the same `201 Created`, binder-card `Location` header, and complete persisted card representation as TCGdex card creation.
- Custom image assets retain a sanitized original upload filename as metadata, but the backend-generated storage filename is used for all filesystem operations.
- Multipart parsing is handled by `express-openapi-validator`'s built-in `fileUploader` option (multer under the hood, added as a new direct backend dependency alongside `@types/multer`) with a custom digest-computing disk `StorageEngine`, rather than its default in-memory buffering, to satisfy the no-byte-limit/streaming/digest-while-streaming requirements above in one pass.
