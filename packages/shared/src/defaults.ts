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

// Timing for the shared loading component (story 6: "Add reusable loading
// feedback"). A pending request only shows the spinner after it has been
// pending this long, avoiding a flash of loading state for fast requests.
export const LOADING_INDICATOR_DELAY_MS = 200;

// Once shown, the loading indicator stays visible for at least this long
// before loaded content can replace it, avoiding a flicker when a request
// settles just after the indicator appears.
export const LOADING_INDICATOR_MIN_DURATION_MS = 300;

// The physical dimensions of one binder card slot in centimeters (story 8:
// "Visualize a basic binder layout"). Story 24 will make per-binder
// width/height-per-slot values configurable (`widthPerSlot`/`heightPerSlot`
// in data-types.md); until then this fixed 6.35:9 ratio is the canonical
// slot/card aspect ratio used by the layout grid.
export const SLOT_WIDTH_CM = 6.35;
export const SLOT_HEIGHT_CM = 9;
