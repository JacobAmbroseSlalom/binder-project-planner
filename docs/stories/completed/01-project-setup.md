# 1. Project setup

**Status:** Done (2026-07-30 21:30 EDT)

#### Acceptance criteria

- A frontend app (React with Next.js and TypeScript) is scaffolded and runs locally.
- A backend app (Node.js with Express and TypeScript) is scaffolded and runs locally.
- An initial database is created using the database technology selected for the project.
- The backend is configured to connect to the initial database successfully.
- A single root pnpm development command starts the frontend and backend in watch mode and reports both local URLs.
- The frontend can successfully make a request to the backend (e.g. a basic health-check endpoint).

#### Technical requirements

- The repository contains separate frontend and backend applications.
- The repository uses pnpm workspaces to manage frontend, backend, and shared tooling packages.
- Project setup pins the active Node.js LTS and current stable framework and tooling versions used at implementation time.
- The first usable version runs locally on a single user's machine.
- The initial local single-user version does not require authentication.
- Local development runs the frontend and backend natively through pnpm commands without requiring Docker.
- SQLite is used for the initial local database, with Drizzle ORM providing the typed schema and migrations.
- Application-managed images are stored in a local application data directory rather than as database blobs.
- The backend generates image filenames and stores each image's metadata and storage reference in the database.
- The frontend communicates with the backend through a REST JSON API.
- `GET /health` returns `200 OK` with an OpenAPI-documented JSON health response and provides the initial frontend-to-backend connectivity check.
- Image uploads use multipart HTTP requests to the backend.
- An OpenAPI specification is the source of truth for REST request and response contracts.
- Frontend and backend API types are generated from the OpenAPI specification.
- Jest is configured for frontend and backend unit and integration tests.
- Playwright is configured for end-to-end browser tests.
- ESLint and Prettier are configured and shared across the frontend and backend applications.
- The root workspace provides `pnpm format` to run Prettier and apply formatting across supported repository files, and `pnpm format:check` to verify formatting without modifying files.
- Prettier configuration and ignore rules are stored at the repository root and apply consistently to frontend, backend, shared packages, configuration, and documentation files.
- A GitHub Actions workflow runs dependency installation, generated OpenAPI contract verification, linting, formatting checks, type checking, Jest tests, application builds, and Playwright tests for each pull request.
