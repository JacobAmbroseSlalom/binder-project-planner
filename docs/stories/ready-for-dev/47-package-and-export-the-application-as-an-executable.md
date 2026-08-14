# 47. Package and export the application as an executable

**Status:** Not started

#### Acceptance criteria

- The application can be packaged and distributed as a native desktop app for both
  Windows and macOS.
- Builds are unsigned and unnotarized: no Apple Developer account or Windows
  code-signing certificate is used. The first launch of a freshly built install shows
  the OS's standard unsigned-app warning (macOS "unidentified developer" / Windows
  SmartScreen), dismissed once via the normal OS workaround (right-click → Open on
  macOS; "More info" → "Run anyway" on Windows); the app opens normally on every launch
  after that.
- There is no auto-updater. Getting a new version means rebuilding and manually
  reinstalling, the same as installing the app the first time.

#### Technical requirements

- Packaging uses Electron, with `electron-builder` producing a macOS `.dmg`/`.app` and
  a Windows installer/`.exe` in one build pipeline.
- The Express backend (including its native `better-sqlite3` and `sharp` dependencies)
  runs as a local process managed by Electron; those native modules are rebuilt against
  Electron's Node ABI (`electron-rebuild`) as part of the packaging build, and
  `asarUnpack` is configured so their platform-specific binaries remain accessible at
  runtime.
- Electron also bundles and runs the actual Next.js server (`next start`) as a second
  local process, with the Electron `BrowserWindow` pointed at its local URL. This keeps
  the existing dynamic `[binderId]` route (and any future dynamic routes) working
  unchanged, since the app is a pure client-rendered SPA against the separate Express
  REST API with no server-only Next.js features (no API routes, server actions, or
  `getServerSideProps`) to migrate.
- The packaged app uses Electron's standard per-OS user-data directory
  (`app.getPath('userData')`, e.g. `~/Library/Application Support/<AppName>` on macOS,
  `%APPDATA%\<AppName>` on Windows) as `applicationDataDirectory`, instead of the
  `cwd`-relative dev default. Electron's main process passes this path into the bundled
  Express child process (e.g. via an environment variable) rather than Express
  resolving it independently, since a packaged app's working directory and install
  location aren't reliably writable.
- Electron enforces a single running instance via its built-in single-instance lock;
  launching the app again while it's already running focuses the existing window
  instead of starting a second copy, preventing two processes from contending for the
  same SQLite database file.
- The app starts its bundled backend and frontend servers on their existing fixed
  default ports; if a port is already in use, the app automatically picks the next
  available port instead of failing to start.
- Since the frontend currently reads `NEXT_PUBLIC_BACKEND_URL` at build time
  ([client.ts](../../../apps/frontend/src/lib/api/client.ts)), which can't reflect a
  backend port chosen at runtime, Electron's `BrowserWindow` uses a preload script to
  inject the backend's actual runtime URL as a global (e.g. `window.__BACKEND_URL__`)
  before the page's own scripts run. `client.ts` checks that global first and falls
  back to the existing build-time `NEXT_PUBLIC_BACKEND_URL` value when it's absent
  (i.e. outside Electron, in normal local/web development), so the existing dev
  workflow is unchanged.
- Closing the app's window fully quits the app: Electron cleanly terminates the bundled
  Express and Next.js child processes as part of shutdown, with no orphaned background
  processes and no system tray/background-running mode.
- The Electron app lives in a new `apps/desktop` package in the existing pnpm
  workspace, alongside `apps/frontend` and `apps/backend`. It depends on both,
  bundling the frontend's production build and the backend as its two managed child
  processes, and owns the Electron main-process code, `electron-builder` config, app
  icon, and app metadata.
- The packaged app's display name is "Binder Project Planner", with a placeholder icon
  until real branding/artwork is provided.
