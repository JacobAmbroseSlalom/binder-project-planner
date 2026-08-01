// Pure Michi-slot-indicator math for the "Edit Layout" tab (story 10). Kept
// framework-free and colocated with the layout route, alongside
// `layoutSpread.ts`.
//
// A "Michi indicator" marks a gap between two adjacent columns whose slot
// openings face each other, letting a collector understand which slots
// across a spread pair up as one physical "pocket". On each binder side,
// columns are paired from the outer edge (farthest from the spine) toward
// the spine; an odd binder width leaves the column nearest the spine
// unpaired. The right side is the left side's mirror image: its outer edge
// is its rightmost column, and its spine-nearest column is its leftmost.
//
// Because pairing never crosses the spine, every gap is entirely local to
// one binder side - this function only needs that side's own width and
// which side it is, not the complete spread. `BinderSide` (the component
// that renders one side's slot grid) calls this directly with its own
// `width`/`side` props.
export type BinderSideName = 'left' | 'right';

// Returns the local (1-indexed, left-to-right within this side) column
// numbers that sit immediately before a Michi-indicator gap, i.e. each
// returned `n` means an indicator belongs between columns `n` and `n + 1`.
export function getMichiGapColumns(width: number, side: BinderSideName): number[] {
  const gapColumns: number[] = [];

  // `position` walks outward-to-inward in twos, starting at the outer edge
  // (position 1). Stopping once `position + 1 > width` naturally leaves an
  // odd width's innermost (spine-nearest) position unpaired.
  for (let position = 1; position + 1 <= width; position += 2) {
    // For the left side, position counts up from the leftmost column
    // (position 1 = column 1). For the right side it's mirrored: position 1
    // = the rightmost column, counting down toward the spine.
    const firstColumn = side === 'left' ? position : width - position + 1;
    const secondColumn = side === 'left' ? position + 1 : width - position;
    gapColumns.push(Math.min(firstColumn, secondColumn));
  }

  return gapColumns;
}
