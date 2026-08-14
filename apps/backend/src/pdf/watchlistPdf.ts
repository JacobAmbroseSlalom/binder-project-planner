import { createWriteStream } from 'node:fs';

import PDFDocument from 'pdfkit';

import { loadImageForEmbedding } from './binderLayoutPdf.js';

// Story 45's "What I'm Looking For" print/export PDF generator produces a
// fixed 2-page, US Letter **portrait** PDF (breaking from every other PDF
// export's landscape convention, per the story's explicit request):
// page 1 packs every included entry's card image onto a single page at a
// fixed card size (never shrunk), overlapping adjacent rows by up to half
// a card's height once needed so every entry fits without adding further
// image pages; page 2 repeats the exact same grid positions with each
// entry's name (bold), set/number, and price as text instead of an
// image, so the two pages can be read side by side or back to back.
const POINTS_PER_INCH = 72;
const PAGE_WIDTH_PT = 8.5 * POINTS_PER_INCH;
const PAGE_HEIGHT_PT = 11 * POINTS_PER_INCH;
// The same 0.25 inch page-margin convention as the other PDF exports.
const PAGE_MARGIN_PT = 0.25 * POINTS_PER_INCH;
// Every page's grid is always exactly this many columns wide, spanning
// the full printable width (page width minus the left/right margins)
// with no gap between cards - the page's own margin is the only
// whitespace bordering the grid. A card's width is therefore fixed,
// derived once here rather than shrunk per export based on entry count.
const CARD_COLUMNS = 5;
const CARD_WIDTH_PT = (PAGE_WIDTH_PT - 2 * PAGE_MARGIN_PT) / CARD_COLUMNS;
// Height is derived from the fixed width above using the standard
// physical trading-card aspect ratio (2.5 x 3.5 in), rather than picked
// independently, so a rendered card's proportions always match a real
// card regardless of this page's fixed column width.
const CARD_HEIGHT_PT = CARD_WIDTH_PT * (3.5 / 2.5);
// The story's fixed cap on how much of the card behind a later row may
// cover ("up to the bottom half") - rows never overlap by more than this
// fraction of the card's fixed height, the only remaining degree of
// freedom now that the card's own size no longer shrinks.
const MAX_ROW_OVERLAP_FRACTION = 0.5;

// Page 1's variation label, drawn as a small badge in the top-right
// corner of a card's own image when it has one - unlike the binder
// layout PDF's full-width bottom-edge overlay (`binderLayoutPdf.ts`),
// this badge is sized to fit its own text (capped to the card's width)
// rather than spanning the whole card, since this page's cards are
// already tightly packed edge to edge with no gap for a full-width bar
// to stand out against.
const VARIATION_BADGE_HEIGHT_PT = 14;
const VARIATION_BADGE_MARGIN_PT = 3;
const VARIATION_BADGE_PADDING_X_PT = 4;
const VARIATION_BADGE_FILL_COLOR = '#000000';
const VARIATION_BADGE_FILL_OPACITY = 0.6;
const VARIATION_BADGE_TEXT_COLOR = '#FFFFFF';
const VARIATION_BADGE_FONT_SIZE_PT = 9;

// Page 2's name/set-number/variation/price text sizing - a fixed
// single-line box for each line (an overlong value is ellipsized on that
// one line rather than wrapping to a second, which would otherwise either
// leave unused space above the next line for the common case of a value
// that fits on one, or - left completely unbounded - visually overlap the
// next line below it). Every entry reserves the same fixed set of lines
// regardless of its own content (a blank line prints nothing, matching
// `formatSetAndNumber`/`formatPrice`'s own "blank rather than a
// placeholder" convention), so the block's total height - and therefore
// its vertical centering within the card - never varies entry to entry.
const NAME_FONT_SIZE_PT = 10;
const NAME_LINE_HEIGHT_PT = 12;
const NAME_BOX_HEIGHT_PT = NAME_LINE_HEIGHT_PT;
const SET_NUMBER_FONT_SIZE_PT = 9;
const SET_NUMBER_LINE_HEIGHT_PT = 11;
const VARIATION_FONT_SIZE_PT = 9;
const VARIATION_LINE_HEIGHT_PT = 11;
const PRICE_FONT_SIZE_PT = 10;
const PRICE_LINE_HEIGHT_PT = 12;
const TEXT_BLOCK_GAP_PT = 2;
// The name box, the set/number line, the variation line, and the price
// line, plus a gap between each - used to center the whole block within
// the card's fixed height below, rather than anchoring it to the cell's
// top edge like the page 1 image.
const TEXT_BLOCK_HEIGHT_PT =
  NAME_BOX_HEIGHT_PT +
  TEXT_BLOCK_GAP_PT +
  SET_NUMBER_LINE_HEIGHT_PT +
  TEXT_BLOCK_GAP_PT +
  VARIATION_LINE_HEIGHT_PT +
  TEXT_BLOCK_GAP_PT +
  PRICE_LINE_HEIGHT_PT;

export interface WatchlistPdfEntryInput {
  // The fields page 1 (image, plus a variation overlay when present) and
  // page 2 (name + set/number + variation + price text) render - matching
  // the story's PDF export requirements plus the variation label already
  // shown elsewhere for a card; acquisition never appears here.
  name: string;
  setName: string | null;
  localNumber: string | null;
  variation: string | null;
  price: number | null;
  imagePath: string;
}

export interface GenerateWatchlistPdfOptions {
  outputPath: string;
  // Already in the caller-resolved (filtered, then manually-ordered-or-
  // column-sorted) order to render, matching
  // `GenerateCardsListPdfOptions`'s own pre-resolved-order convention.
  entries: readonly WatchlistPdfEntryInput[];
}

interface WatchlistPdfLayout {
  // Every entry's top-left position, in submitted order - shared as-is
  // between page 1 (image) and page 2 (text), per the story's "page 2
  // repeats the same grid position as page 1" requirement.
  positions: readonly { x: number; y: number }[];
}

// Solves for how much (if any) adjacent rows must vertically overlap -
// capped at `MAX_ROW_OVERLAP_FRACTION` of the card's fixed height - so
// `count` entries, laid out `CARD_COLUMNS` wide at that fixed nominal
// size, still fit within `contentHeight`. Unlike the width dimension
// (which always fits exactly across the page by construction, see
// `CARD_WIDTH_PT`), row overlap is the only remaining degree of freedom
// for fitting every entry onto page 1, since cards themselves are never
// resized.
function computeWatchlistPageLayout(count: number, contentHeight: number): WatchlistPdfLayout {
  const rows = Math.ceil(count / CARD_COLUMNS);

  // Falls back to the card's own height (no overlap at all) whenever
  // `rows` comfortably fit `contentHeight` at that spacing; only
  // compresses (overlapping) below that once they don't - clamped so the
  // resulting overlap never exceeds the story's cap even if `rows` would
  // otherwise need more than that to fit.
  const rowStep =
    rows > 1
      ? Math.max(
          CARD_HEIGHT_PT * (1 - MAX_ROW_OVERLAP_FRACTION),
          Math.min(CARD_HEIGHT_PT, (contentHeight - CARD_HEIGHT_PT) / (rows - 1)),
        )
      : 0;

  const positions = Array.from({ length: count }, (_, index) => ({
    x: PAGE_MARGIN_PT + (index % CARD_COLUMNS) * CARD_WIDTH_PT,
    y: PAGE_MARGIN_PT + Math.floor(index / CARD_COLUMNS) * rowStep,
  }));

  return { positions };
}

// Formats a price the same way the frontend's shared currency display
// does (`$` plus two decimal places); a blank string prints nothing for an
// entry with no price on file yet.
function formatPrice(price: number | null): string {
  return price === null ? '' : `$${price.toFixed(2)}`;
}

// Combines set name and local number the same way `CardsFinanceSection`
// displays them on the frontend, but collapsing entirely (rather than
// printing an em dash placeholder) when a field is missing, since a blank
// PDF line reads more cleanly than a lone dash for a standalone entry
// that never had a set/number to begin with.
function formatSetAndNumber(setName: string | null, localNumber: string | null): string {
  if (setName && localNumber) return `${setName} · #${localNumber}`;
  if (setName) return setName;
  if (localNumber) return `#${localNumber}`;
  return '';
}

// Same as `formatSetAndNumber`, but when the combined line doesn't fit
// `maxWidthPt` (measured against `doc`'s current font/size, which the
// caller must already have set), shortens only the set name and keeps the
// " · #localNumber" suffix intact. PDFKit's own built-in `ellipsis`
// truncates whatever doesn't fit off the *end* of the whole string, which
// cut off the local number entirely whenever the set name alone was
// already long enough to fill the line - the local number identifies the
// exact print and is the more useful of the two to keep visible.
function formatSetAndNumberForWidth(
  doc: PDFKit.PDFDocument,
  setName: string | null,
  localNumber: string | null,
  maxWidthPt: number,
): string {
  const full = formatSetAndNumber(setName, localNumber);
  if (doc.widthOfString(full) <= maxWidthPt) return full;

  // A lone set name or lone local number has no separate suffix to
  // protect, so it falls through to the `.text()` call's own `ellipsis`
  // fallback below.
  if (!setName || !localNumber) return full;

  const suffix = ` · #${localNumber}`;
  let truncatedSetName = setName;
  while (
    truncatedSetName.length > 0 &&
    doc.widthOfString(`${truncatedSetName}…${suffix}`) > maxWidthPt
  ) {
    truncatedSetName = truncatedSetName.slice(0, -1);
  }
  // Falls back to the local number alone (still fully visible) in the
  // pathological case where even a single set-name character doesn't fit
  // alongside it.
  return truncatedSetName.length > 0 ? `${truncatedSetName}…${suffix}` : `#${localNumber}`;
}

// Generates the complete What I'm Looking For PDF into `outputPath` (a
// request-scoped temporary file, matching the other PDF exports' own
// "finishes generation in a request-scoped temporary file before sending
// response headers" convention). Rejects with a `PdfGenerationError` (or
// lets an unexpected error propagate) on any failure; the caller is
// responsible for removing a partially written file in that case.
export async function generateWatchlistPdf({
  outputPath,
  entries,
}: GenerateWatchlistPdfOptions): Promise<void> {
  const contentHeight = PAGE_HEIGHT_PT - 2 * PAGE_MARGIN_PT;
  const layout = computeWatchlistPageLayout(entries.length, contentHeight);

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

  // Page 1: every entry's card image, in submitted order - later entries
  // draw on top of earlier ones, so a row forced to overlap the row above
  // it (see `computeWatchlistPageLayout`) covers that earlier row's
  // bottom edge, matching the story's "covering up to the bottom half of
  // the card behind". Omitting `valign` anchors each image to its cell's
  // own top edge (PDFKit's default, rather than centering it within any
  // leftover space `fit` leaves for a non-2.5:3.5 source image), keeping
  // the intended overlap consistent regardless of a given card image's
  // own aspect ratio.
  doc.addPage();
  for (const [index, entry] of entries.entries()) {
    const { x, y } = layout.positions[index]!;
    const imageBuffer = await loadImageForEmbedding(entry.imagePath);
    doc.image(imageBuffer, x, y, {
      fit: [CARD_WIDTH_PT, CARD_HEIGHT_PT],
      align: 'center',
    });

    // A small top-right badge with this entry's variation, drawn only
    // when it actually has one, over a translucent fill so it stays
    // legible regardless of the card image's own colors beneath it. The
    // badge's own width is measured from its text (rather than fixed),
    // capped to the card's width so an overlong value still ellipsizes
    // instead of overflowing past the card's edges.
    if (entry.variation) {
      doc.font('Helvetica').fontSize(VARIATION_BADGE_FONT_SIZE_PT);
      const maxTextWidth =
        CARD_WIDTH_PT - VARIATION_BADGE_MARGIN_PT * 2 - VARIATION_BADGE_PADDING_X_PT * 2;
      const textWidth = Math.min(doc.widthOfString(entry.variation), maxTextWidth);
      const badgeWidth = textWidth + VARIATION_BADGE_PADDING_X_PT * 2;
      const badgeX = x + CARD_WIDTH_PT - VARIATION_BADGE_MARGIN_PT - badgeWidth;
      const badgeY = y + VARIATION_BADGE_MARGIN_PT;
      doc
        .save()
        .fillOpacity(VARIATION_BADGE_FILL_OPACITY)
        .rect(badgeX, badgeY, badgeWidth, VARIATION_BADGE_HEIGHT_PT)
        .fill(VARIATION_BADGE_FILL_COLOR)
        .restore();
      doc
        .fillColor(VARIATION_BADGE_TEXT_COLOR)
        .text(
          entry.variation,
          badgeX,
          badgeY + (VARIATION_BADGE_HEIGHT_PT - VARIATION_BADGE_FONT_SIZE_PT) / 2,
          {
            width: badgeWidth,
            height: VARIATION_BADGE_FONT_SIZE_PT,
            align: 'center',
            ellipsis: true,
          },
        );
    }
  }

  // Page 2: the same grid positions as page 1, with each entry's name
  // (bold, to stand out as the primary identifier), set/number, variation,
  // and price as text instead of an image, per the story's requirement
  // that the two pages be readable side by side or back to back. The
  // whole text block is vertically centered within the card's fixed
  // height (rather than anchored to its top edge, like the page 1 image)
  // so it sits where the card itself would be. Every line's box height is
  // fixed (rather than measured) and every `.text()` call below passes
  // that same fixed `height` with `ellipsis: true`, so an overlong value
  // on any line is clipped and ellipsized in place instead of wrapping
  // into - and visually overlapping - the line below it.
  doc.addPage();
  for (const [index, entry] of entries.entries()) {
    const { x, y } = layout.positions[index]!;
    const textY = y + (CARD_HEIGHT_PT - TEXT_BLOCK_HEIGHT_PT) / 2;
    doc
      .font('Helvetica-Bold')
      .fontSize(NAME_FONT_SIZE_PT)
      .fillColor('#000000')
      .text(entry.name, x, textY, {
        width: CARD_WIDTH_PT,
        height: NAME_BOX_HEIGHT_PT,
        align: 'center',
        ellipsis: true,
      });
    // Reset to the regular weight for the set/number, variation, and
    // price lines - `doc.font`/`doc.fillColor` persist across calls, so
    // all three would otherwise stay bold/black from the name above.
    const setNumberY = textY + NAME_BOX_HEIGHT_PT + TEXT_BLOCK_GAP_PT;
    doc.font('Helvetica').fontSize(SET_NUMBER_FONT_SIZE_PT).fillColor('#555555');
    const setAndNumberText = formatSetAndNumberForWidth(
      doc,
      entry.setName,
      entry.localNumber,
      CARD_WIDTH_PT,
    );
    doc.text(setAndNumberText, x, setNumberY, {
      width: CARD_WIDTH_PT,
      height: SET_NUMBER_LINE_HEIGHT_PT,
      align: 'center',
      ellipsis: true,
    });
    const variationY = setNumberY + SET_NUMBER_LINE_HEIGHT_PT + TEXT_BLOCK_GAP_PT;
    doc.fontSize(VARIATION_FONT_SIZE_PT).text(entry.variation ?? '', x, variationY, {
      width: CARD_WIDTH_PT,
      height: VARIATION_LINE_HEIGHT_PT,
      align: 'center',
      ellipsis: true,
    });
    doc
      .fillColor('#000000')
      .fontSize(PRICE_FONT_SIZE_PT)
      .text(
        formatPrice(entry.price),
        x,
        variationY + VARIATION_LINE_HEIGHT_PT + TEXT_BLOCK_GAP_PT,
        {
          width: CARD_WIDTH_PT,
          height: PRICE_LINE_HEIGHT_PT,
          align: 'center',
          ellipsis: true,
        },
      );
  }

  doc.end();
  await finished;
}
