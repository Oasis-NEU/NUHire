// Everything the bot knows about "what this PR actually changed".
import { execFileSync } from 'node:child_process';

function git(args, opts = {}) {
  return execFileSync('git', args, { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024, ...opts });
}

export function gitOk(args) {
  try {
    return git(args).trim();
  } catch {
    return null;
  }
}

/**
 * Merge base, so the bot reviews what the branch adds and not everything that
 * landed on main since it forked.
 */
export function mergeBase(base, head) {
  return gitOk(['merge-base', base, head]) || base;
}

/**
 * Changed files with their status. Renames are kept with both paths and their
 * similarity score, because "moved and edited in one commit" is itself a
 * finding in this repo.
 */
export function changedFiles(base, head) {
  const raw = git(['diff', '--name-status', '--find-renames=40', '-z', `${base}`, `${head}`]);
  const parts = raw.split('\0').filter((s) => s.length > 0);
  const out = [];
  for (let i = 0; i < parts.length;) {
    const status = parts[i++];
    const kind = status[0];
    if (kind === 'R' || kind === 'C') {
      const from = parts[i++];
      const to = parts[i++];
      out.push({ status: kind, path: to, from, similarity: Number(status.slice(1)) || 0 });
    } else {
      out.push({ status: kind, path: parts[i++], from: null, similarity: 0 });
    }
  }
  return out;
}

/** 1-based line numbers added or modified on the head side, per file. */
export function addedLines(base, head, path) {
  let raw;
  try {
    raw = git(['diff', '-U0', '--find-renames=40', base, head, '--', path]);
  } catch {
    return new Set();
  }
  const set = new Set();
  for (const line of raw.split('\n')) {
    const m = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@/.exec(line);
    if (!m) continue;
    const start = Number(m[1]);
    const count = m[2] === undefined ? 1 : Number(m[2]);
    for (let k = 0; k < count; k++) set.add(start + k);
  }
  return set;
}

/** Only the text of the added lines, for rules that care about wording. */
export function addedText(base, head, path) {
  let raw;
  try {
    raw = git(['diff', '-U0', base, head, '--', path]);
  } catch {
    return '';
  }
  return raw
    .split('\n')
    .filter((l) => l.startsWith('+') && !l.startsWith('+++'))
    .map((l) => l.slice(1))
    .join('\n');
}

export function fileAt(ref, path) {
  return gitOk(['show', `${ref}:${path}`]);
}

export function isBinary(base, head, path) {
  const raw = gitOk(['diff', '--numstat', base, head, '--', path]) || '';
  return raw.startsWith('-\t-\t');
}

export function blobSize(ref, path) {
  const raw = gitOk(['cat-file', '-s', `${ref}:${path}`]);
  return raw ? Number(raw) : 0;
}

export function trackedFiles() {
  return git(['ls-files'])
    .split('\n')
    .filter((s) => s.length > 0);
}

export function commitSubjects(base, head) {
  const raw = gitOk(['log', '--format=%H%x1f%s%x1f%b%x1e', `${base}..${head}`]) || '';
  return raw
    .split('\x1e')
    .map((s) => s.trim())
    .filter(Boolean)
    .map((entry) => {
      const [sha, subject, body] = entry.split('\x1f');
      return { sha, subject: subject ?? '', body: body ?? '' };
    });
}
