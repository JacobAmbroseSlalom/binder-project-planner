import type { ArtRow } from './types.js';

// A minimal RFC 7807 Problem Details object, matching every other route
// file's own local `problem()` helper.
export function problem(status: number, title: string, detail: string) {
  return { type: 'about:blank', title, status, detail };
}

// Story 25's normalized focal coordinates and scale multipliers are
// exposed as decimals (rounded to 4 places) but stored as integer
// ten-thousandths to avoid floating-point drift, mirroring story 24's
// hundredths convention for percentages.
export function toTenThousandths(value: number): number {
  return Math.round(value * 10_000);
}

export function fromTenThousandths(value: number): number {
  return value / 10_000;
}

export function toHundredths(value: number): number {
  return Math.round(value * 100);
}

export function fromHundredths(value: number): number {
  return value / 100;
}

// Serializes a persisted art row as the OpenAPI `Art` response shape. The
// image URL is always the backend's own streaming endpoint; storage
// details are never exposed.
export function serializeArt(row: ArtRow) {
  return {
    id: row.id,
    binderId: row.binderId,
    title: row.title,
    description: row.description,
    widthSlots: row.widthSlots,
    heightSlots: row.heightSlots,
    placement: { physicalPage: row.physicalPage, row: row.row, column: row.column },
    imageUrl: `/art/${row.id}/image`,
    imageRotationDegrees: row.imageRotationDegrees,
    focalX: fromTenThousandths(row.focalXTenThousandths),
    focalY: fromTenThousandths(row.focalYTenThousandths),
    scaleX: fromTenThousandths(row.scaleXTenThousandths),
    scaleY: fromTenThousandths(row.scaleYTenThousandths),
    borderColor: row.borderColor,
    borderRadius:
      row.borderRadiusHundredths === null ? null : fromHundredths(row.borderRadiusHundredths),
    borderWidth:
      row.borderWidthHundredths === null ? null : fromHundredths(row.borderWidthHundredths),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}
