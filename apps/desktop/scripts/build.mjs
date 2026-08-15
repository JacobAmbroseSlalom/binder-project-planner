// Story 47: "Package and export the application as an executable". Bundles the
// Electron main process and preload script with esbuild instead of only
// transpiling with `tsc`, inlining the desktop package's own runtime
// dependencies (`get-port`, `@binder-project-planner/shared`) directly into
// `dist/main.js`/`dist/preload.cjs`. This keeps the packaged app free of any
// runtime `node_modules` requirement for the desktop package itself, which in
// turn keeps `apps/desktop/package.json`'s "dependencies" empty - avoiding
// electron-builder's automatic production-dependency detection step, which
// (for a pnpm workspace) otherwise shells out to a bare `pnpm install
// --production` and, because that command isn't scoped with `--filter`,
// treats the entire monorepo as its target and prompts to wipe and reinstall
// every workspace project's `node_modules` from scratch.
import { build } from 'esbuild';

const sharedBuildOptions = {
  bundle: true,
  platform: 'node',
  sourcemap: true,
  external: ['electron'],
  logLevel: 'info',
};

await build({
  ...sharedBuildOptions,
  entryPoints: ['src/main.ts'],
  outfile: 'dist/main.js',
  format: 'esm',
});

// The preload script must be emitted as CommonJS (`.cjs`) - Electron's
// preload loader requires it regardless of the app package's own
// "type": "module" declaration.
await build({
  ...sharedBuildOptions,
  entryPoints: ['src/preload.cts'],
  outfile: 'dist/preload.cjs',
  format: 'cjs',
});
