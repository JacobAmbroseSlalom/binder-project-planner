'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

// Lets a page set the title shown in the persistent app header bar (e.g. the
// binder view/edit pages show the binder name there instead of an in-page
// heading). The provider wraps both the header and the routed page in the
// root layout so a nested client component can set the title and the header
// can read it.
interface AppHeaderTitleContextValue {
  title: string | null;
  setTitle: (title: string | null) => void;
}

const AppHeaderTitleContext = createContext<AppHeaderTitleContextValue>({
  title: null,
  setTitle: () => {},
});

export function AppHeaderTitleProvider({ children }: { children: React.ReactNode }) {
  const [title, setTitle] = useState<string | null>(null);
  // Stable setter so `useSetAppHeaderTitle`'s effect isn't re-run every
  // render.
  const setTitleStable = useCallback((next: string | null) => setTitle(next), []);
  const value = useMemo(
    () => ({ title, setTitle: setTitleStable }),
    [title, setTitleStable],
  );
  return <AppHeaderTitleContext.Provider value={value}>{children}</AppHeaderTitleContext.Provider>;
}

// Read by the app header to display the current page's title, if any.
export function useAppHeaderTitle(): string | null {
  return useContext(AppHeaderTitleContext).title;
}

// Sets the app header's title to `title` while the calling component is
// mounted, clearing it (back to null) on unmount or when `title` becomes
// null - so navigating away from a binder page removes its name from the
// header.
export function useSetAppHeaderTitle(title: string | null): void {
  const { setTitle } = useContext(AppHeaderTitleContext);
  useEffect(() => {
    setTitle(title);
    return () => setTitle(null);
  }, [title, setTitle]);
}
