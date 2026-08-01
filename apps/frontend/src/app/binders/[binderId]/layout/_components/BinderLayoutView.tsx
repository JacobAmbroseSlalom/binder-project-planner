'use client';

import { ChevronLeft, ChevronRight } from 'lucide-react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';

import { useSaveStatusToast } from '@/shared/feedback';

import { useBinderRouteContext } from '../../BinderRouteContext';
import {
  getMaxPhysicalPage,
  getNextPhysicalPage,
  getPreviousPhysicalPage,
  getSpreadLabel,
  parsePhysicalPageInput,
  resolvePhysicalPageParam,
  resolveSpread,
} from '../layoutSpread';
import { BinderSide } from './BinderSide';

// Shared styling for the previous/next icon buttons, matching the app's
// disabled-state convention (reduced opacity + not-allowed cursor).
const ARROW_BUTTON_CLASS_NAME =
  'cursor-pointer rounded-full p-2 text-neutral-100 hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50';

// The direct page-number input's styling: the same filled-input treatment
// documented in styling.instructions.md's "Forms & inputs" section
// (neutral-800 fill, primary border on focus), sized narrow and centered
// for a short numeric value rather than a full-width form field.
const PAGE_INPUT_CLASS_NAME =
  'w-20 rounded-standard border border-transparent bg-neutral-800 px-2 py-1 text-center focus:border-primary focus:outline-none';

// The "Edit Layout" tab's real content (stories 8 and 9): visualizes the
// binder as a sequence of displayed spreads - the first showing only the
// right side, the last only the left side, and every one in between
// showing both - navigated with the arrow controls or the direct
// page-number input in the toolbar above. The current spread is tracked
// by the route's `page` query parameter (a one-based physical page) so
// refreshes and copied URLs retain it; see `layoutSpread.ts` for the
// physical-page/spread math this component drives.
export function BinderLayoutView() {
  const { binder, layoutFocalPage, setLayoutFocalPage } = useBinderRouteContext();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { start } = useSaveStatusToast();

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

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col gap-10 p-8">
      {/* The direct page-number input (story 9), on its own row above the
          binder visualization. */}
      <div className="flex flex-col items-center gap-1">
        <label htmlFor="layout-page-input" className="text-caption text-neutral-500">
          Go to page
        </label>
        <input
          id="layout-page-input"
          type="number"
          min={1}
          max={maxPhysicalPage}
          step={1}
          value={pageInputValue}
          onChange={(event) => setPageInputValue(event.target.value)}
          onBlur={commitPageInput}
          onKeyDown={(event) => {
            // Commits on Enter by blurring, which routes through the same
            // `commitPageInput` handler instead of duplicating its logic.
            if (event.key === 'Enter') event.currentTarget.blur();
          }}
          className={PAGE_INPUT_CLASS_NAME}
        />
      </div>

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

        {/* The current spread's label (story 9), centered directly above
            the binder visualization it describes. */}
        <div className="flex h-full min-h-0 max-w-2xl flex-1 flex-col items-center gap-2">
          <p className="text-caption text-neutral-500">{getSpreadLabel(spread)}</p>

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
          <div className="flex h-full min-h-0 w-full flex-1 items-stretch justify-center gap-1">
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
