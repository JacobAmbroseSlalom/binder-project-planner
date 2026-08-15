'use client';

import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical } from 'lucide-react';

// Story 52's PDF export divider row's sentinel id - never a real entry's
// id, so it's safely distinguishable within the combined drag-and-drop
// row order alongside every entry id.
export const PDF_EXPORT_DIVIDER_ROW_ID = '__pdf_export_divider__';

// Story 52's PDF export divider, a real sortable row (rather than a
// fixed, informational-only line) - only rendered while `canReorder` is
// true (no active column sort/search/filter), since its position only has
// meaning against the full, persisted-order list. Uses `useSortable` (not
// bare `useDraggable`/`useDroppable`) so it participates in the same
// animated repositioning as every entry row when something is dragged
// past it. Extracted out of `WatchlistEntryTable` (which was growing past
// this house-cleaning pass's line-count threshold) alongside its sentinel
// id, since both belong together.
export function DividerRow({ columnCount }: { columnCount: number }) {
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: PDF_EXPORT_DIVIDER_ROW_ID });

  return (
    // `CSS.Translate` (not `CSS.Transform`) deliberately drops the scale
    // component dnd-kit would otherwise compute from this row's rect vs.
    // the dragged row's rect - this divider row's single full-width
    // `colSpan` cell has a very different shape than a normal entry row,
    // so a scale transform here visibly stretched/skewed it.
    <tr ref={setNodeRef} style={{ transform: CSS.Translate.toString(transform), transition }}>
      <td colSpan={columnCount} className="p-0">
        <div
          ref={setActivatorNodeRef}
          {...attributes}
          {...listeners}
          className={`flex cursor-grab items-center gap-2 border-t-2 border-secondary bg-neutral-900/50 px-2 py-1.5 text-caption text-secondary ${
            isDragging ? 'opacity-50' : ''
          }`}
        >
          <GripVertical className="size-4 shrink-0" aria-hidden="true" />
          Only cards above this line are included in the PDF export
        </div>
      </td>
    </tr>
  );
}
