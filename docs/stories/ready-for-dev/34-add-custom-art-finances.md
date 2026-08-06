# 34. Add custom art finances

**Status:** Ready for dev

#### Acceptance criteria

- The binder's "View Financials" tab is built out to show the estimated cost to produce
  the binder, replacing its current "Financials are coming soon" placeholder.
- The tab uses the shared loading component until finance settings, the physical cost
  catalogs, this binder's selected entries, and the art-print page count have all
  loaded, or a provided error is displayed using the shared failed toast.
- Creating or editing a shared cost entry, editing finance settings, and selecting a
  catalog entry for this binder each use the shared save-status toast and restore the
  previous value if saving fails.
- The tab has a Physical costs section covering Binder, Printing, and Holographic Paper.
- For each physical cost item, the user selects a previously saved entry from a dropdown
  of shared entries, or creates a new entry that is saved for reuse across all binders.
- Editing the details of a selected physical cost entry updates that same shared entry,
  and the change is reflected for every binder currently using it.
- The Binder entry has visible Name and Price fields; it also stores width, height, and
  page count, which are not shown to the user.
- The Binder dropdown only lists saved Binder entries whose stored width, height, and
  page count match the current binder's width, height, and page count.
- Changing the current binder's width, height, or page count clears any Binder entry
  currently selected for that binder.
- The Printing entry has Name and Price per Page fields. Its cost is the Price per Page
  multiplied by the number of pages the binder's multi-slot-art print PDF generates.
- The Holographic Paper entry has Name, Price, and Number of Pages Included fields. Its
  cost is (Price ÷ Number of Pages Included) multiplied by the number of pages the
  binder's multi-slot-art print PDF generates.
- A single error-margin percentage, defaulting to 10% and adjustable by the user, is
  shared across all binders and by both the Printing and Holographic Paper costs;
  changing it updates the value used for every binder's calculations, and it represents
  pages that must be redone due to human error.
- The Printing and Holographic Paper costs are each displayed both with and without the
  error margin applied.
- The tab has a Time-based costs section covering Binder Designing, Printing, Applying
  Holographic Paper, Cutting, and Placing.
- A single wage-per-hour value is shared across all binders; changing it updates the
  value used for every binder's time-based cost calculations.
- Each time-based cost category has a shared rate basis of reference hours and
  reference pages (e.g. "25 minutes to do 8 pages"), stored once and shared across all
  binders.
- Editing a category's reference hours or reference pages updates that shared entry, and
  the change is reflected the next time any binder's "View Financials" tab is viewed.
- For each time-based cost category, the page count used in this binder's calculation is
  the same multi-slot-art print PDF page count used for the Printing and Holographic
  Paper physical costs.
- Each time-based cost item's total hours for this binder is its category's reference
  hours divided by its reference pages, multiplied by this binder's page count; its price
  is that total multiplied by the shared wage-per-hour value.
- Each time-based cost item displays both its total hours and its price.
- The tab has a Cards section that is a placeholder until story 38 ("Add card
  finances") is implemented, showing a total for all cards and a separate total for
  unacquired cards only.
- A stickied area at the top of the tab shows running totals as costs change.
- The stickied area shows a currency total for each of the Physical costs, Time-based
  costs, and Cards sections, a currency total excluding the Cards section, and an
  overall currency total including Cards.
- The stickied area also shows the total calculated hours across all time-based cost
  items for the binder, as its own stat alongside the currency totals.
- The stickied and section-level currency totals use the error-margin-applied figures
  for Printing and Holographic Paper; the without-error-margin figures remain visible
  only at those individual line items for comparison.

#### Technical requirements

- The error-margin percentage is a single global value shared across every binder,
  stored and updated the same way as the shared wage-per-hour value, rather than a
  per-binder field.
- Wage-per-hour, the error-margin percentage, and the 5 time-cost rate bases are stored
  together in one global `financeSettings` singleton record (no per-record ID needed in
  the API), exposed through a single `GET`/`PATCH` endpoint pair rather than 5+ separate
  CRUD resources.
- The 5 time-cost categories (`designing`, `printing`, `applyingHolographicPaper`,
  `cutting`, `placing`) are a fixed enum baked into the schema and application code, each
  holding its own `referenceHours`/`referencePages` rate basis nested in
  `financeSettings`. They are not a user-manageable list; adding, renaming, or removing a
  category requires a future code change and database migration rather than an in-app
  action.
- The three physical cost catalogs are separate shared REST resources with full CRUD,
  each with a shape matching its fields rather than one generic discriminated table:
  - `binderCostEntries` (`name`, `price`, `width`, `height`, `pages`) via
    `GET`/`POST /binder-cost-entries` and `PATCH /binder-cost-entries/{id}`.
  - `printingCostEntries` (`name`, `pricePerPage`) via `GET`/`POST /printing-cost-entries`
    and `PATCH /printing-cost-entries/{id}`.
  - `holographicPaperCostEntries` (`name`, `price`, `pagesIncluded`) via
    `GET`/`POST /holographic-paper-cost-entries` and
    `PATCH /holographic-paper-cost-entries/{id}`.
- Each binder stores three new nullable foreign-key fields —
  `selectedBinderCostEntryId`, `selectedPrintingCostEntryId`, and
  `selectedHolographicPaperCostEntryId` — updated through the existing
  `PATCH /binders/{binderId}`.
- When a binder update changes `width`, `height`, or `pages`, the backend nulls out that
  binder's `selectedBinderCostEntryId` as part of the same update whenever the newly
  selected (or currently selected) Binder cost entry's stored dimensions no longer match,
  rather than requiring a separate client call to clear it.
- Calculated totals and prices for physical and time-based costs are derived from
  stored rate/quantity data (shared cost entries, shared time-cost rate bases, the
  shared wage-per-hour value, the binder's page count, and the error-margin
  percentage) at request or render time; they are not persisted as separate stored
  total fields.
- A new read-only `GET /binders/{binderId}/art-print-page-count` endpoint reuses the
  same packing/tiling logic as the art-print PDF export (story 30) to return only the
  computed page count for all currently placed multi-slot art in the binder (no
  `selectedArtIds`, since this is not a user-driven export). The Finances tab uses this
  endpoint instead of generating a PDF to learn the page count that drives Printing,
  Holographic Paper, and all 5 time-cost calculations.
- The binder stores a `cachedArtPrintPageCount` plus a lightweight cache signature: the
  `COUNT` of its currently-placed art rows, `MAX(updatedAt)` across those rows, and the
  binder's own `updatedAt`. `GET /binders/{binderId}/art-print-page-count` recomputes
  that signature (one cheap aggregate query) and compares it to the cached signature,
  recomputing and re-caching the page count only on a mismatch, rather than manually
  invalidating the cache at every mutation site that could change placed-art footprints
  or binder dimensions.
- Currency values (`price`, `pricePerPage`, `wagePerHour`, and every computed total) are
  stored in the database as integer cents (hundredths of a dollar), matching the
  existing centimeter/percentage integer-hundredths convention; REST contracts use
  human-readable decimal dollars (e.g. `12.50`). The app assumes USD with no
  multi-currency support.
- Each time-cost category's rate basis is stored as integer `referenceMinutes` and
  integer `referencePages` (e.g. `25` minutes to do `8` pages) rather than a decimal
  `referenceHours` field, avoiding repeated fractional-hour rounding; hours are derived
  only at the final price computation (`totalMinutes / 60 * wagePerHour`).
- This story's three physical cost catalogs support create and edit only, no delete;
  entries accumulate and cannot be removed through this story. Deletion (and clearing
  the selection of any binder using a deleted entry) is deferred to story 44 ("Delete
  custom art finance cost entries").
- The Cards section placeholder displays static, zeroed values (e.g. `$0.00`) for both
  the all-cards and unacquired-cards totals, with no query against card data. Neither
  the `acquired` field (story 36) nor card pricing (story 38) exist yet, so there is
  nothing real to compute; wiring this section up to real totals is explicitly out of
  scope for this story and belongs to story 38.
- Each physical cost dropdown includes a trailing "+ Add new…" option. Selecting it
  reveals inline fields matching that catalog's shape in place of the dropdown, with
  Save and Cancel controls. Save creates the entry via `POST` and immediately selects it
  for the current binder; Cancel reverts to the dropdown with nothing selected. There is
  no separate "manage cost entries" modal or settings page in this story.
- The `financeSettings` singleton's initial row is seeded with `wagePerHour = 0`,
  `errorMarginPercent = 10`, and every time-cost category's `referenceMinutes = 0` /
  `referencePages = 1` (never `0`, to avoid a division-by-zero rate) directly in the
  database migration/seed that creates the row, rather than as named constants in the
  shared `defaults.ts`. This is an intentional, story-scoped exception to the
  `defaults.ts` centralization convention in
  `.github/instructions/coding-conventions.instructions.md`, made because these are
  one-time seed values for a singleton row rather than fallback values referenced by
  application code at runtime.
- The error margin applies as literal extra whole pages, rounded up:
  `extraPages = ceil(pageCount * errorMarginPercent / 100)`. The with-error-margin
  Printing and Holographic Paper costs are computed using `pageCount + extraPages` in
  place of `pageCount`; the without-error-margin costs continue to use `pageCount`
  unchanged.
- The Finances tab's loading and toast behavior reuses the existing shared loading
  component, shared save-status toast, and optimistic-rollback-on-failure patterns
  already used by the other binder tabs, rather than introducing new tab-specific
  components.
- Field validation:
  - Cost entry `name` fields (Binder, Printing, Holographic Paper): trimmed, required,
    1 to 100 characters; duplicate names across entries are allowed since selection is
    by ID, not name.
  - `price` (Binder, Holographic Paper) and `pricePerPage` (Printing): required, greater
    than `0`.
  - `pagesIncluded` (Holographic Paper): required positive integer, greater than `0`.
  - Binder cost entry `width`/`height`: positive integer, `1` to `8`, matching the
    `Binder` field ranges; `pages`: required positive integer.
  - `wagePerHour`: required, `0` or greater.
  - `errorMarginPercent`: required, `0` to `100` inclusive.
  - Each time-cost category's `referenceMinutes`: `0` or greater; `referencePages`:
    required positive integer, greater than `0`.
- Locking a binder (story 32) does not restrict any mutation introduced by this story.
  Selecting a cost entry for a locked binder (`selectedBinderCostEntryId`,
  `selectedPrintingCostEntryId`, `selectedHolographicPaperCostEntryId` via
  `PATCH /binders/{binderId}`) succeeds regardless of lock state, consistent with the
  existing acquisition/price carve-out. Edits to the global `financeSettings` singleton
  and the shared cost-entry catalogs are unaffected by any binder's lock state, since
  they aren't tied to one binder and can be edited from any binder's Finances tab.
- Every computed currency value (each physical/time-cost line item and every sticky or
  section total) is rounded to the nearest cent using round-half-up, matching normal
  money display. Every computed hours value (each time-cost line item's total hours and
  the sticky total-hours stat) is rounded to 2 decimal places for display, also using
  round-half-up; a time-cost item's price is computed from its unrounded hours value and
  only the resulting price is then rounded to the nearest cent.
- The Finances tab fetches `financeSettings`, the three cost-entry catalogs, this
  binder's selected entries, and the art-print page count locally within its own page
  component, rather than adding them to the existing `BinderRouteContext`. This data is
  only needed on the Finances tab, so loading it eagerly for every tab visit would be
  wasted work; the tab still reads the current binder's `width`, `height`, and `pages`
  from the existing `BinderRouteContext`.
- Each catalog's `GET` endpoint (`binder-cost-entries`, `printing-cost-entries`,
  `holographic-paper-cost-entries`) returns entries ordered alphabetically by `name`
  (case-insensitive).
