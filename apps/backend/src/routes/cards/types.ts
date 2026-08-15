import type { DatabaseConnection } from '../../database/client.js';

// Shared dependencies every `routes/cards/*Route.ts` registration function
// needs, mirroring `createCardsRouter`'s own former closure-captured
// arguments (`database`, `imagesDirectory`, `pokemonTcgApiKey`) - passed as
// one object rather than three positional arguments so adding a new
// dependency later doesn't require updating every registration function's
// signature.
export interface CardsRouteDeps {
  database: DatabaseConnection['database'];
  imagesDirectory: string;
  pokemonTcgApiKey: string | undefined;
}

// One normalized catalog result within a bulk create-cards request
// (stories 17/18, 43; `POST /binders/{binderId}/cards/bulk`) - the sole
// provider-sourced card creation path; there is no single-card JSON
// variant of `POST /binders/{binderId}/cards` anymore. `source` (story 43)
// is `tcgdex` or `pokemontcg`, determining both which provider's image is
// downloaded and how `providerCardId`/`providerSetId` are interpreted.
export interface BulkCardItem {
  source: 'tcgdex' | 'pokemontcg';
  name: string;
  setName: string | null;
  localNumber: string | null;
  providerCardId: string;
  providerSetId: string;
  imageUrl: string;
}

// The validated, OpenAPI-typed shape of `POST /binders/{binderId}/cards/
// bulk`'s request body (stories 17/18): the checked selection, one shared
// optional variation applied to every created card, and one optional
// target placement applied only to the first array element.
export interface BulkCreateCardsRequestBody {
  cards: BulkCardItem[];
  variation?: string | null;
  // Story 36: applied to every card in this bulk request, mirroring the
  // shared `variation` field above; omitted stores as
  // `DEFAULT_CARD_ACQUIRED` (unacquired).
  acquired?: boolean;
  targetPlacement?: { physicalPage: number; row: number; column: number };
}

// The validated, OpenAPI-typed shape of a custom create-card request body
// (story 12, `multipart/form-data`). Placement fields are optional and
// arrive pre-coerced to numbers by the request-validation middleware (see
// app.ts's `coerceTypes` comment); the uploaded image file itself is read
// from `request.files` rather than this body.
export interface CreateCustomCardRequestBody {
  name: string;
  setName?: string;
  localNumber?: string;
  variation?: string;
  // Story 36: unchecked by default on the modal's form (the multipart
  // field arrives as a string and is coerced to boolean by app.ts's
  // `coerceTypes: true` body validation); omitted entirely stores as
  // `DEFAULT_CARD_ACQUIRED` (unacquired), matching every other card-
  // creation path.
  acquired?: boolean;
  physicalPage?: number;
  row?: number;
  column?: number;
}

// The validated, OpenAPI-typed shape of `PATCH /cards/{cardId}/details`'s
// request body (story 49, `multipart/form-data`). `price`, when present,
// arrives pre-coerced to a number by the request-validation middleware
// (see app.ts's `coerceTypes` comment); omitting it clears the card's
// saved price. The optional replacement image file itself is read from
// `request.files` rather than this body.
export interface UpdateCardDetailsRequestBody {
  name: string;
  setName?: string;
  localNumber?: string;
  variation?: string;
  price?: number;
}

// A nullable placement triple, as accepted by both `PlacementCoordinates`
// (an all-populated placed position or an all-null unplaced position -
// story 14/15).
export interface NullablePlacement {
  physicalPage: number | null;
  row: number | null;
  column: number | null;
}

// One entry of the OpenAPI-typed `MoveCardsRequest` body (story 14): the
// affected card's currently expected placement and its final placement.
export interface CardPositionUpdateBody {
  cardId: string;
  expectedPlacement: NullablePlacement;
  finalPlacement: NullablePlacement;
}

// The validated, OpenAPI-typed shape of `PATCH /cards/{cardId}`'s request
// body (story 14): one update for a simple move, two for a swap.
export interface MoveCardsRequestBody {
  updates: CardPositionUpdateBody[];
}

// The validated, OpenAPI-typed shape of `PATCH /cards/{cardId}`'s
// variation-update request body (story 16): replaces the path card's
// variation instead of moving/swapping placement. The route handler below
// branches on which of these two shapes (this one, or
// `MoveCardsRequestBody` above) the request body actually is.
export interface UpdateCardVariationRequestBody {
  variation: string | null;
}

// The validated, OpenAPI-typed shape of `PATCH /cards/{cardId}`'s
// acquisition-update request body (story 36): replaces the path card's
// `acquired` field instead of moving/swapping placement or updating its
// variation. The route handler below distinguishes all three body shapes
// by which of `updates`/`variation`/`acquired` is present.
export interface UpdateCardAcquiredRequestBody {
  acquired: boolean;
}

// The validated, OpenAPI-typed shape of `PATCH /binders/{binderId}/cards/
// acquisition`'s request body (story 46): bulk-replaces `acquired` for
// every listed card in one request, rather than the client looping
// individual `PATCH /cards/{cardId}` requests - used by the Card List
// tab's (story 37) select-all/deselect-all header control.
export interface UpdateCardsAcquisitionRequestBody {
  cardIds: string[];
  acquired: boolean;
}

// The validated, OpenAPI-typed shape of `POST /binders/{binderId}/cards/
// prices/fetch`'s request body (story 38): requests pokemontcg.io price
// data for exactly this set of card ids - the Card List's currently
// filtered/displayed cards, not every card in the binder.
export interface CardPriceFetchRequestBody {
  cardIds: string[];
}

// One reviewed row of `PATCH /binders/{binderId}/cards/prices`'s request
// body (story 38): the new-price value the user is committing for one
// card, plus whether it was hand-edited (`isManualPrice`) - see this
// file's route handler comment for the provenance rules that determine
// this flag client-side.
export interface CardPriceUpdate {
  cardId: string;
  price: number;
  isManualPrice: boolean;
}

export interface UpdateCardPricesRequestBody {
  prices: CardPriceUpdate[];
}

export interface CardRow {
  id: string;
  binderId: string;
  name: string;
  setName: string | null;
  localNumber: string | null;
  source: string;
  providerCardId: string | null;
  providerSetId: string | null;
  variation: string | null;
  physicalPage: number | null;
  row: number | null;
  column: number | null;
  imageAssetId: string;
  acquired: boolean;
  priceCents: number | null;
  isManualPrice: boolean;
  priceUpdatedAt: string | null;
  createdAt: string;
  updatedAt: string;
}
