import Link from 'next/link';

// The home page (story 4: "Create a new binder"). The binder list itself is
// added by story 5; for now this just offers the entry point to create one.
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
    </main>
  );
}
