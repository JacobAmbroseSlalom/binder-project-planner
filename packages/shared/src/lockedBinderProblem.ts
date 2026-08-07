// Story 32: "Lock a binder". A restricted details, layout, card, or art
// mutation rejected because its binder is currently locked returns this
// exact, stable Problem Details `type` (rather than the generic
// `about:blank` every other conflict in this app uses) so the frontend can
// reliably distinguish "this failed specifically because the binder is
// locked" from every other 409 Conflict (e.g. a stale expected position or
// an occupied destination) without depending on the human-readable
// `detail` text. Shared so the backend (setting it) and frontend (matching
// against it) never drift apart.
export const LOCKED_BINDER_PROBLEM_TYPE = '/problems/locked-binder';
