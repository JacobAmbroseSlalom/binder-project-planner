'use client';

import { useSyncExternalStore } from 'react';

// Story 53: the desktop app's preload script (apps/desktop/src/preload.cts)
// exposes this bridge unconditionally whenever the frontend is running
// inside the Electron shell, so its mere presence is how any page/component
// tells desktop apart from a plain browser tab. Declared globally here
// (rather than duplicated per consumer) since both the Settings page and
// the home toolbar's Settings button need it.
declare global {
  interface Window {
    __DESKTOP_SETTINGS__?: {
      get: () => Promise<DesktopSettingsInfo>;
      chooseFolder: () => Promise<string | null>;
      setOverride: (directory: string | null) => Promise<void>;
    };
  }
}

export interface DesktopSettingsInfo {
  dataDirectory: string;
  isOverridden: boolean;
  defaultDataDirectory: string;
}

// No-op subscribe: the bridge's presence is fixed for the lifetime of the
// page (set once by the preload script before any React code runs), so
// there's nothing that ever changes for this hook to react to - it only
// needs a snapshot read.
function subscribe() {
  return () => {};
}

function getSnapshot(): boolean {
  return typeof window !== 'undefined' && Boolean(window.__DESKTOP_SETTINGS__);
}

// The server (and first client render, before hydration) never has a
// desktop bridge, so this always reports `false` there.
function getServerSnapshot(): boolean {
  return false;
}

// Whether the app is currently running inside the Electron desktop shell
// (story 53), rather than a plain browser tab - used to gate desktop-only
// UI like the Settings page/button. Built on `useSyncExternalStore` so the
// server render and first client render both report `false`, then a real
// desktop client re-renders `true` once hydrated, without triggering a
// hydration-mismatch warning.
export function useIsDesktopApp(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
