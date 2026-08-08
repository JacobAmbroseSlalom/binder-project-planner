'use client';

import { Check, Images, Printer, Redo2, Undo2 } from 'lucide-react';

// Shared styling for the direct page-number input, matching
// styling.instructions.md's "Forms & inputs" section (neutral-800 fill,
// primary border on focus), sized narrow and centered for a short numeric
// value rather than a full-width form field.
const PAGE_INPUT_CLASS_NAME =
  'w-20 rounded-standard border border-transparent bg-neutral-800 px-2 py-1 text-center focus:border-primary focus:outline-none';

// The "Edit Layout" tab's toolbar row (stories 9, 10, 16, 23, 28, 29, 30,
// 32): the Michi-indicator/card-variation/notes visibility toggles, the
// direct page-number input, undo/redo, and the print-to-PDF/print-art
// buttons - everything above the binder visualization itself. Extracted
// from `BinderLayoutView` since this is a large, purely presentational
// block driven entirely by props rather than owning any state of its own.
export function LayoutToolbar({
  michiIndicatorsVisible,
  onToggleMichiIndicators,
  variationsVisible,
  onToggleVariationsVisible,
  notesVisible,
  onToggleNotesVisible,
  isLocked,
  maxPhysicalPage,
  pageInputValue,
  onPageInputChange,
  onCommitPageInput,
  canUndoLayoutMovement,
  canRedoLayoutMovement,
  isMovePending,
  onUndo,
  onRedo,
  isExportingPdf,
  onExportPdf,
  placedArtCount,
  onOpenPrintArtModal,
}: {
  michiIndicatorsVisible: boolean;
  onToggleMichiIndicators: () => void;
  variationsVisible: boolean;
  onToggleVariationsVisible: () => void;
  notesVisible: boolean;
  onToggleNotesVisible: () => void;
  isLocked: boolean;
  maxPhysicalPage: number;
  pageInputValue: string;
  onPageInputChange: (value: string) => void;
  onCommitPageInput: () => void;
  canUndoLayoutMovement: boolean;
  canRedoLayoutMovement: boolean;
  isMovePending: boolean;
  onUndo: () => void;
  onRedo: () => void;
  isExportingPdf: boolean;
  onExportPdf: () => void;
  placedArtCount: number;
  onOpenPrintArtModal: () => void;
}) {
  return (
    <div className="flex items-center justify-center gap-10">
      {/* Story 10's toggle: custom-styled checkbox matching the app's
          checkbox convention (styling.instructions.md's "Forms & inputs"
          section). `michiIndicatorsVisible` is a persisted (local
          storage) preference defaulting to off, not a URL query param.
          The label is forced onto 2 short lines (rather than one long
          line) so this control stays narrow next to the page input. */}
      <label htmlFor="michi-indicators-toggle" className="flex items-center gap-2">
        <span className="relative inline-flex size-5 shrink-0 items-center justify-center">
          <input
            id="michi-indicators-toggle"
            type="checkbox"
            checked={michiIndicatorsVisible}
            onChange={onToggleMichiIndicators}
            className="peer size-5 appearance-none rounded-standard border border-neutral-500 bg-neutral-800 checked:border-primary checked:bg-primary"
          />
          <Check className="pointer-events-none absolute size-4 text-background opacity-0 peer-checked:opacity-100" />
        </span>
        <span className="flex flex-col text-caption leading-tight text-neutral-500">
          <span>Show Michi</span>
          <span>slot indicators</span>
        </span>
      </label>

      {/* Story 16's toggle: same custom-styled checkbox as the Michi
          toggle above. `variationsVisible` is a persisted (local
          storage) preference defaulting to off (hidden), per the
          acceptance criteria - not a URL query param. */}
      <label htmlFor="variations-visible-toggle" className="flex items-center gap-2">
        <span className="relative inline-flex size-5 shrink-0 items-center justify-center">
          <input
            id="variations-visible-toggle"
            type="checkbox"
            checked={variationsVisible}
            onChange={onToggleVariationsVisible}
            className="peer size-5 appearance-none rounded-standard border border-neutral-500 bg-neutral-800 checked:border-primary checked:bg-primary"
          />
          <Check className="pointer-events-none absolute size-4 text-background opacity-0 peer-checked:opacity-100" />
        </span>
        <span className="flex flex-col text-caption leading-tight text-neutral-500">
          <span>Show card</span>
          <span>variations</span>
        </span>
      </label>

      {/* Story 23's toggle: same custom-styled checkbox as the toggles
          above; its checked state is the persisted (local-storage)
          notes-visibility preference, defaulting to on. Story 32: hidden
          entirely while the binder is locked, since the notes section
          itself is never rendered in that state (see the gated
          `<BinderNotesSection>` in `BinderLayoutView`) - leaving the
          toggle visible would let the user "show" a section that can
          never actually appear. */}
      {!isLocked && (
        <label htmlFor="notes-visible-toggle" className="flex items-center gap-2">
          <span className="relative inline-flex size-5 shrink-0 items-center justify-center">
            <input
              id="notes-visible-toggle"
              type="checkbox"
              checked={notesVisible}
              onChange={onToggleNotesVisible}
              className="peer size-5 appearance-none rounded-standard border border-neutral-500 bg-neutral-800 checked:border-primary checked:bg-primary"
            />
            <Check className="pointer-events-none absolute size-4 text-background opacity-0 peer-checked:opacity-100" />
          </span>
          <span className="flex flex-col text-caption leading-tight text-neutral-500">
            <span>Show</span>
            <span>notes</span>
          </span>
        </label>
      )}

      <div className="flex flex-col items-center gap-1">
        <label htmlFor="layout-page-input" className="text-caption text-neutral-500">
          Go to page
        </label>
        <input
          id="layout-page-input"
          type="number"
          min={1}
          max={maxPhysicalPage}
          step={1}
          value={pageInputValue}
          onChange={(event) => onPageInputChange(event.target.value)}
          onBlur={onCommitPageInput}
          onKeyDown={(event) => {
            // Commits on Enter by blurring, which routes through the same
            // `onCommitPageInput` handler instead of duplicating its logic.
            if (event.key === 'Enter') event.currentTarget.blur();
          }}
          className={PAGE_INPUT_CLASS_NAME}
        />
      </div>

      {/* Story 32: Undo/Redo are hidden entirely (not merely disabled)
          while the binder is locked - every mutation they could reverse
          is itself unavailable. */}
      {!isLocked && (
        <>
          <button
            type="button"
            onClick={onUndo}
            disabled={!canUndoLayoutMovement || isMovePending}
            aria-label="Undo layout movement"
            title="Undo"
            className="flex cursor-pointer items-center justify-center rounded-standard bg-primary p-2 text-neutral-100 hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Undo2 className="size-5" />
          </button>

          <button
            type="button"
            onClick={onRedo}
            disabled={!canRedoLayoutMovement || isMovePending}
            aria-label="Redo layout movement"
            title="Redo"
            className="flex cursor-pointer items-center justify-center rounded-standard bg-primary p-2 text-neutral-100 hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Redo2 className="size-5" />
          </button>
        </>
      )}

      {/* Story 29's print-to-PDF button: available regardless of lock
          state (story 32 leaves printing unrestricted since it doesn't
          mutate the binder), disabled only while its own export is in
          flight. Icon-only, so it relies on `aria-label`/`title` for its
          accessible name rather than visible text. */}
      <button
        type="button"
        onClick={onExportPdf}
        disabled={isExportingPdf}
        aria-label="Print to PDF"
        title="Print to PDF"
        className="flex cursor-pointer items-center justify-center rounded-standard bg-primary p-2 text-neutral-100 hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
      >
        <Printer className="size-5" />
      </button>

      {/* Story 30's print-art button: opens the selection modal rather
          than immediately generating a PDF, and (like `Printer` above) is
          available regardless of lock state. Disabled with an explanatory
          tooltip when the binder has no placed multi-slot art at all
          (planning.md: "the modal cannot be opened"). Icon-only, so it
          relies on `aria-label`/`title` for its accessible name. */}
      <button
        type="button"
        onClick={onOpenPrintArtModal}
        disabled={placedArtCount === 0}
        aria-label="Print art to PDF"
        title={placedArtCount === 0 ? 'Place multi-slot art to enable this' : 'Print art to PDF'}
        className="flex cursor-pointer items-center justify-center rounded-standard bg-primary p-2 text-neutral-100 hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
      >
        <Images className="size-5" />
      </button>
    </div>
  );
}
