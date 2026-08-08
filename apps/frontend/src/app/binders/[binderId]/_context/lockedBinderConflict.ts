import { LOCKED_BINDER_PROBLEM_TYPE } from '@binder-project-planner/shared';

// Story 32: distinguishes a mutation rejected specifically because its
// binder is locked from every other 409 Conflict (e.g. a stale expected
// position or an occupied destination), by matching the stable Problem
// Details `type` the backend returns for that case alone (see
// `lockedBinderConflictProblem` in the backend and `LOCKED_BINDER_PROBLEM_TYPE`
// in the shared package). Shared by every binder-scoped mutation hook
// (`useCardMutations`/`useArtMutations`/`useLayoutMovement`) that needs to
// trigger a full binder reload when its own request is rejected for this
// specific reason.
export function isLockedBinderConflict(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const candidate = error as { type?: unknown };
  return candidate.type === LOCKED_BINDER_PROBLEM_TYPE;
}
