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
