'use client';

import { CUSTOM_CARD_IMAGE_ACCEPT } from '@binder-project-planner/shared';
import { ImageIcon, Trash2, UploadCloud } from 'lucide-react';
import { useRef } from 'react';
import type { UseFormReturn } from 'react-hook-form';

import type { ManualCardFormValues } from './manualCardSchema';

// The same filled-input treatment used by BinderDetailsForm.tsx
// (styling.instructions.md's "Forms & inputs" section).
const inputClassName =
  'rounded-standard border border-transparent bg-neutral-800 px-3 py-2 placeholder:text-neutral-500 focus:border-primary focus:outline-none';
const errorInputClassName = `${inputClassName} border-error bg-error/10 ring-2 ring-error`;

// One labeled text field, matching BinderDetailsForm.tsx's private `Field`
// helper (kept separate per-file since each is small and only used by its
// own form).
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
  // Lets callers control this field's width within a row (e.g. `flex-1` to
  // fill remaining space, or a fixed width to stay put) without every
  // `Field` needing its own bespoke sizing logic.
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

interface ManualCardFormProps {
  form: UseFormReturn<ManualCardFormValues>;
  // Disables every field, e.g. while the optimistic-add request is in
  // flight (though the modal itself closes immediately on submit per
  // story 12, so this is mostly relevant if a future flow awaits the
  // request before closing).
  disabled?: boolean;
  // The currently selected image file's object-URL preview (`null` until
  // a file is chosen) - owned by the parent (CardSelectionModal) since it
  // also needs the underlying `File` itself to gate the submit button and
  // build the multipart request.
  previewUrl: string | null;
  // The selected file's name, shown in the row below the dropzone (`null`
  // renders the "No file selected" placeholder there).
  fileName: string | null;
  onFileChange: (file: File | null) => void;
  // Shown only after a submit attempt without a file, matching RHF's own
  // error-message styling for the text fields even though this isn't an
  // RHF-managed field.
  fileError?: string;
}

// The card-selection modal's manual-entry form fields (story 12: "Add a
// custom card manually"): name, set, number, and an image file picker with
// a live preview. Rendered in place of the search view within
// CardSelectionModal.tsx rather than as a separate nested modal.
export function ManualCardForm({
  form,
  disabled,
  previewUrl,
  fileName,
  onFileChange,
  fileError,
}: ManualCardFormProps) {
  const {
    register,
    formState: { errors },
  } = form;
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Clears the selection and resets the hidden input's value so choosing
  // the exact same file again still fires a `change` event (browsers skip
  // it otherwise when the value hasn't changed).
  function handleRemoveFile() {
    onFileChange(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  return (
    <div className="flex flex-col gap-6">
      <Field label="Name" htmlFor="custom-card-name" error={errors.name?.message}>
        <input
          id="custom-card-name"
          type="text"
          disabled={disabled}
          className={errors.name ? errorInputClassName : inputClassName}
          {...register('name')}
        />
      </Field>
      <div className="flex flex-wrap gap-6">
        {/* `flex-1` lets Set grow to fill the row's remaining space; Number
            stays a fixed, content-appropriate width alongside it since
            local numbers are always short. */}
        <Field
          label="Set"
          htmlFor="custom-card-set-name"
          error={errors.setName?.message}
          className="min-w-0 flex-1"
        >
          <input
            id="custom-card-set-name"
            type="text"
            disabled={disabled}
            className={`w-full ${errors.setName ? errorInputClassName : inputClassName}`}
            {...register('setName')}
          />
        </Field>
        <Field
          label="Number"
          htmlFor="custom-card-local-number"
          error={errors.localNumber?.message}
          className="w-28 shrink-0"
        >
          <input
            id="custom-card-local-number"
            type="text"
            disabled={disabled}
            className={`w-full ${errors.localNumber ? errorInputClassName : inputClassName}`}
            {...register('localNumber')}
          />
        </Field>
      </div>

      <Field label="Image" htmlFor="custom-card-image" error={fileError}>
        <div className="flex flex-col gap-2">
          {/* The dropzone itself is a plain button (not a `<label>`) so its
              disabled state is a real, native disabled affordance rather
              than a label that silently does nothing while "disabled". The
              actual file input stays hidden and is triggered imperatively
              via the ref. */}
          <button
            type="button"
            disabled={disabled}
            onClick={() => fileInputRef.current?.click()}
            className="flex h-40 w-full cursor-pointer flex-col items-center justify-center gap-2 rounded-standard border-2 border-dashed border-primary/60 bg-neutral-800 p-2 hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {previewUrl ? (
              // eslint-disable-next-line @next/next/no-img-element -- a transient local object-URL preview, not eligible for next/image's fixed-domain optimization.
              <img src={previewUrl} alt="" className="h-full max-w-full object-contain" />
            ) : (
              <>
                <UploadCloud className="size-8 text-primary" aria-hidden="true" />
                <span className="text-body">Browse Files to upload</span>
                {/* Pasting is handled by the parent modal's `onPaste`
                    handler (it fires regardless of which control has
                    focus), but the hint belongs here next to the other
                    "how do I add an image" affordance. */}
                <span className="text-caption text-neutral-500">or paste an image</span>
              </>
            )}
          </button>
          <input
            ref={fileInputRef}
            id="custom-card-image"
            type="file"
            accept={CUSTOM_CARD_IMAGE_ACCEPT}
            disabled={disabled}
            onChange={(event) => onFileChange(event.target.files?.[0] ?? null)}
            className="hidden"
          />
          {/* The filename row: always rendered (even with no selection, as
              "No file selected") so the delete action has a stable, always-
              visible home rather than popping in only once a file exists. */}
          <div className="flex items-center justify-between gap-2 rounded-standard bg-neutral-800 px-3 py-2">
            <span className="flex min-w-0 items-center gap-2 text-caption text-neutral-500">
              <ImageIcon className="size-4 shrink-0" aria-hidden="true" />
              <span className="truncate">{fileName ?? 'No file selected'}</span>
            </span>
            <button
              type="button"
              aria-label="Remove selected image"
              disabled={disabled || !fileName}
              onClick={handleRemoveFile}
              className="shrink-0 cursor-pointer rounded-full p-1 hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Trash2 className="size-4" aria-hidden="true" />
            </button>
          </div>
        </div>
      </Field>
    </div>
  );
}
