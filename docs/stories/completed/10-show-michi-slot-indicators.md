# 10. Show Michi slot indicators

**Status:** Done (2026-08-01 12:14 EDT)

#### Acceptance criteria

- The "Edit Layout" tab has a toggle for showing Michi slot indicators.
- The toggle defaults to off.
- When the toggle is on, each intermediate layout view displays the left and right binder
  sides together as a spread so the Michi placements can be understood across both sides.
- The first layout view remains right-side-only and the last remains left-side-only when
  Michi indicators are on; indicators appear for the binder side that exists.
- A Michi indicator appears above each gap between paired columns whose slot openings
  face toward each other.
- Columns are numbered from left to right across the complete binder spread.
- On each binder side, columns are paired from the outside edge toward the binder spine.
- For an odd binder width, the column nearest the spine on each side is not paired.
- A 3-wide binder displays indicators between columns 1 and 2 and between columns 5 and 6.
- A 5-wide binder displays indicators between columns 1 and 2, 3 and 4, 7 and 8, and 9
  and 10.
- For an even binder width, every column is paired.
- A 4-wide binder displays indicators between columns 1 and 2, 3 and 4, 5 and 6, and 7
  and 8.
- Turning the toggle off hides all Michi indicators.

#### Technical requirements

- Michi-indicator visibility is a persisted preference remembered across binders and
  reloads via browser local storage (matching the later notes-visibility precedent,
  Story 23), not a layout route query parameter; it is not stored by the backend and
  defaults to hidden until a preference is saved.
- Toggling Michi indicators updates the persisted local-storage preference; it has no
  effect on the route's query parameters.
- Any invalid stored value is treated as disabled.
- A frontend pure function derives indicator gaps from the binder width and binder side at render time; Michi pair positions are not returned by the API or persisted.
- Unit tests cover the derived pair gaps for odd and even binder widths on left-only, right-only, and two-sided spreads.
- Indicator elements are noninteractive, excluded from the tab order, and hidden from the accessibility tree.
