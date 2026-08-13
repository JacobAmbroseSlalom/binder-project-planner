import { Copy, Pencil, Trash2 } from 'lucide-react';

import { Tooltip } from '@/shared/feedback';

// The 3 hover-revealed art actions (story 26: "hover actions (edit,
// delete, duplicate) on multi-slot art") shared by `PlacedArtTile` (art on
// the binder layout) and `UnplacedArt` (art in the unplaced-art section) -
// extracted once both call sites turned out to need the identical
// full-width button bar, differing only in their aria-labels and which
// art item's id/title they act on. Styled as the same full-width grey bar
// across the tile's top edge that `CardTile`'s hover actions use.
export function ArtActionsOverlay({
  title,
  isEditDisabled,
  isDeleteDisabled,
  isDuplicateDisabled,
  onEdit,
  onDelete,
  onDuplicate,
}: {
  // The art item's own title, interpolated into each action's aria-label.
  title: string;
  isEditDisabled: boolean;
  isDeleteDisabled: boolean;
  isDuplicateDisabled: boolean;
  onEdit: () => void;
  onDelete: () => void;
  onDuplicate: () => void;
}) {
  return (
    <div className="pointer-events-none absolute inset-x-0 top-0 z-10 flex -translate-y-1 items-center justify-evenly rounded-t-standard bg-black/60 px-1 py-1 opacity-0 transition-all duration-150 ease-out group-hover:pointer-events-auto group-hover:translate-y-0 group-hover:opacity-100">
      <Tooltip label="Edit art">
        <button
          type="button"
          disabled={isEditDisabled}
          onClick={onEdit}
          aria-label={`Edit ${title}`}
          className="flex size-6 cursor-pointer items-center justify-center rounded-standard text-neutral-100 hover:bg-neutral-600 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Pencil className="size-3.5" aria-hidden="true" />
        </button>
      </Tooltip>
      <Tooltip label="Duplicate art">
        <button
          type="button"
          disabled={isDuplicateDisabled}
          onClick={onDuplicate}
          aria-label={`Duplicate ${title}`}
          className="flex size-6 cursor-pointer items-center justify-center rounded-standard text-neutral-100 hover:bg-neutral-600 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Copy className="size-3.5" aria-hidden="true" />
        </button>
      </Tooltip>
      <Tooltip label="Delete art">
        <button
          type="button"
          disabled={isDeleteDisabled}
          onClick={onDelete}
          aria-label={`Delete ${title}`}
          className="flex size-6 cursor-pointer items-center justify-center rounded-standard text-neutral-100 hover:bg-neutral-600 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Trash2 className="size-3.5" aria-hidden="true" />
        </button>
      </Tooltip>
    </div>
  );
}
