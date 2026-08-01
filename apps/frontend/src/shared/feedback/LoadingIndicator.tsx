'use client';

import { Loader2 } from 'lucide-react';

// The sizes the spinner supports, matching the shared icon size scale
// (styling.instructions.md's "Iconography" section: `size-4`/`size-5`/
// `size-6`/`size-8`/`size-10`).
type LoadingIndicatorSize = '4' | '5' | '6' | '8' | '10';

const SPINNER_SIZE_CLASSES: Record<LoadingIndicatorSize, string> = {
  '4': 'size-4',
  '5': 'size-5',
  '6': 'size-6',
  '8': 'size-8',
  '10': 'size-10',
};

interface LoadingIndicatorProps {
  // Accessible status label describing the operation in progress (e.g.
  // "Loading binders…"). Visually hidden; the spinner alone communicates
  // the loading state to sighted users.
  label: string;
  // Which of the standard icon sizes to render at (see
  // styling.instructions.md). Defaults to `'6'`; callers rendering a
  // spinner as a page/list's primary loading state can opt into `'8'` or
  // `'10'` for more prominence.
  size?: LoadingIndicatorSize;
}

// The shared inline loading indicator (story 6: "Add reusable loading
// feedback"). Every future story that retrieves data from the backend
// renders this component, paired with `useDelayedLoading`, instead of
// building its own spinner markup. `role="status"` gives it the same
// polite-live-region accessibility behavior already used by the "saving"
// toast (story 3), satisfying this story's "selected library's default
// accessibility behavior" requirement without a UI component library.
export function LoadingIndicator({ label, size = '6' }: LoadingIndicatorProps) {
  return (
    <div role="status" className="flex justify-center p-8">
      <Loader2
        className={`${SPINNER_SIZE_CLASSES[size]} animate-spin text-neutral-500`}
        aria-hidden="true"
      />
      <span className="sr-only">{label}</span>
    </div>
  );
}
