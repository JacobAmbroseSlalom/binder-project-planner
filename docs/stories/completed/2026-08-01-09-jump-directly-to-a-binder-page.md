# 9. Jump directly to a binder page

**Status:** Done (2026-08-01 10:23 EDT)

#### Acceptance criteria

- The current physical page number or page-number range appears above the binder visualization.
- A page number input or selector appears alongside the previous and next arrows.
- Physical page numbers account for both sides represented by each stored binder page.
- A binder with 20 stored pages has physical page numbers 1 through 40.
- Physical page 1 is displayed by itself on the right side.
- Selecting the right arrow from physical page 1 displays the spread containing physical pages 2 and 3.
- Intermediate spreads are labeled with their even-numbered left page and odd-numbered right page, such as "Pages 4–5".
- The final physical page, page 40 in a 20-page binder, is displayed by itself on the left side.
- Entering either page number from an intermediate spread navigates to that complete spread.
- Entering page 5 displays physical pages 4 and 5 together.
- The page input only accepts physical page numbers that exist in the binder.
- Using the arrows updates the page input and current-page label, and entering a page updates the displayed binder spread.

#### Technical requirements

- Direct page navigation uses an HTML number input.
- The input commits navigation when the user presses Enter or the input loses focus, not on each keystroke.
- Submitting an empty, non-integer, or out-of-range value leaves the current spread unchanged and displays the validation failure through the shared failed toast.
- After an invalid submission, the input resets to the current focal physical page.
- Next-arrow navigation selects the left physical page of the next spread, and previous-arrow navigation selects the right physical page of the previous spread; the single first or last physical page is used at the binder boundaries.
