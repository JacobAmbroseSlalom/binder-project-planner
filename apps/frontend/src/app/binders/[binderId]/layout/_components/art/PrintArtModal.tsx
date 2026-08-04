'use client';

import { useEffect, useRef, useState } from 'react';

import { exportArtPrintPdf, type Art, type Binder } from '@/lib/api';
import { useSaveStatusToast } from '@/shared/feedback';

import { ArtTile } from './ArtTile';

// The rendered width (in pixels) a single-slot-wide art item's `ArtTile`
// gets - every other item's tile width is scaled proportionally from this
// anchor via `pxPerCm` below, so tiles' relative on-screen sizes match
// their relative real-world physical sizes.
const ONE_SLOT_TILE_WIDTH_PX = 120;

// Story 30's print-art selection modal, opened from the layout toolbar's
// print-art button. Lists every currently placed multi-slot art item
// (every listed piece pre-selected for inclusion, per planning.md), lets
// the user deselect/reselect individual pieces, and generates a PDF
// containing only the currently selected art when Print is clicked.
// Modeled on `DeleteBinderConfirmDialog`'s dialog-shell conventions
// (backdrop, `role="dialog"`, Escape-to-close, focus management) since no
// shared top-level `ModalShell` exists yet.
export function PrintArtModal({
  binder,
  placedArt,
  onClose,
}: {
  binder: Binder;
  // Every currently placed multi-slot art item - planning.md: "Unplaced
  // multi-slot art is never listed in the modal and is never included in
  // the PDF" - so the caller filters `art` by `placement.physicalPage !==
  // null` before passing it here.
  placedArt: Art[];
  onClose: () => void;
}) {
  // Every listed item starts selected (planning.md: "every listed piece
  // pre-selected for inclusion").
  const [selectedIds, setSelectedIds] = useState<Set<string>>(
    () => new Set(placedArt.map((item) => item.id)),
  );
  const [isPrinting, setIsPrinting] = useState(false);
  const { start } = useSaveStatusToast();
  const printButtonRef = useRef<HTMLButtonElement>(null);

  // Scales every item's tile width proportionally to its real physical
  // width, anchored so a single-slot-wide item renders at
  // `ONE_SLOT_TILE_WIDTH_PX` - so relative to each other, tiles show how
  // big each piece of art actually is, not just a uniform grid size.
  const oneSlotWidthCm = binder.widthPerSlot + binder.widthBase;
  const pxPerCm = ONE_SLOT_TILE_WIDTH_PX / oneSlotWidthCm;
  const tileWidthsById = new Map(
    placedArt.map((item) => {
      const physicalWidthCm = item.widthSlots * binder.widthPerSlot + binder.widthBase;
      return [item.id, pxPerCm * physicalWidthCm];
    }),
  );
  // Sizes the CSS columns' shared width to fit the single widest tile, so
  // no tile is ever clipped or forced to shrink below its proportional
  // size.
  const maxTileWidthPx = Math.max(...tileWidthsById.values());

  useEffect(() => {
    printButtonRef.current?.focus();
  }, []);

  // Escape closes the modal like `DeleteBinderConfirmDialog`, but only
  // while no print request is in flight - closing mid-request would strand
  // the persistent "saving" toast with no way to see the modal's outcome.
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape' && !isPrinting) {
        event.preventDefault();
        onClose();
      }
    }

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isPrinting, onClose]);

  function toggleSelected(artId: string) {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(artId)) {
        next.delete(artId);
      } else {
        next.add(artId);
      }
      return next;
    });
  }

  // Mirrors story 18's card-selection pattern: one toggle button that
  // switches between selecting every listed item and clearing the complete
  // selection.
  const allArtSelected =
    placedArt.length > 0 && placedArt.every((item) => selectedIds.has(item.id));
  function handleToggleSelectAll() {
    setSelectedIds(allArtSelected ? new Set() : new Set(placedArt.map((item) => item.id)));
  }

  // Generates and downloads the selected art's print PDF (story 30):
  // drives the shared save-status toast exactly like the layout toolbar's
  // own `handleExportPdf`, but on failure keeps the modal open with
  // selections intact (planning.md: "a failure keeps the modal open with
  // its selections intact") rather than closing it.
  async function handlePrint() {
    setIsPrinting(true);
    const toast = start();
    try {
      const { blob, filename } = await exportArtPrintPdf(binder.id, [...selectedIds]);
      const objectUrl = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = objectUrl;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(objectUrl);
      toast.markSaved();
      onClose();
    } catch (error) {
      toast.markFailed(error);
    } finally {
      setIsPrinting(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-8"
      onClick={() => {
        if (!isPrinting) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="print-art-dialog-title"
        onClick={(event) => event.stopPropagation()}
        className="flex max-h-[80vh] w-full max-w-4xl flex-col gap-4 rounded-standard bg-surface p-6 shadow-modal"
      >
        <h3 id="print-art-dialog-title">Print art</h3>
        <div className="flex items-center justify-between gap-3">
          <p className="text-caption text-neutral-500">
            Choose which placed art to include in the generated PDF.
          </p>
          <button
            type="button"
            onClick={handleToggleSelectAll}
            disabled={isPrinting || placedArt.length === 0}
            className={`shrink-0 rounded-standard px-2 py-1 font-bold text-primary hover:brightness-110 ${
              isPrinting || placedArt.length === 0
                ? 'cursor-not-allowed opacity-50'
                : 'cursor-pointer'
            }`}
          >
            {allArtSelected ? 'Deselect All' : 'Select All'}
          </button>
        </div>

        {/* A CSS multi-column ("masonry") layout, not a flex-wrap grid:
            with a flex-wrap row, every tile in a row is forced to share
            that row's tallest tile's height (or otherwise leave dead
            whitespace below the shorter ones before the next row starts),
            which wastes a lot of space given how much art items' aspect
            ratios vary. Columns instead let each item stack directly
            beneath the previous, shorter or taller, item in the *same*
            column, so the gaps naturally fill in - a tighter pack than
            row/column-based wrapping can achieve. `columns-[...]` is a
            width *hint*: the browser fits as many same-width columns as
            the container allows, sized (via inline style, since it's
            derived from this binder's own slot dimensions rather than a
            fixed value) to fit the single widest tile plus the button's
            `p-1` padding. */}
        <div className="min-h-0 flex-1 overflow-y-auto p-2">
          <div className="gap-3" style={{ columnWidth: maxTileWidthPx + 8 }}>
            {placedArt.map((item) => {
              const isSelected = selectedIds.has(item.id);
              // Always present: `tileWidthsById` was built directly from
              // `placedArt` above.
              const tileWidthPx = tileWidthsById.get(item.id)!;
              return (
                // A plain clickable tile (no checkbox/title) with a blue
                // ring when selected, matching `CardSelectionModal`'s own
                // `border-primary`-when-selected treatment - a ring
                // (rather than a border) is used here so it reads as a
                // selection outline distinct from the art's own
                // configured border. `break-inside-avoid` stops a tile
                // from being split across two columns, and `mb-3` gives
                // the vertical spacing between stacked tiles that the
                // columns container's `gap-3` only provides horizontally
                // (between columns), not vertically.
                <button
                  key={item.id}
                  type="button"
                  onClick={() => toggleSelected(item.id)}
                  aria-pressed={isSelected}
                  aria-label={item.title}
                  className={`mb-3 block cursor-pointer break-inside-avoid rounded-standard p-1 ring-2 ring-offset-2 ring-offset-surface hover:brightness-110 ${
                    isSelected ? 'ring-primary' : 'ring-transparent'
                  }`}
                >
                  <ArtTile
                    art={item}
                    binder={binder}
                    isPendingCreate={false}
                    widthPx={tileWidthPx}
                  />
                </button>
              );
            })}
          </div>
        </div>

        <div className="flex justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            disabled={isPrinting}
            className={`rounded-standard px-4 py-2 text-neutral-100 hover:brightness-110 ${
              isPrinting ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'
            }`}
          >
            Cancel
          </button>
          <button
            ref={printButtonRef}
            type="button"
            onClick={handlePrint}
            disabled={isPrinting || selectedIds.size === 0}
            className={`rounded-standard bg-primary px-4 py-2 text-neutral-100 hover:brightness-110 ${
              isPrinting || selectedIds.size === 0
                ? 'cursor-not-allowed opacity-50'
                : 'cursor-pointer'
            }`}
          >
            Print
          </button>
        </div>
      </div>
    </div>
  );
}
