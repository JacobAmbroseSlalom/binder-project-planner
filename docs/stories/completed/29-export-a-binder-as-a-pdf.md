# 29. Export a binder as a PDF

**Status:** Done (2026-08-03 09:43 EDT) - with one known gap: the "print-to-PDF button remains available when the binder is locked" acceptance criterion is trivially satisfied rather than deliberately implemented, since story 32 ("Lock a binder") hasn't been built yet.

#### Acceptance criteria

- The binder has a print-to-PDF button that generates a PDF of its layout.
- The print-to-PDF button remains available when the binder is locked.
- Each displayed binder page is rendered as one PDF page in binder-page order.
- First and last displayed pages retain their single-sided layouts in the PDF.
- Intermediate displayed pages retain their complete left-and-right spread on one PDF page.
- The binder layout is scaled to fit the PDF page and is not rendered at its physical size.
- For a 3-by-3 binder, all 18 slots in an intermediate spread appear together on one PDF page.
- Cards and multi-slot art appear in their assigned positions in the generated PDF.
- The generated PDF includes card variation labels when the layout's variation toggle is on and omits them when the toggle is off.
- When variation labels are included, each card with a saved variation displays that variation in the PDF.
- Generating the PDF uses the shared save-status toast, downloads the file when generation succeeds, and displays the provided error if generation fails.

#### Technical requirements

- The backend generates binder layout PDFs from authoritative persisted binder, card, art, transform, style, and local image data rather than from the browser DOM or binder context.
- The backend reads one transactionally consistent snapshot of the persisted binder graph when generation starts; changes committed afterward do not appear in that PDF and are not blocked by the export.
- The backend uses `pdfkit` for streamed PDF creation, vector clipping, and transformed local-image placement.
- Every binder-layout PDF page uses US Letter landscape dimensions (`11 x 8.5` inches), including the first and last single-sided views.
- Each PDF page reserves a `0.25`-inch margin on every edge and proportionally contains the complete single page or spread within the remaining area without cropping.
- Each PDF page includes the layout's physical page label, such as `Page 1` or `Pages 4-5`, above the scaled binder view within the page margins.
- The PDF renders complete binder-side and slot boundaries, including empty slots, along with placed cards and multi-slot art.
- Binder PDF generation accepts an `includeVariations` option; when true, a card's variation overlays the bottom edge of its own rendered image (matching the layout tab's on-screen overlay, story 16) without resizing card images or grid rows.
- The frontend sets `includeVariations` from the layout tab's current persisted
  `variationsVisible` local-storage preference (Story 16); no separate export-options
  prompt is displayed.
- When that local-storage preference is off, the frontend sends `includeVariations: false`.
- Acquisition indicators, Michi indicators, pending-operation feedback, and editing controls are omitted from binder-layout PDFs.
- `POST /binders/{binderId}/exports/pdf` accepts a JSON request body containing `includeVariations` and streams the generated binder-layout PDF in the response.
- The OpenAPI request schema defines `includeVariations` as an optional boolean with a default of `false`.
- A successful response uses `Content-Type: application/pdf` and `Content-Disposition: attachment` with the sanitized binder name followed by ` Binder.pdf` (e.g. "Umbreon Binder.pdf") as the download filename.
- The backend finishes binder PDF generation in a request-scoped temporary file before sending response headers, then streams the completed file to the client without persisting it as application data.
- A generation failure before streaming returns the applicable Problem Details response and removes the temporary file without starting a download.
- A missing, unreadable, or unsupported local card or art image fails the complete export before download; the backend returns Problem Details rather than generating a PDF with an omitted item or placeholder.
- The backend removes the temporary PDF after the response completes or the client disconnects; cleanup failures are logged for maintenance and do not change a completed response.
- Binder lock state does not restrict the read-only PDF export endpoint.
- Selecting print-to-PDF displays one persistent generating toast and disables that binder's PDF export button until the request succeeds or fails.
- A successful response starts the browser download and replaces the generating toast with the shared saved toast; a failure replaces it with the shared persistent failed toast using the returned Problem Details `detail`.
