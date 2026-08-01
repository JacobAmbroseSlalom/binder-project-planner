import { Suspense } from 'react';

import { BinderLayoutView } from './_components/BinderLayoutView';

// The "Edit Layout" tab (story 8). `BinderLayoutView` reads the `page`
// query parameter via `useSearchParams`, which Next.js requires to be
// wrapped in a Suspense boundary.
export default function BinderLayoutPage() {
  return (
    <Suspense fallback={null}>
      <BinderLayoutView />
    </Suspense>
  );
}
