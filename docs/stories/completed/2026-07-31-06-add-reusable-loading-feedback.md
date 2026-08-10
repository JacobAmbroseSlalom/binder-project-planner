# 6. Add reusable loading feedback

**Status:** Done (2026-07-31 23:52 EDT)

#### Acceptance criteria

- A reusable loading component communicates when the app is waiting for data from the backend.
- The loading component uses a consistent inline spinner and context-specific loading text wherever it appears.
- The loading component remains visible until the request succeeds or fails.
- Loaded content replaces the loading component when the request succeeds.
- If the request fails, the loading component is removed and the provided error is displayed using the shared failed toast.
- Loading feedback prevents empty, incomplete, or stale content from being presented as the completed result.
- Future stories that retrieve data from the backend use this shared loading component.

#### Technical requirements

- The shared loading component renders an inline spinner and accepts an accessible status label describing the operation in progress.
- Loading announcements use the selected UI component library's default accessibility behavior.
- The loading indicator appears only when a request remains pending for 200 milliseconds.
- The 200-millisecond loading delay is stored in the canonical application `defaults.ts`.
- After appearing, the loading indicator remains visible for at least 300 milliseconds before loaded content replaces it.
- The 300-millisecond minimum display duration is stored in the canonical application `defaults.ts`.
- When a newer request for the same content starts, the client aborts the older request through `AbortController` when possible.
- Request state tracks the current operation so stale responses cannot replace data from a newer request.
