# Copilot Instructions — binder-project-planner

## Project overview

`binder-project-planner` is an app for assisting with card binder planning (organizing
trading/collectible cards into binders — deciding layouts, page assignments, and
collection tracking).

**Status:** early stage / greenfield. There is no application code yet — only project
docs. When adding the first code, set up the structure described below and update this
file to match what was actually built.

## Planned stack

- **Repository:** pnpm workspace with separate frontend and backend applications
- **Frontend:** React (Next.js) with TypeScript
- **Frontend virtualization:** TanStack Virtual (`@tanstack/react-virtual`)
- **Frontend icons:** Lucide React (`lucide-react`)
- **Frontend drag and drop:** dnd-kit (`@dnd-kit/core`, `@dnd-kit/sortable`,
  `@dnd-kit/utilities`) — `@dnd-kit/sortable`'s `SortableContext`/`useSortable` power
  animated (FLIP-style) row reordering, added for story 52's What I'm Looking For
  drag-and-drop

- **Frontend image editing:** Konva (`konva`, `react-konva`)
- **Backend:** Node.js (Express) with TypeScript
- **Backend multipart uploads:** multer (`multer`, `@types/multer`), wired through
  `express-openapi-validator`'s built-in `fileUploader` option with a custom
  digest-computing disk `StorageEngine` (story 12) rather than its default in-memory
  buffering
- **Backend image processing:** Sharp (`sharp`)
- **Backend PDF generation:** PDFKit (`pdfkit`)
- **API:** REST with an OpenAPI-first contract
- **Image storage:** Local application data directory with metadata in the database
- **Deployment:** Local single-user application without authentication initially
- **Database:** TBD; SQLite is a strong option for the local deployment
- **Desktop packaging:** Electron + `electron-builder`, in a new `apps/desktop`
  workspace package (story 47) — bundles the frontend's production build and the
  backend as two managed local child processes, producing unsigned/unnotarized macOS
  `.dmg` and Windows NSIS installer builds with no auto-updater. See
  [apps/desktop/src/main.ts](../apps/desktop/src/main.ts) for the Electron main
  process and [apps/desktop/scripts/prepare-package.mjs](../apps/desktop/scripts/prepare-package.mjs)
  for the packaging build (production `pnpm deploy --legacy` staging +
  `@electron/rebuild` for `better-sqlite3`/`sharp`).
  - `apps/desktop`'s own main/preload code is bundled with esbuild
    ([apps/desktop/scripts/build.mjs](../apps/desktop/scripts/build.mjs)) instead of
    plain `tsc`, so `apps/desktop/package.json` has zero runtime `dependencies` (all
    moved to `devDependencies`) — this prevents electron-builder's automatic
    node-modules dependency collector from attempting a destructive, unscoped
    `pnpm install --production` across the whole pnpm workspace.
  - Both child processes (`apps/desktop/src/processes/backendProcess.ts` and
    `frontendProcess.ts`) set `ELECTRON_RUN_AS_NODE: '1'` in their spawned `env`,
    since a packaged/branded Electron executable always relaunches itself as the
    full app rather than running as plain Node when given a script path via argv —
    unlike the unpacked dev Electron binary, where that heuristic works implicitly.
  - [apps/desktop/src/crashLog.ts](../apps/desktop/src/crashLog.ts) reports main-process
    startup failures (spawn errors, uncaught exceptions) via a native error dialog plus
    a `main-process.log` file under the app's per-user data folder, rather than only
    `console.error` — a packaged app (especially a Windows GUI-subsystem executable)
    has no attached console, so an unreported failure previously looked like the app
    doing nothing at all when launched. See the README's "Windows: nothing happens
    when launching the app" and "macOS: is damaged and can't be opened" sections for
    the two known unsigned/unnotarized-build launch issues this surfaces/relates to.
- **Release automation:** [.github/workflows/release.yml](workflows/release.yml)
  builds the macOS `.dmg` and Windows NSIS installer in CI and uploads them as assets
  on the matching GitHub Release, triggered by pushing a `v*.*.*` tag or via manual
  `workflow_dispatch` against an existing tag. `apps/desktop/package.json`'s
  `build.mac.artifactName`/`build.nsis.artifactName` fix each installer's filename (no
  embedded version number) so the root [README.md](../README.md)'s
  `releases/latest/download/<filename>` links keep resolving to the newest build.
- **Multi-laptop data sync (story 53):** the backend owns all of it — a new
  `APP_LOCAL_STATE_DIRECTORY` env var (`config.localStateDirectory`) names a
  fixed, always-local directory (Electron passes `app.getPath('userData')`, kept
  separate from the user-configurable, possibly cloud-synced
  `APP_DATA_DIRECTORY`) for rotating backup snapshots
  ([apps/backend/src/sync/backupSnapshots.ts](../apps/backend/src/sync/backupSnapshots.ts),
  reusing story 33's export archive format via `buildExportArchiveFile` in
  [dataTransfer.ts](../apps/backend/src/routes/dataTransfer.ts)) and the
  `.sync-lock.json` machine/timestamp marker
  ([apps/backend/src/sync/syncMarker.ts](../apps/backend/src/sync/syncMarker.ts),
  [directoryState.ts](../apps/backend/src/sync/directoryState.ts)). Before opening
  the database, [server.ts](../apps/backend/src/server.ts)'s async `main()`
  evaluates directory/marker state and, if launch-time confirmation is needed, runs
  a temporary pre-database Express app exposing `GET /startup/status`/
  `POST /startup/confirm` ([routes/startup.ts](../apps/backend/src/routes/startup.ts))
  — the real app mounts the same two routes (always reporting no confirmation
  pending) so a caller can poll one consistent endpoint pair throughout startup.
  Quitting calls `POST /maintenance/prepare-shutdown`
  ([routes/shutdown.ts](../apps/backend/src/routes/shutdown.ts): backup, WAL
  `checkpoint()`, close, `process.exit(0)`) rather than relying on
  `ChildProcess.kill()` alone, since that's not a reliably catchable signal on
  Windows; [apps/desktop/src/main.ts](../apps/desktop/src/main.ts) awaits it before
  falling back to killing the child process directly, and
  [backendProcess.ts](../apps/desktop/src/processes/backendProcess.ts)'s launch
  polling handles the `/startup/status` confirmation handshake via a native
  `dialog.showMessageBox` prompt. The user's chosen data-directory override is
  set via the frontend's `/settings` page (Electron-only —
  [apps/frontend/src/app/settings/page.tsx](../apps/frontend/src/app/settings/page.tsx))
  through an IPC bridge (`window.__DESKTOP_SETTINGS__`,
  [preload.cts](../apps/desktop/src/preload.cts)) and persisted to
  [apps/desktop/src/desktopSettings.ts](../apps/desktop/src/desktopSettings.ts)'s
  `desktop-settings.json`, applying on the next relaunch.
- If you introduce a new dependency or architectural decision, record it in
  [docs/planning.md](../docs/planning.md) and keep this file in sync.

## Working conventions

- Planning and requirements live in [docs/](../docs). Check
  [docs/planning.md](../docs/planning.md) before starting new work — it holds the
  product vision, tech stack, and definition of done.
- Stories live one-per-file under [docs/stories/](../docs/stories/), in three bucket
  folders: `needs-refinement/`, `ready-for-dev/`, and `completed/`. The index at
  [docs/stories/README.md](../docs/stories/README.md) lists every story file and its
  current bucket — check it, and the active story's file, before starting new work.
- The story-derived endpoint index is [docs/api-endpoints.md](../docs/api-endpoints.md).
  Keep it synchronized with explicitly defined routes in the story files under
  `docs/stories/`; the future OpenAPI specification remains the implementation source
  of truth.
- The story-derived object and property index is [docs/data-types.md](../docs/data-types.md).
  Keep it synchronized with confirmed data-model decisions in the story files under
  `docs/stories/`; do not treat fields marked **TBD** as implemented contracts.
- When continuing the story technical-requirements interview, follow
  [docs/story-requirements-workflow.md](../docs/story-requirements-workflow.md) for the
  one-question workflow, current stopping point, and unresolved decisions.
- Project coding conventions live in
  [.github/instructions/coding-conventions.instructions.md](instructions/coding-conventions.instructions.md).
  Apply them whenever writing, reviewing, or refactoring application code.
- Always add helpful comments to code blocks, especially to explain their purpose,
  control flow, and non-obvious implementation decisions.
- Prefer small, incremental changes. Add new stories as new files in
  `docs/stories/needs-refinement/` (updating the index at
  [docs/stories/README.md](../docs/stories/README.md)) unless the user specifies a
  different bucket.
- Once a build/test/lint toolchain exists, document the exact commands here so future
  sessions don't need to rediscover them.
- After the workspace is scaffolded, run `pnpm format` after repository edits that
  Prettier supports; use `pnpm format:check` for non-mutating formatting verification.
- Keep this file up to date as the project evolves — it is the primary onboarding doc
  for AI coding agents working in this repo.

## Notes for AI agents

- Don't assume a framework or file layout beyond what's listed above until it actually
  exists in the repo — verify by looking at the workspace first.
- When scaffolding the initial app, ask the user for any still-missing decisions, such
  as the database choice, rather than guessing silently.
