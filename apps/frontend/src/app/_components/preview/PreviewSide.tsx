'use client';

import { useMemo, useState } from 'react';

import {
  resolveCardImageUrl,
  type BinderPreviewArt,
  type BinderPreviewCard,
  type BinderSummary,
} from '@/lib/api';

import { PreviewArtTile } from './PreviewArtTile';

// One occupied slot's card image within the home-page binder preview
// (story 20): a plain, noninteractive image fill - no drag handles, hover
// remove action, or variation label, unlike the full layout's `CardTile`.
// Reuses `card`'s already-resolved `imageUrl` rather than needing the
// complete `Card` row.
function PreviewCardImage({ imageUrl }: { imageUrl: string }) {
  const [imageFailed, setImageFailed] = useState(false);

  if (imageFailed) {
    // Story 20's "a failed card ... image preserves its occupied preview
    // geometry and renders a neutral missing-image placeholder" - this
    // slot's own aspect-ratio/grid-area sizing (set by the caller) is
    // untouched; only its content swaps to a neutral fill.
    return <div className="h-full w-full bg-neutral-800" />;
  }

  return (
    // The card image comes from an arbitrary backend/provider origin, so
    // next/image's fixed-domain optimization doesn't apply here.
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={resolveCardImageUrl(imageUrl)}
      alt=""
      draggable={false}
      onError={() => setImageFailed(true)}
      className="h-full w-full object-contain"
    />
  );
}

// One binder side's miniature slot grid within the home-page preview
// (story 20): reuses the full layout's `BinderSide`/`BinderSlot` CSS Grid
// and container-query "contain, don't crop" sizing technique (see
// `.preview-side-fit`/`.binder-side-grid` in globals.css), but strips out
// every interactive/editing concern that technical requirement lists as
// omitted - no "+" add affordance, hover-revealed remove actions, Michi
// indicators, drag-and-drop registration, or pending-state styling.
export function PreviewSide({
  width,
  height,
  physicalPage,
  slotAspectRatio,
  cards,
  art,
  binder,
  spinePosition = 'center',
}: {
  width: number;
  height: number;
  physicalPage: number;
  slotAspectRatio: number;
  cards: BinderPreviewCard[];
  art: BinderPreviewArt[];
  binder: Pick<
    BinderSummary,
    | 'widthPerSlot'
    | 'widthBase'
    | 'heightPerSlot'
    | 'heightBase'
    | 'borderColor'
    | 'borderRadius'
    | 'borderWidth'
  >;
  // Which edge of this side's own fitting area sits at the spread's
  // spine (where the two pages meet). `.binder-side-grid`'s shared
  // `margin: 0 auto` centers the grid within whatever width this side's
  // flex box happens to render at - fine for the full layout tab (each
  // side is flanked by its own chevron, not a second page), but here it
  // leaves equal, independent whitespace on *both* edges of each grid
  // whenever the grid is narrower than its half of the frame, which reads
  // as an oversized gap between the two pages. Overriding the margin here
  // instead pushes each grid all the way to its spine-side edge - flush
  // against its sibling - so only the frame's own `gap`/padding separates
  // them; the two outer edges (against the frame border) keep the extra
  // whitespace instead. A single-page spread has no sibling to push
  // toward, so it keeps the default centered behavior.
  spinePosition?: 'left' | 'right' | 'center';
}) {
  // The grid's overall width-to-height ratio, mirroring `BinderSide`'s own
  // `--slot-ratio` derivation so `.binder-side-grid`'s width-capping `min()`
  // formula produces the identical contained shape at a smaller size.
  const slotRatio = (width / height) * slotAspectRatio;

  // Overrides `.binder-side-grid`'s own `margin: 0 auto` (inline styles
  // always win regardless of CSS layer order) per `spinePosition` above.
  const gridMargin: React.CSSProperties =
    spinePosition === 'left'
      ? { marginLeft: 'auto', marginRight: 0 }
      : spinePosition === 'right'
        ? { marginLeft: 0, marginRight: 'auto' }
        : { marginLeft: 'auto', marginRight: 'auto' };

  const cardsByPosition = useMemo(() => {
    const map = new Map<string, BinderPreviewCard>();
    for (const card of cards) {
      if (card.physicalPage !== physicalPage) continue;
      map.set(`${card.row}-${card.column}`, card);
    }
    return map;
  }, [cards, physicalPage]);

  const artOnThisPage = useMemo(
    () => art.filter((item) => item.physicalPage === physicalPage),
    [art, physicalPage],
  );

  const slotCells = useMemo(() => {
    const cells: { row: number; column: number }[] = [];
    for (let row = 1; row <= height; row++) {
      for (let column = 1; column <= width; column++) {
        cells.push({ row, column });
      }
    }
    return cells;
  }, [width, height]);

  return (
    <div className="preview-side-fit flex min-w-0 flex-1 items-center justify-center">
      <div
        className="binder-side-grid"
        style={{ '--slot-ratio': slotRatio, ...gridMargin } as React.CSSProperties}
      >
        <div
          role="group"
          aria-label={`Binder preview, page ${physicalPage}`}
          className="relative grid gap-0.5 rounded-standard bg-surface p-1"
          style={{
            gridTemplateColumns: `repeat(${width}, 1fr)`,
            gridTemplateRows: `repeat(${height}, auto)`,
          }}
        >
          {slotCells.map(({ row, column }) => {
            const card = cardsByPosition.get(`${row}-${column}`);
            return (
              <div
                key={`${row}-${column}`}
                style={{ aspectRatio: slotAspectRatio, gridRow: row, gridColumn: column }}
                className="overflow-hidden rounded-sm bg-neutral-900"
              >
                {card && <PreviewCardImage imageUrl={card.imageUrl} />}
              </div>
            );
          })}

          {/* Placed multi-slot art (story 26), overlaid the same way
              `BinderSide` positions `PlacedArtTile` - an explicit
              `gridRow`/`gridColumn` span matching its footprint. */}
          {artOnThisPage.map((item, index) => (
            <div
              // Preview art has no id of its own (see `BinderPreviewArt`'s
              // minimal shape) - its (physicalPage, row, column) triple is
              // already unique per binder, so it's a stable key alongside
              // the array index.
              key={`${item.physicalPage}-${item.row}-${item.column}-${index}`}
              style={{
                gridRow: `${item.row} / span ${item.heightSlots}`,
                gridColumn: `${item.column} / span ${item.widthSlots}`,
              }}
            >
              <PreviewArtTile art={item} binder={binder} />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
