'use client';

import { Home, Lock } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

import { useAppHeaderTitle } from './AppHeaderTitle';
import { useNavigationGuard } from './NavigationGuard';

// A persistent top bar rendered once in the root layout (rather than per-page)
// so every page - including ones with no navigation of their own, like
// /health and /binders/new - always offers a consistent way back to the home
// page (per the "back to home" affordance requested alongside story 4). Pages
// can also surface a title here via `useSetAppHeaderTitle` - the binder
// view/edit pages show the binder name in this bar instead of an in-page
// heading.
export function AppHeader() {
  const { title, locked } = useAppHeaderTitle();
  const router = useRouter();
  const { isBlocked, confirmNavigation } = useNavigationGuard();

  return (
    <header className="relative flex items-center bg-surface px-6 py-4 shadow-panel">
      <Link
        href="/"
        onClick={(event) => {
          // Story 38: only intercept the click while some feature has
          // registered an unsaved-changes guard - otherwise this behaves
          // as a normal `Link` (still lets a middle-click/ctrl-click open
          // a new tab, prefetches normally, etc.).
          if (!isBlocked) return;
          event.preventDefault();
          confirmNavigation(() => router.push('/'));
        }}
        className="flex items-center gap-2 font-bold text-neutral-100 hover:brightness-110"
      >
        <Home className="size-5" />
        Binder Project Planner
      </Link>
      {/* The current page's title (e.g. the binder name), centered in the bar
          independently of the home link's width. Absolutely positioned so it
          stays centered on the bar rather than being pushed by the link. */}
      {title && (
        <h1 className="pointer-events-none absolute left-1/2 flex -translate-x-1/2 items-center gap-3 text-subheading font-bold">
          {/* An invisible mirror of the "Locked" badge below, sized
              identically but hidden (`invisible`, not `hidden` - it still
              takes up its layout space) - without it, the badge's own width
              on the right would pull the centered flex row's visual weight
              rightward, leaving the title text itself looking off-center
              even though the whole title+badge group is centered on the
              bar. */}
          {locked && (
            <span
              className="invisible inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-caption font-bold"
              aria-hidden="true"
            >
              <Lock className="size-4" />
              Locked
            </span>
          )}
          {title}
          {/* Story 32: the "Locked" badge sits directly beside the binder
              name in the header (rather than as its own row above the
              tabs), since it's a property of the binder the name is
              already naming. */}
          {locked && (
            <span className="inline-flex items-center gap-1 rounded-full bg-neutral-700 px-2 py-0.5 text-caption font-bold text-neutral-100">
              <Lock className="size-4" aria-hidden="true" />
              Locked
            </span>
          )}
        </h1>
      )}
    </header>
  );
}
