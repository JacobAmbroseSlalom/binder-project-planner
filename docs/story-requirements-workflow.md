# Story technical-requirements handoff

## Canonical sources

- `docs/planning.md` holds the product vision, tech stack, and definition of done.
  Stories themselves live one-per-file under `docs/stories/`, in three bucket folders:
  `docs/stories/needs-refinement/` (requirements not yet fully defined),
  `docs/stories/ready-for-dev/` (requirements complete, implementation not yet done),
  and `docs/stories/completed/` (implemented). `docs/stories/README.md` is the index of
  every story file and its current bucket — check it, and the active story's file,
  before asking questions.
- Each story file carries a `**Status:**` marker (`Not started`, `In progress`, or
  `Done`) tracking implementation progress in place. This is a separate axis from the
  requirements-writing bucket (which folder the file lives in); do not delete or split
  out a story's content when it reaches `Done` — later stories keep citing its
  confirmed contracts.
- `.github/copilot-instructions.md` records the planned stack and onboarding guidance.
- `.github/instructions/coding-conventions.instructions.md` requires all
  application-owned defaults to live in one shared canonical `defaults.ts` once
  scaffolded. Do not create feature-specific defaults files.
- This repository is still documentation-only and greenfield; do not assume application
  structure exists.

## Interview workflow

- Develop technical requirements story by story, working through
  `docs/stories/needs-refinement/` in ascending story-number order unless the user
  directs otherwise, through one question at a time.
- Ask a concrete multiple-choice question with a recommended option and short tradeoff
  descriptions; allow a freeform correction.
- Treat user corrections as authoritative even when they reverse an earlier answer.
- After every answer, immediately patch the active story's own file under
  `docs/stories/needs-refinement/`, run focused validation on that file, briefly report
  what changed, and ask the next single question.
- When a story's acceptance criteria and technical requirements are both fully
  resolved (no remaining TBDs), move its file from `docs/stories/needs-refinement/` into
  `docs/stories/ready-for-dev/` and update its row in `docs/stories/README.md`.
- After the workspace's Prettier toolchain is scaffolded, run `pnpm format` after
  documentation or code edits that it supports; use `pnpm format:check` when a
  non-mutating formatting check is needed.
- Keep behavioral outcomes under `#### Acceptance criteria` and implementation, API,
  storage, and testing choices under `#### Technical requirements`.
- When entering an unstructured story, add both subsection headings.
- Identify physical or logical contradictions explicitly. Do not silently weaken
  requirements; record unresolved issues as prominent TBDs when the user wants to defer
  them.
- Keep questions narrow and decision-oriented. Prefer existing project patterns and
  previously selected contracts over introducing new architecture.

## Established architecture

- pnpm workspace; Next.js, React, and TypeScript frontend; Express and TypeScript backend.
- REST and OpenAPI-first API with generated types and Problem Details errors.
- React state and binder-scoped context; no server-state library currently planned.
- React Hook Form and Zod; Jest and Playwright.
- TanStack Virtual, dnd-kit, Konva and React Konva, Sharp, PDFKit, and Lucide React.
- Local application-data image files with database metadata and references; immutable
  shared image assets.
- Database remains TBD, with SQLite favored.

## Current stopping point

Story content, including which stories already have fully resolved acceptance criteria
and technical requirements, now lives in the story files themselves rather than in a
narrative summary here:

- Every file in `docs/stories/completed/` and `docs/stories/ready-for-dev/` has
  fully resolved acceptance criteria and technical requirements. Read the story file
  directly for its confirmed contracts instead of relying on a summary in this doc.
- Resume technical-requirements questions with the lowest-numbered story file in
  `docs/stories/needs-refinement/` (check `docs/stories/README.md` for the current
  list) unless the user directs otherwise.
- Update this section only if the resume point needs to differ from "lowest-numbered
  file in `needs-refinement/`" — e.g. the user asks to work a specific story out of
  order.

## Consistency notes

- Binder PDF variation visibility is inferred from the current layout route's
  `variations=true` state; there is no separate export-options prompt.
- Read-only binder-layout and placed-art PDF exports remain available when a binder is
  locked.
- Existing requirements contain cross-story API and mutation rules. Before adding a new
  requirement, search story files under `docs/stories/completed/` and
  `docs/stories/ready-for-dev/` for the affected endpoint, lock behavior, toast or
  loading behavior, idempotency, and optimistic rollback to avoid contradictions.
- Validate Markdown after every patch with workspace diagnostics.
