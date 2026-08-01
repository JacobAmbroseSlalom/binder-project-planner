'use client';

import {
  LOADING_INDICATOR_DELAY_MS,
  LOADING_INDICATOR_MIN_DURATION_MS,
} from '@binder-project-planner/shared';
import { useEffect, useRef, useState } from 'react';

// Applies the shared loading component's display timing (story 6) to a raw
// pending flag: the returned `visible` flag only turns on after `isPending`
// has been true for `LOADING_INDICATOR_DELAY_MS` (so quick requests never
// flash a spinner), and once shown stays true for at least
// `LOADING_INDICATOR_MIN_DURATION_MS` (so a request that settles moments
// later doesn't flicker the indicator on and off).
export function useDelayedLoading(isPending: boolean): boolean {
  const [visible, setVisible] = useState(false);
  // Wall-clock time the indicator last became visible, or null while
  // hidden. Tracked in a ref (not state) since it only feeds the hide-timer
  // calculation below and shouldn't itself trigger a render.
  const visibleSinceRef = useRef<number | null>(null);

  useEffect(() => {
    if (isPending) {
      const showTimer = setTimeout(() => {
        visibleSinceRef.current = Date.now();
        setVisible(true);
      }, LOADING_INDICATOR_DELAY_MS);

      // If `isPending` flips back to false before this fires (a fast
      // request), the timer is cancelled and the indicator never appears.
      return () => clearTimeout(showTimer);
    }

    if (visibleSinceRef.current === null) {
      // The indicator never became visible for this pending period, so
      // there's nothing to keep displayed.
      setVisible(false);
      return;
    }

    // The indicator is visible; keep it that way for whatever remains of
    // the minimum display duration before hiding it.
    const elapsedMs = Date.now() - visibleSinceRef.current;
    const remainingMs = Math.max(LOADING_INDICATOR_MIN_DURATION_MS - elapsedMs, 0);
    const hideTimer = setTimeout(() => {
      visibleSinceRef.current = null;
      setVisible(false);
    }, remainingMs);

    return () => clearTimeout(hideTimer);
  }, [isPending]);

  return visible;
}
