# 24. Configure card and multi-slot art dimensions

**Status:** Done (2026-08-02 16:26 EDT) - the documented default values (widthPerSlot
6.85 cm, widthBase -0.5 cm, heightPerSlot 9 cm, heightBase 0 cm, border color `#FFCB05`,
border radius 38%, border width 11) were used as-is without changes, resolving the
"verify all supplied default values" TBD below.

**Update (2026-08-03):** Border width was changed from a percentage to a fixed pixel
value after story 25's on-screen rendering showed that a percentage-based width - like
border radius - grows and shrinks with the frame's own size, so the same binder-level
setting looked inconsistently thick across different art sizes. Border radius is
unaffected and still follows the CSS percentage semantics described below.

**Update (2026-08-03, later the same day):** Border width was changed again, from a
fixed pixel value to a physical centimeters measurement (default `0.25` cm) - a fixed
pixel count doesn't correspond to any real-world size and doesn't scale with the
rendered preview/print size the way the rest of the app's physical (cm-based)
dimensions do. The frontend now converts the stored centimeters value to pixels at
render time using the same cm-to-px scale factor as the art's own image, so the
rendered border thickness stays physically proportional to the art's actual size. This
also resolves the border-width-basis TBD below (a physical measurement has no
frame-relative "basis" to define, unlike a percentage).

#### Acceptance criteria

- The reusable binder-details form on the new binder page and the "Edit Details" tab has editable fields for the width per slot and width base values.
- Width per slot defaults to 6.85 cm and width base defaults to -0.5 cm.
- Displayed width is calculated as `(number of slots x width per slot) + width base`.
- With the default width values, widths of 1, 2, and 3 slots are 6.35 cm, 13.2 cm, and 20.05 cm.
- The reusable binder-details form has editable fields for the height per slot and height base values on both pages.
- Height per slot defaults to 9 cm and height base defaults to 0 cm.
- Displayed height is calculated as `(number of slots x height per slot) + height base`.
- With the default height values, heights of 1, 2, and 3 slots are 9 cm, 18 cm, and 27 cm.
- The reusable binder-details form has editable multi-slot art fields for border color, border radius, and border width on both pages.
- Border color defaults to `#FFCB05`.
- Border radius defaults to 38%.
- Border width defaults to 0.25 cm.
- The dimension and multi-slot art values are saved with the binder through the backend.
- Saving dimension and multi-slot art settings uses the shared save-status toast and preserves the entered values for correction if saving fails.

#### Technical requirements

- Dimension values accept centimeters to two decimal places, border radius accepts a percentage to two decimal places, and border width accepts centimeters to two decimal places.
- REST contracts expose decimal values in their documented human-readable units; the database stores centimeters and percentages as integer hundredths of their respective unit to avoid floating-point drift.
- Width-per-slot and height-per-slot values must be greater than zero; base values may be negative only when the corresponding one-slot formula produces a result greater than zero.
- Border radius must be between `0%` and `100%`, inclusive. Border width must be `0` cm or greater, with no fixed upper bound.
- Border color uses a color input paired with an editable text value, accepts only six-digit `#RRGGBB` hexadecimal colors, and normalizes hexadecimal letters to uppercase before saving.
- Border radius is a percentage of the SHORTER of the frame's width/height, applied equally on both axes (a circular, not elliptical, corner), across editor, layout, preview, and print rendering - avoiding a lopsided, extremely-stretched corner on aspect ratios far from square (e.g. a 1x2 multi-slot art item).
- Border width is a physical centimeters measurement rather than a percentage or a fixed pixel count, converted to pixels at render time using the same cm-to-px scale factor as the art's own image, so it renders physically consistently across different art sizes and preview scales.
- The configured one-slot width and height define the binder's on-screen slot and card aspect ratio and are also the basis for multi-slot-art and print dimensions; the default formulas retain the initial `6.35:9` one-slot ratio.
