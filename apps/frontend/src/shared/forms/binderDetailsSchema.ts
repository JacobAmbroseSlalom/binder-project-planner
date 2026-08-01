import {
  BINDER_DIMENSION_MAX,
  BINDER_NAME_MAX_LENGTH,
  DEFAULT_BINDER_HEIGHT,
  DEFAULT_BINDER_PAGE_COUNT,
  DEFAULT_BINDER_WIDTH,
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

// Shared Zod schema for the reusable binder-details form (story 4), used by
// both the new-binder page and the Edit Details tab (story 7). Runtime
// validation and the inferred TypeScript type both come from this one
// definition so client-side rules never drift from each other.
export const binderDetailsSchema = z.object({
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
};
