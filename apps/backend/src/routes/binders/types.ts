import type { DatabaseConnection } from '../../database/client.js';

// Shared dependencies every binders route needs, built once by
// `createBindersRouter` and passed to each route-registration function -
// mirrors routes/cards/types.ts's own `CardsRouteDeps` pattern for this
// codebase's flat-domain-folder backend split convention (story 48).
// `imagesDirectory` is used by the delete route to clean up now-orphaned
// card/art image files after a binder (and everything it owns) is removed,
// and by the PDF export routes to read stored card/art image files.
export interface BindersRouteDeps {
  database: DatabaseConnection['database'];
  imagesDirectory: string;
}

// The validated, OpenAPI-typed shape of a create-binder request body. The
// OpenAPI validation middleware (mounted in app.ts) already rejects requests
// that don't match this shape before this router runs. Story 24's
// dimension/style fields are optional here and default to the canonical
// shared values when omitted (see `applyDimensionDefaults` below).
export interface CreateBinderRequestBody {
  name: string;
  width: number;
  height: number;
  pages: number;
  widthPerSlot?: number;
  widthBase?: number;
  heightPerSlot?: number;
  heightBase?: number;
  borderColor?: string;
  borderRadius?: number;
  borderWidth?: number;
  previewPhysicalPage?: number;
  notes?: string | null;
  // Story 51: defaults to an empty array when omitted; held in local
  // component state on the create-binder page and submitted as part of
  // this same request.
  tags?: string[];
}

// The validated, OpenAPI-typed shape of an update-binder request body
// (story 7; story 24 adds the dimension/style fields; story 32 adds
// `locked`). Every field is optional since it's a partial update; the
// OpenAPI schema already guarantees at least one field is present and that
// no undocumented field slipped through.
export interface UpdateBinderRequestBody {
  name?: string;
  width?: number;
  height?: number;
  pages?: number;
  widthPerSlot?: number;
  widthBase?: number;
  heightPerSlot?: number;
  heightBase?: number;
  borderColor?: string;
  borderRadius?: number;
  borderWidth?: number;
  previewPhysicalPage?: number;
  notes?: string | null;
  locked?: boolean;
  moveAffectedItemsToUnplaced?: boolean;
  // Story 34: this binder's currently selected shared physical-cost
  // entries. Never restricted by `locked` (see
  // `UNRESTRICTED_BINDER_PATCH_FIELDS` below), mirroring the acquisition/
  // price carve-out a future story documents.
  selectedBinderCostEntryId?: string | null;
  selectedPrintingCostEntryId?: string | null;
  selectedHolographicPaperCostEntryId?: string | null;
  // Story 51: a full replacement of this binder's tags - when present,
  // every currently stored tag is replaced by this array (there is no
  // separate add/remove endpoint).
  tags?: string[];
}

// Story 27's dry-run resize preview request body.
export interface ResizePreviewRequestBody {
  width: number;
  height: number;
  pages: number;
}

// The raw database row shape (includes the internal `normalizedName`
// uniqueness column and the integer-hundredths dimension/style columns,
// neither of which are ever exposed to clients as-is).
export interface BinderRow {
  id: string;
  name: string;
  normalizedName: string;
  selectedBinderCostEntryId: string | null;
  selectedPrintingCostEntryId: string | null;
  selectedHolographicPaperCostEntryId: string | null;
  cachedArtPrintPageCount: number | null;
  cachedArtPrintPlacedArtCount: number | null;
  cachedArtPrintMaxArtUpdatedAt: string | null;
  cachedArtPrintBinderUpdatedAt: string | null;
  width: number;
  height: number;
  pages: number;
  widthPerSlotHundredths: number;
  widthBaseHundredths: number;
  heightPerSlotHundredths: number;
  heightBaseHundredths: number;
  borderColor: string;
  borderRadiusHundredths: number;
  borderWidthHundredths: number;
  previewPhysicalPage: number;
  notes: string | null;
  locked: boolean;
  createdAt: string;
  updatedAt: string;
}
