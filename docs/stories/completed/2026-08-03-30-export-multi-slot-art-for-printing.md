# 30. Export multi-slot art for printing

**Status:** Done (2026-08-03 12:40 EDT)

#### Acceptance criteria

- The binder has a print-art PDF button that opens an art-selection modal rather than immediately generating a PDF.
- The modal lists every piece of the binder's currently placed multi-slot art, with every listed piece pre-selected for inclusion.
- Unplaced multi-slot art is never listed in the modal and is never included in the PDF.
- The user can deselect and reselect individual pieces of listed art before confirming.
- The modal has a Print button that generates a PDF containing only the currently selected art and no cards.
- Closing or cancelling the modal without selecting Print changes nothing and generates no PDF.
- When the binder has no placed multi-slot art, the print-art PDF button is disabled and its tooltip explains that placed art is required, and the modal cannot be opened.
- The print-art PDF button remains available when the binder is locked and placed art exists.
- Selecting Print in the modal uses the shared save-status toast, downloads the file when generation succeeds, and displays the provided error if generation fails.
- PDF pages use a landscape orientation.
- Each piece of art is rendered at its configured physical dimensions rather than scaled to fit a binder view.
- The configured physical width and height measure the complete outside edge of the bordered art frame.
- A piece of art that cannot fit on one PDF page in either orientation is tiled across multiple pages at its configured physical dimensions rather than scaled down or omitted.
- Adjacent pages for one tiled piece repeat `0.25` inch of content to support trimming and alignment during assembly.
- Tiled pages do not add art titles, tile numbers, row or column labels, or other assembly text.
- Other art may be packed into unused regions of a tiled page when it fits at exact scale with the required spacing.
- With the default dimension settings, each slot occupied by art represents 6.35 cm of width and 9 cm of height, adjusted by the configured multi-slot dimension formulas.
- Each piece of art retains its saved image positioning, scaling, aspect-ratio adjustments, and border settings.
- The configured art border serves as the cutting reference; the PDF does not add crop marks or separate cut lines.
- White space separates each piece of art from other art and from the page edges.
- PDF pages reserve `0.25` inch at every edge and at least `0.25` inch between separate art pieces.
- Art edges are aligned where possible to make physical cutting easier.
- Art is arranged across PDF pages to reduce page count and unused space while preserving its physical dimensions and required spacing; a mathematically optimal arrangement is not required.
- Individual pieces of art may be rotated 90 degrees on the PDF page when doing so improves packing efficiency.
- Art may be reordered independently of its binder-page placement to improve packing efficiency.
- With the current default dimension settings, two default 2-by-2 pieces, four default 2-by-1 pieces, or eight default 1-by-1 pieces each fit together on one page with room to spare.
- When the art does not fit on one page, the remaining art is efficiently arranged on additional landscape pages.

#### Technical requirements

- The backend generates multi-slot-art print PDFs using PDFKit and authoritative persisted binder, art, transform, style, and local image data.
- PDFKit draws the resolved art border inward from the configured frame boundary, so border width does not increase the printed footprint used for packing or tiling.
- The backend reads one transactionally consistent snapshot of the persisted binder and placed-art graph when generation starts; changes committed afterward do not appear in that PDF and are not blocked by the export.
- The export query includes only art with non-null placement coordinates in the selected binder, further restricted to the request's selected art UUIDs, and renders each included art record exactly once; binder cards, unplaced art, and deselected placed art are excluded.
- If no placed art exists when the export request is processed, the backend returns a request-validation Problem Details response and does not generate a PDF.
- `POST /binders/{binderId}/exports/art-pdf` accepts a JSON request body containing the array of selected placed-art UUIDs to include.
- The backend validates that every submitted UUID currently identifies placed art in the binder; a submitted UUID that is not currently placed art in the binder, or an empty array, returns a request-validation Problem Details response and does not generate a PDF.
- The modal's art list and pre-selected state are derived entirely from the placed multi-slot art already loaded in the binder-scoped React context; opening the modal makes no additional backend request.
- Every art-print PDF page uses US Letter landscape dimensions (`11 x 8.5` inches).
- `ART_PRINT_PAGE_MARGIN_INCHES` defaults to `0.1` and `ART_PRINT_ITEM_GAP_INCHES` defaults to `0.25` in the canonical shared `defaults.ts`.
- The packing algorithm treats the page margins as unavailable area and enforces the item gap between distinct art regions, including other art packed beside an oversized-art tile region.
- The packing algorithm may rotate a fully composed art frame by 90 degrees; the border, clipped transformed image, and physical width and height rotate together without distortion or rescaling.
- Placement coordinates determine whether art is included but do not determine print order; the packing result is deterministic for the same export snapshot and configuration.
- Packing uses a documented deterministic rectangle-packing heuristic that prioritizes fewer pages and then lower unused area; automated tests cover stable ordering, rotation, spacing, and page-boundary behavior.
- Art that exceeds the usable area of one page in both orientations is rendered at exact scale as a deterministic grid of page tiles whose combined content reconstructs the complete composed art frame.
- `ART_PRINT_TILE_OVERLAP_INCHES` defaults to `0.25` in the canonical shared `defaults.ts` and defines the repeated horizontal and vertical content overlap between adjacent tiles.
- Tile overlap duplicates content without changing the art's coordinate scale or configured physical dimensions.
- Oversized-art tile pages render no export-specific assembly labels or marks in their margins.
- A tiled art region participates in the same deterministic packing model as a normal art rectangle; remaining page regions may hold other art when all bounds and spacing constraints are satisfied.
- PDFKit renders only each art piece's configured border around its frame and does not draw export-specific crop marks or cutting guides.
- `POST /binders/{binderId}/exports/art-pdf` generates and returns the placed-art print PDF; its OpenAPI operation is distinct from the binder-layout PDF export.
- A successful response uses `Content-Type: application/pdf` and `Content-Disposition: attachment` with the sanitized binder name followed by `-art.pdf` as the download filename.
- Binder lock state does not restrict the read-only placed-art PDF export endpoint.
- The backend finishes art PDF generation in a request-scoped temporary file before sending response headers, then streams the completed file without persisting it as application data.
- A generation failure before streaming returns the applicable Problem Details response and removes the temporary file without starting a download.
- A missing, unreadable, or unsupported local image for any included art record fails the complete export before download; the backend returns Problem Details rather than skipping the art or rendering a placeholder.
- The backend removes the temporary PDF after the response completes or the client disconnects; cleanup failures are logged for maintenance and do not change a completed response.
- Selecting Print in the modal displays one persistent generating toast and disables that binder's art-export button and the modal's Print button until the request succeeds or fails.
- A successful response starts the browser download, closes the modal, and replaces the generating toast with the shared saved toast; a failure keeps the modal open with its selections intact and replaces the generating toast with the shared persistent failed toast using the returned Problem Details `detail`.
