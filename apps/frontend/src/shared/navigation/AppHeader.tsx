import { Home } from 'lucide-react';
import Link from 'next/link';

// A persistent top bar rendered once in the root layout (rather than per-page)
// so every page - including ones with no navigation of their own, like
// /health and /binders/new - always offers a consistent way back to the home
// page (per the "back to home" affordance requested alongside story 4).
export function AppHeader() {
  return (
    <header className="flex items-center bg-surface px-6 py-4 shadow-panel">
      <Link
        href="/"
        className="flex items-center gap-2 font-bold text-neutral-100 hover:brightness-110"
      >
        <Home className="size-5" />
        Binder Project Planner
      </Link>
    </header>
  );
}
