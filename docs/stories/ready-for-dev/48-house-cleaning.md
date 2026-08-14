# 48. House cleaning

**Status:** Not started

#### Acceptance criteria

- **Reorganize the codebase.** Re-run the largest-files check first done in an earlier
  session (frontend-only, ~500-line threshold) against both the frontend and backend
  source trees this time (excluding generated/build output such as `.next/`, `dist/`,
  and `drizzle/` migration SQL). Any file still or newly over roughly 500 lines is
  evaluated for splitting into smaller, cohesively-scoped files, following the same
  pattern already established (e.g. extracting hooks/sub-components into a `_context/`-
  or feature-scoped subfolder placed alongside the file being split, mirroring the
  existing `_components/` convention). Folders that have accumulated many files are
  similarly evaluated for splitting into smaller subfolders when that meaningfully
  improves navigability.
- **Update the style guide.** Audit the existing `/style-guide` page
  (`apps/frontend/src/app/style-guide/page.tsx`) and
  [styling.instructions.md](../../../.github/instructions/styling.instructions.md) for
  any real, useful pattern from this app's implementation that isn't yet documented
  there (e.g. the custom modal/focus-trap convention, the shared toast/loading system,
  virtualized-grid usage, drag-and-drop styling) and add it. No new file is created;
  this stays scoped to the two things that already exist.
- **Fix tests, linting, and formatting to a clean, runnable state.** Every existing
  test suite, lint check, and format check passes with no errors. Every outstanding
  warning is investigated individually and either fixed or explicitly documented (in
  the relevant code comment or this story) as an intentionally accepted warning with a
  reason. No new tests are written — this task only fixes what already exists.

#### Technical requirements

- This is a fresh audit at implementation time: the story doesn't pre-list specific
  known test/lint/format failures. Implementation starts by running the full
  test/lint/format suite to establish the actual current state, then fixes what's
  found.
- Backend files that need splitting follow the backend's existing flat, domain-folder
  structure directly (e.g. a large `routes/binders.ts` splits into `routes/binders/`
  with focused sub-files, or a large integration file splits into sibling files within
  its existing `integrations/` folder) rather than importing the frontend's
  underscore-prefixed `_context/`/`_components/` convention, which only exists to hide
  those folders from Next.js's file-based router and has no equivalent purpose here.
