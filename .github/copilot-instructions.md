# Copilot Instructions — binder-project-planner

## Project overview
`binder-project-planner` is an app for assisting with card binder planning (organizing
trading/collectible cards into binders — deciding layouts, page assignments, and
collection tracking).

**Status:** early stage / greenfield. There is no application code yet — only project
docs. When adding the first code, set up the structure described below and update this
file to match what was actually built.

## Planned stack
- **Frontend:** React (Next.js)
- **Backend:** Node.js
- Exact framework choices (e.g. API style, database, hosting) are not finalized. If you
  introduce a new dependency or architectural decision, record it in
  [docs/planning.md](../docs/planning.md) and keep this file in sync.

## Working conventions
- Planning and requirements live in [docs/](../docs). Check
  [docs/planning.md](../docs/planning.md) before starting new work — it holds the story
  backlog and product notes.
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
- When scaffolding the initial app, ask the user for missing decisions (database choice,
  auth, deployment target) rather than guessing silently.
