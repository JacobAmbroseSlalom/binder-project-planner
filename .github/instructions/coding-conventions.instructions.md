---
description: 'Use when writing, reviewing, or refactoring application code. Defines project-wide coding conventions, including centralized default values.'
applyTo: '**'
---

# Coding Conventions

## Default values

- Keep every application-owned default value in one canonical file named `defaults.ts`.
- When the application is scaffolded, place `defaults.ts` in a shared location that both
  the frontend and backend can import, and record its exact path in
  `.github/copilot-instructions.md`.
- Search for the canonical file before adding a default. Never create a second defaults
  file for a feature, package, frontend, backend, test, or environment.
- Export named, domain-specific constants or immutable objects from `defaults.ts`; avoid
  unexplained literals at call sites.
- Import defaults from the canonical file instead of copying their values elsewhere.
- Keep secrets and environment-specific configuration in environment variables, not in
  `defaults.ts`.
- Keep values calculated from runtime state near the code that calculates them; they are
  not defaults.
- Tests should import production defaults when verifying default behavior. A test may use
  local fixture values when the value is test data rather than an application default.

## Database migrations

- `drizzle-kit generate` names new migration files with a random adjective-noun tag
  (e.g. `0012_nervous_killer_shrike.sql`). Immediately after generating one, rename the
  file to a short, descriptive, snake_case summary of what it does (e.g.
  `0012_custom_art_finances.sql`), keeping the existing zero-padded numeric prefix
  unchanged.
- Update the matching `tag` field in `apps/backend/drizzle/meta/_journal.json` to the
  new filename (without its `.sql` extension) in the same change. Nothing else under
  `meta/` references the filename, so no other file needs updating.
- Update any other place that names the old filename in prose (code comments, story
  docs) to match, so the reference stays accurate.
- Do this for every migration, not just ones with notable schema changes — a consistent,
  readable migration history makes `apps/backend/drizzle/` easy to skim later.

## Comments

- Always leave helpful comments, as much as possible — err on the side of adding one
  rather than skipping it.
- Every exported function, hook, component, and type gets a comment explaining its
  purpose (what it's for and why it exists), not just a restatement of its signature.
- Inside function bodies, comment non-obvious control flow, edge cases, and any
  implementation decision that isn't self-evident from the code alone (e.g. why a
  particular ordering, guard, or workaround is needed).
- Prefer comments that explain _why_, not _what_ — the code already shows what's
  happening; the comment should add context a reader can't get from the code itself.
- Keep comments accurate and up to date: when editing a commented code block, update or
  remove its comment if the change makes the comment stale or misleading.
