import { contextBridge } from 'electron';

// Story 47: "Package and export the application as an executable". The
// frontend currently reads `NEXT_PUBLIC_BACKEND_URL` at build time
// (apps/frontend/src/lib/api/client.ts), which can't reflect a backend port
// chosen at runtime (see ports.ts). The main process instead passes the
// backend's actual runtime origin through `webPreferences.additionalArguments`
// when it creates the `BrowserWindow` (see main.ts) - Electron appends those
// strings onto this preload script's own `process.argv`, letting this script
// read the value back out below before any of the page's own scripts run.
const backendUrlArgument = process.argv.find((argument) => argument.startsWith('--backend-url='));
const backendUrl = backendUrlArgument?.slice('--backend-url='.length);

if (backendUrl) {
  // `contextBridge.exposeInMainWorld` is the contextIsolation-safe way to
  // hand a value from this preload script (which runs with Node/Electron
  // access) to the untrusted renderer's own `window` - client.ts checks
  // `window.__BACKEND_URL__` first, falling back to the build-time
  // `NEXT_PUBLIC_BACKEND_URL` value outside Electron.
  contextBridge.exposeInMainWorld('__BACKEND_URL__', backendUrl);
}
