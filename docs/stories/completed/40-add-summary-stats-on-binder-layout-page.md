# 40. Add summary stats on Binder Layout Page

**Status:** Done (2026-08-03 23:11 EDT) - a client-side `BinderLayoutSummaryStats` component renders on one line above the spread label on the Edit Layout tab, showing `occupied/total slots filled (percent%)` (success color + checkmark when full) plus unplaced card/art counts and the slots the unplaced art would occupy; when the unplaced cards and art together need more slots than remain empty, the unplaced figure turns the error color (the color alone is the indicator, no shortfall message). Computed entirely from the loaded cards/art and `getTotalSlots`; no backend change.

#### Acceptance criteria

- The "Edit Layout" tab displays a summary stats line directly above the spread's page label (e.g. "Page 1" or "Pages 4-5"), which sits above the binder visualization.
- The summary shows how many of the binder's slots are filled as `occupied/total slots filled (percent%)` - for example, `58/360 slots filled (16%)` - matching the home-page completion metric's wording (story 22).
- A slot is counted as filled when it holds a placed card or is covered by placed multi-slot art; slots covered by overlapping items are counted once.
- When every slot in the binder is filled, the slots-filled figure is shown in the success color with a checkmark, matching the home-page fully-filled indicator (story 22).
- The summary shows the number of unplaced cards.
- The summary shows the number of unplaced multi-slot art items and the total number of slots those items would occupy (each art item occupies its width-in-slots times its height-in-slots).
- The summary makes it easy to identify when there is not enough remaining room in the binder for everything in the unplaced sections.
- When the slots needed by all unplaced cards and unplaced art together exceed the binder's remaining empty slots, the unplaced figure is shown in the error color as the over-capacity indicator.
- When the unplaced cards and art together fit within the remaining empty slots, the unplaced figures are shown in the normal muted style.
- The summary stats update immediately as cards or art are added, removed, placed, unplaced, moved, or duplicated, without reloading the binder.

#### Technical requirements

- The summary stats are computed entirely client-side from the cards and art already loaded in the binder route context plus the binder's dimensions; no backend request is made and no new endpoint or binder-summary field is added.
- Total slots is `width * height * (2 * pages)`, reusing the shared `getTotalSlots` helper (story 22) rather than recomputing the formula inline.
- Occupied slots is the number of distinct slots holding a placed card or covered by a placed multi-slot-art footprint across all physical pages, deduplicated across overlaps (the same definition as story 22's `occupiedSlots`); empty slots is `total - occupied`. This client-side occupancy count is derived from the loaded cards and art, mirroring the backend's `countOccupiedSlots` logic (a card contributes its single placed cell; an art item contributes every cell in its `row..row+heightSlots-1` by `column..column+widthSlots-1` footprint).
- Unplaced cards are cards whose placement coordinates are all null; unplaced art are art items whose placement coordinates are all null.
- Slots needed by unplaced items is `(number of unplaced cards) + sum over unplaced art of (widthSlots * heightSlots)`. Cards and art are counted together against the single remaining-empty-slots figure; they are not tracked as separate capacities.
- The binder is over capacity when slots-needed is greater than empty-slots-remaining; that comparison drives the error color on the unplaced figure (no separate shortfall message is shown).
- Colors use the existing design tokens: `text-success` with a `lucide-react` `Check` icon when the binder is fully occupied, `text-error` on the unplaced figure when over capacity, and `text-neutral-500` otherwise.
- The slot-completion percentage is rounded to the nearest whole percent and derived from occupied/total; total is always at least 1 (width, height, and pages are each at least 1), so no divide-by-zero guard is needed.
- The stats line renders within the center column of the "Edit Layout" tab, above the existing spread page label, and does not alter the existing toolbar, page navigation, or spread rendering.
