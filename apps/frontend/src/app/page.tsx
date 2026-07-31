import Link from 'next/link';

import { BinderList } from './_components/BinderList';

// The home page (stories 4 and 5): offers the entry point to create a
// binder and displays the existing binder list.
export default function Home() {
  return (
    <main className="flex flex-col items-center gap-8 p-8">
      <h1>Binders</h1>
      {/* Story 4: "Create a new binder" - navigates to the new-binder page. */}
      <Link
        href="/binders/new"
        className="inline-block rounded-standard bg-primary px-4 py-2 font-bold hover:brightness-110"
      >
        Create new binder
      </Link>

      <BinderList />
    </main>
  );
}
