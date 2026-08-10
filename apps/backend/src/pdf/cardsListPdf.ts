import { createWriteStream } from 'node:fs';

import PDFDocument from 'pdfkit';

import { loadImageForEmbedding } from './binderLayoutPdf.js';

// Story 37's Card List PDF generator. Unlike the binder-layout PDF
// (which mirrors the binder's own physical page/slot grid) or the
// art-print PDF (which packs items by their own pixel dimensions), this is
// a plain, binder-agnostic printable list: every submitted card renders at
// the same fixed cell size, in the exact order the caller (routes/
// binders.ts) already resolved from the request's `cardIds`, with no
// packing/tiling logic needed.

// US Letter **portrait** (unlike the binder-layout/art-print PDFs' own
// landscape orientation) - planning.md's Card List requirement.
const POINTS_PER_INCH = 72;
const PAGE_WIDTH_PT = 8.5 * POINTS_PER_INCH;
const PAGE_HEIGHT_PT = 11 * POINTS_PER_INCH;
// The same 0.25 inch page-margin convention as the other PDF exports
// (stories 29/30).
const PAGE_MARGIN_PT = 0.25 * POINTS_PER_INCH;
const COLUMNS = 4;
const ROWS = 6;
const CARDS_PER_PAGE = COLUMNS * ROWS;
// A small gap between adjacent cells, mirroring the binder-layout PDF's
// own `SLOT_GAP_PT` convention.
const CELL_GAP_PT = 6;
// The standard trading-card aspect ratio (2.5 x 3.5 in) - this card list
// isn't tied to any one binder's own slot aspect ratio (which varies with
// `widthPerSlot`/`heightPerSlot`), since the same card list page layout
// applies across every binder.
const CARD_CELL_ASPECT_RATIO = 2.5 / 3.5;

// Story 16's variation-label overlay, matching the binder-layout PDF's own
// bottom-edge overlay treatment (see its identical constants) so a printed
// card list entry's variation reads the same way as the on-screen
// `CardTile` and the full-layout PDF export.
const VARIATION_OVERLAY_HEIGHT_PT = 16;
const VARIATION_OVERLAY_FILL_COLOR = '#000000';
const VARIATION_OVERLAY_FILL_OPACITY = 0.6;
const VARIATION_OVERLAY_TEXT_COLOR = '#FFFFFF';
const VARIATION_OVERLAY_FONT_SIZE_PT = 9;

export interface CardsListPdfCardInput {
  // Only the card's image and variation are ever rendered (planning.md:
  // "Each exported entry includes only the card's image and variation") -
  // no name, set, number, or acquisition state.
  variation: string | null;
  imagePath: string;
}

export interface GenerateCardsListPdfOptions {
  outputPath: string;
  // Already in the caller-resolved (filtered + sorted) order to render.
  cards: readonly CardsListPdfCardInput[];
}

interface CellGridLayout {
  cellWidthPt: number;
  cellHeightPt: number;
  originX: number;
  originY: number;
}

// A fixed 4x6 "contain" grid centered on the page within its margins,
// sized so every cell keeps the standard card aspect ratio - mirrors the
// binder-layout PDF's own `computeGridLayout` shape, simplified since this
// grid never varies per binder.
function computeCellGridLayout(): CellGridLayout {
  const contentWidth = PAGE_WIDTH_PT - 2 * PAGE_MARGIN_PT;
  const contentHeight = PAGE_HEIGHT_PT - 2 * PAGE_MARGIN_PT;

  const horizontalGaps = (COLUMNS - 1) * CELL_GAP_PT;
  const verticalGaps = (ROWS - 1) * CELL_GAP_PT;

  const candidateWidthByWidth = (contentWidth - horizontalGaps) / COLUMNS;
  const candidateWidthByHeight = ((contentHeight - verticalGaps) / ROWS) * CARD_CELL_ASPECT_RATIO;

  const cellWidthPt = Math.min(candidateWidthByWidth, candidateWidthByHeight);
  const cellHeightPt = cellWidthPt / CARD_CELL_ASPECT_RATIO;

  const totalGridWidth = cellWidthPt * COLUMNS + horizontalGaps;
  const totalGridHeight = cellHeightPt * ROWS + verticalGaps;

  return {
    cellWidthPt,
    cellHeightPt,
    originX: PAGE_MARGIN_PT + (contentWidth - totalGridWidth) / 2,
    originY: PAGE_MARGIN_PT + (contentHeight - totalGridHeight) / 2,
  };
}

// Generates the complete Card List PDF into `outputPath` (a
// request-scoped temporary file, matching the other PDF exports' own
// "finishes generation in a request-scoped temporary file before sending
// response headers" convention). Rejects with a `PdfGenerationError` (or
// lets an unexpected error propagate) on any failure; the caller is
// responsible for removing a partially written file in that case.
export async function generateCardsListPdf({
  outputPath,
  cards,
}: GenerateCardsListPdfOptions): Promise<void> {
  const layout = computeCellGridLayout();

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

  for (const [index, card] of cards.entries()) {
    if (index % CARDS_PER_PAGE === 0) {
      doc.addPage();
    }

    const positionOnPage = index % CARDS_PER_PAGE;
    const row = Math.floor(positionOnPage / COLUMNS);
    const column = positionOnPage % COLUMNS;

    const x = layout.originX + column * (layout.cellWidthPt + CELL_GAP_PT);
    const y = layout.originY + row * (layout.cellHeightPt + CELL_GAP_PT);

    const imageBuffer = await loadImageForEmbedding(card.imagePath);
    // `fit` centers the image within the cell while preserving its own
    // aspect ratio without cropping, matching the binder-layout PDF's
    // identical card-image treatment.
    doc.image(imageBuffer, x, y, {
      fit: [layout.cellWidthPt, layout.cellHeightPt],
      align: 'center',
      valign: 'center',
    });

    if (card.variation) {
      const overlayY = y + layout.cellHeightPt - VARIATION_OVERLAY_HEIGHT_PT;
      doc
        .save()
        .fillOpacity(VARIATION_OVERLAY_FILL_OPACITY)
        .rect(x, overlayY, layout.cellWidthPt, VARIATION_OVERLAY_HEIGHT_PT)
        .fill(VARIATION_OVERLAY_FILL_COLOR)
        .restore();
      doc
        .fontSize(VARIATION_OVERLAY_FONT_SIZE_PT)
        .fillColor(VARIATION_OVERLAY_TEXT_COLOR)
        .text(
          card.variation,
          x + 2,
          overlayY + (VARIATION_OVERLAY_HEIGHT_PT - VARIATION_OVERLAY_FONT_SIZE_PT) / 2,
          {
            width: layout.cellWidthPt - 4,
            align: 'center',
            ellipsis: true,
            lineBreak: false,
          },
        );
    }
  }

  doc.end();
  await finished;
}
