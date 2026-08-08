'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';

import { useSaveStatusToast } from '@/shared/feedback';

import {
  getMaxPhysicalPage,
  parsePhysicalPageInput,
  resolvePhysicalPageParam,
  resolveSpread,
} from './layoutSpread';

// Owns the "Edit Layout" tab's physical-page/spread navigation (stories
// 8-9) for `BinderLayoutView`: resolving the route's `page` query
// parameter (and keeping the URL in sync with it), the retained
// `layoutFocalPage` restore, and the direct page-number input's own text
// state/commit handling. Extracted from `BinderLayoutView` since this
// navigation concern is self-contained and independent of the tab's
// drag-and-drop, modal, and toolbar-preference state.
export function useLayoutSpreadNavigation({
  totalPages,
  layoutFocalPage,
  setLayoutFocalPage,
}: {
  totalPages: number;
  layoutFocalPage: number | null;
  setLayoutFocalPage: (page: number) => void;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { start } = useSaveStatusToast();

  const maxPhysicalPage = getMaxPhysicalPage(totalPages);
  const rawPage = searchParams.get('page');
  const { physicalPage, replacementPage } = resolvePhysicalPageParam(
    rawPage,
    maxPhysicalPage,
    layoutFocalPage,
  );

  function navigateToPhysicalPage(targetPage: number) {
    const params = new URLSearchParams(searchParams);
    params.set('page', String(targetPage));
    router.replace(`${pathname}?${params.toString()}`);
  }

  // Keeps the URL in sync for the `page` query parameter only, using
  // history replacement so spread navigation doesn't grow browser history.
  useEffect(() => {
    if (replacementPage === undefined) return;

    const params = new URLSearchParams(searchParams);
    if (replacementPage !== undefined) params.set('page', String(replacementPage));
    router.replace(`${pathname}?${params.toString()}`);
  }, [replacementPage, pathname, router, searchParams]);

  // Records the displayed physical page as the route's retained layout
  // focal page, but only once it's explicit in the URL - the very first,
  // param-less visit is left untouched so it keeps defaulting to physical
  // page 1 without ever adding `?page=1` to the URL (story 8).
  useEffect(() => {
    if (rawPage !== null) {
      setLayoutFocalPage(physicalPage);
    }
  }, [rawPage, physicalPage, setLayoutFocalPage]);

  const spread = resolveSpread(physicalPage, maxPhysicalPage);
  const isFirstSpread = spread.left === null;
  const isLastSpread = spread.right === null;
  // The denominator in the page label uses total physical pages (stored
  // pages × 2), so users see progress against the binder's actual page
  // count, e.g. `Pages 2–3 / 40` for a 20-page binder.
  const totalPhysicalPages = maxPhysicalPage;

  // The direct page-number input's own text state (story 9), separate from
  // `physicalPage` so keystrokes don't navigate until the value commits on
  // blur/Enter. Re-synced whenever `physicalPage` changes for any other
  // reason (arrows, URL edits) by comparing against the last-seen value
  // during render (React's documented "adjusting state when a prop
  // changes" pattern) rather than in an effect, which would cause an extra
  // render pass after every navigation.
  const [lastSyncedPhysicalPage, setLastSyncedPhysicalPage] = useState(physicalPage);
  const [pageInputValue, setPageInputValue] = useState(() => String(physicalPage));
  if (physicalPage !== lastSyncedPhysicalPage) {
    setLastSyncedPhysicalPage(physicalPage);
    setPageInputValue(String(physicalPage));
  }

  // Commits the page input's current text (story 9): a valid in-range
  // integer navigates to that physical page's spread; anything else
  // (empty, non-integer, out-of-range) leaves the spread unchanged, shows
  // the shared failed toast, and resets the input back to the current
  // focal physical page.
  function commitPageInput() {
    const parsed = parsePhysicalPageInput(pageInputValue, maxPhysicalPage);
    if (parsed === null) {
      start().markFailed({
        detail: `Enter a page number between 1 and ${maxPhysicalPage}.`,
      });
      setPageInputValue(String(physicalPage));
      return;
    }
    navigateToPhysicalPage(parsed);
  }

  return {
    maxPhysicalPage,
    physicalPage,
    spread,
    isFirstSpread,
    isLastSpread,
    totalPhysicalPages,
    navigateToPhysicalPage,
    pageInputValue,
    setPageInputValue,
    commitPageInput,
  };
}
