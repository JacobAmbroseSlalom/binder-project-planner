import { ART_DESCRIPTION_MAX_LENGTH, ART_TITLE_MAX_LENGTH } from '@binder-project-planner/shared';
import { z } from 'zod';

// The create-art modal's title/description form fields' Zod schema (story
// 25). Only these two text fields are modeled here - the grid selection,
// image, rotation/focal/scale transforms, and border overrides are plain
// component state rather than RHF-registered fields, since they're driven
// by direct user interaction (grid hover/click, Konva drag, sliders,
// color swatches) rather than typed text input. Colocated with
// `CreateArtModal.tsx` (its only consumer) rather than in `shared/forms/`,
// per styling.instructions.md's "promote only once a second place needs
// it" rule.
export const artDetailsSchema = z.object({
  // Trimmed and required after trimming; the trimmed value (not the raw
  // input) is what gets submitted to the backend.
  title: z
    .string()
    .trim()
    .min(1, 'Title is required.')
    .max(ART_TITLE_MAX_LENGTH, `Title must be ${ART_TITLE_MAX_LENGTH} characters or fewer.`),
  // Optional trimmed string; a blank value is normalized to `null` at
  // submission time (see CreateArtModal.tsx), not by this schema.
  description: z
    .string()
    .trim()
    .max(
      ART_DESCRIPTION_MAX_LENGTH,
      `Description must be ${ART_DESCRIPTION_MAX_LENGTH} characters or fewer.`,
    ),
});

export type ArtDetailsFormValues = z.infer<typeof artDetailsSchema>;

// Default/blank field values for a fresh create-art modal.
export const defaultArtDetailsFormValues: ArtDetailsFormValues = {
  title: '',
  description: '',
};
