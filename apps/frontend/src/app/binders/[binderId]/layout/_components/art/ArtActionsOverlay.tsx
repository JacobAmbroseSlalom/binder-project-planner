import { Copy, Pencil, Trash2 } from 'lucide-react';

// The 3 hover-revealed art actions (story 26: "hover actions (edit,
// delete, duplicate) on multi-slot art") shared by `PlacedArtTile` (art on
// the binder layout) and `UnplacedArt` (art in the unplaced-art section) -
// extracted once both call sites turned out to need the identical
// top-right button cluster, differing only in their aria-labels and which
// art item's id/title they act on. Mirrors `CardTile`'s own single-action
// hover-reveal pattern, extended to 3 actions.
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
    <div className="pointer-events-none absolute top-0 right-0 z-10 flex -translate-y-1 translate-x-1 gap-1 opacity-0 transition-all duration-150 ease-out group-hover:pointer-events-auto group-hover:translate-x-0 group-hover:translate-y-0 group-hover:opacity-100">
      <button
        type="button"
        disabled={isEditDisabled}
        onClick={onEdit}
        aria-label={`Edit ${title}`}
        title="Edit art"
        className="flex size-6 cursor-pointer items-center justify-center rounded-standard bg-neutral-700 text-neutral-100 hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
      >
        <Pencil className="size-3.5" aria-hidden="true" />
      </button>
      <button
        type="button"
        disabled={isDuplicateDisabled}
        onClick={onDuplicate}
        aria-label={`Duplicate ${title}`}
        title="Duplicate art"
        className="flex size-6 cursor-pointer items-center justify-center rounded-standard bg-neutral-700 text-neutral-100 hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
      >
        <Copy className="size-3.5" aria-hidden="true" />
      </button>
      <button
        type="button"
        disabled={isDeleteDisabled}
        onClick={onDelete}
        aria-label={`Delete ${title}`}
        title="Delete art"
        className="flex size-6 cursor-pointer items-center justify-center rounded-standard bg-neutral-700 text-neutral-100 hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
      >
        <Trash2 className="size-3.5" aria-hidden="true" />
      </button>
    </div>
  );
}
