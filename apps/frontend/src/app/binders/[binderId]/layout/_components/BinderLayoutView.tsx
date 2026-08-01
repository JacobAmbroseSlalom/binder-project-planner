'use client';

import { ChevronLeft, ChevronRight } from 'lucide-react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useEffect } from 'react';

import { useBinderRouteContext } from '../../BinderRouteContext';
import {
  getMaxPhysicalPage,
  getNextPhysicalPage,
  getPreviousPhysicalPage,
  resolvePhysicalPageParam,
  resolveSpread,
} from '../layoutSpread';
import { BinderSide } from './BinderSide';

// Shared styling for the previous/next icon buttons, matching the app's
// disabled-state convention (reduced opacity + not-allowed cursor).
const ARROW_BUTTON_CLASS_NAME =
  'cursor-pointer rounded-full p-2 text-neutral-100 hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50';

// The "Edit Layout" tab's real content (story 8): visualizes the binder as
// a sequence of displayed spreads - the first showing only the right side,
// the last only the left side, and every one in between showing both -
// navigated with the arrow controls below. The current spread is tracked
// by the route's `page` query parameter (a one-based physical page) so
// refreshes and copied URLs retain it; see `layoutSpread.ts` for the
// physical-page/spread math this component drives.
export function BinderLayoutView() {
  const { binder, layoutFocalPage, setLayoutFocalPage } = useBinderRouteContext();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const maxPhysicalPage = getMaxPhysicalPage(binder.pages);
  const rawPage = searchParams.get('page');
  const { physicalPage, replacementPage } = resolvePhysicalPageParam(
    rawPage,
    maxPhysicalPage,
    layoutFocalPage,
  );

  // Keeps the URL in sync: replaces (never pushes, so navigating spreads
  // never grows browser history) the `page` query parameter whenever the
  // requested value needed correcting, or to restore a focal page retained
  // from a previous visit to this tab.
  useEffect(() => {
    if (replacementPage === undefined) return;

    const params = new URLSearchParams(searchParams);
    params.set('page', String(replacementPage));
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

  function navigateToPhysicalPage(targetPage: number) {
    const params = new URLSearchParams(searchParams);
    params.set('page', String(targetPage));
    router.replace(`${pathname}?${params.toString()}`);
  }

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col gap-4 p-8">
      <div className="flex h-full min-h-0 flex-1 items-center justify-center gap-4">
        <button
          type="button"
          aria-label="Previous page"
          disabled={isFirstSpread}
          onClick={() =>
            navigateToPhysicalPage(getPreviousPhysicalPage(physicalPage, maxPhysicalPage))
          }
          className={ARROW_BUTTON_CLASS_NAME}
        >
          <ChevronLeft className="size-6" />
        </button>

        {/* Only the active spread's data is mounted - the previous/next
            spreads are never rendered or retained as hidden elements. A
            tight gap keeps the two sides reading as one bound spread (like
            facing pages meeting at the spine), and the max-width cap keeps
            the overall visualization compact so future flanking panels
            (notes on the left, unplaced cards on the right) have room
            beside it rather than being crowded out by an edge-to-edge
            layout. Both flex slots always render (a blank, non-content
            placeholder standing in for the side missing on the first/last
            spread) so that single-sided spread reserves the exact same
            half-row share of space as a two-sided spread instead of its
            lone binder side stretching to fill the whole row. */}
        <div className="flex h-full min-h-0 max-w-2xl flex-1 items-stretch justify-center gap-1">
          {spread.left !== null ? (
            <BinderSide side="left" width={binder.width} height={binder.height} />
          ) : (
            <div className="h-full min-h-0 w-full min-w-0 flex-1" aria-hidden="true" />
          )}
          {spread.right !== null ? (
            <BinderSide side="right" width={binder.width} height={binder.height} />
          ) : (
            <div className="h-full min-h-0 w-full min-w-0 flex-1" aria-hidden="true" />
          )}
        </div>

        <button
          type="button"
          aria-label="Next page"
          disabled={isLastSpread}
          onClick={() => navigateToPhysicalPage(getNextPhysicalPage(physicalPage, maxPhysicalPage))}
          className={ARROW_BUTTON_CLASS_NAME}
        >
          <ChevronRight className="size-6" />
        </button>
      </div>
    </div>
  );
}
