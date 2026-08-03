import { useEffect, useRef, useState } from 'react';

// Measures an element's rendered content-box size via `ResizeObserver`,
// reactively updating whenever the element's own size changes. Shared by
// `ArtTile` (to recover the same frame-relative geometry math the Konva
// editor uses without a fixed pixel size passed down from the caller) and
// `UnplacedArtPanel` (to size art tiles proportionally to the unplaced
// cards grid's own column width - see its own usage for details).
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
