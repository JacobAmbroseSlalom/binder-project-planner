'use client';

import { useEffect, useState } from 'react';

import { getHealth } from '@/lib/api';

// The home page's backend-connectivity state: loading while the health check is
// in flight, then either connected (with the reported database status) or errored.
type BackendStatus =
  | { state: 'loading' }
  | { state: 'connected'; database: string }
  | { state: 'error'; message: string };

export default function Home() {
  const [backendStatus, setBackendStatus] = useState<BackendStatus>({ state: 'loading' });

  useEffect(() => {
    // Guards against setting state after the effect has been cleaned up, e.g. if
    // the component unmounts before the request resolves.
    let cancelled = false;

    getHealth()
      .then((health) => {
        if (!cancelled) {
          setBackendStatus({ state: 'connected', database: health.database });
        }
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setBackendStatus({
            state: 'error',
            message: error instanceof Error ? error.message : 'Unknown error.',
          });
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <main>
      <h1>Binder Project Planner</h1>
      <p data-testid="backend-status">
        {backendStatus.state === 'loading' && 'Checking backend connection…'}
        {backendStatus.state === 'connected' &&
          `Backend connected (database: ${backendStatus.database}).`}
        {backendStatus.state === 'error' && `Backend connection failed: ${backendStatus.message}`}
      </p>
    </main>
  );
}
