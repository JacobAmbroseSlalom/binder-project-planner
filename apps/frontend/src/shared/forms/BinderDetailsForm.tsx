'use client';

import {
  DEFAULT_BORDER_COLOR,
  DEFAULT_BORDER_RADIUS_PERCENT,
  DEFAULT_BORDER_WIDTH_CM,
  DEFAULT_HEIGHT_BASE_CM,
  DEFAULT_HEIGHT_PER_SLOT_CM,
  DEFAULT_WIDTH_BASE_CM,
  DEFAULT_WIDTH_PER_SLOT_CM,
} from '@binder-project-planner/shared';
import { RotateCcw } from 'lucide-react';
import { useEffect, useState } from 'react';
import type { UseFormReturn } from 'react-hook-form';

import { listTagSuggestions } from '@/lib/api';
import { Tooltip } from '@/shared/feedback';

import type { BinderDetailsFormInput, BinderDetailsFormValues } from './binderDetailsSchema';
import { BinderSettingsArtPreview, BinderSettingsLayoutPreview } from './BinderSettingsPreview';
import { TagsInput } from './TagsInput';

// The filled-input treatment documented in styling.instructions.md's "Forms &
// inputs" section: neutral-800 fill, no visible resting border, primary
// border on focus.
const inputClassName =
  'rounded-standard border border-transparent bg-neutral-800 px-3 py-2 placeholder:text-neutral-500 focus:border-primary focus:outline-none';

// The same treatment with the documented error-state tint layered on top.
const errorInputClassName = `${inputClassName} border-error bg-error/10 ring-2 ring-error`;

interface BinderDetailsFormProps {
  // The parent owns the `useForm` instance (and therefore submission
  // behavior) since different pages need different submit semantics: the
  // new-binder page submits on a Create button click (story 4), while the
  // later Edit Details tab saves valid dirty fields on blur (story 7). Typed
  // against the form's raw input values (see binderDetailsSchema.ts) since
  // that's what registered fields and defaultValues use; `handleSubmit`
  // still yields the parsed `BinderDetailsFormValues` output type.
  form: UseFormReturn<BinderDetailsFormInput, unknown, BinderDetailsFormValues>;
  // Disables every field, e.g. while a create/save request is in flight.
  disabled?: boolean;
}

// One labeled numeric or text field, reducing repetition across the 4
// binder-detail fields below without introducing a general-purpose
// cross-file abstraction (this stays private to this one component).
function Field({
  label,
  htmlFor,
  error,
  className,
  children,
}: {
  label: string;
  htmlFor: string;
  error?: string;
  // Lets call sites opt individual fields into `flex-1` within a
  // `flex-wrap` row, so rows with fewer fields (e.g. the story-24 rows
  // below, with 2-3 fields instead of 3) stretch to fill the same total
  // row width as the row above them rather than sitting narrower.
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={`flex flex-col gap-1 ${className ?? ''}`}>
      <label htmlFor={htmlFor} className="text-caption text-neutral-500">
        {label}
      </label>
      {children}
      {error && (
        <p role="alert" className="text-caption text-error">
          {error}
        </p>
      )}
    </div>
  );
}

// An icon-only button that resets just one story-24 row's fields back to
// their defaults (each row wires its own `onClick` handler with the
// specific fields/values it owns). Colocated here rather than promoted to
// `src/shared/buttons/` since this file is still its only consumer. The
// "Reset to default" label is exposed via the shared instant `Tooltip`
// and `aria-label` rather than always-visible text, since the icon alone
// is enough once its meaning is established.
//
// Mirrors `Field`'s two-row layout (an invisible label-height spacer, then
// a box matching the real inputs' rendered height) so the button ends up
// vertically centered against the input itself - not the whole row (which
// is taller once you include the label above the input) - even though the
// surrounding row uses `items-end` to bottom-align every field. `h-10`
// (rather than reusing the inputs' `px-3 py-2` padding) is used because an
// `<input>`'s line-height doesn't match a plain `<div>`'s at the same
// padding, so matching padding alone left the icon slightly off-center;
// `h-10` is the same fixed height already used for the border-color swatch
// beside a text input, confirming that's what these filled inputs render
// at. The spacer holds a non-breaking space rather than `label` itself -
// `label` is only meant to name the button for the tooltip/aria-label
// below, but reusing that full sentence as the spacer's visible (if
// invisible) content made this column as wide as the sentence's rendered
// text, stealing space from the row's `flex-1` fields instead of staying
// button-sized.
function ResetButton({
  label,
  disabled,
  onClick,
}: {
  label: string;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <div className="flex flex-col gap-1">
      <span aria-hidden="true" className="invisible text-caption">
        {'\u00A0'}
      </span>
      <div className="flex h-10 items-center">
        <Tooltip label="Reset to default">
          <button
            type="button"
            disabled={disabled}
            onClick={(event) => {
              onClick();
              // The "Edit Details" tab (story 7) saves dirty fields on
              // `blur`, bubbling up from whichever field loses focus - but
              // resetting via this button doesn't blur an input itself, so
              // without an explicit blur here the just-reset values would
              // sit dirty and unsaved until the user happened to focus/blur
              // something else. Blurring the button immediately after
              // applying the reset mirrors a normal field edit + blur.
              event.currentTarget.blur();
            }}
            aria-label={`Reset ${label} to default`}
            className={`text-neutral-500 hover:text-primary ${
              disabled ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'
            }`}
          >
            <RotateCcw className="size-6" />
          </button>
        </Tooltip>
      </div>
    </div>
  );
}

// Computes the live "N slot(s): X cm" example text shown below the
// width/height-per-slot rows, for the first three slot counts, from the
// current form values - e.g. the defaults (6.85 per slot, -0.5 base)
// produce "1 slot: 6.35 cm · 2 slots: 13.20 cm · 3 slots: 20.05 cm". Returns
// `null` while either value isn't yet a valid number (blank or mid-edit)
// rather than showing a broken/NaN example. `perSlot`/`base` are typed
// `unknown` because `watch()` returns the form's raw (pre-Zod-coercion)
// input type.
function formatSlotSizeExamples(perSlot: unknown, base: unknown): string | null {
  const perSlotValue = typeof perSlot === 'number' && Number.isFinite(perSlot) ? perSlot : null;
  const baseValue = typeof base === 'number' && Number.isFinite(base) ? base : null;
  if (perSlotValue === null || baseValue === null) {
    return null;
  }

  return [1, 2, 3]
    .map((slots) => {
      const sizeCm = Math.round((slots * perSlotValue + baseValue) * 100) / 100;
      return `${slots} slot${slots === 1 ? '' : 's'}: ${sizeCm.toFixed(2)} cm`;
    })
    .join(' · ');
}

// The reusable binder-details form fields (story 4: "Create a new binder").
// Used by the new-binder page and the view/edit binder page's "Edit
// Details" tab (story 7) so both places share one set of fields,
// validation, and defaults. Story 24 adds the card/multi-slot-art
// dimension and border-style fields below.
export function BinderDetailsForm({ form, disabled }: BinderDetailsFormProps) {
  const {
    register,
    watch,
    formState: { errors },
  } = form;

  // Story 51: the tags combobox's suggestion list - fetched once here
  // (rather than by each of this form's two callers separately) since both
  // the create-binder page and the Edit Details tab render this same
  // component. A fetch failure is treated as "no suggestions yet" rather
  // than an error state - freeform tag entry still works either way, and
  // this list is a convenience, not a requirement for the field to
  // function.
  const [tagSuggestions, setTagSuggestions] = useState<string[]>([]);
  useEffect(() => {
    const controller = new AbortController();

    listTagSuggestions(controller.signal)
      .then(setTagSuggestions)
      .catch(() => {
        // Ignored - see the comment above `tagSuggestions` for why a
        // failed fetch doesn't surface an error.
      });

    return () => controller.abort();
  }, []);

  // The color-swatch input mirrors the editable text field below it (per
  // planning.md's "color input paired with an editable text value"). Its
  // own `value` must always be a well-formed 6-digit hex string or the
  // browser silently ignores it, so an in-progress/invalid text value
  // falls back to black for the swatch alone - the text field itself keeps
  // showing exactly what the user typed.
  const borderColorValue = watch('borderColor');
  const swatchValue = /^#[0-9A-Fa-f]{6}$/.test(borderColorValue ?? '')
    ? (borderColorValue as string)
    : '#000000';

  // Live 1/2/3-slot size examples shown below the width/height-per-slot
  // rows so the `(slots * perSlot) + base` formula's effect is concrete
  // rather than purely abstract.
  const widthSizeExamples = formatSlotSizeExamples(watch('widthPerSlot'), watch('widthBase'));
  const heightSizeExamples = formatSlotSizeExamples(watch('heightPerSlot'), watch('heightBase'));

  // Each story-24 row's own reset handler restores only the fields that
  // row owns, leaving every other field (including the other two rows)
  // untouched.
  const resetWidthRow = () => {
    form.setValue('widthPerSlot', DEFAULT_WIDTH_PER_SLOT_CM, {
      shouldDirty: true,
      shouldValidate: true,
    });
    form.setValue('widthBase', DEFAULT_WIDTH_BASE_CM, { shouldDirty: true, shouldValidate: true });
  };
  const resetHeightRow = () => {
    form.setValue('heightPerSlot', DEFAULT_HEIGHT_PER_SLOT_CM, {
      shouldDirty: true,
      shouldValidate: true,
    });
    form.setValue('heightBase', DEFAULT_HEIGHT_BASE_CM, {
      shouldDirty: true,
      shouldValidate: true,
    });
  };
  const resetBorderStyleRow = () => {
    form.setValue('borderColor', DEFAULT_BORDER_COLOR, { shouldDirty: true, shouldValidate: true });
    form.setValue('borderRadius', DEFAULT_BORDER_RADIUS_PERCENT, {
      shouldDirty: true,
      shouldValidate: true,
    });
    form.setValue('borderWidth', DEFAULT_BORDER_WIDTH_CM, {
      shouldDirty: true,
      shouldValidate: true,
    });
  };

  return (
    <div className="flex flex-col gap-6">
      <Field label="Binder name" htmlFor="binder-name" error={errors.name?.message}>
        <input
          id="binder-name"
          type="text"
          disabled={disabled}
          className={errors.name ? errorInputClassName : inputClassName}
          {...register('name')}
        />
      </Field>
      {/* Story 51: directly below the binder name field, per its own
          acceptance criteria. */}
      <Field label="Tags" htmlFor="binder-tags" error={errors.tags?.message}>
        <TagsInput
          id="binder-tags"
          value={watch('tags')}
          onChange={(next) =>
            form.setValue('tags', next, { shouldDirty: true, shouldValidate: true })
          }
          suggestions={tagSuggestions}
          disabled={disabled}
        />
      </Field>
      {/* Page-count fields first (story 42 reorder): the stored page count
          and, per story 20, the physical page (1-based, either page of a
          two-page spread) the home-page preview renders - validated as an
          integer from 1 through twice the stored page count (see
          binderDetailsSchema.ts's cross-field refinement). */}
      <div className="flex flex-wrap gap-6">
        <Field
          label="Pages (front and back)"
          htmlFor="binder-pages"
          error={errors.pages?.message}
          className="flex-1"
        >
          <input
            id="binder-pages"
            type="number"
            min={1}
            step={1}
            disabled={disabled}
            className={errors.pages ? errorInputClassName : inputClassName}
            {...register('pages', { valueAsNumber: true })}
          />
        </Field>
        <Field
          label="Preview page"
          htmlFor="binder-preview-physical-page"
          error={errors.previewPhysicalPage?.message}
          className="flex-1"
        >
          <input
            id="binder-preview-physical-page"
            type="number"
            min={1}
            step={1}
            disabled={disabled}
            className={errors.previewPhysicalPage ? errorInputClassName : inputClassName}
            {...register('previewPhysicalPage', { valueAsNumber: true })}
          />
        </Field>
      </div>
      {/* Width/height next, immediately above the live layout-spread
          preview they drive (story 42 reorder). */}
      <div className="flex flex-wrap gap-6">
        <Field
          label="Width (slots)"
          htmlFor="binder-width"
          error={errors.width?.message}
          className="flex-1"
        >
          <input
            id="binder-width"
            type="number"
            min={1}
            step={1}
            disabled={disabled}
            className={errors.width ? errorInputClassName : inputClassName}
            {...register('width', { valueAsNumber: true })}
          />
        </Field>
        <Field
          label="Height (slots)"
          htmlFor="binder-height"
          error={errors.height?.message}
          className="flex-1"
        >
          <input
            id="binder-height"
            type="number"
            min={1}
            step={1}
            disabled={disabled}
            className={errors.height ? errorInputClassName : inputClassName}
            {...register('height', { valueAsNumber: true })}
          />
        </Field>
      </div>

      {/* Story 42: the live layout-spread preview, directly below the
          width/height fields that size it. */}
      <BinderSettingsLayoutPreview form={form} />

      {/* Separates the original story-4 identity/layout fields above from
          story 24's card/multi-slot-art dimension and border-style fields
          below. */}
      <hr className="border-t border-neutral-700" />

      {/* Story 24: card/multi-slot-art dimension fields. Displayed width is
          `(slots * widthPerSlot) + widthBase`, and displayed height is
          `(slots * heightPerSlot) + heightBase`. Width and height fields
          each get their own row so the pairing stays clear regardless of
          viewport width. */}
      <div className="flex flex-col gap-6">
        <div className="flex flex-col gap-2">
          <div className="flex flex-wrap items-end gap-6">
            <Field
              label="Width per slot (cm)"
              htmlFor="binder-width-per-slot"
              error={errors.widthPerSlot?.message}
              className="flex-1"
            >
              <input
                id="binder-width-per-slot"
                type="number"
                step={0.01}
                disabled={disabled}
                className={errors.widthPerSlot ? errorInputClassName : inputClassName}
                {...register('widthPerSlot', { valueAsNumber: true })}
              />
            </Field>
            <Field
              label="Width base (cm)"
              htmlFor="binder-width-base"
              error={errors.widthBase?.message}
              className="flex-1"
            >
              <input
                id="binder-width-base"
                type="number"
                step={0.01}
                disabled={disabled}
                className={errors.widthBase ? errorInputClassName : inputClassName}
                {...register('widthBase', { valueAsNumber: true })}
              />
            </Field>
            <ResetButton label="width fields" disabled={disabled} onClick={resetWidthRow} />
          </div>
          {widthSizeExamples && (
            <p className="text-caption text-neutral-500">{widthSizeExamples}</p>
          )}
        </div>
        <div className="flex flex-col gap-2">
          <div className="flex flex-wrap items-end gap-6">
            <Field
              label="Height per slot (cm)"
              htmlFor="binder-height-per-slot"
              error={errors.heightPerSlot?.message}
              className="flex-1"
            >
              <input
                id="binder-height-per-slot"
                type="number"
                step={0.01}
                disabled={disabled}
                className={errors.heightPerSlot ? errorInputClassName : inputClassName}
                {...register('heightPerSlot', { valueAsNumber: true })}
              />
            </Field>
            <Field
              label="Height base (cm)"
              htmlFor="binder-height-base"
              error={errors.heightBase?.message}
              className="flex-1"
            >
              <input
                id="binder-height-base"
                type="number"
                step={0.01}
                disabled={disabled}
                className={errors.heightBase ? errorInputClassName : inputClassName}
                {...register('heightBase', { valueAsNumber: true })}
              />
            </Field>
            <ResetButton label="height fields" disabled={disabled} onClick={resetHeightRow} />
          </div>
          {heightSizeExamples && (
            <p className="text-caption text-neutral-500">{heightSizeExamples}</p>
          )}
        </div>
      </div>

      {/* Story 24: multi-slot-art border-style fields, applied per binder
          and overridable per art item (story 25). */}
      <div className="flex flex-wrap items-end gap-6">
        <Field
          label="Border color"
          htmlFor="binder-border-color"
          error={errors.borderColor?.message}
          className="flex-1"
        >
          <div className="flex items-center gap-2">
            <input
              id="binder-border-color-swatch"
              type="color"
              aria-label="Border color swatch"
              disabled={disabled}
              value={swatchValue}
              onChange={(event) =>
                form.setValue('borderColor', event.target.value.toUpperCase(), {
                  shouldDirty: true,
                  shouldValidate: true,
                })
              }
              className="h-10 w-10 cursor-pointer rounded-standard border border-transparent bg-neutral-800 disabled:cursor-not-allowed disabled:opacity-50"
            />
            <input
              id="binder-border-color"
              type="text"
              disabled={disabled}
              className={`${errors.borderColor ? errorInputClassName : inputClassName} w-28`}
              {...register('borderColor')}
            />
          </div>
        </Field>
        <Field
          label="Border radius (%)"
          htmlFor="binder-border-radius"
          error={errors.borderRadius?.message}
          className="flex-1"
        >
          <input
            id="binder-border-radius"
            type="number"
            min={0}
            max={100}
            step={0.01}
            disabled={disabled}
            className={errors.borderRadius ? errorInputClassName : inputClassName}
            {...register('borderRadius', { valueAsNumber: true })}
          />
        </Field>
        <Field
          label="Border width (cm)"
          htmlFor="binder-border-width"
          error={errors.borderWidth?.message}
          className="flex-1"
        >
          <input
            id="binder-border-width"
            type="number"
            min={0}
            step={0.01}
            disabled={disabled}
            className={errors.borderWidth ? errorInputClassName : inputClassName}
            {...register('borderWidth', { valueAsNumber: true })}
          />
        </Field>
        <ResetButton
          label="border style fields"
          disabled={disabled}
          onClick={resetBorderStyleRow}
        />
      </div>

      {/* Story 42: the live art border-outline example, directly below
            the border-style fields that drive it. */}
      <BinderSettingsArtPreview form={form} />
    </div>
  );
}
