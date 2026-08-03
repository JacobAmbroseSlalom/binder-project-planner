import { createWriteStream } from 'node:fs';

import { computeArtDisplayGeometry } from '@binder-project-planner/shared';
import PDFDocument from 'pdfkit';

import { loadImageForEmbedding, traceRoundedRectPath } from './binderLayoutPdf.js';
import { packArtForPrint, type ArtPrintItem, type PlacedRect } from './artPrintPacking.js';

// Story 30's print-art PDF generator. Like Story 29's
// `generateBinderLayoutPdf`, draws from an already-resolved, transactionally
// consistent snapshot (query and transaction handling live in
// routes/binders.ts) rather than reaching back into the database itself.
// Unlike the binder-layout export, page placement here isn't a fixed grid -
// it comes from `artPrintPacking.ts`'s deterministic packing heuristic,
// which may also tile a piece of art too large for one page across several.

const POINTS_PER_INCH = 72;
// Every art-print PDF page is US Letter landscape.
const PAGE_WIDTH_IN = 11;
const PAGE_HEIGHT_IN = 8.5;
const PAGE_WIDTH_PT = PAGE_WIDTH_IN * POINTS_PER_INCH;
const PAGE_HEIGHT_PT = PAGE_HEIGHT_IN * POINTS_PER_INCH;
const CM_PER_INCH = 2.54;

export interface ArtPrintInput {
  id: string;
  imagePath: string;
  // The image's correctly-oriented pixel dimensions, as already resolved
  // and stored by story 25's art upload - reused as-is rather than
  // re-derived here (matches `BinderPdfArtInput`).
  naturalWidth: number;
  naturalHeight: number;
  imageRotationDegrees: 0 | 90 | 180 | 270;
  focalX: number;
  focalY: number;
  scaleX: number;
  scaleY: number;
  borderColor: string;
  // A percentage of the art's own frame width/height (elliptical corners
  // when the frame isn't square), matching `ArtTile.tsx`/`BinderPdfArtInput`.
  borderRadius: number;
  // Physical centimeters - unlike `BinderPdfArtInput`, this module has no
  // slot-grid frame to derive a cm-to-point scale from, so the caller's
  // resolved `physicalWidthCm`/`physicalHeightCm` below are converted
  // directly using the fixed 72pt/2.54cm-per-inch ratio.
  borderWidth: number;
  // The complete outside edge of the bordered art frame, in centimeters
  // (planning.md: "physical width and height measure the complete outside
  // edge of the bordered art frame") - this is what the packing algorithm
  // and every point-space frame dimension below are derived from.
  physicalWidthCm: number;
  physicalHeightCm: number;
}

export interface GenerateArtPrintPdfOptions {
  outputPath: string;
  art: readonly ArtPrintInput[];
  marginIn: number;
  gapIn: number;
  tileOverlapIn: number;
}

// Draws one art frame (border fill, then the clipped/transformed image)
// into the CURRENT local coordinate system, whose origin is already the
// frame's own unrotated top-left corner (the caller establishes that via
// `doc.translate`/`doc.rotate` before calling this, so the geometry here
// never needs to know about the page, packing rotation, or tiling).
function drawArtFrame({
  doc,
  frameWidthPt,
  frameHeightPt,
  art,
  imageBuffer,
}: {
  doc: PDFKit.PDFDocument;
  frameWidthPt: number;
  frameHeightPt: number;
  art: ArtPrintInput;
  imageBuffer: Buffer;
}): void {
  const borderWidthPt = (art.borderWidth / CM_PER_INCH) * POINTS_PER_INCH;

  // Capped by the SHORTER of the frame's two dimensions (not each axis
  // independently) so corners stay circular instead of stretching into an
  // extreme, lopsided-looking ellipse on a tall/narrow or short/wide
  // frame - matching `binderLayoutPdf.ts`'s own art-frame treatment.
  const outerRadius = (art.borderRadius / 100) * Math.min(frameWidthPt, frameHeightPt);
  const innerRadius = Math.max(0, outerRadius - borderWidthPt);

  const innerX = borderWidthPt;
  const innerY = borderWidthPt;
  const innerWidth = frameWidthPt - 2 * borderWidthPt;
  const innerHeight = frameHeightPt - 2 * borderWidthPt;

  // Fills the entire (outer) frame with the art's own resolved border
  // color first, matching `binderLayoutPdf.ts`'s own art-drawing technique
  // (see that file's comment for why a filled rounded-rect stands in for a
  // stroked border here).
  doc.save();
  traceRoundedRectPath(doc, 0, 0, frameWidthPt, frameHeightPt, outerRadius, outerRadius);
  doc.fill(art.borderColor);
  doc.restore();

  const geometry = computeArtDisplayGeometry({
    naturalWidth: art.naturalWidth,
    naturalHeight: art.naturalHeight,
    frameWidthPx: innerWidth,
    frameHeightPx: innerHeight,
    transform: {
      imageRotationDegrees: art.imageRotationDegrees,
      focalX: art.focalX,
      focalY: art.focalY,
      scaleX: art.scaleX,
      scaleY: art.scaleY,
    },
  });

  doc.save();
  traceRoundedRectPath(doc, innerX, innerY, innerWidth, innerHeight, innerRadius, innerRadius);
  doc.clip();
  doc.translate(innerX + geometry.centerX, innerY + geometry.centerY);
  if (art.imageRotationDegrees !== 0) doc.rotate(art.imageRotationDegrees);
  doc.image(imageBuffer, -geometry.localWidth / 2, -geometry.localHeight / 2, {
    width: geometry.localWidth,
    height: geometry.localHeight,
  });
  doc.restore();
}

// Draws one packed placement (a whole piece of art, or one tile of an
// oversized one) onto the page it was assigned to.
//
// The border/image are always drawn using the frame's own UNROTATED
// physical width/height (`frameWidthPt`/`frameHeightPt`, from
// `physicalWidthCm`/`physicalHeightCm` directly) - the packing algorithm's
// `rotated` flag is a whole-frame print-time rotation layered on top of
// that, applied here as a single `translate`+`rotate` of the local
// coordinate system before `drawArtFrame` runs, so "the border, clipped
// transformed image, and physical width and height rotate together
// without distortion or rescaling" (planning.md) falls out of drawing
// everything in one un-rotated local space and rotating the whole space.
//
// For a tile, `sourceX`/`sourceY` (already in the packing algorithm's
// oriented/rotated coordinate space) locate this tile's window within the
// full composed frame; subtracting them from the tile's own page position
// recovers where that full frame's own origin would be if it were entirely
// drawn, so the same rotate math works unchanged for whole items (whose
// `sourceX`/`sourceY` are always 0).
async function drawPlacement({
  doc,
  placement,
  art,
  marginPt,
  centeringOffsetXPt,
  centeringOffsetYPt,
}: {
  doc: PDFKit.PDFDocument;
  placement: PlacedRect;
  art: ArtPrintInput;
  marginPt: number;
  // Added to every placement's `x`/`y` on this page (see
  // `generateArtPrintPdf` below) so the page's actual packed content is
  // centered both horizontally and vertically within the usable area
  // rather than pinned to the top-left margin - the shelf packer itself
  // always packs from the usable area's top-left corner and doesn't know
  // or care how much width/height a page ends up using, so there's
  // nothing for it to center against.
  centeringOffsetXPt: number;
  centeringOffsetYPt: number;
}): Promise<void> {
  const pageX = marginPt + centeringOffsetXPt + placement.x * POINTS_PER_INCH;
  const pageY = marginPt + centeringOffsetYPt + placement.y * POINTS_PER_INCH;
  const placedWidthPt = placement.widthIn * POINTS_PER_INCH;
  const placedHeightPt = placement.heightIn * POINTS_PER_INCH;

  const frameWidthPt = (art.physicalWidthCm / CM_PER_INCH) * POINTS_PER_INCH;
  const frameHeightPt = (art.physicalHeightCm / CM_PER_INCH) * POINTS_PER_INCH;

  const sourceXPt = placement.kind === 'tile' ? placement.sourceX * POINTS_PER_INCH : 0;
  const sourceYPt = placement.kind === 'tile' ? placement.sourceY * POINTS_PER_INCH : 0;
  const orientedOriginX = pageX - sourceXPt;
  const orientedOriginY = pageY - sourceYPt;

  const imageBuffer = await loadImageForEmbedding(art.imagePath);

  doc.save();
  // Clips to this placement's own window on the page BEFORE establishing
  // the (possibly rotated) local coordinate system below, so the clip
  // boundary always stays the axis-aligned page rectangle it was drawn
  // against, regardless of any subsequent rotation.
  doc.rect(pageX, pageY, placedWidthPt, placedHeightPt).clip();

  if (placement.rotated) {
    // Rotating the unrotated frame (frameWidthPt x frameHeightPt) 90
    // degrees clockwise around a pivot at (orientedOriginX + frameHeightPt,
    // orientedOriginY) places its rotated bounding box's top-left exactly
    // at (orientedOriginX, orientedOriginY) - see this function's
    // doc-comment above for the derivation.
    doc.translate(orientedOriginX + frameHeightPt, orientedOriginY);
    doc.rotate(90);
  } else {
    doc.translate(orientedOriginX, orientedOriginY);
  }

  drawArtFrame({ doc, frameWidthPt, frameHeightPt, art, imageBuffer });

  doc.restore();
}

// Generates the complete print-art PDF into `outputPath` (a request-scoped
// temporary file - the caller streams it to the response only after this
// promise resolves, matching `generateBinderLayoutPdf`'s own contract).
// Rejects with a `PdfGenerationError` (thrown by `loadImageForEmbedding`)
// or lets an unexpected error propagate on any failure; the caller is
// responsible for removing a partially written file in that case.
export async function generateArtPrintPdf({
  outputPath,
  art,
  marginIn,
  gapIn,
  tileOverlapIn,
}: GenerateArtPrintPdfOptions): Promise<void> {
  const usableWidthIn = PAGE_WIDTH_IN - 2 * marginIn;
  const usableHeightIn = PAGE_HEIGHT_IN - 2 * marginIn;
  const marginPt = marginIn * POINTS_PER_INCH;

  const items: ArtPrintItem[] = art.map((item) => ({
    id: item.id,
    widthIn: item.physicalWidthCm / CM_PER_INCH,
    heightIn: item.physicalHeightCm / CM_PER_INCH,
  }));

  const { pageCount, placements } = packArtForPrint(items, {
    usableWidthIn,
    usableHeightIn,
    gapIn,
    tileOverlapIn,
  });

  const artById = new Map(art.map((item) => [item.id, item]));
  const placementsByPage = new Map<number, PlacedRect[]>();
  for (const placement of placements) {
    const list = placementsByPage.get(placement.page) ?? [];
    list.push(placement);
    placementsByPage.set(placement.page, list);
  }

  const doc = new PDFDocument({
    size: [PAGE_WIDTH_PT, PAGE_HEIGHT_PT],
    margin: 0,
    autoFirstPage: false,
  });

  const writeStream = createWriteStream(outputPath);
  const finished = new Promise<void>((resolve, reject) => {
    writeStream.on('finish', resolve);
    writeStream.on('error', reject);
    doc.on('error', reject);
  });
  doc.pipe(writeStream);

  for (let pageIndex = 0; pageIndex < pageCount; pageIndex++) {
    doc.addPage();
    const pagePlacements = placementsByPage.get(pageIndex) ?? [];

    // The shelf packer always packs from the usable area's top-left
    // corner and has no notion of the page as a whole, so a page whose
    // content doesn't fill the full usable width/height ends up pinned to
    // the top-left with all the unused space left over on the right and
    // bottom. Re-centering here (a pure presentation concern, not a
    // packing one) measures how far this page's own placements actually
    // extend on each axis and shifts them all right/down by half the
    // remaining width/height, so the leftover whitespace is split evenly
    // between the opposite margins on both axes instead.
    const contentWidthIn = pagePlacements.reduce(
      (maxRightEdgeIn, placement) => Math.max(maxRightEdgeIn, placement.x + placement.widthIn),
      0,
    );
    const contentHeightIn = pagePlacements.reduce(
      (maxBottomEdgeIn, placement) => Math.max(maxBottomEdgeIn, placement.y + placement.heightIn),
      0,
    );
    const centeringOffsetXPt = (Math.max(0, usableWidthIn - contentWidthIn) / 2) * POINTS_PER_INCH;
    const centeringOffsetYPt =
      (Math.max(0, usableHeightIn - contentHeightIn) / 2) * POINTS_PER_INCH;

    for (const placement of pagePlacements) {
      const artInput = artById.get(placement.id);
      if (!artInput) continue; // defensive; every placement originates from `art` above
      await drawPlacement({
        doc,
        placement,
        art: artInput,
        marginPt,
        centeringOffsetXPt,
        centeringOffsetYPt,
      });
    }
  }

  doc.end();
  await finished;
}
