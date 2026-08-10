#!/usr/bin/env node
// Automates the developer-mode "story is fully implemented" workflow
// (.github/copilot-instructions.md / the developer mode instructions):
// given a story number currently in docs/stories/ready-for-dev/, this
// - updates its `**Status:**` marker to `Done (<local timestamp>)`,
// - renames it with a `YYYY-MM-DD-` date prefix,
// - moves it into docs/stories/completed/ via `git mv` (so the rename and
//   edit are tracked together), and
// - moves its row in docs/stories/README.md from wherever it currently
//   lives into the Completed table, in ascending story-number order.
//
// Usage: node scripts/move-story-to-done.mjs <story-number>
// Example: node scripts/move-story-to-done.mjs 32

import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');

const storiesDir = path.join(repoRoot, 'docs', 'stories');
const readyForDevDir = path.join(storiesDir, 'ready-for-dev');
const completedDir = path.join(storiesDir, 'completed');
const readmePath = path.join(storiesDir, 'README.md');

function fail(message) {
  console.error(`Error: ${message}`);
  process.exit(1);
}

// Finds the story's current row in docs/stories/README.md (whichever
// bucket table it's still listed under), removes it, and inserts an
// equivalent row into the Completed table's ascending story-number order.
function moveStoryIndexRowToCompleted({ storyNumber, newFileName }) {
  const lines = readFileSync(readmePath, 'utf8').split('\n');

  const rowPattern = new RegExp(`^\\|\\s*${storyNumber}\\s*\\|(.*)\\|(.*)\\|\\s*$`);
  const sourceRowIndex = lines.findIndex((line) => rowPattern.test(line));
  if (sourceRowIndex === -1) {
    fail(`Could not find a docs/stories/README.md row for story ${storyNumber}.`);
  }
  const title = lines[sourceRowIndex].match(rowPattern)[1].trim();
  lines.splice(sourceRowIndex, 1);

  const newRow = `| ${storyNumber} | ${title} | [docs/stories/completed/${newFileName}](completed/${newFileName}) |`;

  const completedHeadingIndex = lines.findIndex((line) => line.trim() === '## Completed');
  if (completedHeadingIndex === -1) {
    fail('Could not find the "## Completed" section in docs/stories/README.md.');
  }

  // The table's header row (`| Story | Title | File |`) and separator row
  // (`| ----- | ... |`) follow the heading before any data rows start.
  let insertIndex = completedHeadingIndex + 1;
  while (lines[insertIndex] !== undefined && !lines[insertIndex].startsWith('| Story')) {
    insertIndex += 1;
  }
  insertIndex += 2;

  while (
    insertIndex < lines.length &&
    lines[insertIndex].startsWith('|') &&
    Number(lines[insertIndex].match(/^\|\s*(\d+)/)?.[1]) < Number(storyNumber)
  ) {
    insertIndex += 1;
  }

  lines.splice(insertIndex, 0, newRow);
  writeFileSync(readmePath, lines.join('\n'));
}

const storyNumberArg = process.argv[2];
if (!storyNumberArg) {
  fail('Usage: node scripts/move-story-to-done.mjs <story-number>');
}

// Normalizes e.g. "032" to "32" - story files use unpadded numbers.
const storyNumber = String(Number(storyNumberArg));
if (storyNumber === 'NaN') {
  fail(`"${storyNumberArg}" is not a valid story number.`);
}

const candidates = readdirSync(readyForDevDir).filter((name) =>
  new RegExp(`^${storyNumber}-.+\\.md$`).test(name),
);
if (candidates.length === 0) {
  fail(`No story numbered ${storyNumber} found in docs/stories/ready-for-dev/.`);
}
if (candidates.length > 1) {
  fail(
    `Multiple files in docs/stories/ready-for-dev/ matched story ${storyNumber}: ${candidates.join(', ')}`,
  );
}

const originalFileName = candidates[0];
const originalPath = path.join(readyForDevDir, originalFileName);

// Matches this repo's `date "+%Y-%m-%d %H:%M %Z"` convention exactly
// (e.g. "2026-08-10 02:11 EDT") by shelling out to the same command,
// rather than reimplementing timezone-abbreviation formatting in JS -
// Node's Intl output for zone abbreviations varies across ICU builds.
const timestamp = execFileSync('date', ['+%Y-%m-%d %H:%M %Z']).toString().trim();
const dateOnly = timestamp.split(' ')[0];

const originalContent = readFileSync(originalPath, 'utf8');
const statusLinePattern = /^\*\*Status:\*\* .+$/m;
if (!statusLinePattern.test(originalContent)) {
  fail(`${originalFileName} has no "**Status:**" line to update.`);
}
writeFileSync(
  originalPath,
  originalContent.replace(statusLinePattern, `**Status:** Done (${timestamp})`),
);

const newFileName = `${dateOnly}-${originalFileName}`;
const newPath = path.join(completedDir, newFileName);
if (existsSync(newPath)) {
  fail(`${newPath} already exists.`);
}

execFileSync('git', ['mv', originalPath, newPath], { cwd: repoRoot });

moveStoryIndexRowToCompleted({ storyNumber, newFileName });

// Prettier realigns the markdown tables' column widths (and any other
// formatting) after these raw text edits - mirrors this repo's "run
// `pnpm format` after repository edits" convention rather than
// hand-aligning table columns here. Best-effort: the move/status/README
// updates above already succeeded by this point, so a formatting failure
// (e.g. prettier not installed) shouldn't be reported as if the whole
// operation failed.
try {
  execFileSync('pnpm', ['exec', 'prettier', '--write', newPath, readmePath], { cwd: repoRoot });
} catch {
  console.warn('Warning: could not run prettier automatically - run `pnpm format` manually.');
}

console.log(`Moved story ${storyNumber} to docs/stories/completed/${newFileName}`);
console.log(`Status set to: Done (${timestamp})`);
console.log('docs/stories/README.md updated.');
