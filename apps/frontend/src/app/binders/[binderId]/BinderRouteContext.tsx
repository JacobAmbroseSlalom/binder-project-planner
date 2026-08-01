'use client';

import { useRouter } from 'next/navigation';
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

import { getBinder, listBinderArt, listBinderCards, type Binder } from '@/lib/api';
import {
  LoadingIndicator,
  toProblemDetailsInfo,
  useDelayedLoading,
  useToastContext,
} from '@/shared/feedback';

import { BinderTabs } from './BinderTabs';

// Fixed (not per-attempt-random) toast id, matching the pattern established
// by BinderList's `LIST_BINDERS_TOAST_ID`: a later attempt (retry, or a
// fresh mount after the redirect-home case below) replaces this operation's
// own toast rather than stacking a new one on top of a still-visible one.
const OPEN_BINDER_TOAST_ID = 'open-binder';

// The 3 states one binder-load attempt can be in (mirrors BinderList's
// `BinderListStatus`, extended here with the redirect-triggering 404/400
// handling in the effect below rather than as a 4th status).
type BinderLoadStatus = 'loading' | 'success' | 'error';

// The shared binder route context value (story 7): the binder details,
// cards, and multi-slot art loaded in parallel by the route's provider, plus
// a setter the Edit Details tab uses to sync the context after a successful
// `PATCH` without forcing a full reload. Cards and art don't have a real
// schema yet (stories 11 and 25 respectively; see BinderRouteProvider's
// fetch below), so they're typed as `unknown[]` for now.
interface BinderRouteContextValue {
  binder: Binder;
  cards: unknown[];
  art: unknown[];
  // Replaces the context's binder with the backend's authoritative
  // representation, e.g. after the Edit Details tab's `PATCH` succeeds.
  updateBinder: (binder: Binder) => void;
  // The most recently displayed one-based physical page on the "Edit
  // Layout" tab (story 8), or `null` if that tab hasn't been visited yet
  // this route mount. Retained here (rather than in the layout tab's own
  // state) so it survives switching to another tab and back without
  // needing to reload binder data.
  layoutFocalPage: number | null;
  setLayoutFocalPage: (page: number) => void;
}

const BinderRouteContext = createContext<BinderRouteContextValue | null>(null);

// Reads the binder route context, throwing if called outside a
// `BinderRouteProvider` so a tab rendered without the provider mounted above
// it (a programming error) fails loudly rather than silently.
export function useBinderRouteContext(): BinderRouteContextValue {
  const context = useContext(BinderRouteContext);
  if (!context) {
    throw new Error('useBinderRouteContext must be used within a BinderRouteProvider.');
  }
  return context;
}

// Mounted once per binder route (from `[binderId]/layout.tsx`) and remains
// mounted while the user switches between its nested tabs, so tab
// navigation never refetches unchanged binder data or discards local
// updates (story 7). Loads the binder's details, cards, and art through 3
// parallel requests and only publishes them - and only renders the tab nav
// and `children` - once every request has succeeded, so nested tabs never
// receive a partially loaded binder graph.
export function BinderRouteProvider({
  binderId,
  children,
}: {
  binderId: string;
  children: React.ReactNode;
}) {
  const router = useRouter();
  const { markFailed, dismiss } = useToastContext();

  const [status, setStatus] = useState<BinderLoadStatus>('loading');
  const [binder, setBinder] = useState<Binder | null>(null);
  const [cards, setCards] = useState<unknown[]>([]);
  const [art, setArt] = useState<unknown[]>([]);
  // Bumped by the retry button to re-run the load effect below without
  // needing a separate imperative "reload" function threaded through state.
  const [retryToken, setRetryToken] = useState(0);
  // Story 8's retained layout focal page; `null` means the layout tab
  // hasn't been visited yet during this route mount, so it should still
  // default to physical page 1 without adding `?page=1` to the URL.
  const [layoutFocalPage, setLayoutFocalPage] = useState<number | null>(null);

  const showLoading = useDelayedLoading(status === 'loading');

  useEffect(() => {
    const controller = new AbortController();

    async function load() {
      setStatus('loading');
      try {
        // Story 7 requires all 3 requests to run in parallel and to publish
        // together only once every one succeeds, so a consumer never sees
        // e.g. cards without matching binder details.
        const [binderResult, cardsResult, artResult] = await Promise.all([
          getBinder(binderId, controller.signal),
          listBinderCards(binderId, controller.signal),
          listBinderArt(binderId, controller.signal),
        ]);
        setBinder(binderResult);
        setCards(cardsResult);
        setArt(artResult);
        setStatus('success');
        dismiss(OPEN_BINDER_TOAST_ID);
      } catch (error) {
        // An aborted request's rejection isn't a real failure - it means this
        // attempt was superseded (e.g. the user navigated away), so it's
        // ignored rather than reported as an error.
        if (controller.signal.aborted) return;

        const info = toProblemDetailsInfo(error);
        if (info.httpStatus === 404 || info.httpStatus === 400) {
          // Missing binder (404) or malformed binderId (400, rejected by
          // request validation before the database lookup) both use the
          // same redirect-home-and-toast behavior per story 7's acceptance
          // criteria. `replace` (not `push`) so the invalid binder URL isn't
          // left in browser history.
          markFailed(OPEN_BINDER_TOAST_ID, info);
          router.replace('/');
          return;
        }

        setStatus('error');
        markFailed(OPEN_BINDER_TOAST_ID, info);
      }
    }

    load();

    return () => {
      controller.abort();
    };
  }, [binderId, retryToken, router, markFailed, dismiss]);

  // Lets the Edit Details tab sync the context with the backend's
  // authoritative binder after a successful `PATCH`, without re-fetching
  // cards/art or discarding the rest of the loaded route state.
  const updateBinder = useCallback((updated: Binder) => {
    setBinder(updated);
  }, []);

  // A failed (non-404/400) load's retry action: re-runs all 3 requests per
  // story 7's "retry starts all three requests again".
  const retry = useCallback(() => {
    setRetryToken((token) => token + 1);
  }, []);

  // Only meaningful once `status === 'success'`; computed unconditionally
  // (rather than after an early return) so hook call order stays stable
  // across renders.
  const value = useMemo<BinderRouteContextValue | null>(() => {
    if (!binder) return null;
    return { binder, cards, art, updateBinder, layoutFocalPage, setLayoutFocalPage };
  }, [binder, cards, art, updateBinder, layoutFocalPage]);

  if (status === 'loading') {
    return showLoading ? <LoadingIndicator label="Loading binder…" size="10" /> : null;
  }

  if (status === 'error') {
    return (
      <div className="flex flex-col items-center gap-4 p-8">
        <p className="text-body text-neutral-500">The binder could not be loaded.</p>
        <button
          type="button"
          onClick={retry}
          className="cursor-pointer rounded-standard bg-primary px-4 py-2 font-bold hover:brightness-110"
        >
          Retry
        </button>
      </div>
    );
  }

  // Unreachable in practice (status is only 'success' once `binder` is set),
  // but keeps the render function total instead of asserting `value!` below.
  if (!value) return null;

  return (
    <BinderRouteContext.Provider value={value}>
      <h1 className="pt-4 text-center">{value.binder.name}</h1>
      <BinderTabs binderId={binderId} />
      {/* `flex-1 min-h-0`: gives the active tab a definite, fill-remaining-
          space container to grow into. Tabs that don't need it (Edit
          Details, View Financials) just render their normal top-aligned
          content inside it, identical to before; the Edit Layout tab (story
          8) uses it to size its binder-side grids to the viewport without
          scrolling. */}
      <div className="flex min-h-0 flex-1 flex-col">{children}</div>
    </BinderRouteContext.Provider>
  );
}
