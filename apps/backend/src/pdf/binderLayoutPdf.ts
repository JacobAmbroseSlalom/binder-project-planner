import { createWriteStream } from 'node:fs';

import {
  computeArtDisplayGeometry,
  listBinderSpreads,
  getSpreadLabel,
} from '@binder-project-planner/shared';
import PDFDocument from 'pdfkit';
import sharp from 'sharp';

// Story 29's binder-layout PDF generator. Draws from an already-resolved,
// transactionally consistent snapshot of the binder graph (query and
// transaction handling live in routes/binders.ts) rather than reaching
// back into the database itself, keeping this module a pure rendering
// step that's easy to reason about independently of the request/response
// plumbing around it.

// Raised for any failure that should abort the export with Problem
// Details rather than a generated (possibly partial) PDF - a missing,
// unreadable, or unsupported local image, or any other drawing failure.
// `status` matches the shape app.ts's error handler already expects from
// any thrown error (`error.status ?? 500`).
export class PdfGenerationError extends Error {
  status = 500;
  constructor(message: string) {
    super(message);
    this.name = 'PdfGenerationError';
  }
}

// US Letter landscape, in PDFKit's default point unit (72 per inch) - the
// same fixed page size and margin for every generated page, including the
// first/last single-sided spreads (planning.md's technical requirements).
const POINTS_PER_INCH = 72;
const PAGE_WIDTH_PT = 11 * POINTS_PER_INCH;
const PAGE_HEIGHT_PT = 8.5 * POINTS_PER_INCH;
const PAGE_MARGIN_PT = 0.25 * POINTS_PER_INCH;
// Space reserved above the scaled binder view for the spread's own "Page
// N"/"Pages L-R" label.
const LABEL_HEIGHT_PT = 24;
// A thin gap between adjacent slots and rows, mirroring the layout tab's
// own small on-screen grid gap; not a value planning.md names explicitly,
// so kept as a local rendering constant rather than a shared default.
const SLOT_GAP_PT = 3;
// The extra gap between a spread's left and right sides (the binder's
// spine), wider than the ordinary slot gap so the two sides read as
// visually distinct halves.
const SPINE_GAP_PT = 14;
// Extra height reserved below each grid row when variation labels are
// included, without resizing the row's own card-image height.
const VARIATION_LABEL_HEIGHT_PT = 14;
const SLOT_BORDER_COLOR = '#3B4A59'; // matches --color-neutral-700
const SLOT_LABEL_TEXT_COLOR = '#28333F'; // matches --color-neutral-800, readable on a white page

export interface BinderPdfBinderInput {
  name: string;
  width: number;
  height: number;
  pages: number;
  widthPerSlot: number;
  widthBase: number;
  heightPerSlot: number;
  heightBase: number;
}

export interface BinderPdfCardInput {
  physicalPage: number;
  row: number;
  column: number;
  variation: string | null;
  imagePath: string;
}

export interface BinderPdfArtInput {
  physicalPage: number;
  row: number;
  column: number;
  widthSlots: number;
  heightSlots: number;
  imagePath: string;
  // The image's correctly-oriented pixel dimensions, as already resolved
  // and stored by story 25's art upload (`artImageAssets.pixelWidth`/
  // `pixelHeight`) - reused as-is rather than re-derived here.
  naturalWidth: number;
  naturalHeight: number;
  imageRotationDegrees: 0 | 90 | 180 | 270;
  focalX: number;
  focalY: number;
  scaleX: number;
  scaleY: number;
  // Already resolved (art's own override, falling back to the binder's
  // current setting when null) by the caller - mirrors `ArtTile.tsx`'s own
  // `art.borderColor ?? binder.borderColor` resolution, per planning.md's
  // "a non-null value is this art item's own custom override"/"null means
  // use the binder's current setting at render time".
  borderColor: string;
  // A percentage of the art's own frame width/height (elliptical corners
  // when the frame isn't square), matching `ArtTile.tsx`.
  borderRadius: number;
  // Physical centimeters, converted to points using the frame's own
  // cm-to-point scale below - matching `ArtTile.tsx`'s cm-to-px scale.
  borderWidth: number;
}

export interface GenerateBinderLayoutPdfOptions {
  outputPath: string;
  binder: BinderPdfBinderInput;
  cards: readonly BinderPdfCardInput[];
  art: readonly BinderPdfArtInput[];
  includeVariations: boolean;
}

// Loads a local image file and re-encodes it as a PNG buffer with any
// embedded EXIF orientation baked in. PDFKit's `doc.image()` only
// understands JPEG/PNG natively - not WebP, a fully supported upload
// format (see images/imageFormat.ts) - and never itself respects EXIF
// orientation the way a browser `<img>` element does, so every embedded
// image is normalized through sharp first regardless of its source
// format. `sharp().rotate()` with no arguments auto-orients from EXIF and
// strips the tag; it's a safe no-op for images that already have no
// orientation tag (e.g. art's pre-normalized `normalizedStorageFilename`).
export async function loadImageForEmbedding(imagePath: string): Promise<Buffer> {
  try {
    return await sharp(imagePath).rotate().png().toBuffer();
  } catch {
    throw new PdfGenerationError(
      `A placed card or art image is missing, unreadable, or not a supported format: "${imagePath}".`,
    );
  }
}

// Traces a rounded rectangle's outline path, accepting independently-sized
// corner radii (`rx` horizontal, `ry` vertical) for generality - callers
// currently always pass equal `rx`/`ry` (a circular corner capped by the
// frame's shorter dimension, matching `ArtTile.tsx`), but PDFKit's own
// single-radius `roundedRect()` couldn't express distinct axis radii if a
// future caller ever needed them. Uses the standard cubic-bezier
// quarter-ellipse approximation (the `0.5523` "kappa" constant). Only
// traces the path - the caller still calls `.fill()`/`.clip()`/`.stroke()`
// afterward.
const BEZIER_ELLIPSE_KAPPA = 0.5522847498307936;

export function traceRoundedRectPath(
  doc: PDFKit.PDFDocument,
  x: number,
  y: number,
  width: number,
  height: number,
  rx: number,
  ry: number,
): void {
  // Clamp so oversized radii (e.g. a 50%+ `borderRadius`) never produce an
  // invalid path that overshoots the rectangle's own center.
  const clampedRx = Math.min(Math.max(rx, 0), width / 2);
  const clampedRy = Math.min(Math.max(ry, 0), height / 2);
  const kx = clampedRx * BEZIER_ELLIPSE_KAPPA;
  const ky = clampedRy * BEZIER_ELLIPSE_KAPPA;

  doc
    .moveTo(x + clampedRx, y)
    .lineTo(x + width - clampedRx, y)
    .bezierCurveTo(
      x + width - clampedRx + kx,
      y,
      x + width,
      y + clampedRy - ky,
      x + width,
      y + clampedRy,
    )
    .lineTo(x + width, y + height - clampedRy)
    .bezierCurveTo(
      x + width,
      y + height - clampedRy + ky,
      x + width - clampedRx + kx,
      y + height,
      x + width - clampedRx,
      y + height,
    )
    .lineTo(x + clampedRx, y + height)
    .bezierCurveTo(
      x + clampedRx - kx,
      y + height,
      x,
      y + height - clampedRy + ky,
      x,
      y + height - clampedRy,
    )
    .lineTo(x, y + clampedRy)
    .bezierCurveTo(x, y + clampedRy - ky, x + clampedRx - kx, y, x + clampedRx, y)
    .closePath();
}

// One resolved slot-grid layout for a spread: the pixel(point) geometry
// every card/art placement below is positioned against. Mirrors the
// layout tab's own "contain" scaling (the binder view is scaled to fit
// the page without cropping) using a `min()` of the width-constrained and
// height-constrained candidate slot sizes, the same approach the
// frontend's CSS achieves declaratively. Always sized and positioned as
// if both a left and right side are present - even a single-sided
// first/last page reserves the same two-side layout (slots the same size
// as an interior spread's, not enlarged to fill the whole page) and its
// lone side renders in its own correct half (right for the first page,
// left for the last), leaving the other half blank - matching
// `BinderLayoutView.tsx`'s own always-reserve-both-flex-slots treatment
// (see its "blank, non-content placeholder" comment) rather than
// centering the lone side across the full page width.
interface GridLayout {
  slotWidthPt: number;
  slotHeightPt: number;
  // The top-left origin, in page points, of the left side's slot (1, 1).
  leftOriginX: number;
  // The top-left origin, in page points, of the right side's slot (1, 1).
  rightOriginX: number;
  originY: number;
}

function computeGridLayout({
  binder,
  includeVariations,
}: {
  binder: BinderPdfBinderInput;
  includeVariations: boolean;
}): GridLayout {
  const slotAspectRatio =
    (binder.widthPerSlot + binder.widthBase) / (binder.heightPerSlot + binder.heightBase);

  const contentWidth = PAGE_WIDTH_PT - 2 * PAGE_MARGIN_PT;
  const contentHeight = PAGE_HEIGHT_PT - 2 * PAGE_MARGIN_PT - LABEL_HEIGHT_PT;

  const horizontalGaps = 2 * (binder.width - 1) * SLOT_GAP_PT + SPINE_GAP_PT;
  const verticalGaps = (binder.height - 1) * SLOT_GAP_PT;
  const labelRowsHeight = includeVariations ? binder.height * VARIATION_LABEL_HEIGHT_PT : 0;

  // The two candidate slot widths a pure "contain" (aspect-preserving,
  // no-crop) fit would produce if constrained by only one axis at a time;
  // the smaller one is the actual fit, matching the frontend's own
  // `min()`-based scaling.
  const availableWidth = contentWidth - horizontalGaps;
  const candidateWidthByWidth = availableWidth / (binder.width * 2);
  const availableHeightForSlots = contentHeight - verticalGaps - labelRowsHeight;
  const candidateWidthByHeight = (availableHeightForSlots / binder.height) * slotAspectRatio;

  const slotWidthPt = Math.min(candidateWidthByWidth, candidateWidthByHeight);
  const slotHeightPt = slotWidthPt / slotAspectRatio;

  const totalGridWidth = slotWidthPt * binder.width * 2 + horizontalGaps;
  const totalGridHeight = slotHeightPt * binder.height + verticalGaps + labelRowsHeight;

  const gridOriginX = PAGE_MARGIN_PT + (contentWidth - totalGridWidth) / 2;
  const originY = PAGE_MARGIN_PT + LABEL_HEIGHT_PT + (contentHeight - totalGridHeight) / 2;

  const leftSideWidth = binder.width * slotWidthPt + (binder.width - 1) * SLOT_GAP_PT;

  return {
    slotWidthPt,
    slotHeightPt,
    leftOriginX: gridOriginX,
    rightOriginX: gridOriginX + leftSideWidth + SPINE_GAP_PT,
    originY,
  };
}

// The top-left point of a given (1-based) row/column within one side,
// given that side's own origin X.
function slotOrigin(
  layout: GridLayout,
  sideOriginX: number,
  row: number,
  column: number,
  includeVariations: boolean,
): { x: number; y: number } {
  const rowStride =
    layout.slotHeightPt + SLOT_GAP_PT + (includeVariations ? VARIATION_LABEL_HEIGHT_PT : 0);
  return {
    x: sideOriginX + (column - 1) * (layout.slotWidthPt + SLOT_GAP_PT),
    y: layout.originY + (row - 1) * rowStride,
  };
}

// Draws one physical page's cards, empty-slot boundaries, and multi-slot
// art onto the already-positioned current PDF page.
async function drawSide({
  doc,
  binder,
  sideOriginX,
  layout,
  cardsOnPage,
  artOnPage,
  includeVariations,
}: {
  doc: PDFKit.PDFDocument;
  binder: BinderPdfBinderInput;
  sideOriginX: number;
  layout: GridLayout;
  cardsOnPage: readonly BinderPdfCardInput[];
  artOnPage: readonly BinderPdfArtInput[];
  includeVariations: boolean;
}): Promise<void> {
  // Cells covered by a multi-slot art item's footprint never render their
  // own empty-slot boundary or (if a card also somehow occupies it - not
  // expected given the placement model, but defensive regardless) a card
  // image; art draws one frame across its whole span instead.
  const coveredCells = new Set<string>();
  for (const item of artOnPage) {
    for (let dRow = 0; dRow < item.heightSlots; dRow++) {
      for (let dCol = 0; dCol < item.widthSlots; dCol++) {
        coveredCells.add(`${item.row + dRow}-${item.column + dCol}`);
      }
    }
  }

  const cardsByPosition = new Map(cardsOnPage.map((card) => [`${card.row}-${card.column}`, card]));

  for (let row = 1; row <= binder.height; row++) {
    for (let column = 1; column <= binder.width; column++) {
      if (coveredCells.has(`${row}-${column}`)) continue;

      const { x, y } = slotOrigin(layout, sideOriginX, row, column, includeVariations);
      const card = cardsByPosition.get(`${row}-${column}`);

      // Only a truly empty slot (no card placed in it) shows the generic
      // gray boundary - a placed card's own image already visually marks
      // its slot, so drawing the boundary underneath it would just be a
      // sliver peeking out around the card's own (possibly non-matching)
      // aspect ratio for no benefit.
      if (!card) {
        doc
          .rect(x, y, layout.slotWidthPt, layout.slotHeightPt)
          .lineWidth(0.75)
          .stroke(SLOT_BORDER_COLOR);
        continue;
      }

      const imageBuffer = await loadImageForEmbedding(card.imagePath);
      // `fit` centers the image within the given box while preserving its
      // own aspect ratio without cropping, matching the on-screen card
      // tile's `object-contain` treatment.
      doc.image(imageBuffer, x, y, {
        fit: [layout.slotWidthPt, layout.slotHeightPt],
        align: 'center',
        valign: 'center',
      });

      if (includeVariations && card.variation) {
        doc
          .fontSize(8)
          .fillColor(SLOT_LABEL_TEXT_COLOR)
          .text(card.variation, x, y + layout.slotHeightPt + 2, {
            width: layout.slotWidthPt,
            height: VARIATION_LABEL_HEIGHT_PT,
            align: 'center',
            ellipsis: true,
          });
      }
    }
  }

  for (const item of artOnPage) {
    const { x, y } = slotOrigin(layout, sideOriginX, item.row, item.column, includeVariations);
    // The art's full span, including the internal gaps between the slots
    // it covers - matching a CSS Grid item's own box, which extends from
    // the start of its first spanned track to the end of its last one.
    // The gap between spanned rows is `SLOT_GAP_PT` plus a variation-label
    // row's height when included; each spanned row otherwise contributes
    // its own `slotHeightPt` exactly once (mirroring `frameWidth`'s own
    // `slots * slotSize + (slots - 1) * gap` shape - a previous version of
    // this formula double-counted an extra `slotHeightPt` per spanned row
    // by multiplying the *whole* row-to-row stride, rather than just the
    // gap portion of it, producing frames far taller than their slots).
    const frameWidth = item.widthSlots * layout.slotWidthPt + (item.widthSlots - 1) * SLOT_GAP_PT;
    const rowGapPt = SLOT_GAP_PT + (includeVariations ? VARIATION_LABEL_HEIGHT_PT : 0);
    const frameHeight = item.heightSlots * layout.slotHeightPt + (item.heightSlots - 1) * rowGapPt;

    // The art's own physical size (story 25: derived from its
    // widthSlots/heightSlots footprint), used only to recover the same
    // cm-to-point scale `ArtTile.tsx` uses for its cm-to-px scale, so a
    // physical-centimeters `borderWidth` renders proportionally to the
    // frame's actual printed size rather than as a fixed point count.
    const physicalWidthCm = item.widthSlots * binder.widthPerSlot + binder.widthBase;
    const ptPerCm = frameWidth / physicalWidthCm;
    const borderWidthPt = item.borderWidth * ptPerCm;

    // Outer radius is a percentage of the SHORTER of the frame's two
    // dimensions (not each axis independently), matching `ArtTile.tsx` -
    // this keeps corners circular instead of stretching them into an
    // extreme, lopsided-looking ellipse on a tall/narrow or short/wide
    // frame (e.g. a 1x2 multi-slot art item's ~1:2.8 aspect ratio). Inner
    // radius is reduced by the border thickness so the image's own
    // rounded corners stay concentric with the border's, clamped so it
    // never goes negative for a thick border with a small radius.
    const outerRadius = (item.borderRadius / 100) * Math.min(frameWidth, frameHeight);
    const innerRadius = Math.max(0, outerRadius - borderWidthPt);

    const innerX = x + borderWidthPt;
    const innerY = y + borderWidthPt;
    const innerWidth = frameWidth - 2 * borderWidthPt;
    const innerHeight = frameHeight - 2 * borderWidthPt;

    // Fills the entire (outer) frame with the art's own resolved border
    // color first - since the subsequent inset, clipped image below
    // covers all of it except a `borderWidthPt`-wide ring around the
    // edge, this reproduces the same visual result as `ArtTile.tsx`'s CSS
    // `border` property without needing a stroked rounded-rect path
    // (which draws its stroke straddling the path itself rather than
    // fully inside it, and doesn't support elliptical corners in PDFKit).
    doc.save();
    traceRoundedRectPath(doc, x, y, frameWidth, frameHeight, outerRadius, outerRadius);
    doc.fill(item.borderColor);
    doc.restore();

    const imageBuffer = await loadImageForEmbedding(item.imagePath);
    const geometry = computeArtDisplayGeometry({
      naturalWidth: item.naturalWidth,
      naturalHeight: item.naturalHeight,
      frameWidthPx: innerWidth,
      frameHeightPx: innerHeight,
      transform: {
        imageRotationDegrees: item.imageRotationDegrees,
        focalX: item.focalX,
        focalY: item.focalY,
        scaleX: item.scaleX,
        scaleY: item.scaleY,
      },
    });

    doc.save();
    traceRoundedRectPath(doc, innerX, innerY, innerWidth, innerHeight, innerRadius, innerRadius);
    doc.clip();
    doc.translate(innerX + geometry.centerX, innerY + geometry.centerY);
    if (item.imageRotationDegrees !== 0) doc.rotate(item.imageRotationDegrees);
    doc.image(imageBuffer, -geometry.localWidth / 2, -geometry.localHeight / 2, {
      width: geometry.localWidth,
      height: geometry.localHeight,
    });
    doc.restore();
  }
}

// Generates the complete binder-layout PDF into `outputPath` (a
// request-scoped temporary file - the caller streams it to the response
// only after this promise resolves, per planning.md's "finishes ... in a
// request-scoped temporary file before sending response headers"
// requirement). Rejects with a `PdfGenerationError` (or lets an
// unexpected error propagate) on any failure; the caller is responsible
// for removing a partially written file in that case.
export async function generateBinderLayoutPdf({
  outputPath,
  binder,
  cards,
  art,
  includeVariations,
}: GenerateBinderLayoutPdfOptions): Promise<void> {
  const spreads = listBinderSpreads(binder.pages);

  const cardsByPhysicalPage = new Map<number, BinderPdfCardInput[]>();
  for (const card of cards) {
    const list = cardsByPhysicalPage.get(card.physicalPage) ?? [];
    list.push(card);
    cardsByPhysicalPage.set(card.physicalPage, list);
  }
  const artByPhysicalPage = new Map<number, BinderPdfArtInput[]>();
  for (const item of art) {
    const list = artByPhysicalPage.get(item.physicalPage) ?? [];
    list.push(item);
    artByPhysicalPage.set(item.physicalPage, list);
  }

  const doc = new PDFDocument({
    size: [PAGE_WIDTH_PT, PAGE_HEIGHT_PT],
    margin: PAGE_MARGIN_PT,
    autoFirstPage: false,
  });

  const writeStream = createWriteStream(outputPath);
  const finished = new Promise<void>((resolve, reject) => {
    writeStream.on('finish', resolve);
    writeStream.on('error', reject);
    doc.on('error', reject);
  });
  doc.pipe(writeStream);

  for (const spread of spreads) {
    doc.addPage();
    doc
      .fontSize(12)
      .fillColor(SLOT_LABEL_TEXT_COLOR)
      .text(getSpreadLabel(spread), PAGE_MARGIN_PT, PAGE_MARGIN_PT, {
        width: PAGE_WIDTH_PT - 2 * PAGE_MARGIN_PT,
        align: 'center',
      });

    const layout = computeGridLayout({
      binder,
      includeVariations,
    });

    if (spread.left !== null) {
      await drawSide({
        doc,
        binder,
        sideOriginX: layout.leftOriginX,
        layout,
        cardsOnPage: cardsByPhysicalPage.get(spread.left) ?? [],
        artOnPage: artByPhysicalPage.get(spread.left) ?? [],
        includeVariations,
      });
    }
    if (spread.right !== null) {
      await drawSide({
        doc,
        binder,
        sideOriginX: layout.rightOriginX,
        layout,
        cardsOnPage: cardsByPhysicalPage.get(spread.right) ?? [],
        artOnPage: artByPhysicalPage.get(spread.right) ?? [],
        includeVariations,
      });
    }
  }

  doc.end();
  await finished;
}
