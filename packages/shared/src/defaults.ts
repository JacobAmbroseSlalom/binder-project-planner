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

// Maximum binder width/height (slot columns/rows per binder side), shared by
// the frontend Zod schema, the OpenAPI request/response contract, and the
// backend database check constraint. Unlike width/height, the binder page
// count has no fixed maximum.
export const BINDER_DIMENSION_MAX = 8;

// Story 23: "Add binder notes". Maximum length of a binder's free-form
// Markdown-source notes, shared by the frontend textarea/validation, the
// OpenAPI request/response contract, and backend validation. An exactly
// empty notes string is normalized to `null` rather than stored.
export const BINDER_NOTES_MAX_LENGTH = 1_000_000;

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

// Story 11: "Select a card for a binder slot". TCGdex search only runs once
// the trimmed query has been stable for this long, so the frontend doesn't
// send a request per keystroke.
export const CARD_SEARCH_DEBOUNCE_MS = 300;
// The trimmed query must reach this length before a TCGdex search runs at
// all; shorter queries leave the most recent completed results visible.
export const CARD_SEARCH_MIN_QUERY_LENGTH = 4;
// How long the backend's in-memory TCGdex search cache retains a
// successful normalized response for a given trimmed, case-normalized
// query, keyed by that query.
export const CARD_SEARCH_CACHE_TTL_MS = 300_000; // 5 minutes
// The maximum number of distinct queries the backend's LRU search cache
// retains at once; the least-recently-used entry is evicted first.
export const CARD_SEARCH_CACHE_MAX_ENTRIES = 50;
// Upstream TCGdex searches and image downloads are aborted after this long
// and surfaced to the client as a Problem Details timeout failure.
export const TCGDEX_REQUEST_TIMEOUT_MS = 30_000;
// How long the backend waits before retrying one failed TCGdex search or
// image download (network error, timeout, 429, or 5xx) when the provider
// doesn't supply a valid `Retry-After` header.
export const TCGDEX_RETRY_DELAY_MS = 500;

// Story 41: "Filter card search by TCG Pocket inclusion and language". The
// card-selection modal's language toggle defaults to English; switching it
// to Japanese searches TCGdex's `ja` catalog instead.
export const CARD_SEARCH_LANGUAGE_DEFAULT = 'en';
// The card-selection modal's TCG Pocket toggle defaults to off: search
// results exclude Pokémon TCG Pocket cards (TCGdex's `tcgp` serie) unless
// the user explicitly opts in.
export const CARD_SEARCH_INCLUDE_TCG_POCKET_DEFAULT = false;
// Upstream PokéAPI species-name lookups (used to translate an English
// Pokémon species name to Japanese before a `language=ja` search) are
// aborted after this long; a timeout is treated as a translation miss
// rather than a search failure.
export const POKEAPI_REQUEST_TIMEOUT_MS = 10_000;

// Story 12: "Add a custom card manually". Maximum trimmed lengths for a
// custom card's name/set/number, shared by the frontend Zod schema, the
// OpenAPI multipart request contract, and backend validation. Name is
// required after trimming; set and number are optional (blank stores as
// `null`).
export const CUSTOM_CARD_NAME_MAX_LENGTH = 100;
export const CUSTOM_CARD_SET_MAX_LENGTH = 100;
export const CUSTOM_CARD_NUMBER_MAX_LENGTH = 50;
// The only image formats a custom-card upload may use; the frontend file
// input's `accept` value and the backend's magic-byte signature check both
// derive from this same list.
export const CUSTOM_CARD_IMAGE_ACCEPT = 'image/jpeg,image/png,image/webp';

// Story 14: "Move a card to a different binder slot". dnd-kit's pointer
// sensor only starts a drag once the pointer has moved this many CSS
// pixels, so an ordinary click (e.g. a future card-details action) doesn't
// get mistaken for a drag attempt.
export const CARD_DRAG_ACTIVATION_DISTANCE_PX = 8;

// Story 28: "Undo and redo layout movements". The maximum number of
// successful drag-and-drop actions retained in the undo stack for one
// binder route session. When this limit is reached, adding one new action
// discards the oldest retained action.
export const LAYOUT_MOVEMENT_HISTORY_LIMIT = 50;

// Story 24: "Configure card and multi-slot art dimensions". Per-binder
// configurable formulas replace the fixed `SLOT_WIDTH_CM`/`SLOT_HEIGHT_CM`
// one-slot dimensions above: displayed width is
// `(slots * widthPerSlot) + widthBase`, and displayed height is
// `(slots * heightPerSlot) + heightBase`. The defaults below reproduce the
// same 6.35 cm x 9 cm one-slot ratio those fixed constants used.
export const DEFAULT_WIDTH_PER_SLOT_CM = 6.85;
export const DEFAULT_WIDTH_BASE_CM = -0.5;
export const DEFAULT_HEIGHT_PER_SLOT_CM = 9;
export const DEFAULT_HEIGHT_BASE_CM = 0;

// Multi-slot art style defaults, also configured per binder by story 24 and
// overridable per art item (story 25). Border radius follows CSS
// percentage semantics (relative to the frame's width/height per axis).
// Border width is a physical centimeters measurement, like the dimension
// fields above - converted to pixels at render time using the same
// cm-to-px scale factor as the art's own image, so the border's rendered
// thickness stays physically consistent (and proportionally correct)
// across different art sizes and preview scales instead of drifting with
// either a percentage or a fixed pixel count.
export const DEFAULT_BORDER_COLOR = '#FFCB05';
export const DEFAULT_BORDER_RADIUS_PERCENT = 5;
export const DEFAULT_BORDER_WIDTH_CM = 0.25;

// Story 25: "Add multi-slot art". Maximum trimmed lengths for an art
// item's title/description, shared by the frontend Zod schema, the OpenAPI
// multipart request contract, and backend validation. Title is required
// after trimming; description is optional (blank stores as `null`).
export const ART_TITLE_MAX_LENGTH = 100;
export const ART_DESCRIPTION_MAX_LENGTH = 10_000;

// The minimum print resolution (pixels per inch) an art image's effective
// horizontal/vertical resolution must reach at its configured physical
// output size to avoid the create-art modal's nonblocking image-quality
// warning (story 25).
export const MIN_ART_PRINT_RESOLUTION_PPI = 300;

// Story 16: "Add card variations". The variation combobox's suggested
// values - the user may also type an unmatched custom value in the same
// field, which is stored as-is rather than being restricted to this list.
export const CARD_VARIATION_SUGGESTIONS = [
  'Reverse Holo',
  'Non-Holo',
  '1st Edition',
  'Expansion Stamp',
] as const;
// Maximum trimmed variation length, shared by the frontend schema, the
// OpenAPI contract, and backend validation; blank input is stored as
// `null` rather than an empty string.
export const CARD_VARIATION_MAX_LENGTH = 50;

// Story 26: "Move and manage multi-slot art". How long a completed
// mutation's outcome (keyed by a client-generated idempotency key, e.g.
// art duplication) is retained so a retried request replays the original
// outcome instead of repeating the mutation.
export const MUTATION_IDEMPOTENCY_RETENTION_MS = 86_400_000; // 24 hours

// Stories 17/18: "Add more cards" / "Bulk add cards". The maximum number of
// card creations `POST /binders/{binderId}/cards/bulk` processes
// concurrently for one request - keeps one large selection from opening an
// unbounded number of simultaneous TCGdex image downloads/database writes.
export const BULK_CARD_CREATE_CONCURRENCY = 5;

// Story 20: "Add a binder preview". The reusable binder-details form's
// `previewPhysicalPage` field defaults to physical page 2 (the binder's
// first two-page spread) for a newly created binder. The backend also
// resets a binder's `previewPhysicalPage` back to this value when
// reducing the stored page count makes the previously saved value
// invalid for the new page count.
export const DEFAULT_BINDER_PREVIEW_PHYSICAL_PAGE = 2;

// Story 42: "Preview binder layout and multi-slot art while editing binder
// settings". The reusable binder-details form's live preview shows one
// representative piece of multi-slot art anchored at row 1, column 1,
// spanning `min(BINDER_SETTINGS_PREVIEW_ART_SLOT_SPAN, current width)`
// columns by `min(BINDER_SETTINGS_PREVIEW_ART_SLOT_SPAN, current height)`
// rows.
export const BINDER_SETTINGS_PREVIEW_ART_SLOT_SPAN = 2;

// Story 22: "Show binder completion metrics". The home-page binder list's
// completion-metrics visibility toggle defaults to visible on a first
// visit, before the user's own preference has been saved to browser local
// storage. The toggle is a presentation-only preference and is never
// persisted by the backend.
export const DEFAULT_BINDER_COMPLETION_METRICS_VISIBLE = true;

// Story 23: "Add binder notes". The Edit Layout tab's notes-section
// visibility toggle defaults to visible, before the user's own preference
// has been saved to browser local storage. Presentation-only; never
// persisted by the backend.
export const DEFAULT_BINDER_NOTES_VISIBLE = true;

// Story 33: "Export and import all application data". The version of the
// export archive format, written into its manifest and required to match
// on import so an incompatible archive is rejected rather than
// mis-imported.
export const EXPORT_FORMAT_VERSION = 1;

// How long a staged (validated but not yet committed) import is retained
// server-side before it's pruned; the two-step import flow validates and
// stages an uploaded archive, then commits it by token within this window.
export const IMPORT_STAGING_TTL_MS = 1_800_000; // 30 minutes

// Story 30: "Export multi-slot art for printing". Every art-print PDF page
// is US Letter landscape (11 x 8.5 in); this margin is reserved on every
// edge and treated as unavailable area by the packing algorithm.
export const ART_PRINT_PAGE_MARGIN_INCHES = 0.1;
// The minimum white space the packing algorithm enforces between two
// distinct art regions placed on the same page (including other art
// packed beside an oversized-art tile region).
export const ART_PRINT_ITEM_GAP_INCHES = 0.25;
// The repeated horizontal/vertical content overlap between adjacent tile
// pages of one piece of art that's too large to fit one page in either
// orientation, so the printed tiles can be trimmed and aligned during
// physical assembly without losing any of the reconstructed image.
export const ART_PRINT_TILE_OVERLAP_INCHES = 0.25;
