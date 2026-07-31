// The 3 save-status toast states from story 3's acceptance criteria. There is
// no separate "warning" state — see styling.instructions.md's "Toast
// notifications" section.
export type ToastStatus = 'saving' | 'saved' | 'failed';

// The Problem Details fields a failed toast needs to display the backend's
// error message and retain enough information for diagnostics. Named
// `httpStatus`/`problemType` (rather than `status`/`type`) so they don't
// collide with ToastEntry's own `status` discriminant field below.
export interface FailedToastDetails {
  detail: string;
  httpStatus?: number;
  problemType?: string;
}

// One toast entry, keyed by its mutation's operation id so concurrent
// mutations render and update independently. A 'saved' toast defaults to
// "Saved" but accepts an optional custom message (e.g. "Successfully
// deleted").
export type ToastEntry =
  | { id: string; status: 'saving' }
  | { id: string; status: 'saved'; message?: string }
  | ({ id: string; status: 'failed' } & FailedToastDetails);
