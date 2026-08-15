import type { DatabaseConnection } from '../../database/client.js';

// Shared dependencies every `routes/art/*Route.ts` registration function
// needs, mirroring `createArtRouter`'s own former closure-captured
// arguments (`database`, `imagesDirectory`) - passed as one object rather
// than positional arguments so adding a new dependency later doesn't
// require updating every registration function's signature.
export interface ArtRouteDeps {
  database: DatabaseConnection['database'];
  imagesDirectory: string;
}

// The validated, OpenAPI-typed shape of a create-art request body (story
// 25, `multipart/form-data`). Numeric fields arrive pre-coerced to numbers
// by the request-validation middleware (see app.ts's `coerceTypes`
// comment); the uploaded image file itself is read from `request.files`
// rather than this body.
export interface CreateArtRequestBody {
  title: string;
  description?: string;
  widthSlots: number;
  heightSlots: number;
  imageRotationDegrees?: number;
  focalX?: number;
  focalY?: number;
  scaleX?: number;
  scaleY?: number;
  borderColor?: string | null;
  borderRadius?: number | null;
  borderWidth?: number | null;
}

// A nullable placement triple, mirroring routes/cards/types.ts's own shape -
// an all-populated placed position or an all-null unplaced position (story
// 26).
export interface NullablePlacement {
  physicalPage: number | null;
  row: number | null;
  column: number | null;
}

// `PATCH /art/{artId}`'s `application/json` movement body (story 26): art
// never swaps (only cards can occupy each other's slot in a 2-card swap),
// so - unlike `MoveCardsRequest` - this is always exactly one
// expected/final placement pair for the one art item the path identifies.
export interface MoveArtRequestBody {
  expectedPlacement: NullablePlacement;
  finalPlacement: NullablePlacement;
}

// `PATCH /art/{artId}`'s `multipart/form-data` edit body (story 26):
// mirrors `CreateArtRequestBody`'s metadata fields (the image itself stays
// optional - omitting it keeps the art's current image) plus a flag that
// confirms moving already-placed art to the unplaced section when the
// edited dimensions would otherwise leave it out of bounds or overlapping
// another item.
export interface UpdateArtRequestBody {
  title: string;
  description?: string;
  widthSlots: number;
  heightSlots: number;
  imageRotationDegrees?: number;
  focalX?: number;
  focalY?: number;
  scaleX?: number;
  scaleY?: number;
  borderColor?: string | null;
  borderRadius?: number | null;
  borderWidth?: number | null;
  moveToUnplacedOnConflict?: boolean;
}

export interface ArtRow {
  id: string;
  binderId: string;
  title: string;
  description: string | null;
  widthSlots: number;
  heightSlots: number;
  physicalPage: number | null;
  row: number | null;
  column: number | null;
  imageAssetId: string;
  imageRotationDegrees: number;
  focalXTenThousandths: number;
  focalYTenThousandths: number;
  scaleXTenThousandths: number;
  scaleYTenThousandths: number;
  borderColor: string | null;
  borderRadiusHundredths: number | null;
  borderWidthHundredths: number | null;
  createdAt: string;
  updatedAt: string;
}
