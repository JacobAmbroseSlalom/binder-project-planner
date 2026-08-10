# 8. Visualize a basic binder layout

**Status:** Done (2026-08-01 02:29 EDT)

#### Acceptance criteria

- The "Edit Layout" tab displays a visual representation of the binder.
- Each binder side displays a grid based on the binder's width and height.
- A 3-by-3 binder side displays 9 slots.
- The first displayed page shows only the right binder side. For a 3-by-3 binder, it displays 9 slots.
- Each intermediate displayed page shows both the left and right binder sides. For a 3-by-3 binder, it displays 18 slots.
- The last displayed page shows only the left binder side. For a 3-by-3 binder, it displays 9 slots.
- The number of displayed pages is one greater than the number of pages stored in the binder data. For example, a binder with 20 stored pages has 21 displayed pages.
- Left and right arrow controls navigate backward and forward through the displayed pages.
- The left arrow is disabled on the first displayed page.
- The right arrow is disabled on the last displayed page.
- A physical card slot is 6.35 cm wide by 9 cm high.
- Binder slots and displayed cards preserve the corresponding 6.35:9 width-to-height ratio.
- The on-screen dimensions may scale responsively and do not need to equal the physical size.
- The initial binder layout editor supports desktop viewports at least 1024 CSS pixels wide.
- Returning to Edit Layout after selecting another binder tab restores the physical page or spread that was visible before leaving the layout.

#### Technical requirements

- Binder sides and slots render as semantic HTML elements arranged with CSS Grid rather than canvas or SVG.
- Each binder-side grid uses the binder width for its CSS Grid column count and the binder height for its row count.
- Slot sizing uses the CSS `aspect-ratio` property to preserve the configured width-to-height ratio responsively.
- Each complete binder-side grid scales to fit its available layout area without internal scrolling, including when large dimensions make individual slots very small.
- The canonical placement coordinates are physical page, row, and column; no separate side or flattened slot-number field is stored.
- Physical page, row, and column are one-based in the database and OpenAPI contracts.
- The backend validates that a placement's physical page is between 1 and twice the binder's stored page count and that its row and column exist within the binder's current dimensions.
- Automated layout tests cover supported viewport widths of 1024 CSS pixels and wider; narrow-screen reflow is deferred.
- Viewports narrower than 1024 CSS pixels still render the editor without a blocking notice, but their layout is not guaranteed or covered by the initial acceptance tests.
- The current spread is represented by a one-based physical page number in the layout route's `page` query parameter so refreshes and copied URLs retain the displayed spread.
- The binder route context retains the most recent valid layout focal physical page while another binder tab is active; returning to Edit Layout restores that value in the layout route's `page` query parameter without requesting binder data again.
- The retained focal page is route-local UI state rather than persisted binder data; a newly opened binder layout without a prior layout visit still defaults to physical page 1.
- The `page` query parameter retains the requested focal physical page: either page in a two-page spread displays that spread without rewriting the query parameter to its other page.
- When the `page` query parameter is absent, the layout displays physical page 1 without adding the parameter to the URL.
- A malformed, non-integer, or out-of-range `page` query value is replaced with `?page=1`, and the layout displays physical page 1.
- Arrow and direct-page navigation replace the current URL rather than adding each viewed spread to browser history.
- Only the active spread is mounted in the DOM; inactive spreads are not rendered or retained as hidden elements.
