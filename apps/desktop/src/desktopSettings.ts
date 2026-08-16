import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

// Story 53: "Sync data across laptops via cloud-sync folder". Persisted
// machine-local desktop app settings - currently just the user's chosen
// override for where the backend's `APP_DATA_DIRECTORY` points (e.g. a
// Dropbox/iCloud/OneDrive/Google Drive-managed folder), set via the
// frontend's Settings page. Stored as plain JSON directly under
// `app.getPath('userData')` (never inside the folder it might itself be
// pointing at), since it needs to be readable before the backend process
// (which owns `APP_DATA_DIRECTORY` resolution) is even spawned.
export interface DesktopSettings {
  dataDirectoryOverride?: string;
}

const SETTINGS_FILENAME = 'desktop-settings.json';

function settingsFilePath(userDataDirectory: string): string {
  return join(userDataDirectory, SETTINGS_FILENAME);
}

// Reads the persisted settings, or an empty object if the file is
// missing or unreadable/malformed - falling back to "no override" rather
// than throwing, since a corrupt settings file shouldn't prevent the app
// from launching at all.
export function readDesktopSettings(userDataDirectory: string): DesktopSettings {
  const filePath = settingsFilePath(userDataDirectory);
  if (!existsSync(filePath)) return {};

  try {
    const parsed = JSON.parse(readFileSync(filePath, 'utf8')) as Partial<DesktopSettings>;
    return typeof parsed.dataDirectoryOverride === 'string'
      ? { dataDirectoryOverride: parsed.dataDirectoryOverride }
      : {};
  } catch {
    return {};
  }
}

export function writeDesktopSettings(userDataDirectory: string, settings: DesktopSettings): void {
  mkdirSync(userDataDirectory, { recursive: true });
  writeFileSync(settingsFilePath(userDataDirectory), JSON.stringify(settings, null, 2));
}
