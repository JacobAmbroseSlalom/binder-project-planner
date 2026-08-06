# Project Planning — Card Binder Planner

This doc is the starting point for planning and tracking development. Update it as the
product direction and backlog evolve.

## Product vision

An app that helps collectors plan how to organize their trading/collectible cards into
binders — e.g. deciding page layouts, assigning cards to pages/slots, and tracking what's
been placed vs. still needs a home.

## Tech stack (planned)

- Frontend: React (Next.js)
- Frontend styling: Tailwind CSS
- Frontend virtualization: TanStack Virtual
- Frontend icons: Lucide React
- Frontend drag and drop: dnd-kit
- Frontend image editing: Konva with React Konva
- Backend: Node.js (Express)
- Backend image processing: Sharp
- Backend PDF generation: PDFKit
- Language: TypeScript
- Database: SQLite with Drizzle ORM.
- Authentication: None for the initial local single-user version.
- Hosting: Local machine for the initial version.

## Story backlog

Stories live one-per-file under [docs/stories/](stories/), organized into three bucket
folders: [`completed/`](stories/completed/), [`ready-for-dev/`](stories/ready-for-dev/),
and [`needs-refinement/`](stories/needs-refinement/). The index at
[docs/stories/README.md](stories/README.md) lists every story file and its current
bucket — check it, and the active story's file, before starting new work.

Each story file keeps behavioral outcomes under a `#### Acceptance criteria` heading and
implementation, API, storage, and testing choices under a separate `#### Technical
requirements` heading, defined as decisions are made.

Each story file also carries a `**Status:**` marker of `Not started`, `In progress`, or
`Done`, tracking implementation progress in place. This is independent from the
requirements-writing bucket (which folder the file lives in) and from the
requirements-writing progress tracked in
[story-requirements-workflow.md](story-requirements-workflow.md); a story can have
complete acceptance criteria and technical requirements (i.e. live in
`ready-for-dev/`) while its status is still `Not started`. Update the marker in place
as work progresses. When a story becomes `Done`, append the completion date and time in
parentheses, e.g. `Done (2026-07-30 23:31 EDT)`, move its file into
[`completed/`](stories/completed/), and update the row in
[docs/stories/README.md](stories/README.md).

Add new stories as new files in [`needs-refinement/`](stories/needs-refinement/),
following the same format, starting with `**Status:** Not started` and `TBD`
acceptance criteria and technical requirements, then add a row to
[docs/stories/README.md](stories/README.md). Skip straight to
[`ready-for-dev/`](stories/ready-for-dev/) only when the story's requirements are
already fully known.

## Definition of done (draft)

- Story's acceptance criteria are all met.
- No console errors/warnings introduced.
- Basic tests added/updated if a test setup exists.
- The story's `**Status:**` marker is updated to `Done`, its file is moved from
  `ready-for-dev/` into [`completed/`](stories/completed/), and
  [docs/stories/README.md](stories/README.md) is updated to match.

## Next steps

1. Define the core data model and how its pieces relate.
2. Decide on database and auth approach; record the decision here.
3. Scaffold the Next.js + Node project structure.
4. Add the first stories to the backlog above.
