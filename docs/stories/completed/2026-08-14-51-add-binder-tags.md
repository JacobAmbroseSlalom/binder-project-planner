# 51. Add binder tags

**Status:** Done (2026-08-14 14:35 EDT)

#### Acceptance criteria

- The create/edit binder form has a tags field directly below the binder name field.
- A binder may have zero to many tags.
- Clicking the tags field opens an editable combobox (matching the existing card-variation combobox pattern, Story 16) listing every distinct tag currently used by any binder, filtered as the user types.
- The combobox also accepts freeform text for a tag that isn't in the suggested list.
- Selecting a suggestion or entering freeform text and choosing "Add" adds that tag to the binder's tag list, shown as its own pill near the input.
- Each tag pill has an "x" control that removes that tag from the binder.
- The home page has a new multi-select tag filter control (alongside the existing search box, sort toggle, and completion-metrics toggle, Story 39) that lets the user pick one or more tags; the binder list only shows binders matching the selected tags.
- The selected tag filter always resets to no tags selected when the home page loads, matching the search box and sort toggle's own reset-on-load behavior (Story 39); it is not persisted across visits.

#### Technical requirements

- A single `BinderTag` table stores each binder's tags directly (`binderId` plus the
  tag text) — no separate `Tag` catalog table. The combobox's suggestion list is a
  `SELECT DISTINCT` over this table's tag text across every binder, so a tag that is
  removed from every binder it was on naturally disappears from suggestions.
- There is no tag-rename operation, in the UI or the API: a tag can only be added to or
  deleted from a binder. Correcting a typo means deleting the old tag and adding the
  corrected one.
- Tag text is trimmed; de-duplication (both within one binder's tags and for the
  combobox's suggestion list) is case-insensitive, matching the same normalized
  casing already used by binder-name uniqueness. Tag text is limited to 30 characters.
  There is no maximum number of tags per binder.
- Adding a tag that case-insensitively matches a tag already on that binder is a no-op:
  it does not add a duplicate and keeps the existing tag's original casing.
- `tags: string[]` is a field on the `Binder` and `BinderSummary` representations,
  returned by `GET /binders`, `GET /binders/{binderId}`, and `POST /binders`, and
  accepted by `POST /binders` and `PATCH /binders/{binderId}` as a full replacement
  array (matching how other partial-update fields already work). A new
  `GET /tags` endpoint returns the distinct, alphabetically ordered tag suggestion
  list (a `SELECT DISTINCT` over `BinderTag`) for the combobox.
- On the create-binder page, added/removed tags are held in local component state
  (there is no binder to attach them to yet) and submitted as part of the same
  `POST /binders` request as the rest of the form, matching how every other
  create-binder field already behaves.
- On the edit-binder page's "Edit Details" tab, adding or removing a tag is treated as
  a dirty-field change on the shared React Hook Form state (Story 7): the Add and ×
  actions each immediately trigger the tab's existing "save all currently valid dirty
  fields" flow (the same flow a field blur already triggers), rather than requiring a
  separate save control or waiting for another field's blur.
- The home page tag filter matches a binder that has ANY of the selected tags (OR
  logic), not ALL of them.
- The home page tag filter is client-side, operating on the already-fetched
  `GET /binders` list (matching Story 39's search/sort precedent) rather than adding
  new backend query parameters.
- The selected tag filter is held in ordinary component state (not local storage or a
  route parameter), matching Story 39's search text and sort selection; it always
  resets to no tags selected on page load and is never restored across navigation.
