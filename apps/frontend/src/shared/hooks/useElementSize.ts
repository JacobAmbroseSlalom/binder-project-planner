import { useEffect, useRef, useState } from 'react';

// Measures an element's rendered content-box size via `ResizeObserver`,
// reactively updating whenever the element's own size changes. Shared by
// the binder layout tab's `ArtTile` (to recover the same frame-relative
// geometry math the Konva editor uses without a fixed pixel size passed
// down from the caller) and the home-page preview's `PreviewArtTile`
// (story 20, to compute the same cm-to-px border-width scale factor for
// its own much smaller rendered size). Promoted here from the layout
// route's private `_components/art/` folder once this second consumer
// needed it, per styling.instructions.md's "colocate until a second place
// needs it" rule.
export function useElementSize<T extends HTMLElement>(): [
  React.RefObject<T | null>,
  { width: number; height: number },
] {
  const ref = useRef<T>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });

  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      setSize({ width, height });
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  return [ref, size];
}
