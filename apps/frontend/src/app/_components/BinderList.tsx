'use client';

import { Loader2 } from 'lucide-react';
import { useEffect, useState } from 'react';

import { listBinders, type BinderSummary } from '@/lib/api';
import { toProblemDetailsInfo, useToastContext } from '@/shared/feedback';

// The three states the binder list can be in (story 5). Tracking this as one
// enum, rather than separate booleans, keeps "loading" and "failed" from
// ever being true simultaneously and makes the empty-state gating below
// ("only after a successful load with zero binders") straightforward.
type BinderListStatus = 'loading' | 'success' | 'error';

// The home page's binder list (story 5): fetches the binder-summary
// collection on mount and renders its loading/empty/success/error states. A
// minimal inline spinner stands in for the shared loading component until
// story 6 ("Add reusable loading feedback") lands and this gets refactored
// to use it. Only used by the home page today, so it's colocated here
// rather than under src/shared/.
export function BinderList() {
  const [status, setStatus] = useState<BinderListStatus>('loading');
  const [binders, setBinders] = useState<BinderSummary[]>([]);
  const { markFailed } = useToastContext();

  useEffect(() => {
    // Guards against setting state from a stale request if this effect ever
    // re-runs before the previous fetch resolves (e.g. React Strict Mode's
    // double-invoke in development).
    let cancelled = false;

    async function loadBinders() {
      setStatus('loading');
      try {
        const summaries = await listBinders();
        if (cancelled) return;
        setBinders(summaries);
        setStatus('success');
      } catch (error) {
        if (cancelled) return;
        // No "saving" phase applies to a read, so the failed toast is raised
        // directly (bypassing useSaveStatusToast's saving->failed lifecycle)
        // per story 5: only the loading indicator and, on failure, the
        // failed toast are shown.
        setStatus('error');
        markFailed(crypto.randomUUID(), toProblemDetailsInfo(error));
      }
    }

    loadBinders();

    return () => {
      cancelled = true;
    };
  }, [markFailed]);

  return (
    // Full page width (no max-width container, per the styling conventions);
    // binders wrap onto additional centered rows as more are added.
    <div className="w-full">
      {status === 'loading' && (
        <div role="status" className="flex justify-center p-8">
          <Loader2 className="size-6 animate-spin text-neutral-500" aria-hidden="true" />
          <span className="sr-only">Loading binders…</span>
        </div>
      )}
      {status === 'success' && binders.length === 0 && (
        <p className="text-center text-body text-neutral-500">
          No binders yet. Create one to get started.
        </p>
      )}
      {status === 'success' && binders.length > 0 && (
        <ul className="flex flex-wrap justify-center gap-12">
          {binders.map((binder) => (
            <li key={binder.id} className="flex flex-col items-center gap-2">
              {/* Rectangle placeholder standing in for the binder's actual
                  preview (story 20) until that story renders the real
                  miniature page layout. Landscape orientation. */}
              <div className="flex h-40 w-[16.8rem] flex-col items-center justify-center gap-1 rounded-standard bg-surface p-4 text-center shadow-panel">
                <p className="text-caption text-neutral-500">
                  {binder.width} &times; {binder.height}
                </p>
                <p className="text-caption text-neutral-500">{binder.pages} pages</p>
              </div>
              <p className="font-bold">{binder.name}</p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
