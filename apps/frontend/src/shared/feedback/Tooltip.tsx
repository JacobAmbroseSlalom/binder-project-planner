'use client';

import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

// Horizontal anchor for the tooltip bubble relative to its trigger:
// `'center'` (default) centers it under/over the trigger, `'start'`
// left-aligns the bubble's edge with the trigger's own left edge, and
// `'end'` right-aligns it with the trigger's own right edge instead. This
// is just the *preferred* alignment, though - see the viewport-clamping
// logic below, which nudges the bubble back on-screen regardless of
// `align` if that preference would otherwise overflow the viewport.
type TooltipAlign = 'center' | 'start' | 'end';

// Horizontal translate-x percentage paired with each `TooltipAlign`,
// centering/left-/right-aligning the bubble on the anchor point computed
// in `updateAnchor` below. Applied via inline `style.transform` (rather
// than a Tailwind utility class) so it can be combined with the
// viewport-clamping pixel offset in a single `calc()`.
const ALIGN_TRANSLATE_X_PERCENT: Record<TooltipAlign, number> = {
  center: -50,
  start: 0,
  end: -100,
};

// Minimum gap (px) kept between the bubble and the viewport's left/right
// edges when clamping.
const VIEWPORT_EDGE_PADDING_PX = 8;

// Shared instant hover/focus tooltip. Renders a small dark bubble above its
// trigger, fading in on a short (75ms) transition with no start delay -
// unlike the native `title` attribute, whose browser-default hover delay
// (~1.5-2s) makes icon-only buttons feel unresponsive. Wrap a single
// interactive trigger (typically an icon button) as this component's
// child; the trigger keeps its own `aria-label` for its accessible name,
// since this tooltip's label is presentational only (`aria-hidden`) and
// not read twice by screen readers.
//
// The bubble is rendered through a portal into `document.body` and
// positioned with `fixed` coordinates computed from the trigger's own
// `getBoundingClientRect()`, rather than being absolutely positioned as a
// sibling inside this component's own wrapper. A plain CSS-positioned
// bubble gets silently clipped by the nearest scrollable ancestor (e.g.
// the unplaced-cards panel's `overflow-y-auto` list) whenever it pops up
// past that ancestor's own edge - most visibly for a trigger in the very
// first row, which has no room to escape into and so never becomes
// visible at all. Portaling to `document.body` sidesteps every such
// ancestor's `overflow` entirely, so the bubble is always fully visible
// regardless of where its trigger sits.
//
// Because the bubble is no longer a DOM sibling of its trigger once
// portaled, visibility can no longer be driven by a CSS `group-hover`/
// `group-focus-within` selector (there's nothing left for it to target) -
// hover/focus are tracked as local component state instead, via listeners
// on the wrapper span. This also sidesteps the unnamed-vs-named-group
// leakage bug the previous named-group scoping guarded against: state is
// now per-`Tooltip`-instance, so nesting inside any other hover-reveal
// `group` (named or not) can no longer cause unrelated tooltips to light
// up together.
export function Tooltip({
  label,
  children,
  align = 'center',
}: {
  label: string;
  children: ReactNode;
  align?: TooltipAlign;
}) {
  const wrapperRef = useRef<HTMLSpanElement>(null);
  const bubbleRef = useRef<HTMLSpanElement>(null);
  const [isVisible, setIsVisible] = useState(false);
  const [anchor, setAnchor] = useState({ top: 0, left: 0 });
  // Extra horizontal pixel nudge (on top of `align`'s translate-x) applied
  // once the bubble's actual rendered width is known, keeping it from
  // overflowing past the viewport's left/right edge - reset to 0 whenever
  // the bubble is repositioned, then recomputed by the layout effect below.
  const [clampOffsetPx, setClampOffsetPx] = useState(0);

  // Recomputes the trigger's current viewport position. Called both right
  // before showing the bubble, and (while visible) on every scroll/resize,
  // since a `fixed`-positioned portal element doesn't move with its
  // trigger on its own the way a normal in-flow sibling would.
  const updateAnchor = useCallback(() => {
    const rect = wrapperRef.current?.getBoundingClientRect();
    if (!rect) return;
    const left =
      align === 'start' ? rect.left : align === 'end' ? rect.right : rect.left + rect.width / 2;
    // 4px gap above the trigger, matching the previous CSS `mb-1`.
    setAnchor({ top: rect.top - 4, left });
    setClampOffsetPx(0);
  }, [align]);

  const show = () => {
    updateAnchor();
    setIsVisible(true);
  };
  const hide = () => setIsVisible(false);

  // Keeps the bubble aligned with its trigger for as long as it's visible
  // - `true` (capture) so scroll events from any nested scrollable
  // ancestor are seen here too, since plain `scroll` events don't bubble.
  useEffect(() => {
    if (!isVisible) return;
    window.addEventListener('scroll', updateAnchor, true);
    window.addEventListener('resize', updateAnchor);
    return () => {
      window.removeEventListener('scroll', updateAnchor, true);
      window.removeEventListener('resize', updateAnchor);
    };
  }, [isVisible, updateAnchor]);

  // Clamps the bubble back on-screen after each (re)position, once its
  // actual rendered width is known - runs synchronously before paint (via
  // `useLayoutEffect`) so the user never sees the unclamped position, only
  // the corrected one. Needed for triggers near either viewport edge (e.g.
  // the card list's leftmost Acquisition-column header control), where a
  // longer label would otherwise render partly off-screen regardless of
  // `align`.
  useLayoutEffect(() => {
    if (!isVisible) return;
    const bubble = bubbleRef.current;
    if (!bubble) return;
    const rect = bubble.getBoundingClientRect();
    if (rect.left < VIEWPORT_EDGE_PADDING_PX) {
      setClampOffsetPx(VIEWPORT_EDGE_PADDING_PX - rect.left);
    } else if (rect.right > window.innerWidth - VIEWPORT_EDGE_PADDING_PX) {
      setClampOffsetPx(window.innerWidth - VIEWPORT_EDGE_PADDING_PX - rect.right);
    }
  }, [isVisible, anchor]);

  return (
    <span
      ref={wrapperRef}
      className="relative inline-flex"
      onMouseEnter={show}
      onMouseLeave={hide}
      onFocus={show}
      onBlur={hide}
    >
      {children}
      {typeof document !== 'undefined' &&
        createPortal(
          <span
            ref={bubbleRef}
            aria-hidden="true"
            style={{
              top: anchor.top,
              left: anchor.left,
              transform: `translate(calc(${ALIGN_TRANSLATE_X_PERCENT[align]}% + ${clampOffsetPx}px), -100%)`,
            }}
            className={`pointer-events-none fixed z-50 whitespace-nowrap rounded-standard bg-neutral-800 px-2 py-1 text-caption text-neutral-100 shadow-panel transition-opacity duration-75 ${
              isVisible ? 'opacity-100' : 'opacity-0'
            }`}
          >
            {label}
          </span>,
          document.body,
        )}
    </span>
  );
}
