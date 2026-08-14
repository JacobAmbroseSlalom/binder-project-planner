# 49. Edit a card's info from the Card List

**Status:** Not started

#### Acceptance criteria

- Each Card List row has an "Edit" action (a pencil icon), available only while the
  price-review workflow isn't active or fetching (mirroring story 38's own
  disablement of the row's other controls during that state).
- Selecting "Edit" switches that row into an editable state: its image, name,
  variation, set, number, and price all become editable fields in place, and the
  row's normal action(s) are replaced with "Save" and "Cancel" buttons. This applies
  identically to every card regardless of `source` (`tcgdex` or `custom`) - a
  TCGdex-sourced card's name, set, number, and image are just as freely editable as a
  custom card's. Editing those fields on a TCGdex card does not change its `source`,
  `providerCardId`, or `providerSetId`; if the edited values later cause a mismatch
  during a future price lookup for that card, that lookup is allowed to silently fail
  (or return no match) rather than blocking the edit or attempting to reconcile it.
- "Cancel" discards any edits made in that row and returns it to its normal display
  state without a backend request.
- "Save" commits every edited field for that row in one request. If the price field's
  value changed from what was previously saved, `isManualPrice` is set to `true` and
  `priceUpdatedAt` is set to the current time as part of that same save (mirroring the
  price-review "Save all" flow's own provenance rule) - editing the image, name,
  variation, set, or number does not affect `isManualPrice`/`priceUpdatedAt`.

#### Technical requirements

- No existing backend endpoint updates a card's `name`/`setName`/`localNumber`/
  `variation`/image together. A new dedicated endpoint, `PATCH /cards/{cardId}/
details`, handles this edit as a `multipart/form-data` request (the optional image
  file, alongside the other editable fields) - `PATCH /cards/{cardId}` itself stays
  exclusively JSON/move-swap/variation/acquired, unchanged by this story.
- Image replacement reuses story 12's existing `resolveCustomImageAsset(database,
imagesDirectory, uploadedFile)` helper (the same digest-computed disk storage path
  already used by `POST /binders/{binderId}/cards`'s custom-card-creation endpoint),
  rather than introducing a second image-storage mechanism. Unlike creation, the
  image field is optional on this edit request: omitting it leaves the card's
  existing `imageAssetId` unchanged.
- `name`, `setName`, `localNumber`, and `variation` reuse the same trim/blank-to-null
  and max-length validation already enforced for custom-card creation
  (`CUSTOM_CARD_NAME_MAX_LENGTH`, `CUSTOM_CARD_SET_MAX_LENGTH`,
  `CUSTOM_CARD_NUMBER_MAX_LENGTH`, `CARD_VARIATION_MAX_LENGTH`), applied identically
  regardless of the card's `source`.
