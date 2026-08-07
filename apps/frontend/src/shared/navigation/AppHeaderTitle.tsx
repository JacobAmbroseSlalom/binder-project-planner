'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

// The app header's title state: the current page's title text (e.g. a
// binder's name), plus whether to show the small "Locked" badge next to it
// (story 32). Bundled into one state object - rather than two separate
// contexts - since both are always set/cleared together by the same binder
// route and read together by the header.
interface AppHeaderTitleState {
  title: string | null;
  locked: boolean;
}

const DEFAULT_STATE: AppHeaderTitleState = { title: null, locked: false };

// Lets a page set the title shown in the persistent app header bar (e.g. the
// binder view/edit pages show the binder name there instead of an in-page
// heading). The provider wraps both the header and the routed page in the
// root layout so a nested client component can set the title and the header
// can read it.
interface AppHeaderTitleContextValue {
  state: AppHeaderTitleState;
  setState: (next: AppHeaderTitleState) => void;
}

const AppHeaderTitleContext = createContext<AppHeaderTitleContextValue>({
  state: DEFAULT_STATE,
  setState: () => {},
});

export function AppHeaderTitleProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<AppHeaderTitleState>(DEFAULT_STATE);
  // Stable setter so `useSetAppHeaderTitle`'s effect isn't re-run every
  // render.
  const setStateStable = useCallback((next: AppHeaderTitleState) => setState(next), []);
  const value = useMemo(() => ({ state, setState: setStateStable }), [state, setStateStable]);
  return <AppHeaderTitleContext.Provider value={value}>{children}</AppHeaderTitleContext.Provider>;
}

// Read by the app header to display the current page's title (and its
// locked badge, if any).
export function useAppHeaderTitle(): AppHeaderTitleState {
  return useContext(AppHeaderTitleContext).state;
}

// Sets the app header's title to `title` (and its "Locked" badge to
// `locked`) while the calling component is mounted, clearing both back to
// the default on unmount or when `title` becomes null - so navigating away
// from a binder page removes its name (and badge) from the header.
export function useSetAppHeaderTitle(title: string | null, locked = false): void {
  const { setState } = useContext(AppHeaderTitleContext);
  useEffect(() => {
    setState({ title, locked });
    return () => setState(DEFAULT_STATE);
  }, [title, locked, setState]);
}
