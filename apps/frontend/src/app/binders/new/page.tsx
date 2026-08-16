import { Suspense } from 'react';

import { NewBinderForm } from './_components/NewBinderForm';

// The "Create a new binder" page (story 4). `NewBinderForm` reads
// `width`/`height`/`pages` query parameters via `useSearchParams` (used by
// story 54's Finances Preview page's "Create binder" button to prefill
// these 3 fields), which Next.js requires to be wrapped in a Suspense
// boundary.
export default function NewBinderPage() {
  return (
    <Suspense fallback={null}>
      <NewBinderForm />
    </Suspense>
  );
}
