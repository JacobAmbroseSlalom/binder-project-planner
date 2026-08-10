# 3. Add reusable save-status feedback

**Status:** Done (2026-07-30 23:45 EDT)

#### Acceptance criteria

- A reusable toast component appears at the bottom of the page to communicate backend operation status.
- Concurrent backend mutations display independently updated toasts.
- A saving toast appears when an operation begins and remains visible until the operation succeeds or fails.
- When the operation succeeds, the saving toast is replaced by a green saved toast.
- Saved toasts dismiss automatically after 3 seconds.
- When the operation fails, the saving toast is replaced by a red failed toast that includes the provided error message.
- Failed toasts display the error detail provided by the backend.
- Failed toasts remain visible until the user dismisses them with an X.
- When a failed operation changed the visible interface before backend confirmation, the interface returns to its previous state.
- Stories that save, update, move, duplicate, delete, lock, or unlock data use this shared toast component.

#### Technical requirements

- The frontend toast component is custom-built (`apps/frontend/src/shared/feedback/`) rather than a third-party toast library (e.g. Sonner), consistent with the styling system's fully-custom interactive-component rule.
- Save-status announcements use ARIA live regions matching each status's urgency: `role="status"` for saving/saved, `role="alert"` for failed.
- Mutation status and optimistic rollback are managed with React state and the OpenAPI-generated REST client rather than a server-state library.
- Each concurrent backend mutation has its own operation identifier.
- The 3-second saved-toast duration is stored in the canonical application `defaults.ts` as `SAVED_TOAST_DURATION_MS`.
- Backend failures use the standard Problem Details JSON response format documented in the OpenAPI specification.
- Failed toasts use the Problem Details `detail` value and retain the response status and problem type for diagnostics.
