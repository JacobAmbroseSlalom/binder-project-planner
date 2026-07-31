export const DEFAULT_BACKEND_HOST = '127.0.0.1';
export const DEFAULT_BACKEND_PORT = 3001;
export const DEFAULT_BACKEND_ORIGIN = `http://${DEFAULT_BACKEND_HOST}:${DEFAULT_BACKEND_PORT}`;
export const DEFAULT_FRONTEND_ORIGIN = 'http://localhost:3000';
export const DEFAULT_APPLICATION_DATA_DIRECTORY = '.data';
export const DEFAULT_DATABASE_FILENAME = 'binder-project-planner.sqlite';

// How long a "saved" save-status toast remains visible before it auto-dismisses
// (story 3: "Add reusable save-status feedback").
export const SAVED_TOAST_DURATION_MS = 3000;

// Binder defaults used by the reusable binder-details form (story 4: "Create a
// new binder") so the new-binder page and, later, the Edit Details tab never
// duplicate these values.
export const DEFAULT_BINDER_WIDTH = 3;
export const DEFAULT_BINDER_HEIGHT = 3;
export const DEFAULT_BINDER_PAGE_COUNT = 20;

// Maximum trimmed binder-name length, shared by the frontend Zod schema, the
// OpenAPI request/response contract, and the backend database field.
export const BINDER_NAME_MAX_LENGTH = 100;
