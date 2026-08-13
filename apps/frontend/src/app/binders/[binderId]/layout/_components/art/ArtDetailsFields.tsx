'use client';

import { RotateCcw } from 'lucide-react';
import type { ChangeEvent } from 'react';
import type { UseFormReturn } from 'react-hook-form';

import type { Binder } from '@/lib/api';
import { Tooltip } from '@/shared/feedback';

import { ArtGridSelector } from './ArtGridSelector';
import type { ArtDetailsFormValues } from './artSchema';

const inputClassName =
  'rounded-standard border border-transparent bg-neutral-800 px-3 py-2 placeholder:text-neutral-500 focus:border-primary focus:outline-none';
const errorInputClassName = `${inputClassName} border-error bg-error/10 ring-2 ring-error`;

// `CreateArtModal`'s left-column form fields (stories 24, 25): the
// grid-based slot-size selector, title/description, the three
// border-style override fields, and the image upload control. Extracted
// from `CreateArtModal` since this is a large, purely presentational
// block driven entirely by props (mostly `useArtFormState`'s return
// value) rather than owning any state of its own.
export function ArtDetailsFields({
  form,
  binder,
  widthSlots,
  heightSlots,
  slotAspectRatio,
  onSelectGridSize,
  borderColor,
  onBorderColorChange,
  borderRadius,
  onBorderRadiusChange,
  borderWidth,
  onBorderWidthChange,
  onResetBorderStyle,
  file,
  mode,
  onFileInputChange,
  fileError,
}: {
  form: UseFormReturn<ArtDetailsFormValues>;
  binder: Binder;
  widthSlots: number | null;
  heightSlots: number | null;
  slotAspectRatio: number;
  onSelectGridSize: (widthSlots: number, heightSlots: number) => void;
  borderColor: string;
  onBorderColorChange: (color: string) => void;
  borderRadius: number;
  onBorderRadiusChange: (radius: number) => void;
  borderWidth: number;
  onBorderWidthChange: (width: number) => void;
  onResetBorderStyle: () => void;
  file: File | null;
  mode: 'create' | 'edit';
  onFileInputChange: (event: ChangeEvent<HTMLInputElement>) => void;
  fileError: string | undefined;
}) {
  return (
    <div className="flex flex-1 flex-col gap-4">
      <div className="flex flex-col gap-1">
        <span className="text-caption text-neutral-500">Art size (slots)</span>
        <ArtGridSelector
          binderWidth={binder.width}
          binderHeight={binder.height}
          slotAspectRatio={slotAspectRatio}
          widthSlots={widthSlots}
          heightSlots={heightSlots}
          onSelect={onSelectGridSize}
        />
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="art-title" className="text-caption text-neutral-500">
          Title
        </label>
        <input
          id="art-title"
          type="text"
          className={form.formState.errors.title ? errorInputClassName : inputClassName}
          {...form.register('title')}
        />
        {form.formState.errors.title && (
          <p role="alert" className="text-caption text-error">
            {form.formState.errors.title.message}
          </p>
        )}
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="art-description" className="text-caption text-neutral-500">
          Description
        </label>
        <textarea
          id="art-description"
          rows={3}
          className={form.formState.errors.description ? errorInputClassName : inputClassName}
          {...form.register('description')}
        />
        {form.formState.errors.description && (
          <p role="alert" className="text-caption text-error">
            {form.formState.errors.description.message}
          </p>
        )}
      </div>

      {/* Border-style overrides (story 24/25): all three fields on
          one row, each prefilled with the binder's own current
          setting and directly editable (no separate "use binder
          setting"/"custom" toggle) - see `onResetBorderStyle` for
          the reset button. */}
      <div className="flex flex-col gap-1">
        <span className="text-caption text-neutral-500">Border style</span>
        <div className="flex flex-wrap items-end gap-3">
          <label className="flex flex-1 flex-col gap-1">
            <span className="text-caption text-neutral-500">Color</span>
            <div className="flex items-center gap-2">
              <input
                type="color"
                aria-label="Border color swatch"
                value={/^#[0-9A-Fa-f]{6}$/.test(borderColor) ? borderColor : '#000000'}
                onChange={(event) => onBorderColorChange(event.target.value.toUpperCase())}
                className="h-10 w-10 shrink-0 cursor-pointer rounded-standard border border-transparent bg-neutral-800"
              />
              <input
                type="text"
                aria-label="Border color hex value"
                value={borderColor}
                onChange={(event) => onBorderColorChange(event.target.value.toUpperCase())}
                className={`${inputClassName} w-full`}
              />
            </div>
          </label>
          <label className="flex flex-1 flex-col gap-1">
            <span className="text-caption text-neutral-500">Radius (%)</span>
            <input
              type="number"
              min={0}
              max={100}
              step={0.01}
              value={borderRadius}
              onChange={(event) => onBorderRadiusChange(Number(event.target.value))}
              className={`${inputClassName} w-full`}
            />
          </label>
          <label className="flex flex-1 flex-col gap-1">
            <span className="text-caption text-neutral-500">Width (cm)</span>
            <input
              type="number"
              min={0}
              step={0.01}
              value={borderWidth}
              onChange={(event) => onBorderWidthChange(Number(event.target.value))}
              className={`${inputClassName} w-full`}
            />
          </label>
          <Tooltip label="Reset to binder settings">
            <button
              type="button"
              onClick={onResetBorderStyle}
              aria-label="Reset border style fields to binder settings"
              className="flex h-10 shrink-0 cursor-pointer items-center text-neutral-500 hover:text-primary"
            >
              <RotateCcw className="size-6" />
            </button>
          </Tooltip>
        </div>
      </div>

      <div className="flex flex-col gap-1">
        <span className="text-caption text-neutral-500">Image</span>
        {/* The native `<input type="file">` element's own "No file
            chosen"/filename text is driven entirely by its internal
            file list, not React state - it never reflects a pasted
            image (which sets `file` state directly, bypassing the
            input), and even for a manually chosen file it reverts to
            "No file chosen" as soon as `onFileInputChange` clears
            `event.target.value` (needed so re-choosing the exact same
            file still fires a change event). A visually hidden input
            triggered by its own `<label>`, plus a filename driven by
            `file` state below, keeps this display correct regardless
            of how the file arrived. */}
        <div className="flex items-center gap-2">
          <label
            htmlFor="art-image-file"
            className="cursor-pointer rounded-standard bg-neutral-800 px-3 py-2 text-caption hover:brightness-110"
          >
            Choose File
          </label>
          <input
            id="art-image-file"
            type="file"
            accept="image/jpeg,image/png,image/webp"
            onChange={onFileInputChange}
            className="sr-only"
          />
          <span className="text-caption text-neutral-500">
            {file ? file.name : mode === 'edit' ? 'Using the current image' : 'No file chosen'}
          </span>
        </div>
        <p className="text-caption text-neutral-500">
          Or paste an image (Cmd/Ctrl+V) while this modal is focused.
        </p>
        {fileError && (
          <p role="alert" className="text-caption text-error">
            {fileError}
          </p>
        )}
      </div>
    </div>
  );
}
