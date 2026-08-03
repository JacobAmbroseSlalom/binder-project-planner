// Story 30's deterministic rectangle-packing heuristic for the multi-slot-art
// print export. Pure, PDFKit-free geometry logic (all dimensions in inches)
// so it can be reasoned about and exercised independently of PDF rendering;
// `artPrintPdf.ts` consumes this module's output to actually draw pages.
//
// Documented heuristic: Guillotine First-Fit Decreasing Height, using a
// Shorter-Leftover-Axis Split (guillotine-FFDH-SLAS) - a standard,
// deterministic 2D bin-packing approximation - planning.md explicitly
// doesn't require a mathematically optimal arrangement, only "a documented
// deterministic rectangle-packing heuristic that prioritizes fewer pages
// and then lower unused area."
//
// Every rectangle to place - including each tile of an oversized piece of
// art - is treated uniformly by one shared packing pass:
//   1. A piece of art that already fits one page (in either orientation) is
//      placed as-is, preferring its unrotated orientation and rotating 90
//      degrees only when that's required for it to fit at all.
//   2. A piece of art that fits one page in NEITHER orientation is first
//      sliced into a grid of tile rectangles, each sized to fit one page
//      and overlapping its neighbors by the configured tile-overlap amount
//      so the printed tiles can be trimmed and reassembled by hand.
//   3. Every resulting rectangle (whole art pieces plus every oversized
//      piece's individual tiles) is packed together in one shelf-packing
//      pass across as many pages as needed.
// Because a full-size tile already consumes an entire page's usable area,
// nothing else can share its page - but a smaller, partial tile (the last
// row/column of an oversized piece's grid) naturally leaves room for the
// shelf packer to place other, smaller art beside it on the same page,
// satisfying "other art may be packed into unused regions of a tiled page"
// as an emergent property of packing every rectangle through the same pass,
// rather than as a hand-written special case.
//
// Determinism: the input `items` array is first sorted by ascending art
// UUID (never trusting the caller's/database's own row order), then every
// expanded rectangle (whole pieces and tiles alike) is sorted by decreasing
// height, then decreasing width, then - for exact ties - the stable sort's
// preserved relative order, which is itself derived only from each
// oversized piece's own deterministic row-major tile generation. The result
// therefore depends only on the set of selected art and the page/gap/
// overlap configuration, never on submission or database-query order
// (planning.md: "the packing result is deterministic for the same export
// snapshot and configuration").
//
// Guillotine packing: every page tracks the list of still-open rectangular
// regions ("free rectangles") within its usable area, starting with one
// free rectangle covering the whole page. Each rectangle is placed into
// the FIRST free rectangle (earliest page, then earliest free rectangle
// within that page, in creation order) it fits into; that free rectangle
// is then replaced by up to two smaller free rectangles covering whatever
// of it the placed rectangle didn't use (a "guillotine" cut, named for
// dividing the leftover space into two non-overlapping pieces with a
// single straight cut). The cut runs along whichever of the leftover
// rectangle's two axes has less room left over (Shorter-Leftover-Axis
// Split), which keeps the other, larger leftover region contiguous and
// available for later, still-unplaced rectangles. This is what lets a
// later, smaller rectangle backfill space left over BENEATH an earlier,
// shorter rectangle that shares a row with a taller one - space a
// shelf-only packer can never reclaim, because a shelf's height is fixed
// by its tallest rectangle and nothing else may start a new row inside
// that same shelf.

export interface PackingConfig {
  usableWidthIn: number;
  usableHeightIn: number;
  gapIn: number;
  tileOverlapIn: number;
}

// One selected piece of art's physical size (the complete outside edge of
// its bordered frame, in inches) to be packed.
export interface ArtPrintItem {
  id: string;
  widthIn: number;
  heightIn: number;
}

// One whole (non-tiled) piece of art's resolved position and orientation.
export interface PlacedArtRect {
  kind: 'whole';
  id: string;
  page: number;
  x: number;
  y: number;
  widthIn: number;
  heightIn: number;
  rotated: boolean;
}

// One tile of an oversized piece of art's resolved position, plus which
// window of the art's own full (oriented) frame it depicts - `sourceX`/
// `sourceY`/the placement's own `widthIn`/`heightIn` together describe an
// axis-aligned rectangle within the complete composed art frame (after any
// whole-item rotation), for the renderer to clip and translate against.
export interface PlacedArtTileRect {
  kind: 'tile';
  id: string;
  page: number;
  x: number;
  y: number;
  widthIn: number;
  heightIn: number;
  rotated: boolean;
  tileRow: number;
  tileCol: number;
  tileRows: number;
  tileCols: number;
  sourceX: number;
  sourceY: number;
}

export type PlacedRect = PlacedArtRect | PlacedArtTileRect;

export interface PackResult {
  pageCount: number;
  placements: PlacedRect[];
}

// The internal, not-yet-positioned rectangle shape shared by whole items
// and tiles alike before the shelf-packing pass assigns a page/x/y.
interface Rectangle {
  id: string;
  widthIn: number;
  heightIn: number;
  rotated: boolean;
  tile?: {
    tileRow: number;
    tileCol: number;
    tileRows: number;
    tileCols: number;
    sourceX: number;
    sourceY: number;
  };
}

const EPSILON_IN = 1e-9;

function fitsOnPage(widthIn: number, heightIn: number, config: PackingConfig): boolean {
  return (
    widthIn <= config.usableWidthIn + EPSILON_IN && heightIn <= config.usableHeightIn + EPSILON_IN
  );
}

// Chooses the orientation for a whole piece of art that already fits one
// page in at least one orientation. Prefers the unrotated orientation,
// rotating only when the unrotated orientation doesn't fit - this simpler
// "rotate only if necessary" rule (rather than always choosing whichever
// orientation minimizes height) is what allows the documented default-size
// scenarios (two 2x2, four 2x1, or eight 1x1 pieces of art all fitting on
// one page) to actually pack that tightly: opportunistically rotating
// every item to minimize its own height reduces how many identically-sized
// items fit per shelf row for the app's default (taller-than-wide) slot
// aspect ratio.
function chooseWholeOrientation(
  item: ArtPrintItem,
  config: PackingConfig,
): { widthIn: number; heightIn: number; rotated: boolean } {
  if (fitsOnPage(item.widthIn, item.heightIn, config)) {
    return { widthIn: item.widthIn, heightIn: item.heightIn, rotated: false };
  }
  return { widthIn: item.heightIn, heightIn: item.widthIn, rotated: true };
}

// Splits one axis's full size into a deterministic sequence of tile sizes:
// every tile before the last is the full usable page dimension, and
// consecutive tiles overlap by the configured tile-overlap amount; the
// final tile is sized down to the exact remainder so the tiles'
// reconstructed content exactly reaches the art's full physical size.
function planTileAxis(sizeIn: number, usableIn: number, tileOverlapIn: number): number[] {
  if (sizeIn <= usableIn + EPSILON_IN) return [sizeIn];

  const stride = usableIn - tileOverlapIn;
  const tileCount = Math.ceil((sizeIn - tileOverlapIn) / stride);
  const sizes: number[] = [];
  for (let index = 0; index < tileCount; index++) {
    const start = index * stride;
    sizes.push(index === tileCount - 1 ? sizeIn - start : usableIn);
  }
  return sizes;
}

// Slices one oversized piece of art (fits one page in NEITHER orientation)
// into a grid of overlapping tile rectangles at exact scale. Chooses
// whichever orientation (unrotated or rotated 90 degrees) needs fewer total
// tiles, tying toward the unrotated orientation.
function tileOversizedItem(item: ArtPrintItem, config: PackingConfig): Rectangle[] {
  function plan(widthIn: number, heightIn: number) {
    const colSizes = planTileAxis(widthIn, config.usableWidthIn, config.tileOverlapIn);
    const rowSizes = planTileAxis(heightIn, config.usableHeightIn, config.tileOverlapIn);
    return { colSizes, rowSizes, totalTiles: colSizes.length * rowSizes.length };
  }

  const unrotatedPlan = plan(item.widthIn, item.heightIn);
  const rotatedPlan = plan(item.heightIn, item.widthIn);
  const rotated = rotatedPlan.totalTiles < unrotatedPlan.totalTiles;
  const chosen = rotated ? rotatedPlan : unrotatedPlan;

  const strideX = config.usableWidthIn - config.tileOverlapIn;
  const strideY = config.usableHeightIn - config.tileOverlapIn;

  const tiles: Rectangle[] = [];
  for (let tileRow = 0; tileRow < chosen.rowSizes.length; tileRow++) {
    for (let tileCol = 0; tileCol < chosen.colSizes.length; tileCol++) {
      // Non-null: `tileCol`/`tileRow` are always in-bounds indices derived
      // from these same arrays' own lengths above.
      const widthIn = chosen.colSizes[tileCol]!;
      const heightIn = chosen.rowSizes[tileRow]!;
      tiles.push({
        id: item.id,
        widthIn,
        heightIn,
        rotated,
        tile: {
          tileRow,
          tileCol,
          tileRows: chosen.rowSizes.length,
          tileCols: chosen.colSizes.length,
          sourceX: tileCol * strideX,
          sourceY: tileRow * strideY,
        },
      });
    }
  }
  return tiles;
}

// One rectangular region of a page's usable area not yet occupied by any
// placed rectangle. A page's free rectangles are always pairwise
// non-overlapping - each guillotine cut divides one free rectangle into up
// to two smaller ones that exactly tile its leftover space, so this
// invariant holds inductively from the single full-page free rectangle a
// new page starts with.
interface FreeRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

// Runs the packing pass over an already-expanded, already-sorted list of
// rectangles, assigning each one a page and top-left position. See this
// module's top-of-file "Guillotine packing" comment for the full algorithm.
function packRectangles(rectangles: readonly Rectangle[], config: PackingConfig): PlacedRect[] {
  const placements: PlacedRect[] = [];
  // Every page's own free-rectangle list, in creation order; a page is
  // only appended here once some rectangle actually needs it.
  const pagesFreeRects: FreeRect[][] = [];

  for (const rect of rectangles) {
    let page = -1;
    let freeRectIndex = -1;

    // First-fit search across every existing page (in order), then every
    // free rectangle on that page (in creation order), for the first one
    // with enough width AND height for this rectangle.
    pageSearch: for (
      let candidatePage = 0;
      candidatePage < pagesFreeRects.length;
      candidatePage++
    ) {
      const freeRects = pagesFreeRects[candidatePage]!;
      for (let index = 0; index < freeRects.length; index++) {
        const freeRect = freeRects[index]!;
        if (
          rect.widthIn <= freeRect.width + EPSILON_IN &&
          rect.heightIn <= freeRect.height + EPSILON_IN
        ) {
          page = candidatePage;
          freeRectIndex = index;
          break pageSearch;
        }
      }
    }

    if (page === -1) {
      // No existing page had room - start a brand new page, which always
      // has room since every rectangle here was already confirmed to fit
      // one full page (whole items chose a fitting orientation; oversized
      // items were tiled down to page-sized pieces).
      page = pagesFreeRects.length;
      pagesFreeRects.push([
        { x: 0, y: 0, width: config.usableWidthIn, height: config.usableHeightIn },
      ]);
      freeRectIndex = 0;
    }

    const freeRects = pagesFreeRects[page]!;
    // Non-null: `freeRectIndex` was just set to a valid index into this
    // same array, either by the search above or by the fresh page just
    // pushed.
    const freeRect = freeRects[freeRectIndex]!;
    freeRects.splice(freeRectIndex, 1);

    const leftoverWidth = freeRect.width - rect.widthIn - config.gapIn;
    const leftoverHeight = freeRect.height - rect.heightIn - config.gapIn;

    // Shorter-Leftover-Axis Split: cut along whichever axis has less
    // leftover room, so the other (larger) leftover region stays
    // contiguous and full-sized for later rectangles rather than being
    // sliced into a narrow sliver by this split.
    if (leftoverWidth <= leftoverHeight) {
      // Horizontal cut: the region below the placed rectangle spans the
      // free rectangle's full width; the region beside it only spans the
      // placed rectangle's own height.
      if (leftoverHeight > EPSILON_IN) {
        freeRects.push({
          x: freeRect.x,
          y: freeRect.y + rect.heightIn + config.gapIn,
          width: freeRect.width,
          height: leftoverHeight,
        });
      }
      if (leftoverWidth > EPSILON_IN) {
        freeRects.push({
          x: freeRect.x + rect.widthIn + config.gapIn,
          y: freeRect.y,
          width: leftoverWidth,
          height: rect.heightIn,
        });
      }
    } else {
      // Vertical cut: the region beside the placed rectangle spans the
      // free rectangle's full height; the region below it only spans the
      // placed rectangle's own width.
      if (leftoverWidth > EPSILON_IN) {
        freeRects.push({
          x: freeRect.x + rect.widthIn + config.gapIn,
          y: freeRect.y,
          width: leftoverWidth,
          height: freeRect.height,
        });
      }
      if (leftoverHeight > EPSILON_IN) {
        freeRects.push({
          x: freeRect.x,
          y: freeRect.y + rect.heightIn + config.gapIn,
          width: rect.widthIn,
          height: leftoverHeight,
        });
      }
    }

    placements.push(
      rect.tile
        ? {
            kind: 'tile',
            id: rect.id,
            page,
            x: freeRect.x,
            y: freeRect.y,
            widthIn: rect.widthIn,
            heightIn: rect.heightIn,
            rotated: rect.rotated,
            tileRow: rect.tile.tileRow,
            tileCol: rect.tile.tileCol,
            tileRows: rect.tile.tileRows,
            tileCols: rect.tile.tileCols,
            sourceX: rect.tile.sourceX,
            sourceY: rect.tile.sourceY,
          }
        : {
            kind: 'whole',
            id: rect.id,
            page,
            x: freeRect.x,
            y: freeRect.y,
            widthIn: rect.widthIn,
            heightIn: rect.heightIn,
            rotated: rect.rotated,
          },
    );
  }

  return placements;
}

// Packs every selected piece of art into as few US Letter landscape pages
// as possible, tiling any piece too large for one page in either
// orientation. See this module's top-of-file comment for the full
// documented heuristic.
export function packArtForPrint(items: readonly ArtPrintItem[], config: PackingConfig): PackResult {
  // Never trusts the caller's/database's own row order - sorting by id
  // first keeps the final packing fully deterministic regardless of it.
  const orderedItems = [...items].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));

  const rectangles: Rectangle[] = [];
  for (const item of orderedItems) {
    const fitsWhole =
      fitsOnPage(item.widthIn, item.heightIn, config) ||
      fitsOnPage(item.heightIn, item.widthIn, config);
    if (fitsWhole) {
      rectangles.push({ id: item.id, ...chooseWholeOrientation(item, config) });
    } else {
      rectangles.push(...tileOversizedItem(item, config));
    }
  }

  // Decreasing height, then decreasing width; exact ties keep their
  // current (already-deterministic) relative order via the stable sort.
  rectangles.sort((a, b) => {
    if (a.heightIn !== b.heightIn) return b.heightIn - a.heightIn;
    return b.widthIn - a.widthIn;
  });

  const placements = packRectangles(rectangles, config);
  const pageCount =
    placements.length === 0 ? 0 : Math.max(...placements.map((placement) => placement.page)) + 1;

  return { pageCount, placements };
}
