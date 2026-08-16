# 54. Finances preview page

**Status:** Done (2026-08-15 22:21 EDT)

#### Acceptance criteria

- A new "Finances Preview" page lets the user estimate binder production costs
  without first creating a binder, closely mirroring the layout of the existing
  binder "View Financials" tab (story 34/38/50).
- The page is reachable from a new button on the home page, placed next to the
  existing "Create new binder" button.
- The page's sticky Summary header shows: Material costs, Time-based costs, Total,
  With Tax, and Total hours — it has no Cards line and no Overall total, since
  there's no per-card dollar total on this page (only the Cards & Art slot-count
  summary described below).
- The Material costs section (Binder, Printing, Holographic Paper) works the same
  as the existing Financials tab, with one difference: the Binder cost-entry
  catalog (name, price, and its stored width/height/pages) drives this page's
  dimensions directly, since there's no linked application binder to source them
  from. The user either selects a previously saved Binder cost entry from the
  catalog — whose stored width, height, and pages become this page's dimensions —
  or creates a new Binder cost entry, this time with width, height, and pages
  shown and directly editable (unlike the real Financials tab, where those three
  fields stay hidden and are pre-matched against the real binder they belong to).
  Unlike the real tab, the Binder dropdown here lists every saved entry rather
  than filtering to ones matching a fixed set of current dimensions, since picking
  the entry is how the dimensions get set in the first place.
- Editing Material costs selections and Time-based costs values (including the
  shared wage-per-hour and error-margin percentage) on this page never saves
  anything back to the database — unlike the real Financials tab, where these are
  shared, persisted values. Every value shown starts from the current
  saved/shared values, but edits made here only change what's displayed on this
  page.
- Creating a new Material cost entry (Binder/Printing/Holographic Paper "+ Add
  new…") on this page is also purely page-local and never saved to the shared
  catalog: it behaves like a throwaway entry that exists only for this page's
  current session and disappears on navigation, unlike the same action on a real
  binder's Financials tab. The entry's name field is cosmetic display text only on
  this page — it isn't checked for uniqueness or used in any calculation or
  validation, since it's never persisted or looked up again.
- The Cards section is renamed "Cards & Art" and no longer reflects real cards in
  a binder. Instead, the user enters one or more rows of a cosmetic label plus a
  card count (e.g. "Base set — 100"); an "Add" control lets them add more rows of
  the same shape, and their counts are summed to a total card count.
- The Cards & Art section's summary shows: the total number of slots (from the
  width/height/pages sourced from the selected/created Binder cost entry above),
  the total card count (summed from the label/count rows), and the number of
  slots art would occupy (total slots minus total cards) — each of the card and
  art figures also shown as a percentage of total slots.
- Nothing entered or selected on this page is saved anywhere. Navigating away from
  the page loses every change with no confirmation prompt, matching the "nothing
  is saved" framing already used for this page rather than the rest of the app's
  autosave convention.
- The sticky Summary header has no gear icon (unlike the real Financials tab, which
  opens the "Manage cost entries" modal from it). In its place is a "Create binder"
  button that navigates to the existing "Create a new binder" page, prefilling that
  page's width, height, and pages fields with whatever is currently entered/selected
  on this preview page (the name field is left blank). None of this page's
  selections are saved as part of that navigation — it only prefills the new
  binder's own form.

#### Technical requirements

- New route: `apps/frontend/src/app/finances-preview/page.tsx`, following the
  existing kebab-case top-level route convention (e.g. `apps/frontend/src/app/
binders/new`).
- Home page: a new "Preview Finances" button is added to `HomeToolbar.tsx` beside
  the existing "Create new binder" button, linking to `/finances-preview`.
- The existing binder-scoped Financials components
  (`PhysicalCostsSection`/`TimeCostsSection`/`StickyTotals`, under
  `apps/frontend/src/app/binders/[binderId]/financials/_components/`) are tightly
  coupled to a real `binder` object and `PATCH`-based persistence
  (`onBinderUpdated`, `updateFinanceSettings`, etc.). Rather than threading a
  "don't actually save" flag through those existing components, this page gets
  its own sibling components under `apps/frontend/src/app/finances-preview/
_components/`, reusing the same pure calculation helpers
  (`apps/frontend/src/app/binders/[binderId]/financials/_lib/financeCalculations.ts`)
  and the same `FinanceField`/currency-formatting building blocks, but holding
  their own local component state instead of calling any update endpoint. The
  "+ Add new…" flow for each Material cost catalog is similarly reimplemented as a
  local-only append to that page's own in-memory list (assigning a temporary
  client-side id) rather than calling the catalogs' `POST` endpoints, since new
  entries created here are never persisted.
- This page's Binder cost-entry variant (a sibling of the existing
  `BinderCostEntryCard`) fetches the full `binderCostEntries` catalog via the
  existing `GET /binder-cost-entries` (unfiltered, unlike the real tab's
  dimension-matched dropdown) and, unlike the real card, always renders
  width/height/pages as visible fields — read-only display when an existing entry
  is selected, directly editable when creating a new one. Whichever entry is
  currently selected (or being created) is this page's sole source of the
  width/height/pages used everywhere else on the page (Printing/Holographic Paper
  page-count-based costs, and the Cards & Art total-slots calculation); there is
  no separate "pick one of my binders" control anywhere on this page.
- Since there's no real placed multi-slot art to derive a print-PDF page count
  from (as the real Financials tab does via `GET /binders/{binderId}/art-print-
page-count`, which packs actually-placed art), this page estimates it instead:
  the total slots (from the selected/created Binder cost entry's width/height/
  pages) minus the Cards & Art section's own total card count leaves the slot
  count assumed to hold art (floored at 0), and a flat 8 slots' worth of art is
  assumed to fit per printed page, rounded up (`Math.ceil`) — e.g. 9 slots of art
  is 2 pages. This estimated page count drives the Printing and Holographic Paper
  costs and all 5 time-cost categories on this page.
- Total slots is computed with the existing shared `getTotalSlots(width, height,
pages)` helper (`packages/shared/src/binderSpread.ts`), matching how the real
  binder's own summary stats compute it.
- When entered card counts exceed total slots, the page reuses the existing
  over-capacity display convention from story 40's layout summary stats (turning
  the affected figure to the error color) rather than blocking input or inventing
  new validation — there is no hard cap on the entered numbers.
- The "Create binder" button in the Summary header navigates to `/binders/new`
  with `width`, `height`, and `pages` passed as query parameters (e.g.
  `/binders/new?width=3&height=4&pages=20`); `NewBinderPage` reads and applies any
  present query parameters as overrides on top of `defaultBinderDetailsFormValues`
  when initializing its form, leaving the name field at its normal empty default.
- No new backend endpoints or database changes: this page only reads existing
  `GET` endpoints (finance settings and the three cost-entry catalogs) already
  used elsewhere, and writes nothing back until the user explicitly uses the
  "Create binder" button, which goes through the existing, unchanged
  `POST /binders` creation flow.
