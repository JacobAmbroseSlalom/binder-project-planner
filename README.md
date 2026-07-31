# Binder Project Planner

Binder Project Planner is a local, single-user application for designing and managing
trading card binder layouts. It is intended to help collectors organize cards into
pages and slots, track cards that have not yet been placed, and plan artwork that spans
multiple pockets.

## Architecture

This repository is a pnpm workspace organized into applications and shared packages:

| Path                    | Purpose                                                                    |
| ----------------------- | -------------------------------------------------------------------------- |
| `apps/backend`          | Express REST API backed by SQLite and Drizzle ORM.                         |
| `apps/frontend`         | Next.js (App Router) React frontend.                                       |
| `packages/api-contract` | OpenAPI specification and generated TypeScript API types.                  |
| `packages/shared`       | Defaults and code shared across workspace applications.                    |
| `docs`                  | Product planning, requirements, API endpoint, and data-type documentation. |

The frontend calls the backend using a typed client generated from the OpenAPI
contract. The backend currently exposes `GET /health`, which verifies that both the API
and database are available, and the frontend's home page displays that status.

## Getting started

### Prerequisites

- Node.js 24.18.1
- pnpm 11.18.0

Install dependencies and start the backend and frontend development servers together:

```sh
pnpm install
pnpm dev
```

The backend listens on `http://127.0.0.1:3001` and the frontend on `http://localhost:3000`
by default; `pnpm dev` runs both concurrently and prints both URLs. Verify the backend
from another terminal:

```sh
curl http://127.0.0.1:3001/health
```

A healthy response is:

```json
{ "status": "ok", "database": "connected" }
```

Open `http://localhost:3000` in a browser to see the frontend's home page, which calls
the backend's health check and reports whether it is connected.

The local database is created at `.data/binder-project-planner.sqlite` by default.

To run only one side, use `pnpm dev:backend` or `pnpm dev:frontend`.

## Commands

| Command             | Description                                                                |
| ------------------- | -------------------------------------------------------------------------- |
| `pnpm dev`          | Run the backend and frontend together in watch mode.                       |
| `pnpm dev:backend`  | Run only the backend in watch mode.                                        |
| `pnpm dev:frontend` | Run only the frontend in watch mode.                                       |
| `pnpm build`        | Build shared packages, generated API types, the backend, and the frontend. |
| `pnpm typecheck`    | Type-check every workspace package.                                        |
| `pnpm lint`         | Run ESLint across the repository.                                          |
| `pnpm test`         | Build the workspace and run backend and frontend tests.                    |
| `pnpm format`       | Format supported repository files with Prettier.                           |
| `pnpm format:check` | Check formatting without changing files.                                   |

## Configuration

The backend supports these environment variables:

| Variable             | Default                                              | Purpose                               |
| -------------------- | ---------------------------------------------------- | ------------------------------------- |
| `HOST`               | `127.0.0.1`                                          | Address on which the backend listens. |
| `PORT`               | `3001`                                               | Backend HTTP port.                    |
| `FRONTEND_ORIGIN`    | `http://localhost:3000`                              | Origin allowed by CORS.               |
| `APP_DATA_DIRECTORY` | `.data`                                              | Directory for local application data. |
| `DATABASE_FILE`      | `<APP_DATA_DIRECTORY>/binder-project-planner.sqlite` | SQLite database path.                 |

The frontend supports this environment variable:

| Variable                  | Default                 | Purpose                            |
| ------------------------- | ----------------------- | ---------------------------------- |
| `NEXT_PUBLIC_BACKEND_URL` | `http://127.0.0.1:3001` | Backend origin the frontend calls. |

## Project documentation

- [Product planning and story backlog](docs/planning.md)
- [API endpoint index](docs/api-endpoints.md)
- [Data types and modeling decisions](docs/data-types.md)
- [Story requirements workflow](docs/story-requirements-workflow.md)
- [Technical recommendations](docs/recommendations.md)
