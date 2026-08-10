# 4. Create a new binder

**Status:** Done (2026-07-31 17:15 EDT)

#### Acceptance criteria

- The home page has a button to create a new binder.
- Selecting the button navigates to the new binder page.
- The new binder page has fields for name, width, height, and pages.
- Binder name is required, has a maximum length of 100 characters after trimming, and must be unique regardless of capitalization.
- Width defaults to 3.
- Height defaults to 3.
- Pages defaults to 20.
- Width, height, and pages accept positive integers with a minimum value of 1.
- Width and height have a maximum value of 8; pages has no fixed maximum.
- Cancel and Create buttons appear at the bottom of the page.
- Cancel returns to the home page without creating a binder.
- Create is disabled while binder creation is in progress and is re-enabled if creation fails.
- Create saves the binder through the backend to a database.
- After the binder is saved, the user returns to the home page.
- Binder creation uses the shared save-status toast and remains on the completed form if saving fails.

#### Technical requirements

- The reusable binder-details form uses React Hook Form for client-side form state.
- The form uses React Hook Form's submission state to prevent repeated create requests while one is in progress.
- The form uses Zod schemas for client-side runtime validation and TypeScript type inference.
- The Zod schema trims the binder name and requires the result to contain between 1 and 100 characters.
- The Zod schema rejects non-integer width, height, or page values and values less than 1; width and height are additionally capped at `BINDER_DIMENSION_MAX`.
- The default width, height, and page count are defined in the canonical application `defaults.ts` rather than duplicated in the form.
- `BINDER_DIMENSION_MAX` (the width/height maximum) is defined in the canonical application `defaults.ts` and defaults to `8`; it is enforced by the frontend Zod schema, the OpenAPI request/response schemas, and a database check constraint.
- Binder-name uniqueness is enforced by the backend and database using a case-insensitive normalized value rather than relying only on client validation.
- The OpenAPI create-binder request schema and database field enforce the 100-character binder-name limit.
- A duplicate binder name returns HTTP `409 Conflict` using Problem Details and identifies the name field as conflicting.
- The backend generates a UUID for each binder and uses it as the binder identifier in the database, REST API, and full-data exports.
- Each binder stores backend-managed `createdAt` and `updatedAt` timestamps in UTC.
- `POST /binders` creates a binder from its normalized name, dimensions, and stored page count; it returns `201 Created`, a `Location` header for the new binder resource, and the complete persisted binder representation.
- The OpenAPI specification remains the source of truth for the backend request and response contract.
- Express uses maintained OpenAPI validation middleware to reject requests that do not match the documented schema before route logic runs.
