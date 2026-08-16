'use client';

import { FolderOpen } from 'lucide-react';
import { useEffect, useState } from 'react';

import type { DesktopSettingsInfo } from '@/shared/hooks/useIsDesktopApp';

// The desktop app's Settings page (story 53), letting the user point the
// backend's data directory at a folder managed by a cloud-sync client
// (Dropbox, iCloud Drive, OneDrive, Google Drive, etc.) instead of setting
// an environment variable by hand. Changing it relaunches the whole app,
// since the backend process only ever reads its data directory once, at
// launch.
export default function SettingsPage() {
  const [info, setInfo] = useState<DesktopSettingsInfo | null>(null);
  const [pendingFolder, setPendingFolder] = useState<string | null>(null);
  const [isApplying, setIsApplying] = useState(false);
  // Read once per render rather than stored in state - `window` is stable
  // for the lifetime of the page, and this keeps every handler below from
  // needing its own `window.__DESKTOP_SETTINGS__` null-check. The bridge's
  // mere presence is also how this page tells it's actually running inside
  // the Electron shell (rather than a plain browser tab) - see the early
  // return below for the case where it's absent.
  const bridge = typeof window !== 'undefined' ? window.__DESKTOP_SETTINGS__ : undefined;

  useEffect(() => {
    bridge
      ?.get()
      .then(setInfo)
      .catch(() => setInfo(null));
  }, [bridge]);

  if (!bridge) {
    return (
      <main className="flex flex-col items-start gap-4 p-8">
        <h1>Settings</h1>
        <p className="text-body text-neutral-100">
          Settings are only available in the desktop app.
        </p>
      </main>
    );
  }

  async function chooseFolder() {
    const folder = await bridge!.chooseFolder();
    if (folder) setPendingFolder(folder);
  }

  async function applyFolder() {
    if (!pendingFolder) return;
    setIsApplying(true);
    // The app relaunches once this resolves (see main.ts's
    // `desktop-settings:set-override` handler), so no further UI state
    // update is needed after this call.
    await bridge!.setOverride(pendingFolder);
  }

  async function resetToDefault() {
    setIsApplying(true);
    await bridge!.setOverride(null);
  }

  return (
    <main className="flex flex-col items-start gap-8 p-8">
      <h1>Settings</h1>
      <section className="flex w-full max-w-2xl flex-col gap-4 rounded-standard bg-surface p-6 shadow-panel">
        <h2 className="text-subheading font-bold">Data folder</h2>
        <p className="text-body text-neutral-100">
          Choose a folder managed by a cloud-sync app (Dropbox, iCloud Drive, OneDrive, Google
          Drive, etc.) to keep your data in sync across laptops. Restarting the app is required for
          a change to take effect.
        </p>
        {info && (
          <p className="text-caption text-neutral-400">
            Current: <span className="font-bold text-neutral-100">{info.dataDirectory}</span>
            {!info.isOverridden && ' (default)'}
          </p>
        )}
        {pendingFolder && (
          <p className="text-caption text-neutral-400">
            New folder selected: <span className="font-bold text-neutral-100">{pendingFolder}</span>
          </p>
        )}
        <div className="flex gap-4">
          <button
            type="button"
            onClick={chooseFolder}
            disabled={isApplying}
            className={`flex items-center gap-2 rounded-standard bg-neutral-800 px-4 py-2 font-bold hover:brightness-110 ${
              isApplying ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'
            }`}
          >
            <FolderOpen className="size-5" />
            Choose Folder...
          </button>
          <button
            type="button"
            onClick={applyFolder}
            disabled={isApplying || !pendingFolder}
            className={`rounded-standard bg-primary px-4 py-2 font-bold hover:brightness-110 ${
              isApplying || !pendingFolder ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'
            }`}
          >
            Apply and Restart
          </button>
          {info?.isOverridden && (
            <button
              type="button"
              onClick={resetToDefault}
              disabled={isApplying}
              className={`rounded-standard bg-neutral-800 px-4 py-2 font-bold hover:brightness-110 ${
                isApplying ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'
              }`}
            >
              Reset to Default
            </button>
          )}
        </div>
      </section>
    </main>
  );
}
