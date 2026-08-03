# API Endpoint Reference

This is a planning-derived index of every explicitly specified endpoint in
[planning.md](planning.md). The OpenAPI specification will be the implementation source
of truth; update this reference when planning adds, removes, or changes a route.

## Conventions

- Resource identifiers in paths, such as `{binderId}`, `{cardId}`, and `{artId}`, are
  backend-generated UUIDs.
- Request and response contracts are OpenAPI-documented. JSON is the default request
  format unless an endpoint below specifies multipart form data.
- Validation, conflict, and other failures use Problem Details JSON responses.
- Binder, card, and art representations contain metadata and image URLs. Image bytes are
  served through the dedicated image endpoints.

## Service

| Method | Path      | Description                                                                                     |
| ------ | --------- | ----------------------------------------------------------------------------------------------- |
| `GET`  | `/health` | Returns `200 OK` with the JSON health response used to verify frontend-to-backend connectivity. |

## Binders

| Method   | Path                                 | Description                                                                                                                                                                                 |
| -------- | ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `POST`   | `/binders`                           | Creates a binder from normalized name, dimensions, and stored page count. Returns `201 Created`, a `Location` header, and the persisted binder.                                             |
| `GET`    | `/binders`                           | Returns every binder summary in deterministic `updatedAt`-descending, then UUID-ascending order. The initial endpoint is not paginated.                                                     |
| `GET`    | `/binders/{binderId}`                | Returns binder details for the shared binder context and Edit Details tab. Missing binders return `404 Not Found`.                                                                          |
| `PATCH`  | `/binders/{binderId}`                | Applies documented partial binder updates, including details, notes, preview page, dimensions, locked state, and confirmed affected-item relocation. Returns the complete persisted binder. |
| `DELETE` | `/binders/{binderId}`                | Permanently deletes a binder and its owned graph. Returns `204 No Content` whether present or already absent; locked binders return `409 Conflict`.                                         |
| `POST`   | `/binders/{binderId}/duplicate`      | Deep-copies the authoritative binder graph into a new unlocked binder while reusing immutable image assets. Returns `201 Created`, a `Location` header, and the new binder summary.         |
| `POST`   | `/binders/{binderId}/resize-preview` | Read-only dry run for a proposed width, height, and stored page count reduction. Returns affected card and art IDs and separate counts without changing data.                               |

## Binder Content Reads

| Method | Path                        | Description                                                                                               |
| ------ | --------------------------- | --------------------------------------------------------------------------------------------------------- |
| `GET`  | `/binders/{binderId}/cards` | Returns every binder-owned card, including placed and unplaced cards, without image bytes.                |
| `GET`  | `/binders/{binderId}/art`   | Returns every binder-owned multi-slot-art record, including placed and unplaced art, without image bytes. |

## Card Catalog and Cards

| Method   | Path                                                                           | Description                                                                                                                                                                                                                                                                                                                                                                                  |
| -------- | ------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET`    | `/card-catalog/search?query={query}&includeTcgPocket={bool}&language={en\|ja}` | Searches TCGdex through the backend and returns normalized provider cards in provider order. The trimmed query is required and must meet the configured minimum length. `includeTcgPocket` and `language` are optional and default to `false` and `en`.                                                                                                                                      |
| `POST`   | `/binders/{binderId}/cards`                                                    | Creates one binder-owned custom card via multipart form data with metadata, optional placement, and a required image. Returns `201 Created`, a `Location` header, and the persisted card. TCGdex-card creation, including a single selected card, instead uses `POST /binders/{binderId}/cards/bulk` (Stories 11, 17, and 18).                                                               |
| `POST`   | `/binders/{binderId}/cards/bulk`                                               | Creates one or more independent TCGdex cards (array of one or more selected search results), an optional shared variation, and an optional target placement applied only to the first array element. The sole TCGdex-card creation path. Returns per-card outcomes with `201 Created` for complete success or `207 Multi-Status` for card-level failures; requires a client idempotency key. |
| `PATCH`  | `/cards/{cardId}`                                                              | Updates a card. Placement moves and swaps include expected and final coordinate triples and return every updated card; variation edits use a nullable variation field and return the persisted card.                                                                                                                                                                                         |
| `DELETE` | `/cards/{cardId}`                                                              | Permanently deletes a binder-owned card and cascades its dependent records. Returns `204 No Content` whether the card exists or is already absent.                                                                                                                                                                                                                                           |
| `POST`   | `/cards/{cardId}/duplicate`                                                    | Creates an independent unplaced copy of the authoritative card, reusing its image asset. Returns `201 Created`, a `Location` header, and the persisted duplicate; requires a client idempotency key.                                                                                                                                                                                         |
| `GET`    | `/cards/{cardId}/image`                                                        | Streams the card's shared local image with the detected content type and immutable caching. Missing cards, image metadata, or files return `404 Not Found`.                                                                                                                                                                                                                                  |

## Multi-Slot Art

| Method   | Path                      | Description                                                                                                                                                                                                                                                                                                   |
| -------- | ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `POST`   | `/binders/{binderId}/art` | Creates multi-slot art from one multipart request containing normalized metadata, image transforms including quarter-turn rotation, and an image. Upload installation, image-asset persistence, and art creation succeed or fail together. Returns `201 Created`, a `Location` header, and the persisted art. |
| `PATCH`  | `/art/{artId}`            | Updates art placement using expected and final coordinate triples, or edits normalized metadata, transforms including quarter-turn rotation, style overrides, and an optional replacement image through multipart form data. Returns the complete persisted art.                                              |
| `DELETE` | `/art/{artId}`            | Permanently deletes art and its image reference. Returns `204 No Content` whether the art exists or is already absent.                                                                                                                                                                                        |
| `POST`   | `/art/{artId}/duplicate`  | Creates an unplaced copy of the authoritative art while reusing its immutable image assets. Returns `201 Created`, a `Location` header, and the persisted duplicate; requires a client idempotency key.                                                                                                       |
| `GET`    | `/art/{artId}/image`      | Streams the art's normalized rendering image with the detected content type and immutable caching. Missing art, image metadata, or files return `404 Not Found`.                                                                                                                                              |

## PDF Exports

| Method | Path                                  | Description                                                                                                                                                                                                                                                                                                                                                                                                |
| ------ | ------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `POST` | `/binders/{binderId}/exports/pdf`     | Generates the binder-layout PDF from a request-start persisted snapshot. Accepts JSON `{ "includeVariations": boolean }`, with `false` as the default, and returns a downloadable PDF named from the sanitized binder name followed by " Binder" (e.g. "Umbreon Binder.pdf").                                                                                                                              |
| `POST` | `/binders/{binderId}/exports/art-pdf` | Generates a downloadable PDF containing only the request's selected, currently placed multi-slot art from a request-start persisted snapshot, packed across as many pages as needed. Accepts JSON `{ "selectedArtIds": string[] }`; the filename is the sanitized binder name followed by `-art.pdf`. The request fails when `selectedArtIds` is empty or any id isn't currently placed art in the binder. |

## Planned Endpoint Gaps

The following planned features do not yet specify an endpoint path and are intentionally
absent from this reference: full-data export and import, card acquisition, card
checklists, card finances, custom art finances, and art production statistics.
