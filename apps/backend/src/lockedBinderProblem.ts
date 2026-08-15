import { LOCKED_BINDER_PROBLEM_TYPE } from '@binder-project-planner/shared';

// Story 32: "Lock a binder". The Problem Details body every restricted
// details/layout/card/art mutation returns when its binder is currently
// locked - shared by routes/binders/, routes/cards/, and routes/art/
// so the response shape (and, especially, the stable `type`) never drifts
// between them. Lives at the `src/` top level (not under `routes/`, which
// is reserved for actual router factories) mirroring `idempotency/
// mutationIdempotency.ts`'s own cross-route helper placement.
export function lockedBinderConflictProblem() {
  return {
    type: LOCKED_BINDER_PROBLEM_TYPE,
    title: 'Conflict',
    status: 409,
    detail: 'This binder is locked. Unlock it to make this change.',
  };
}
