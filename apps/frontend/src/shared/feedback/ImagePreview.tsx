'use client';

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

// Fixed footprint (px) of the enlarged preview box. Unlike `Tooltip`'s
// bubble (sized to its text content, so its on-screen size can only be
// known after render), this is a constant we choose up front - which lets
// `updateAnchor` below compute a fully clamped, non-overlapping position
// in one pass, with no post-render measure-and-correct step (and so no
// risk of a visible reposition flicker).
const PREVIEW_WIDTH_PX = 192;
const PREVIEW_HEIGHT_PX = 256;

// Gap (px) kept between the preview and both its trigger and the
// viewport's edges.
const TRIGGER_GAP_PX = 8;
const VIEWPORT_EDGE_PADDING_PX = 8;

// Shared instant hover/focus enlarged-image preview - the image-based
// counterpart to `Tooltip` (see that component's comments for the
// portal/fixed-positioning rationale, which applies identically here).
// Wrap a small trigger (e.g. the card list's thumbnail) as this
// component's child; on hover/focus it portals a much larger version of
// the same image to `document.body`, positioned just to the right of the
// trigger (flipping to the left if there's no room) and vertically
// centered on it, clamped back on-screen if either would otherwise
// overflow the viewport.
export function ImagePreview({
  src,
  alt,
  children,
}: {
  src: string;
  alt: string;
  children: ReactNode;
}) {
  const wrapperRef = useRef<HTMLSpanElement>(null);
  const [isVisible, setIsVisible] = useState(false);
  const [anchor, setAnchor] = useState({ top: 0, left: 0 });

  // Recomputes the trigger's current viewport position, and from it the
  // preview's fully clamped on-screen position - called both right before
  // showing the preview, and (while visible) on every scroll/resize, since
  // a `fixed`-positioned portal element doesn't move with its trigger on
  // its own the way a normal in-flow sibling would.
  const updateAnchor = useCallback(() => {
    const rect = wrapperRef.current?.getBoundingClientRect();
    if (!rect) return;

    // Prefer showing to the trigger's right; flip to its left if there's
    // not enough room, rather than letting it overflow the right edge.
    const spaceOnRight = window.innerWidth - rect.right - TRIGGER_GAP_PX;
    const showOnRight = spaceOnRight >= PREVIEW_WIDTH_PX + VIEWPORT_EDGE_PADDING_PX;
    const idealLeft = showOnRight
      ? rect.right + TRIGGER_GAP_PX
      : rect.left - TRIGGER_GAP_PX - PREVIEW_WIDTH_PX;
    const left = Math.min(
      Math.max(idealLeft, VIEWPORT_EDGE_PADDING_PX),
      window.innerWidth - PREVIEW_WIDTH_PX - VIEWPORT_EDGE_PADDING_PX,
    );

    // Vertically centered on the trigger, then clamped within the
    // viewport's top/bottom edges.
    const idealTop = rect.top + rect.height / 2 - PREVIEW_HEIGHT_PX / 2;
    const top = Math.min(
      Math.max(idealTop, VIEWPORT_EDGE_PADDING_PX),
      window.innerHeight - PREVIEW_HEIGHT_PX - VIEWPORT_EDGE_PADDING_PX,
    );

    setAnchor({ top, left });
  }, []);

  const show = () => {
    updateAnchor();
    setIsVisible(true);
  };
  const hide = () => setIsVisible(false);

  useEffect(() => {
    if (!isVisible) return;
    window.addEventListener('scroll', updateAnchor, true);
    window.addEventListener('resize', updateAnchor);
    return () => {
      window.removeEventListener('scroll', updateAnchor, true);
      window.removeEventListener('resize', updateAnchor);
    };
  }, [isVisible, updateAnchor]);

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
            aria-hidden="true"
            style={{
              top: anchor.top,
              left: anchor.left,
              width: PREVIEW_WIDTH_PX,
              height: PREVIEW_HEIGHT_PX,
            }}
            className={`pointer-events-none fixed z-50 flex items-center justify-center overflow-hidden rounded-standard border border-neutral-700 bg-neutral-800 p-2 shadow-panel transition-opacity duration-75 ${
              isVisible ? 'opacity-100' : 'opacity-0'
            }`}
          >
            {/* eslint-disable-next-line @next/next/no-img-element -- the
                card image comes from an arbitrary backend/provider origin,
                so next/image's fixed-domain optimization doesn't apply
                here (same reasoning as the thumbnail this previews). */}
            <img src={src} alt={alt} className="h-full w-full object-contain" />
          </span>,
          document.body,
        )}
    </span>
  );
}
