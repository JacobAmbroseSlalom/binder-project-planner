'use client';

import { Home, Lock, Search } from 'lucide-react';
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
// heading. Story 45 adds a second persistent link, to the "What I'm Looking
// For" page, at the opposite (right) end of the bar.
export function AppHeader() {
  const { title, locked } = useAppHeaderTitle();
  const router = useRouter();
  const { isBlocked, confirmNavigation } = useNavigationGuard();

  // Both persistent links share the same "intercept while a feature has
  // registered an unsaved-changes guard" click handling (story 38), so it's
  // factored out here rather than duplicated between the home link below
  // and the new watchlist link.
  function handleGuardedNavigate(event: React.MouseEvent<HTMLAnchorElement>, href: string) {
    if (!isBlocked) return;
    event.preventDefault();
    confirmNavigation(() => router.push(href));
  }

  return (
    <header className="relative flex items-center bg-surface px-6 py-4 shadow-panel">
      <Link
        href="/"
        onClick={(event) => handleGuardedNavigate(event, '/')}
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
      {/* Story 45: a persistent right-aligned link to the "What I'm
          Looking For" page, the only other content in this bar besides
          the home link (left) and the centered title above - `ml-auto`
          pushes it to the opposite end of the flex row without disturbing
          either of those. */}
      <Link
        href="/watchlist"
        onClick={(event) => handleGuardedNavigate(event, '/watchlist')}
        className="ml-auto flex items-center gap-2 font-bold text-neutral-100 hover:brightness-110"
      >
        <Search className="size-5" />
        What I&apos;m Looking For
      </Link>
    </header>
  );
}
