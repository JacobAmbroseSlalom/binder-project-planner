import { Copy, Lock, LockOpen, Pencil, Trash2 } from 'lucide-react';

import { Tooltip } from '@/shared/feedback';

// The hover-revealed home-page binder actions (story 21: "Hovering over a
// binder in the home page list displays delete, copy, and edit actions.";
// story 32 adds the lock/unlock toggle), styled as the same full-width
// grey bar across the tile's top edge that `CardTile`'s hover actions use
// (rather than individual floating corner buttons), matching
// `ArtActionsOverlay`'s identical bar. Rendered in edit/copy/lock-toggle/
// delete order; the delete action is omitted entirely while the binder is
// locked (story 32: "The delete action is hidden from the home page hover
// actions while the binder is locked").
export function BinderActionsOverlay({
  name,
  locked,
  isEditDisabled,
  isCopyDisabled,
  isDeleteDisabled,
  isLockToggleDisabled,
  onEdit,
  onCopy,
  onDelete,
  onToggleLock,
}: {
  // The binder's own name, interpolated into each action's aria-label.
  name: string;
  locked: boolean;
  isEditDisabled: boolean;
  isCopyDisabled: boolean;
  isDeleteDisabled: boolean;
  isLockToggleDisabled: boolean;
  onEdit: () => void;
  onCopy: () => void;
  onDelete: () => void;
  onToggleLock: () => void;
}) {
  return (
    <div className="pointer-events-none absolute inset-x-0 top-0 z-10 flex -translate-y-1 items-center justify-evenly rounded-t-standard bg-black/60 px-1 py-1 opacity-0 transition-all duration-150 ease-out group-hover:pointer-events-auto group-hover:translate-y-0 group-hover:opacity-100">
      <Tooltip label="Edit binder details">
        <button
          type="button"
          disabled={isEditDisabled}
          onClick={onEdit}
          aria-label={`Edit ${name}`}
          className="flex size-6 cursor-pointer items-center justify-center rounded-standard text-neutral-100 hover:bg-neutral-600 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Pencil className="size-3.5" aria-hidden="true" />
        </button>
      </Tooltip>
      <Tooltip label="Copy binder">
        <button
          type="button"
          disabled={isCopyDisabled}
          onClick={onCopy}
          aria-label={`Copy ${name}`}
          className="flex size-6 cursor-pointer items-center justify-center rounded-standard text-neutral-100 hover:bg-neutral-600 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Copy className="size-3.5" aria-hidden="true" />
        </button>
      </Tooltip>
      <Tooltip label={locked ? 'Unlock binder' : 'Lock binder'}>
        <button
          type="button"
          disabled={isLockToggleDisabled}
          onClick={onToggleLock}
          aria-label={locked ? `Unlock ${name}` : `Lock ${name}`}
          className="flex size-6 cursor-pointer items-center justify-center rounded-standard text-neutral-100 hover:bg-neutral-600 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {locked ? (
            <LockOpen className="size-3.5" aria-hidden="true" />
          ) : (
            <Lock className="size-3.5" aria-hidden="true" />
          )}
        </button>
      </Tooltip>
      {!locked && (
        <Tooltip label="Delete binder">
          <button
            type="button"
            disabled={isDeleteDisabled}
            onClick={onDelete}
            aria-label={`Delete ${name}`}
            className="flex size-6 cursor-pointer items-center justify-center rounded-standard text-neutral-100 hover:bg-neutral-600 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Trash2 className="size-3.5" aria-hidden="true" />
          </button>
        </Tooltip>
      )}
    </div>
  );
}
