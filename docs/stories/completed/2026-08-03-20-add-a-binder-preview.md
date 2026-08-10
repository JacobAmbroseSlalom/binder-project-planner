# 20. Add a binder preview

**Status:** Done (2026-08-03 00:05 EDT)

#### Acceptance criteria

- Each binder in the home page list displays a preview of one of its pages.
- The preview shows how the selected binder page and its cards appear in the binder layout.
- The reusable binder-details form on the new binder page and the "Edit Details" tab has a field for selecting which physical page is used by the preview.
- The preview physical page defaults to page 2.
- The selected preview page is saved with the binder through the backend.
- The home page list uses the binder's saved preview page when displaying the preview.
- Saving the preview page uses the shared save-status toast and restores the previous selection if saving fails.

#### Technical requirements

- Home-page previews render live as noninteractive React layouts rather than generated or stored bitmap images.
- The preview reuses the binder-side, slot, card, and multi-slot-art rendering primitives from the full layout while omitting editing controls, drag-and-drop registration, and card actions.
- Binder-summary data includes only the selected preview spread's placement and image information required by the miniature layout rather than the complete binder graph.
- The binder stores `previewPhysicalPage` as a one-based physical focal page and resolves it to the same single page or two-page spread as layout navigation.
- `DEFAULT_BINDER_PREVIEW_PHYSICAL_PAGE` defaults to `2` in the canonical shared `defaults.ts`.
- The reusable binder-details form uses an HTML number input and validates `previewPhysicalPage` as an integer from `1` through twice the form's current stored page count.
- Either page in a two-page spread is retained as the saved focal value rather than canonicalized to the other page.
- If reducing stored page count makes the saved preview page invalid, the frontend and backend reset `previewPhysicalPage` to `DEFAULT_BINDER_PREVIEW_PHYSICAL_PAGE` in the same binder update.
- The existing binder-list endpoint embeds each binder's selected preview-spread data in its binder summary; the home page does not issue separate preview requests.
- Embedded preview data contains only spread identity, placed card and multi-slot-art geometry, display metadata, and image URLs; image bytes and unrelated binder records are excluded.
- Every binder-list item uses the same stable preview-frame dimensions, defined by the frontend styling system rather than binder data.
- The complete selected single page or two-page spread scales proportionally to contain within the frame without cropping.
- Previews render slots, cards, and multi-slot art only; variation labels, Michi indicators, acquisition state, pending-operation feedback, and editing controls are omitted.
- A failed card or multi-slot-art image preserves its occupied preview geometry and renders a neutral missing-image placeholder; one failed image does not replace the complete preview.
