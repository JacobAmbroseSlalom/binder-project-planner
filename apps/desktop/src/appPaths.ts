import { app } from 'electron';
import { join, resolve } from 'node:path';

// Where the packaged app's bundled backend/frontend, and this process's own
// compiled preload script, live - resolved differently in development vs.
// a packaged build (see each field's comment below).
export interface AppPaths {
  backendDirectory: string;
  frontendDirectory: string;
  preloadScript: string;
}

// In development, this compiled main process runs from
// `apps/desktop/dist/main.js`, with the backend and frontend as sibling
// workspace packages (`apps/backend`, `apps/frontend`) three directories up
// from `dist`. In a packaged app, `electron-builder`'s `extraResources`
// config (see the `build` field in package.json) copies each package's
// production build output under `process.resourcesPath`, deliberately
// preserving this same `apps/backend` / `apps/frontend` relative layout -
// so this is the only place in the app that needs to branch on
// `app.isPackaged`, and `paths.ts`'s existing relative lookup of
// `packages/api-contract/openapi.yaml` from the backend's own directory
// (see apps/backend/src/paths.ts) keeps working unmodified either way.
export function resolveAppPaths(moduleDirectory: string): AppPaths {
  const root = app.isPackaged ? process.resourcesPath : resolve(moduleDirectory, '..', '..', '..');

  return {
    backendDirectory: join(root, 'apps', 'backend'),
    frontendDirectory: join(root, 'apps', 'frontend'),
    // Compiled from src/preload.cts (rather than preload.ts) specifically so
    // TypeScript emits it as `preload.cjs` - Electron's preload loader
    // requires CommonJS, but this package's `"type": "module"` would
    // otherwise make a plain `preload.js` load as ESM and fail with
    // "Cannot use import statement outside a module".
    preloadScript: join(moduleDirectory, 'preload.cjs'),
  };
}
