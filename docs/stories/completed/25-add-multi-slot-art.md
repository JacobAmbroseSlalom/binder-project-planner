# 25. Add multi-slot art

**Status:** Done - with known gaps (2026-08-02 20:51 EDT) - implemented per the acceptance
criteria and technical requirements below, with the following deliberate scope-downs/decisions
carried over for a later story to close:

- **Image-asset cross-dedup gap**: `artImageAssets` is its own table, separate from
	`cardImageAssets` (story 12). The SHA-256 digest dedup described below applies only
	within each table - identical bytes uploaded once as a custom card and once as
	multi-slot art create two separate image assets rather than the one global asset the
	acceptance criteria describe. Merging the two tables (or adding a lookup across both)
	is deferred; flagged here so a future story can decide whether it's worth the
	migration.
- **Client-side image-quality calculation**: the quality warning's effective PPI is
	computed entirely in the browser from the selected `File`'s natural pixel dimensions
	(via `HTMLImageElement.naturalWidth`/`naturalHeight`), not from the backend's stored
	`pixelWidth`/`pixelHeight` columns - the OpenAPI `Art`/`CreateArtRequest` schemas don't
	expose those columns to the frontend, and didn't need to for this calculation.
- **Modern-browser EXIF assumption**: the client-side quality calculation and Konva
	editor both assume the browser's own image decoding already applies EXIF orientation
	to `naturalWidth`/`naturalHeight` (true in current Chrome/Firefox/Safari) rather than
	re-deriving orientation client-side; the backend's own `sharp`-based normalization is
	authoritative for the persisted/served image regardless.

#### Acceptance criteria

- An unplaced art section appears on the right side of the "Edit Layout" tab, separate from the unplaced cards section.
- The unplaced art section has an add-art button that opens a modal for creating multi-slot art.
- The modal allows the user to upload an image from the computer's files.
- The modal also accepts an image pasted from the clipboard with Cmd+V.
- The modal has fields for the multi-slot art's title and description.
- The modal has a grid selector whose columns and rows match the binder's width and height.
- A 4-by-4 binder displays a 4-by-4 selector containing 16 cells.
- Hovering over a cell highlights the rectangle from the top-left cell through the hovered cell.
- Selecting a cell sets the art's width and height in slots from that highlighted rectangle.
- Selecting row 1, column 2 creates art that is 2 slots wide and 1 slot high.
- With the default dimension settings, art that is 2 slots wide and 1 slot high measures 13.2 cm by 9 cm.
- The modal has fields for art-specific border color, border radius, and border width.
- Each art-specific border field can either use the binder's setting or define a custom value.
- When an art-specific field uses the binder's setting, its override is stored as null in the database so later binder-setting changes apply to the art.
- The modal displays an editable preview of the uploaded image inside a border frame sized from the selected slot dimensions and border settings.
- The border frame remains fixed while the image can be repositioned within it.
- The image can be resized while preserving its aspect ratio.
- The image can also be stretched or compressed horizontally and vertically when needed.
- Rotate-left and rotate-right controls rotate the image inside its fixed border frame in 90-degree increments.
- The preview reflects the image's position, scale, rotation, aspect-ratio adjustments, and border settings.
- The modal evaluates the uploaded image's pixel dimensions against the art's selected physical print dimensions using a documented minimum print-resolution threshold.
- Image quality is reevaluated when the uploaded image or selected slot dimensions change.
- When the image does not meet the minimum resolution for its physical print size, a warning appears in the modal.
- The warning explains that the image may appear blurry or pixelated when printed and displays the image's available resolution and the required resolution.
- The image-quality warning does not prevent the user from saving the multi-slot art.
- The title, description, original uploaded image, selected slot dimensions, image-editing specifications, and art-specific style overrides are saved through the backend.
- Outside the editor, the art renders with the saved positioning, scaling, rotation, aspect-ratio adjustments, and border settings.
- After it is added, the multi-slot art appears in the unplaced art section with an aspect ratio derived from its configured physical dimensions, sized proportionally to the unplaced cards section's own card size (a shared physical cm-to-px scale derived from one slot's width) rather than stretched to fill the panel width.
- Placement and other interactions for multi-slot art on the binder layout will be defined in the next story.
- Image upload and multi-slot art creation use the shared save-status toast, and the modal retains its image and entered settings if either operation fails.

#### Technical requirements

- `POST /binders/{binderId}/art` uses one multipart request containing the image and normalized art metadata.
- Individual multi-slot-art records use `/art/{artId}` resource paths, with backend-generated UUIDs as `artId` values.
- Image installation, image-asset persistence, and art-record creation succeed as one logical operation; failure removes temporary files and any newly created unreferenced image file or metadata.
- The backend calculates a SHA-256 digest while streaming the upload and reuses the global immutable image asset when identical bytes already belong to multi-slot art or a custom card.
- A database uniqueness constraint on the image digest prevents concurrent identical uploads from creating duplicate assets.
- The image asset retains the exact uploaded source bytes; when JPEG EXIF orientation requires it, ingestion also creates an immutable orientation-normalized rendering derivative.
- The backend uses `sharp` to inspect pixel dimensions and generate auto-oriented rendering derivatives.
- The editor, layout, preview, and print renderers use normalized pixel orientation, while exports that require the original upload retain access to the source file.
- Source installation, derivative generation, and art-record creation participate in the same logical creation operation, and failure cleans up newly created unreferenced source and derivative files.
- File selection and clipboard paste accept JPEG, PNG, and WebP images; the backend detects and validates the file signature rather than trusting the filename or multipart MIME type.
- Unsupported image content receives `415 Unsupported Media Type` using Problem Details and leaves the modal state available for correction.
- Multi-slot-art uploads have no application-level byte-size limit and stream to temporary storage rather than being buffered completely in backend memory.
- Art titles are trimmed, required after trimming, and limited to 100 characters by the frontend schema, OpenAPI contract, and backend validation.
- Art descriptions are optional, limited to 10,000 characters, and stored as `null` when blank.
- New art initializes border color, radius, and width in Use Binder Setting mode, with each corresponding override persisted as `null`.
- Switching one field to a custom value affects only that nullable override; fields that remain `null` resolve against the binder's current settings at render time.
- The unplaced art section orders art by creation timestamp descending and then art UUID ascending, matching the unplaced cards section's tie-breaking rule, but is an independently rendered panel rather than a combined list with cards.
- Unplaced art preserves its configured physical aspect ratio and scales down to fit the panel width without horizontal scrolling; proportional sizing does not require an absolute shared scale with card thumbnails.
- The unplaced art section's virtualizer measures variable art-row heights after rendering rather than assuming the unplaced cards section's fixed card-row estimate.
- The image editor uses `konva` with `react-konva` for dragging and transform handles.
- The editor persists normalized focal X and Y coordinates plus independent horizontal and vertical scale multipliers relative to the computed centered-cover fit rather than a rendered canvas snapshot.
- Each art record also stores `imageRotationDegrees` as one of `0`, `90`, `180`, or `270`; rotate-left and rotate-right controls change it by one quarter turn with wraparound.
- Rotation applies only to the image within the fixed art frame and does not alter the frame's slot dimensions, border settings, or placement footprint.
- Layout, preview, and print renderers derive transformed image geometry from the same rotation, focal-point, and scale-multiplier contract at their respective output sizes.
- Normalized focal coordinates and scale multipliers are rounded to four decimal places in REST contracts and stored as integer ten-thousandths in the database; `imageRotationDegrees` is stored as its discrete integer value.
- The art frame clips image overflow, and editor constraints require the transformed image to cover the complete inner frame without transparent or background-colored gaps.
- A newly selected image starts unrotated and centered with an aspect-ratio-preserving `cover` fit that scales it just enough to fill the selected frame.
- Changing the selected slot width or height discards manual image transforms, resets `imageRotationDegrees` to `0`, and resets the image to a centered `cover` fit for the new frame.
- `MIN_ART_PRINT_RESOLUTION_PPI` defaults to `300` in the canonical shared `defaults.ts` and drives the nonblocking image-quality warning.
- The client calculates effective horizontal and vertical PPI from the source pixels used after cropping and scaling and the configured physical output dimensions.
- The quality warning appears when either effective axis is below the threshold and reports both effective axis values and the pixel dimensions required at the configured art size.
- The create-art modal starts without a selected slot width or height; the preview and Save action remain unavailable until the user selects a grid size and supplies an image.
- Pasting a supported image when one is already loaded opens a nested custom confirmation dialog above the art editor; confirming replaces the image, resets `imageRotationDegrees` to `0`, and resets its transform to centered cover, while cancelling retains the existing image and edits.
- While replacement confirmation is open, only the top dialog is interactive and owns the focus trap; closing it restores focus to the art editor.
- Clipboard image handling is active only while the art modal is open and does not intercept paste when focus is in the title or description control; those controls retain normal text-paste behavior.
- Submitting valid art closes the modal and optimistically inserts a disabled unplaced-art item using an object URL for the selected image.
- A successful `201 Created` response includes a `Location` header and the complete persisted art representation, which replaces the optimistic item and allows the object URL to be revoked.
- Failure removes the optimistic item, reopens the editor with the image, metadata, dimensions, rotation, transforms, and style choices preserved, and retains the object URL until that restored preview no longer needs it.
