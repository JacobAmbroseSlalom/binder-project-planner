# 53. Sync data across laptops via cloud-sync folder

**Status:** Not started

#### Acceptance criteria

- A user can point the application's data directory (database file plus the `images/`
  folder) at a folder managed by a consumer cloud-sync client (e.g. Dropbox, iCloud
  Drive, OneDrive, Google Drive) on each laptop, so the same binder data becomes
  available on more than one laptop without a hosted server.
- On quitting the application, the application leaves the database file in a
  sync-safe, single-file state (see technical requirements) so the sync client can
  pick up a consistent copy rather than a mid-write or split WAL/SHM state.
- On launching the application, if the configured data directory looks incomplete or
  like it's mid-sync (per the marker-file check described in technical requirements),
  the user is warned and asked to confirm before the application opens the database,
  rather than silently initializing a new/empty database over data that hasn't
  finished syncing yet.
- If another laptop appears to have had the application open recently (via the marker
  file described in technical requirements), the user is warned that opening now may
  race with an unfinished sync, rather than the application opening silently.
- This is explicitly **not** real-time multi-user collaboration: only one laptop is
  expected to have the application open at a time. The feature's goal is safer
  hand-off between laptops, not concurrent editing.

#### Technical requirements

- **Known limitation to document for users, not solved in code:** consumer cloud-sync
  clients sync continuously and asynchronously in the background; the application has
  no hook into "upload finished." The application can only guarantee the local file is
  left in a safe state to be picked up — not that the remote copy is caught up before
  the laptop is closed. User-facing copy must set this expectation rather than imply a
  guarantee.
- Extends the existing `APP_DATA_DIRECTORY`-configurable data directory
  ([config.ts](../../../apps/backend/src/config.ts)) rather than introducing a new
  config mechanism; both the database file and the images directory already live
  under one configured root today.
- A settings screen in the Electron desktop app lets the user browse to/select their
  local cloud-sync folder (e.g. their Dropbox/iCloud Drive/OneDrive/Google Drive
  folder on that machine); the app stores the chosen path and uses it as the
  `APP_DATA_DIRECTORY` value going forward, per laptop. This replaces manual
  environment-variable setup, since the synced folder mounts at a different absolute
  path on each laptop/OS and this app has no terminal-facing setup step elsewhere.
- On quit, the application keeps SQLite's existing WAL journal mode (no change to
  day-to-day write/read behavior) but runs a checkpoint
  (`PRAGMA wal_checkpoint(TRUNCATE)`) to fold pending WAL contents back into the main
  `.db` file and empty the `-wal`/`-shm` side files, then cleanly closes the
  connection before the Electron app exits. This leaves a single, self-contained `.db`
  file for the sync client to pick up, without giving up WAL's normal performance
  benefit during the rest of the session.
- The application writes a small marker file (e.g. `.sync-lock.json`) into the data
  directory recording a machine identifier and a last-updated timestamp, refreshed on
  launch (once the database opens successfully) and periodically while running. On
  every launch, before opening the database, the application reads this marker; if it
  names a different machine with a recent timestamp, the user is warned (e.g. "This
  was last opened on [machine] at [time] — make sure it finished syncing before
  continuing") but is still allowed to proceed. This is advisory only — sync
  completion genuinely can't be verified from the application side — but it directly
  addresses the most likely real-world mistake (switching laptops before the previous
  one's edits finished syncing).
- The application reuses the `.sync-lock.json` marker file (see the "another laptop
  recently open" requirement above) as its signal for "this directory has existing
  data syncing in." If the configured directory is completely empty (no marker file,
  no database file), the application treats it as genuinely new and initializes
  normally. If the directory shows any trace of prior use (a marker file, or partial
  files) but the database file itself is missing or unreadable, the application does
  not auto-initialize a fresh database; instead it shows a confirmation prompt
  explaining the folder looks like it already has data syncing in, letting the user
  either wait and retry or explicitly choose to start fresh anyway. This confirmation
  step is needed because on-demand cloud-sync file providers (e.g. OneDrive Files
  On-Demand, Dropbox Smart Sync) can show a file listing before the actual file bytes
  finish downloading, so a purely automatic existence check can't reliably tell
  "partially synced" apart from "genuinely brand new."
- Provider-agnostic: the settings-screen folder picker lets the user choose any local
  folder, without special-casing Dropbox/iCloud Drive/OneDrive/Google Drive
  specifically. Documentation describes the general requirement (a folder kept in
  sync by some client the user already has) rather than naming or claiming to test
  against specific providers. No provider-specific detection or handling is built.
- Before the checkpoint-and-quit sequence, and before proceeding past either the
  "looks incomplete/mid-sync" or "another laptop had this open recently" warnings, the
  application automatically writes a timestamped backup snapshot to a local,
  non-synced folder (outside the configured sync directory, e.g. the OS-standard
  application-data location already used for other local application state) — never
  inside the synced folder itself, since a corrupt or conflicting sync would risk
  taking the backup down with it. The snapshot reuses story 33's existing export
  archive format (`manifest.json` + `data.json` + `images/`, zipped) rather than
  inventing a second format. The application retains a small fixed number of the most
  recent snapshots (e.g. the last 5), deleting older ones automatically, to bound disk
  usage.
- No server-side or authentication changes; this stays within the existing local,
  no-auth, single-user-at-a-time architecture — multiple laptops are still understood
  as "the same single user's data," not multiple accounts.
