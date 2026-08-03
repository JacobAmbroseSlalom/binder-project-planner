import type { BinderSummary } from '@/lib/api';

import { PreviewSide } from './PreviewSide';

// The fixed, stable preview-frame dimensions every home-page binder-list
// item uses (story 20's "Every binder-list item uses the same stable
// preview-frame dimensions, defined by the frontend styling system rather
// than binder data") - landscape-oriented, sized larger than the original
// placeholder rectangle this component replaces since a miniature layout
// needs more room than a plain label to stay legible. Documented in
// styling.instructions.md's "Binder-list previews" section.
const FRAME_CLASS_NAME = 'h-56 w-[23.52rem]';

// The home-page binder-list preview (story 20): renders the binder's saved
// `previewPhysicalPage`, resolved to a spread, as a live noninteractive
// miniature of the full "Edit Layout" tab - reusing the same binder-side/
// slot/card/multi-slot-art rendering primitives and CSS Grid + container-
// query "contain, don't crop" sizing technique, but with every editing
// control, drag-and-drop registration, and card/art action omitted. All the
// data needed is already embedded in `binder.preview` by `GET /binders`
// (see planning.md's "the home page does not issue separate preview
// requests"), so this component does no fetching of its own.
export function BinderPreview({ binder }: { binder: BinderSummary }) {
  const { spread, cards, art } = binder.preview;

  // The binder's own single-slot width-to-height ratio (story 24),
  // matching `BinderLayoutView`'s identical derivation for the full
  // layout.
  const slotAspectRatio =
    (binder.widthPerSlot + binder.widthBase) / (binder.heightPerSlot + binder.heightBase);

  // Only push each side's grid toward the shared spine when there really
  // are two sides to push together - a single-page spread has no sibling
  // to close a gap against, so it stays centered (`PreviewSide`'s default).
  const isTwoPageSpread = spread.left !== null && spread.right !== null;

  return (
    <div
      className={`flex ${FRAME_CLASS_NAME} items-center justify-center gap-0.5 rounded-standard bg-surface p-2 shadow-panel`}
    >
      {spread.left !== null && (
        <PreviewSide
          width={binder.width}
          height={binder.height}
          physicalPage={spread.left}
          slotAspectRatio={slotAspectRatio}
          cards={cards}
          art={art}
          binder={binder}
          spinePosition={isTwoPageSpread ? 'left' : 'center'}
        />
      )}
      {spread.right !== null && (
        <PreviewSide
          width={binder.width}
          height={binder.height}
          physicalPage={spread.right}
          slotAspectRatio={slotAspectRatio}
          cards={cards}
          art={art}
          binder={binder}
          spinePosition={isTwoPageSpread ? 'right' : 'center'}
        />
      )}
    </div>
  );
}
