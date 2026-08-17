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
import { existsSync, readdirSync, rmSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const desktopDirectory = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const repoRoot = resolve(desktopDirectory, '..', '..');
const releaseDirectory = resolve(desktopDirectory, 'release');
const stagingDirectory = resolve(desktopDirectory, '.staging');

// `package:mac`/`package:win` (see package.json) pass these so the native
// module rebuild below targets the platform/arch actually being packaged,
// rather than defaulting to whatever platform/arch this script happens to
// be running on - without this, packaging a win32 build from a macOS host
// would silently bundle macOS-native `.node` binaries into the Windows app.
function readCliFlag(name) {
  const prefix = `--${name}=`;
  const arg = process.argv.find((value) => value.startsWith(prefix));
  if (!arg) {
    throw new Error(`Missing required ${prefix}<value> argument.`);
  }
  return arg.slice(prefix.length);
}

const targetPlatform = readCliFlag('platform');
const targetArch = readCliFlag('arch');

// Runs a command and throws on a nonzero exit code instead of continuing a
// packaging run with a half-built staging directory.
function run(command, args, options) {
  console.log(`$ ${command} ${args.join(' ')}`);
  // On Windows, commands installed via corepack/npm (like `pnpm`) are shell
  // shims (`pnpm.cmd`), which `spawnSync` can only resolve through a shell -
  // without `shell: true` here, spawning fails outright (`result.status` is
  // `null`, not a nonzero exit code) rather than actually running the
  // command and failing on its own merits.
  const result = spawnSync(command, args, {
    stdio: 'inherit',
    shell: process.platform === 'win32',
    ...options,
  });
  if (result.status !== 0) {
    throw new Error(`Command failed (${result.status}): ${command} ${args.join(' ')}`);
  }
}

console.log('Building every workspace package (shared, api-contract, backend, frontend)...');
run('pnpm', ['run', 'build'], { cwd: repoRoot });

console.log('Recreating the packaging staging directory...');
rmSync(stagingDirectory, { recursive: true, force: true });

// electron-builder copies `extraResources` into `release/<target>-unpacked`
// incrementally across runs rather than fully recreating it, so a stale copy
// of the self-referential symlink below (see `removeSelfReferentialSymlink`)
// from an earlier, unfixed attempt can survive even after this script stops
// producing new ones - removing it here forces a fully fresh copy every run.
if (existsSync(releaseDirectory)) {
  for (const entry of readdirSync(releaseDirectory)) {
    if (entry.endsWith('-unpacked')) {
      rmSync(resolve(releaseDirectory, entry), { recursive: true, force: true });
    }
  }
}

// `pnpm deploy --legacy` leaves a self-referential symlink at
// `node_modules/.pnpm/node_modules/@binder-project-planner/<package>` whose
// relative target (e.g. `../../../../../../../backend`) is computed for its
// position inside this staging directory, where it correctly resolves back
// to the original `apps/<package>` inside the monorepo. But electron-builder
// copies the symlink text as-is into a much deeper `resources/apps/<package>`
// path inside the packaged app, where that same relative target no longer
// resolves to anything - the same symlink is valid at one depth and
// dangling at the other, so checking for brokenness here (at staging depth)
// never catches it. It's redundant anyway - the package's real files are
// already staged directly - but the dangling copy makes electron-builder's
// NSIS packaging step (which archives resources with 7-Zip) fail outright,
// even though macOS's dmg packaging tolerates it. Remove it unconditionally.
function removeSelfReferentialSymlink(packageStagingDirectory, packageName) {
  rmSync(
    resolve(
      packageStagingDirectory,
      'node_modules/.pnpm/node_modules/@binder-project-planner',
      packageName,
    ),
    { force: true },
  );
}

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
removeSelfReferentialSymlink(resolve(stagingDirectory, 'backend'), 'backend');

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
removeSelfReferentialSymlink(resolve(stagingDirectory, 'frontend'), 'frontend');

const stagedBackendDirectory = resolve(stagingDirectory, 'backend');
if (!existsSync(stagedBackendDirectory)) {
  throw new Error(`Expected ${stagedBackendDirectory} to exist after 'pnpm deploy'.`);
}

// `better-sqlite3` only ships a node-gyp build (no prebuild-install fallback
// electron-rebuild can fetch here), and node-gyp cannot cross-compile native
// addons from source for a different target platform - it can only rebuild
// for the platform/arch this script itself is running on. So a same-host
// package (e.g. `package:mac` on a Mac) can genuinely rebuild for its target,
// but a cross-host package (e.g. `package:win` run on this Mac) cannot: the
// resulting .exe would either fail this step outright or, if skipped
// silently, bundle non-functional macOS-native `.node` binaries. Rather than
// hard-failing the whole packaging run (which nobody running locally can fix
// short of a real Windows machine or a full cross-compilation toolchain),
// skip the rebuild with a loud warning - this still produces installable
// output useful for smoke-testing the packaging config/UI, but that output's
// native modules will NOT function on a real Windows machine. The project's
// own CI (.github/workflows/release.yml) builds Windows on an actual
// `windows-latest` runner, where host === target and this limitation doesn't
// apply - that remains the authoritative build path for a real Windows
// installer.
if (targetPlatform !== process.platform) {
  console.warn('');
  console.warn(
    `WARNING: cannot rebuild native dependencies (better-sqlite3, sharp) for ${targetPlatform}/${targetArch} ` +
      `from this ${process.platform}/${process.arch} host - node-gyp does not support cross-compiling native ` +
      'modules from source. Skipping the rebuild step; this package will bundle ' +
      `${process.platform}/${process.arch} native binaries, which will NOT function on a real ` +
      `${targetPlatform} machine. Use the project's CI release workflow ` +
      '(.github/workflows/release.yml, which builds on a matching host runner) to produce a genuinely ' +
      'runnable installer for this target.',
  );
  console.warn('');
} else {
  console.log(
    `Rebuilding the backend's native dependencies against Electron's Node ABI for ${targetPlatform}/${targetArch}...`,
  );
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
      '--platform',
      targetPlatform,
      '--arch',
      targetArch,
    ],
    { cwd: desktopDirectory },
  );
}

console.log('Packaging preparation complete.');
