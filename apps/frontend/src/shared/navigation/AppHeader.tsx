'use client';

import { Home } from 'lucide-react';
import Link from 'next/link';

import { useAppHeaderTitle } from './AppHeaderTitle';

// A persistent top bar rendered once in the root layout (rather than per-page)
// so every page - including ones with no navigation of their own, like
// /health and /binders/new - always offers a consistent way back to the home
// page (per the "back to home" affordance requested alongside story 4). Pages
// can also surface a title here via `useSetAppHeaderTitle` - the binder
// view/edit pages show the binder name in this bar instead of an in-page
// heading.
export function AppHeader() {
  const title = useAppHeaderTitle();

  return (
    <header className="relative flex items-center bg-surface px-6 py-4 shadow-panel">
      <Link
        href="/"
        className="flex items-center gap-2 font-bold text-neutral-100 hover:brightness-110"
      >
        <Home className="size-5" />
        Binder Project Planner
      </Link>
      {/* The current page's title (e.g. the binder name), centered in the bar
          independently of the home link's width. Absolutely positioned so it
          stays centered on the bar rather than being pushed by the link. */}
      {title && (
        <h1 className="pointer-events-none absolute left-1/2 -translate-x-1/2 text-subheading font-bold">
          {title}
        </h1>
      )}
    </header>
  );
}
