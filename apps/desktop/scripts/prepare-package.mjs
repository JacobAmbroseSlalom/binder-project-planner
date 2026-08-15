#!/usr/bin/env node
// Story 47: "Package and export the application as an executable". Prepares
// everything `electron-builder` needs before it can produce a `.dmg`/`.exe`:
// builds every workspace package, then uses `pnpm deploy` to produce a
// clean, non-symlinked, production-only `node_modules` for the backend and
// frontend under `.staging/` (electron-builder's `extraResources` config in
// package.json copies from there rather than the live `apps/backend`/
// `apps/frontend` directories, so this never touches the real dev
// `node_modules` pnpm manages for local development), then rebuilds the
// backend's native dependencies (`better-sqlite3`, `sharp`) against
// Electron's own Node ABI via `@electron/rebuild` - the prebuilt binaries
// pnpm installed target the system's plain Node.js ABI, which doesn't match
// what the packaged app's bundled Electron runtime loads native addons
// against.
import { spawnSync } from 'node:child_process';
import { existsSync, rmSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const desktopDirectory = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const repoRoot = resolve(desktopDirectory, '..', '..');
const stagingDirectory = resolve(desktopDirectory, '.staging');

// Runs a command and throws on a nonzero exit code instead of continuing a
// packaging run with a half-built staging directory.
function run(command, args, options) {
  console.log(`$ ${command} ${args.join(' ')}`);
  const result = spawnSync(command, args, { stdio: 'inherit', ...options });
  if (result.status !== 0) {
    throw new Error(`Command failed (${result.status}): ${command} ${args.join(' ')}`);
  }
}

console.log('Building every workspace package (shared, api-contract, backend, frontend)...');
run('pnpm', ['run', 'build'], { cwd: repoRoot });

console.log('Recreating the packaging staging directory...');
rmSync(stagingDirectory, { recursive: true, force: true });

console.log('Deploying a production-only backend into .staging/backend...');
run(
  'pnpm',
  [
    '--filter',
    '@binder-project-planner/backend',
    'deploy',
    resolve(stagingDirectory, 'backend'),
    '--prod',
    // pnpm v10+ deploy defaults to requiring `inject-workspace-packages` in
    // pnpm-workspace.yaml (which would change how every workspace package's
    // dependencies are linked, not just this packaging step) - `--legacy`
    // instead deploys by resolving and copying workspace deps directly, as
    // pnpm always did before v10, which is all this staging step needs.
    '--legacy',
  ],
  { cwd: repoRoot },
);

console.log('Deploying a production-only frontend into .staging/frontend...');
run(
  'pnpm',
  [
    '--filter',
    '@binder-project-planner/frontend',
    'deploy',
    resolve(stagingDirectory, 'frontend'),
    '--prod',
    '--legacy',
  ],
  { cwd: repoRoot },
);

const stagedBackendDirectory = resolve(stagingDirectory, 'backend');
if (!existsSync(stagedBackendDirectory)) {
  throw new Error(`Expected ${stagedBackendDirectory} to exist after 'pnpm deploy'.`);
}

console.log("Rebuilding the backend's native dependencies against Electron's Node ABI...");
run(
  'pnpm',
  [
    'exec',
    'electron-rebuild',
    '--force',
    '--module-dir',
    stagedBackendDirectory,
    '--which-module',
    'better-sqlite3,sharp',
  ],
  { cwd: desktopDirectory },
);

console.log('Packaging preparation complete.');
