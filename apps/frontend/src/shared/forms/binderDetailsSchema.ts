import {
  BINDER_DIMENSION_MAX,
  BINDER_NAME_MAX_LENGTH,
  DEFAULT_BINDER_HEIGHT,
  DEFAULT_BINDER_PAGE_COUNT,
  DEFAULT_BINDER_WIDTH,
  DEFAULT_BORDER_COLOR,
  DEFAULT_BORDER_RADIUS_PERCENT,
  DEFAULT_BORDER_WIDTH_CM,
  DEFAULT_HEIGHT_BASE_CM,
  DEFAULT_HEIGHT_PER_SLOT_CM,
  DEFAULT_WIDTH_BASE_CM,
  DEFAULT_WIDTH_PER_SLOT_CM,
} from '@binder-project-planner/shared';
import { z } from 'zod';

// A positive-integer field shared by width, height, and pages: coerces the
// HTML number input's string value to a number, then rejects non-integers
// and values below 1 (planning.md story 4's "positive integers with a
// minimum value of 1"). `max` is only supplied for width/height, which are
// capped at `BINDER_DIMENSION_MAX`; pages has no fixed maximum.
function positiveIntegerField(label: string, max?: number) {
  const schema = z.coerce
    .number({ message: `${label} is required.` })
    .int(`${label} must be a whole number.`)
    .min(1, `${label} must be at least 1.`);

  return max === undefined ? schema : schema.max(max, `${label} must be ${max} or fewer.`);
}

// A decimal centimeters field for the story 24 per-slot dimension fields
// (`widthPerSlot`/`heightPerSlot`): coerces the HTML number input's string
// value to a number, requires it to be strictly greater than zero, then
// rounds to two decimal places (per planning.md's "accept ... to two
// decimal places") so a value like `6.856` is silently normalized rather
// than rejected.
function positiveDecimalField(label: string) {
  return z.coerce
    .number({ message: `${label} is required.` })
    .gt(0, `${label} must be greater than zero.`)
    .transform((value) => Math.round(value * 100) / 100);
}

// A decimal centimeters field with no fixed bound, for the story 24 base
// dimension fields (`widthBase`/`heightBase`), which may be negative -
// their validity depends on the corresponding per-slot field and is
// cross-field-checked below instead.
function unboundedDecimalField(label: string) {
  return z.coerce
    .number({ message: `${label} is required.` })
    .transform((value) => Math.round(value * 100) / 100);
}

// A decimal percentage field for the story 24 `borderRadius` field: 0
// through 100 inclusive, rounded to two decimal places.
function percentageField(label: string) {
  return z.coerce
    .number({ message: `${label} is required.` })
    .min(0, `${label} must be 0 or greater.`)
    .max(100, `${label} must be 100 or less.`)
    .transform((value) => Math.round(value * 100) / 100);
}

// A decimal pixels field for the story 24 `borderWidth` field: zero or
// A decimal centimeters field for the story 24 `borderWidth` field: zero or
// greater (unlike `positiveDecimalField`, zero is allowed - it means no
// border), rounded to two decimal places. Border width is a physical
// centimeters measurement (like the dimension fields above) rather than a
// percentage, so it's converted to pixels at render time using the same
// cm-to-px scale factor as the art's own image - unlike border radius,
// which intentionally scales with the frame per CSS percentage semantics.
function nonNegativeDecimalField(label: string) {
  return z.coerce
    .number({ message: `${label} is required.` })
    .min(0, `${label} must be 0 or greater.`)
    .transform((value) => Math.round(value * 100) / 100);
}

// Six-digit `#RRGGBB` hex color field (story 24): accepts either case but
// normalizes hexadecimal letters to uppercase before saving, per
// planning.md.
const borderColorField = z
  .string()
  .trim()
  .regex(/^#[0-9A-Fa-f]{6}$/, 'Border color must be a six-digit #RRGGBB hexadecimal color.')
  .transform((value) => value.toUpperCase());

// Shared Zod schema for the reusable binder-details form (story 4), used by
// both the new-binder page and the Edit Details tab (story 7). Runtime
// validation and the inferred TypeScript type both come from this one
// definition so client-side rules never drift from each other.
export const binderDetailsSchema = z
  .object({
    // Trimmed and required after trimming, per planning.md; the trimmed value
    // (not the raw input) is what gets submitted to the backend.
    name: z
      .string()
      .trim()
      .min(1, 'Binder name is required.')
      .max(
        BINDER_NAME_MAX_LENGTH,
        `Binder name must be ${BINDER_NAME_MAX_LENGTH} characters or fewer.`,
      ),
    width: positiveIntegerField('Width', BINDER_DIMENSION_MAX),
    height: positiveIntegerField('Height', BINDER_DIMENSION_MAX),
    pages: positiveIntegerField('Pages'),
    // Story 24: card/multi-slot-art dimension and style fields. Base values
    // may be negative (cross-field-validated below against their
    // corresponding per-slot value), so they get no `min`/`max` bound here.
    widthPerSlot: positiveDecimalField('Width per slot'),
    widthBase: unboundedDecimalField('Width base'),
    heightPerSlot: positiveDecimalField('Height per slot'),
    heightBase: unboundedDecimalField('Height base'),
    borderColor: borderColorField,
    borderRadius: percentageField('Border radius'),
    borderWidth: nonNegativeDecimalField('Border width'),
  })
  .superRefine((values, ctx) => {
    // Cross-field validation that can't be expressed on one field alone:
    // "base may be negative only when the one-slot formula stays positive"
    // (planning.md), mirrored by the backend's own re-check and a database
    // check constraint.
    if (values.widthPerSlot + values.widthBase <= 0) {
      ctx.addIssue({
        code: 'custom',
        path: ['widthBase'],
        message: 'The one-slot width (width per slot + width base) must be greater than zero.',
      });
    }
    if (values.heightPerSlot + values.heightBase <= 0) {
      ctx.addIssue({
        code: 'custom',
        path: ['heightBase'],
        message: 'The one-slot height (height per slot + height base) must be greater than zero.',
      });
    }
  });

// The form's *parsed* values (after Zod's `.trim()`/`z.coerce.number()` run):
// what `handleSubmit`'s callback receives and what gets submitted to the
// backend.
export type BinderDetailsFormValues = z.infer<typeof binderDetailsSchema>;

// The form's *raw* field values (before parsing) - `z.coerce.number()` widens
// its input type to `unknown` since it accepts whatever the HTML number
// input hands it. `useForm` and `BinderDetailsForm` are typed against this
// input type so registered fields and defaultValues type-check, while
// `handleSubmit` still yields the parsed `BinderDetailsFormValues` above.
export type BinderDetailsFormInput = z.input<typeof binderDetailsSchema>;

// Default field values for a brand-new binder, sourced from the canonical
// shared `defaults.ts` rather than duplicated here (per coding-conventions).
export const defaultBinderDetailsFormValues: BinderDetailsFormInput = {
  name: '',
  width: DEFAULT_BINDER_WIDTH,
  height: DEFAULT_BINDER_HEIGHT,
  pages: DEFAULT_BINDER_PAGE_COUNT,
  widthPerSlot: DEFAULT_WIDTH_PER_SLOT_CM,
  widthBase: DEFAULT_WIDTH_BASE_CM,
  heightPerSlot: DEFAULT_HEIGHT_PER_SLOT_CM,
  heightBase: DEFAULT_HEIGHT_BASE_CM,
  borderColor: DEFAULT_BORDER_COLOR,
  borderRadius: DEFAULT_BORDER_RADIUS_PERCENT,
  borderWidth: DEFAULT_BORDER_WIDTH_CM,
};
