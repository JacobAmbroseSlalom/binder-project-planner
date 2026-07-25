# Story technical-requirements handoff

## Canonical sources

- `docs/planning.md` is the canonical product backlog and technical-decisions document.
  Read the active story and nearby related stories before asking questions.
- `.github/copilot-instructions.md` records the planned stack and onboarding guidance.
- `.github/instructions/coding-conventions.instructions.md` requires all
  application-owned defaults to live in one shared canonical `defaults.ts` once
  scaffolded. Do not create feature-specific defaults files.
- This repository is still documentation-only and greenfield; do not assume application
  structure exists.

## Interview workflow

- Develop technical requirements story by story, in backlog order, through one question
  at a time.
- Ask a concrete multiple-choice question with a recommended option and short tradeoff
  descriptions; allow a freeform correction.
- Treat user corrections as authoritative even when they reverse an earlier answer.
- After every answer, immediately patch `docs/planning.md`, run focused validation on
  that file, briefly report what changed, and ask the next single question.
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

Status as of 2026-07-24:

- Technical requirements have been developed from Project Setup through Search and
  filter unplaced items.
- Binder-layout PDF export is substantially specified, including a dedicated POST
  endpoint, current UI variation-toggle inference, temporary-file generation, atomic
  image-integrity failure, request-start snapshot consistency, locked-binder
  availability, and binder-name download filename.
- Multi-slot-art print export is substantially specified, but implementation is
  explicitly blocked by a critical packing-capacity TBD. Default exact-size 2-by-2,
  2-by-1, and 1-by-1 capacity targets conflict with US Letter landscape once physical
  dimensions, margins, and gaps are honored. Do not treat those capacity targets as
  resolved.
- The art-print story currently selects US Letter landscape, placed art only, 90-degree
  rotation, deterministic heuristic packing, 0.25-inch margins and gaps, exact-scale
  tiling for oversized art with 0.25-inch overlap, no labels or crop marks, and allowance
  for other art in unused tile-page regions.
- A separate critical TBD remains for the physical or rendered basis of multi-slot-art
  border-width percentage.
- Search and filter unplaced items is complete: client-side, case-insensitive substring
  terms with AND semantics across fields, ephemeral state, segmented All, Cards, and Art
  control, `useDeferredValue`, and a Clear filters empty state.
- Story 32, `Lock a binder`, has complete technical requirements. They use the existing binder
  PATCH with a required `locked` boolean; optimistic per-binder action disabling;
  last-write-wins state updates; `409 Conflict` enforcement and stale-state reloads;
  disabled details fields; hidden layout-editing controls; preserved read-only display
  controls; allowed acquisition and price changes; and a compact Lock plus `Locked`
  status on the binder page. Lock-specific automated coverage was intentionally left
  unspecified.
- Resume technical-requirements questions at `### Export and import all application
  data` unless the user directs otherwise.

## Consistency notes

- Binder PDF variation visibility is inferred from the current layout route's
  `variations=true` state; there is no separate export-options prompt.
- Read-only binder-layout and placed-art PDF exports remain available when a binder is
  locked.
- Existing requirements contain cross-story API and mutation rules. Before adding a new
  requirement, search `docs/planning.md` for the affected endpoint, lock behavior,
  toast or loading behavior, idempotency, and optimistic rollback to avoid
  contradictions.
- Validate Markdown after every patch with workspace diagnostics. Diagnostics were clean
  at the pause point.