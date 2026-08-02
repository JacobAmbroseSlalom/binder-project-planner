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
- **Frontend drag and drop:** dnd-kit (`@dnd-kit/core`)
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
- If you introduce a new dependency or architectural decision, record it in
  [docs/planning.md](../docs/planning.md) and keep this file in sync.

## Working conventions

- Planning and requirements live in [docs/](../docs). Check
  [docs/planning.md](../docs/planning.md) before starting new work — it holds the story
  backlog and product notes.
- The planning-derived endpoint index is [docs/api-endpoints.md](../docs/api-endpoints.md).
  Keep it synchronized with explicitly defined routes in `docs/planning.md`; the future
  OpenAPI specification remains the implementation source of truth.
- The planning-derived object and property index is [docs/data-types.md](../docs/data-types.md).
  Keep it synchronized with confirmed data-model decisions in `docs/planning.md`; do
  not treat fields marked **TBD** as implemented contracts.
- When continuing the story technical-requirements interview, follow
  [docs/story-requirements-workflow.md](../docs/story-requirements-workflow.md) for the
  one-question workflow, current stopping point, and unresolved decisions.
- Project coding conventions live in
  [.github/instructions/coding-conventions.instructions.md](instructions/coding-conventions.instructions.md).
  Apply them whenever writing, reviewing, or refactoring application code.
- Always add helpful comments to code blocks, especially to explain their purpose,
  control flow, and non-obvious implementation decisions.
- Prefer small, incremental changes. Add new stories to the bottom of the backlog in
  `docs/planning.md` unless the user specifies a different position.
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
