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
- When continuing the story technical-requirements interview, follow
  [docs/story-requirements-workflow.md](../docs/story-requirements-workflow.md) for the
  one-question workflow, current stopping point, and unresolved decisions.
- Project coding conventions live in
  [.github/instructions/coding-conventions.instructions.md](instructions/coding-conventions.instructions.md).
  Apply them whenever writing, reviewing, or refactoring application code.
- Prefer small, incremental changes. Add new stories to the bottom of the backlog in
  `docs/planning.md` unless the user specifies a different position.
- Once a build/test/lint toolchain exists, document the exact commands here so future
  sessions don't need to rediscover them.
- Keep this file up to date as the project evolves — it is the primary onboarding doc
  for AI coding agents working in this repo.

## Notes for AI agents
- Don't assume a framework or file layout beyond what's listed above until it actually
  exists in the repo — verify by looking at the workspace first.
- When scaffolding the initial app, ask the user for any still-missing decisions, such
  as the database choice, rather than guessing silently.
