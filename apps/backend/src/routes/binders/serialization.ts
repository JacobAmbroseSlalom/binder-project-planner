import type { BinderRow } from './types.js';

// Story 24: REST contracts expose centimeters/percentages as decimals to
// two decimal places, but the database stores them as integer hundredths
// to avoid floating-point drift (per planning.md). These two helpers
// convert between the two representations at the API boundary.
export function toHundredths(value: number): number {
  return Math.round(value * 100);
}

export function fromHundredths(value: number): number {
  return value / 100;
}

// Story 25/29: art's normalized focal/scale fields are stored as integer
// ten-thousandths (see routes/art/serialization.ts's own copy of this helper); needed
// here too so the PDF exporter can convert them back to the decimals
// `computeArtDisplayGeometry` expects.
export function fromTenThousandths(value: number): number {
  return value / 10_000;
}

// Strips internal-only columns (`normalizedName`, the `*Hundredths` storage
// columns) and converts stored hundredths back to their documented decimal
// units before a binder row is serialized as an OpenAPI `Binder`, shared by
// every route that returns one. `tags` (story 51) lives in its own table
// keyed by `binderId` rather than a column on this row, so every call site
// fetches it separately (via `listTagsForBinder`) and passes it in.
export function serializeBinder(row: BinderRow, tags: string[]) {
  return {
    id: row.id,
    name: row.name,
    width: row.width,
    height: row.height,
    pages: row.pages,
    widthPerSlot: fromHundredths(row.widthPerSlotHundredths),
    widthBase: fromHundredths(row.widthBaseHundredths),
    heightPerSlot: fromHundredths(row.heightPerSlotHundredths),
    heightBase: fromHundredths(row.heightBaseHundredths),
    borderColor: row.borderColor,
    borderRadius: fromHundredths(row.borderRadiusHundredths),
    borderWidth: fromHundredths(row.borderWidthHundredths),
    previewPhysicalPage: row.previewPhysicalPage,
    notes: row.notes,
    locked: row.locked,
    selectedBinderCostEntryId: row.selectedBinderCostEntryId,
    selectedPrintingCostEntryId: row.selectedPrintingCostEntryId,
    selectedHolographicPaperCostEntryId: row.selectedHolographicPaperCostEntryId,
    tags,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export function badRequestProblem(detail: string) {
  return {
    type: 'about:blank',
    title: 'Bad Request',
    status: 400,
    detail,
  };
}

export function notFoundProblem(binderId: string) {
  return {
    type: 'about:blank',
    title: 'Not Found',
    status: 404,
    detail: `No binder exists with id "${binderId}".`,
  };
}
