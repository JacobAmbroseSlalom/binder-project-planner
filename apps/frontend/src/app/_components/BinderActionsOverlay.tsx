import { Copy, Lock, LockOpen, Pencil, Trash2 } from 'lucide-react';

// The hover-revealed home-page binder actions (story 21: "Hovering over a
// binder in the home page list displays delete, copy, and edit actions.";
// story 32 adds the lock/unlock toggle), mirroring `ArtActionsOverlay`'s
// identical top-right hover-reveal cluster pattern (itself modeled on
// `CardTile`'s single-action reveal). Rendered in edit/copy/lock-toggle/
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
    <div className="pointer-events-none absolute top-0 right-0 z-10 flex -translate-y-1 translate-x-1 gap-1 opacity-0 transition-all duration-150 ease-out group-hover:pointer-events-auto group-hover:translate-x-0 group-hover:translate-y-0 group-hover:opacity-100">
      <button
        type="button"
        disabled={isEditDisabled}
        onClick={onEdit}
        aria-label={`Edit ${name}`}
        title="Edit binder details"
        className="flex size-6 cursor-pointer items-center justify-center rounded-standard bg-neutral-700 text-neutral-100 hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
      >
        <Pencil className="size-3.5" aria-hidden="true" />
      </button>
      <button
        type="button"
        disabled={isCopyDisabled}
        onClick={onCopy}
        aria-label={`Copy ${name}`}
        title="Copy binder"
        className="flex size-6 cursor-pointer items-center justify-center rounded-standard bg-neutral-700 text-neutral-100 hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
      >
        <Copy className="size-3.5" aria-hidden="true" />
      </button>
      <button
        type="button"
        disabled={isLockToggleDisabled}
        onClick={onToggleLock}
        aria-label={locked ? `Unlock ${name}` : `Lock ${name}`}
        title={locked ? 'Unlock binder' : 'Lock binder'}
        className="flex size-6 cursor-pointer items-center justify-center rounded-standard bg-neutral-700 text-neutral-100 hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {locked ? (
          <LockOpen className="size-3.5" aria-hidden="true" />
        ) : (
          <Lock className="size-3.5" aria-hidden="true" />
        )}
      </button>
      {!locked && (
        <button
          type="button"
          disabled={isDeleteDisabled}
          onClick={onDelete}
          aria-label={`Delete ${name}`}
          title="Delete binder"
          className="flex size-6 cursor-pointer items-center justify-center rounded-standard bg-neutral-700 text-neutral-100 hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Trash2 className="size-3.5" aria-hidden="true" />
        </button>
      )}
    </div>
  );
}
