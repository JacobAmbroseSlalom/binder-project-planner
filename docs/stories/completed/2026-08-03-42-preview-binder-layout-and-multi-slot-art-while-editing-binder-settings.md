# 42. Preview binder layout and multi-slot art while editing binder settings

**Status:** Done (2026-08-03 22:18 EDT) - implemented as two separate live previews per in-progress design feedback: (1) a layout-spread preview (a representative left+right two-page spread of empty slots) shown directly below the width/height fields, and (2) a separate art border-outline example shown directly below the border-style fields, rather than one combined preview with art overlaid on the grid. The binder-details form's fields were reordered so the page-count/preview-page row precedes the width/height row. The blue surface hugs only the slot grids (as on the Edit Layout tab), not the whole preview frame. The acceptance criteria and technical requirements below were updated to match.

#### Acceptance criteria

- The reusable binder-details form on the new binder page and the "Edit Details" tab displays a live layout-spread preview directly below its width and height fields, and a live art border-outline example directly below its multi-slot art border-style fields.
- The layout-spread preview shows a representative two-page binder spread (a left and a right binder side) sized from the form's current width and height (in slots) and its current width-per-slot, width base, height-per-slot, and height base values.
- The layout-spread preview's slots are surrounded by the blue surface only around the slot grid of each side (matching the Edit Layout tab), not around the whole preview frame.
- The art border-outline example shows one representative piece of multi-slot art rendered as just its border outline (with the form's current border color, border radius, and border width values) with a transparent interior and no image or fill.
- Both previews update immediately as the width, height, or any dimension or multi-slot art style field changes, without saving the form.
- Both previews appear identically on the new binder page, which has no saved binder or existing cards or art, and on the "Edit Details" tab of an existing binder.
- Both previews use placeholder content rather than the binder's actual saved cards or multi-slot art, even on the "Edit Details" tab.
- Both previews are read-only: they do not accept dragging, dropping, or any other layout-editing interaction.
- An invalid or incomplete field value while the user is typing does not remove or break either preview; each preview continues to reflect the most recently valid values for the field being edited.

#### Technical requirements

- Both previews are computed entirely from the reusable binder-details form's current React Hook Form field values; they make no backend request and are not part of any saved binder data.
- The layout-spread preview reuses the same binder-side and slot rendering approach as the full layout (Story 8) and the home-page preview (Story 20), configured with placeholder empty slots instead of real cards or art.
- The layout-spread preview's binder-side grids use the form's current width for their column count and current height for their row count, matching the full layout's CSS Grid approach, and render a left and right side as a two-page spread.
- The art border-outline example's representative art spans `min(BINDER_SETTINGS_PREVIEW_ART_SLOT_SPAN, current width)` columns by `min(BINDER_SETTINGS_PREVIEW_ART_SLOT_SPAN, current height)` rows to derive its physical aspect ratio.
- `BINDER_SETTINGS_PREVIEW_ART_SLOT_SPAN` defaults to `2` in the canonical shared `defaults.ts`.
- The art border-outline example uses the same border-frame math as real multi-slot art (Story 25 and Story 26) - physical-centimeters border width converted to pixels via the frame's own cm-to-px scale, and a circular corner radius capped by the shorter dimension - but renders an outline only (transparent interior, no uploaded image or placeholder fill).
- All layout-spread slots render as empty slots using the same empty-slot rendering as the full layout; no placeholder card or art content is shown in them.
- The blue `bg-surface` is applied to each side's slot grid rather than the outer preview frame, so the surface hugs only the slots, matching the Edit Layout tab.
- Each preview frame uses stable on-screen dimensions defined by the frontend styling system, independent of the home-page preview frame's dimensions (Story 20); its content scales proportionally to contain within that frame without cropping.
- Both previews recalculate on every relevant field change (width, height, width-per-slot, width base, height-per-slot, height base, border color, border radius, border width) without a debounce, since rendering is CSS-driven and inexpensive.
- While a field's current input is blank or fails validation, the previews use that field's last valid parsed value rather than clearing or erroring; they only use the canonical `defaults.ts` values as their very first render, before the form's own default values are applied.
- Neither preview depends on nor is affected by the binder name, page count, or preview-physical-page (Story 20) fields.
- Both previews mount identically whether the binder-details form is in its new-binder (no `binderId`) or edit (existing `binderId`) mode; no additional data is fetched for them in either mode.
- The binder-details form's fields are ordered so the page-count and preview-page row precedes the width/height row, which is immediately followed by the layout-spread preview.
