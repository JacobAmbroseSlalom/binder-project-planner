import {
  CUSTOM_CARD_NAME_MAX_LENGTH,
  CUSTOM_CARD_NUMBER_MAX_LENGTH,
  CUSTOM_CARD_SET_MAX_LENGTH,
} from '@binder-project-planner/shared';
import { z } from 'zod';

// The card-selection modal's manual-entry form's Zod schema (story 12).
// Only the name/set/number text fields are modeled here - the required
// image file has no natural place in a `File`-unaware Zod schema shared
// with RHF's `register`/`defaultValues`, so the modal validates it
// separately (a plain "a file is required" check gating the submit
// button), matching planning.md's "Name is required" / "An image is
// required" being two independently-enforced rules. Colocated with
// `ManualCardForm.tsx` (its only consumer) rather than in `shared/forms/`,
// per styling.instructions.md's "promote only once a second place needs
// it" rule.
export const manualCardSchema = z.object({
  // Trimmed and required after trimming; the trimmed value (not the raw
  // input) is what gets submitted to the backend.
  name: z
    .string()
    .trim()
    .min(1, 'Name is required.')
    .max(
      CUSTOM_CARD_NAME_MAX_LENGTH,
      `Name must be ${CUSTOM_CARD_NAME_MAX_LENGTH} characters or fewer.`,
    ),
  // Optional trimmed strings; a blank value is normalized to `null` at
  // submission time (see CardSelectionModal.tsx), not by this schema.
  setName: z
    .string()
    .trim()
    .max(
      CUSTOM_CARD_SET_MAX_LENGTH,
      `Set must be ${CUSTOM_CARD_SET_MAX_LENGTH} characters or fewer.`,
    ),
  localNumber: z
    .string()
    .trim()
    .max(
      CUSTOM_CARD_NUMBER_MAX_LENGTH,
      `Number must be ${CUSTOM_CARD_NUMBER_MAX_LENGTH} characters or fewer.`,
    ),
});

export type ManualCardFormValues = z.infer<typeof manualCardSchema>;

// Default/blank field values for a fresh manual-entry view.
export const defaultManualCardFormValues: ManualCardFormValues = {
  name: '',
  setName: '',
  localNumber: '',
};
