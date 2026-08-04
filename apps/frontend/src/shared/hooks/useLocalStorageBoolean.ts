'use client';

import { useCallback, useSyncExternalStore } from 'react';

// A boolean UI preference persisted in the browser's local storage and
// restored on later visits (story 22: the binder completion-metrics
// visibility toggle). Kept generic (a `key` + `defaultValue`) rather than
// metrics-specific so a future persisted boolean preference can reuse it.
//
// Built on `useSyncExternalStore` - React's SSR-safe primitive for reading
// an external store - rather than a `useState`/`useEffect` hydration pair:
// the server snapshot returns `defaultValue` (so the server and first
// client render match), while the client snapshot reads local storage.
// This also avoids a setState-in-effect, which the React Compiler flags as
// a cascading-render risk.

// Same-tab notification: the native `storage` event only fires in OTHER
// tabs, so writes in this tab dispatch a custom event that our own
// subscribers listen for too.
const SAME_TAB_CHANGE_EVENT = 'local-storage-boolean-change';

// Reads the stored boolean, falling back to `defaultValue` when the key was
// never saved or storage access throws (e.g. Safari private mode).
function readStoredBoolean(key: string, defaultValue: boolean): boolean {
  try {
    const stored = window.localStorage.getItem(key);
    if (stored === null) return defaultValue;
    return stored === 'true';
  } catch {
    return defaultValue;
  }
}

export function useLocalStorageBoolean(
  key: string,
  defaultValue: boolean,
): [boolean, (next: boolean) => void] {
  // Re-run the snapshot on cross-tab `storage` events and same-tab writes.
  const subscribe = useCallback((onStoreChange: () => void) => {
    window.addEventListener('storage', onStoreChange);
    window.addEventListener(SAME_TAB_CHANGE_EVENT, onStoreChange);
    return () => {
      window.removeEventListener('storage', onStoreChange);
      window.removeEventListener(SAME_TAB_CHANGE_EVENT, onStoreChange);
    };
  }, []);

  // Client snapshot reads local storage; a boolean primitive is referentially
  // stable, so `useSyncExternalStore`'s `Object.is` check won't loop.
  const getSnapshot = useCallback(() => readStoredBoolean(key, defaultValue), [key, defaultValue]);
  // Server (and first client) snapshot: always the default, so hydration
  // markup matches.
  const getServerSnapshot = useCallback(() => defaultValue, [defaultValue]);

  const value = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  const setPersisted = useCallback(
    (next: boolean) => {
      try {
        window.localStorage.setItem(key, String(next));
      } catch {
        // Storage unavailable - the write is dropped, but the dispatched
        // event below still re-runs subscribers so nothing gets stuck.
      }
      // Notify this tab's own subscribers (the native `storage` event won't).
      window.dispatchEvent(new Event(SAME_TAB_CHANGE_EVENT));
    },
    [key],
  );

  return [value, setPersisted];
}
