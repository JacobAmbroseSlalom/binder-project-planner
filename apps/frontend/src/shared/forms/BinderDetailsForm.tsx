'use client';

import type { UseFormReturn } from 'react-hook-form';

import type { BinderDetailsFormInput, BinderDetailsFormValues } from './binderDetailsSchema';

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
  children,
}: {
  label: string;
  htmlFor: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1">
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

// The reusable binder-details form fields (story 4: "Create a new binder").
// Used by the new-binder page today and, per planning.md story 7, will also
// back the view/edit binder page's "Edit Details" tab so both places share
// one set of fields, validation, and defaults.
export function BinderDetailsForm({ form, disabled }: BinderDetailsFormProps) {
  const {
    register,
    formState: { errors },
  } = form;

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
      <div className="flex flex-wrap gap-6">
        <Field label="Width (slots)" htmlFor="binder-width" error={errors.width?.message}>
          <input
            id="binder-width"
            type="number"
            min={1}
            step={1}
            disabled={disabled}
            className={errors.width ? errorInputClassName : inputClassName}
            {...register('width')}
          />
        </Field>
        <Field label="Height (slots)" htmlFor="binder-height" error={errors.height?.message}>
          <input
            id="binder-height"
            type="number"
            min={1}
            step={1}
            disabled={disabled}
            className={errors.height ? errorInputClassName : inputClassName}
            {...register('height')}
          />
        </Field>
        <Field label="Pages (front and back)" htmlFor="binder-pages" error={errors.pages?.message}>
          <input
            id="binder-pages"
            type="number"
            min={1}
            step={1}
            disabled={disabled}
            className={errors.pages ? errorInputClassName : inputClassName}
            {...register('pages')}
          />
        </Field>
      </div>
    </div>
  );
}
