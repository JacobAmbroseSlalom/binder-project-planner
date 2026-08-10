# 23. Add binder notes

**Status:** Done (2026-08-03 23:51 EDT) - with one known gap: the locked-binder behavior (hiding the notes toggle and section, and not mounting them, while a binder is locked) isn't implemented because story 32 ("Lock a binder") hasn't been built - there's no `locked` column on `binders` yet, so notes are always shown/editable for now. Everything else is implemented: a nullable `notes` Markdown column (migration `0010_binder_notes.sql`, a simple in-place `ALTER`) returned in the binder-details response and the shared binder context and saved through the existing `PATCH /binders/{binderId}` (empty string normalized to null, 1,000,000-char limit via `BINDER_NOTES_MAX_LENGTH` in the OpenAPI contract and backend validation); a "Show notes" checkbox in the layout toolbar whose state is a persisted local-storage preference (`DEFAULT_BINDER_NOTES_VISIBLE`, defaulting to visible) remembered across binders and reloads; and a full-width `BinderNotesSection` textarea below the layout grid that saves on blur when changed, using the shared save-status toast with the same serialized/coalesced one-in-flight save behavior as the Edit Details tab.

#### Acceptance criteria

- The binder view/edit page has a toggle for showing or hiding a notes section.
- The notes section appears below the binder layout and the unplaced cards and unplaced art sections, spanning the full width of the tab, when it is visible.
- The notes toggle defaults to on for an unlocked binder.
- The notes toggle and notes section are hidden while the binder is locked.
- The notes section contains a large text box for free-form notes and to-do items.
- The binder's saved notes are loaded from the database through the backend.
- The notes text box is editable when the binder is unlocked.
- Locking a binder does not delete or change its saved notes, and unlocking it makes them available again.
- When the notes text box loses focus after its contents change, the updated notes are saved to the database through the backend.
- Notes loading uses the shared loading component and displays the provided error using the shared failed toast if loading fails.
- Notes saving uses the shared save-status toast and preserves the entered text for correction if saving fails.

#### Technical requirements

- Notes are included in the existing binder-details response and shared binder context rather than loaded through a separate request.
- Notes are saved through the existing partial binder update endpoint.
- Binder notes are persisted as Markdown source text rather than rendered HTML.
- Unlocked binders display only the Markdown source textarea without a rendered preview.
- The frontend does not mount the notes toggle, textarea, or notes content for a locked binder; the persisted Markdown remains part of the binder data and is unchanged by locking or unlocking.
- Binder notes are limited to 1,000,000 characters by the frontend schema, OpenAPI contract, and backend validation.
- An exactly empty notes string is normalized to `null`; nonempty Markdown is preserved without trimming leading or trailing whitespace.
- Notes visibility is a persisted preference remembered across binders and reloads via browser local storage, defaulting to visible on a first visit (before any preference is saved); it is not stored by the backend. (Originally specced as a `notes` route query parameter; changed to a local-storage preference so the show/hide choice is remembered.)
- The first-visit default visibility value is exported from the canonical shared `defaults.ts` (`DEFAULT_BINDER_NOTES_VISIBLE`).
- Notes updates are serialized so only one notes save is in flight per binder; editing remains enabled while a save is pending.
- If the notes change again while saving, intermediate values are coalesced and the latest value is sent in one follow-up request after the active save settles.
- If an active notes save fails while a newer value is queued, the client reports that failure and still submits the latest queued value; a successful follow-up response becomes the saved binder state.
