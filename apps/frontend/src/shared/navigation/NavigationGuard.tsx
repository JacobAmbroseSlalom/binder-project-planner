'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

import { NavigationConfirmDialog } from './NavigationConfirmDialog';

interface NavigationGuardContextValue {
  isBlocked: boolean;
  confirmNavigation: (proceed: () => void) => void;
  setMessage: (message: string | null) => void;
}

const NavigationGuardContext = createContext<NavigationGuardContextValue>({
  isBlocked: false,
  confirmNavigation: (proceed) => proceed(),
  setMessage: () => {},
});

// Mounted once in the root layout (story 38's navigate-away confirmation),
// above both `AppHeader` and every routed page, so any in-app navigation
// affordance (the header's home link, the binder route's own tab bar) can
// guard against leaving while a feature elsewhere in the tree has
// unsaved changes - mirroring `AppHeaderTitleProvider`'s "register from
// below, read from above" pattern. Only one feature is ever expected to
// hold the guard at a time (currently the Card List tab's price-review
// state), so a single `message` slot - rather than a stack - is enough.
export function NavigationGuardProvider({ children }: { children: React.ReactNode }) {
  const [message, setMessage] = useState<string | null>(null);
  const [pendingProceed, setPendingProceed] = useState<(() => void) | null>(null);

  const confirmNavigation = useCallback(
    (proceed: () => void) => {
      if (!message) {
        proceed();
        return;
      }
      setPendingProceed(() => proceed);
    },
    [message],
  );

  const value = useMemo(
    () => ({ isBlocked: message !== null, confirmNavigation, setMessage }),
    [message, confirmNavigation],
  );

  return (
    <NavigationGuardContext.Provider value={value}>
      {children}
      {pendingProceed && message && (
        <NavigationConfirmDialog
          message={message}
          onConfirm={() => {
            const proceed = pendingProceed;
            setPendingProceed(null);
            proceed();
          }}
          onCancel={() => setPendingProceed(null)}
        />
      )}
    </NavigationGuardContext.Provider>
  );
}

// Read by any in-app navigation affordance (a `Link`'s own click handler)
// that needs to guard against leaving while unsaved changes exist
// elsewhere in the tree: `isBlocked` tells it whether to intercept the
// click at all, and `confirmNavigation` either runs `proceed` immediately
// (nothing to guard) or shows the shared confirmation dialog first.
export function useNavigationGuard(): Pick<
  NavigationGuardContextValue,
  'isBlocked' | 'confirmNavigation'
> {
  const { isBlocked, confirmNavigation } = useContext(NavigationGuardContext);
  return { isBlocked, confirmNavigation };
}

// Registers `message` as the active navigate-away guard while the calling
// component is mounted and `active` is true, clearing it on unmount or
// whenever `active` becomes false - so leaving the Card List tab's price-
// review state (saved, cancelled, or the tab itself unmounting) always
// re-enables normal navigation.
export function useSetNavigationGuardMessage(active: boolean, message: string): void {
  const { setMessage } = useContext(NavigationGuardContext);
  useEffect(() => {
    setMessage(active ? message : null);
    return () => setMessage(null);
  }, [active, message, setMessage]);
}
