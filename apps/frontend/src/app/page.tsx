import { BinderList } from './_components/BinderList';
import { HomeToolbar } from './_components/HomeToolbar';

// The home page (stories 4 and 5): a single-line toolbar (completion-metrics
// toggle, centered create button, export/import) above the binder list.
export default function Home() {
  return (
    <main className="flex flex-col items-center gap-8 p-8">
      {/* Stories 22/4/33: the completion-metrics toggle, the centered
          "Create new binder" button, and the export/import actions, all on
          one row. */}
      <HomeToolbar />

      <BinderList />
    </main>
  );
}
