import type { Art, Card } from '@/lib/api';

// One (row, column) cell of a multi-slot art item's (or, trivially, a
// single card's) footprint (story 26).
export interface FootprintCell {
  row: number;
  column: number;
}

// Every cell a `widthSlots`-by-`heightSlots` footprint anchored at
// (anchorRow, anchorColumn) occupies (story 26) - shared by both the
// client-side occupancy checks below and `BinderSide`'s art-overlay grid
// placement, so the same anchor-to-cells math is never duplicated.
export function getFootprintCells(
  anchorRow: number,
  anchorColumn: number,
  widthSlots: number,
  heightSlots: number,
): FootprintCell[] {
  const cells: FootprintCell[] = [];
  for (let row = anchorRow; row < anchorRow + heightSlots; row++) {
    for (let column = anchorColumn; column < anchorColumn + widthSlots; column++) {
      cells.push({ row, column });
    }
  }
  return cells;
}

// True when every cell of the given anchor+footprint fits within the
// binder's own slot grid (story 26) - a client-side mirror of the
// backend's own `validateArtPlacement` bounds check, used to reject an
// out-of-bounds destination before ever sending a request.
export function isFootprintInBounds(
  anchorRow: number,
  anchorColumn: number,
  widthSlots: number,
  heightSlots: number,
  binderWidth: number,
  binderHeight: number,
): boolean {
  return (
    anchorRow >= 1 &&
    anchorColumn >= 1 &&
    anchorRow + heightSlots - 1 <= binderHeight &&
    anchorColumn + widthSlots - 1 <= binderWidth
  );
}

// True when the given footprint on `physicalPage` overlaps any existing
// card or other art item - a client-side mirror of the backend's own
// occupancy check (story 26). `excludeArtId` omits the art item currently
// being moved from the "other art" half of the check, so an item doesn't
// block its own footprint while it's still shown at its old placement.
// Used both to silently cancel an art drop the client already knows is
// blocked (`BinderRouteContext.moveArt`) and to live-highlight a drag's
// candidate destination as blocked before it's ever dropped
// (`BinderLayoutView`'s `onDragOver`).
export function isFootprintBlocked(
  cards: Card[],
  art: Art[],
  physicalPage: number,
  cells: FootprintCell[],
  excludeArtId?: string,
): boolean {
  const blockedByCard = cards.some(
    (card) =>
      card.placement.physicalPage === physicalPage &&
      cells.some(
        (cell) => cell.row === card.placement.row && cell.column === card.placement.column,
      ),
  );
  if (blockedByCard) return true;

  return art.some((item) => {
    if (item.id === excludeArtId || item.placement.physicalPage !== physicalPage) return false;
    const { row, column } = item.placement;
    if (row === null || column === null) return false;
    const itemCells = getFootprintCells(row, column, item.widthSlots, item.heightSlots);
    return itemCells.some((itemCell) =>
      cells.some((cell) => cell.row === itemCell.row && cell.column === itemCell.column),
    );
  });
}
