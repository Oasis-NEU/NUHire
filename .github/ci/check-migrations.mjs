#!/usr/bin/env node
// Enforces database-files/migrations/README.md on a PR's diff (AGENTS.md rule 12):
//
//   - a change to Pandployer.sql comes with a new migration in the same PR
//   - a migration already on the base branch is never edited, renamed or deleted
//   - new migrations are named NNN-short-name.sql and continue the numbering
//
// Whether the migrations actually run, twice, is checked separately in CI
// against a real MySQL.
import { execFileSync } from 'node:child_process';
import { readdirSync } from 'node:fs';

const DIR = 'database-files/migrations';
const SCHEMA = 'database-files/Pandployer.sql';
const NAME = /^(\d{3})-[a-z0-9]+(?:-[a-z0-9]+)*\.sql$/;

const git = (...args) => execFileSync('git', args, { encoding: 'utf8' }).trim();
const base = process.env.GITHUB_BASE_REF ? `origin/${process.env.GITHUB_BASE_REF}` : 'origin/main';
const mergeBase = git('merge-base', base, 'HEAD');

// name-status: "M\tpath", "A\tpath", "D\tpath", "R100\told\tnew"
const changes = git('diff', '--name-status', '-M', mergeBase, 'HEAD')
  .split('\n')
  .filter(Boolean)
  .map((line) => line.split('\t'));

const errors = [];
const added = [];
for (const [status, path, renamedTo] of changes) {
  if (!path.startsWith(`${DIR}/`) || !path.endsWith('.sql')) continue;
  if (status === 'A') {
    added.push(path.slice(DIR.length + 1));
  } else {
    const what = { M: 'edited', D: 'deleted' }[status[0]] ?? `renamed to ${renamedTo}`;
    errors.push(
      `${path} was ${what}. A migration that has been applied cannot change; add a new numbered migration instead.`
    );
  }
}

const schemaChanged = changes.some(([, path]) => path === SCHEMA);
if (schemaChanged && added.length === 0) {
  errors.push(
    `${SCHEMA} changed but no migration was added. Editing the dump fixes new databases only; add ${DIR}/NNN-what-it-does.sql for the live one.`
  );
}

const existing = git('ls-tree', '--name-only', `${mergeBase}:${DIR}`)
  .split('\n')
  .filter((f) => f.endsWith('.sql'));
let next = Math.max(0, ...existing.map((f) => Number(NAME.exec(f)?.[1] ?? 0))) + 1;
for (const file of added.sort()) {
  const match = NAME.exec(file);
  if (!match) {
    errors.push(
      `${DIR}/${file}: name must look like ${String(next).padStart(3, '0')}-what-it-does.sql`
    );
    continue;
  }
  if (Number(match[1]) !== next) {
    errors.push(
      `${DIR}/${file}: expected number ${String(next).padStart(3, '0')}, the next one after what is on the base branch.`
    );
  }
  next = Number(match[1]) + 1;
}

// The directory on disk and the numbering must agree too, so two PRs that both
// took the same number are caught once the second is rebased.
const numbers = readdirSync(DIR)
  .map((f) => NAME.exec(f)?.[1])
  .filter(Boolean);
for (const n of new Set(numbers)) {
  if (numbers.filter((m) => m === n).length > 1)
    errors.push(`Two migrations share the number ${n}.`);
}

if (errors.length) {
  for (const e of errors) console.log(`::error title=Database change::${e}`);
  process.exit(1);
}
console.log(
  `Migration rules OK (${added.length} new migration${added.length === 1 ? '' : 's'}, schema ${schemaChanged ? 'changed' : 'unchanged'}).`
);
