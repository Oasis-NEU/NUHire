// Lexical helpers. Rules need to tell code from comments from string bodies,
// otherwise every rule double-fires on the example blocks in AGENTS.md and on
// commented-out code.

/**
 * Single pass over a source file producing two masked copies of the same
 * length, so an index into either maps back to the original:
 *
 *   code  comments blanked, strings intact  (SQL rules live here)
 *   bare  comments and string bodies blanked (keyword rules live here)
 *
 * Handles line/block comments, the three quote styles, `${}` interpolation to
 * arbitrary depth, escapes, and regex literals (a regex containing a quote
 * would otherwise desync the whole file).
 */
export function mask(src) {
  const n = src.length;
  const code = new Array(n);
  const bare = new Array(n);
  for (let k = 0; k < n; k++) {
    code[k] = src[k];
    bare[k] = src[k];
  }
  const blank = (k, arrs) => {
    const r = src[k] === '\n' ? '\n' : ' ';
    for (const a of arrs) a[k] = r;
  };
  const both = [code, bare];
  const strOnly = [bare];

  const frames = []; // one per open `${`, tracking nested braces
  let mode = 'code';
  let lastSignificant = '';
  let i = 0;

  while (i < n) {
    const c = src[i];
    const c2 = src[i + 1];

    if (mode === 'code') {
      if (c === '/' && c2 === '/') {
        mode = 'line';
        blank(i, both);
        blank(i + 1, both);
        i += 2;
        continue;
      }
      if (c === '/' && c2 === '*') {
        mode = 'block';
        blank(i, both);
        blank(i + 1, both);
        i += 2;
        continue;
      }
      if (c === '/' && canStartRegex(lastSignificant)) {
        i = skipRegex(src, i, both, blank);
        lastSignificant = '/';
        continue;
      }
      if (c === "'" || c === '"') {
        mode = c === "'" ? 'sq' : 'dq';
        blank(i, strOnly);
        i++;
        continue;
      }
      if (c === '`') {
        mode = 'tpl';
        blank(i, strOnly);
        i++;
        continue;
      }
      if (c === '{' && frames.length) frames[frames.length - 1].braces++;
      if (c === '}' && frames.length) {
        const top = frames[frames.length - 1];
        if (top.braces === 0) {
          frames.pop();
          mode = 'tpl';
          blank(i, strOnly);
          i++;
          continue;
        }
        top.braces--;
      }
      if (!/\s/.test(c)) lastSignificant = c;
      i++;
      continue;
    }

    if (mode === 'line') {
      if (c === '\n') {
        mode = 'code';
        i++;
        continue;
      }
      blank(i, both);
      i++;
      continue;
    }

    if (mode === 'block') {
      if (c === '*' && c2 === '/') {
        blank(i, both);
        blank(i + 1, both);
        mode = 'code';
        i += 2;
        continue;
      }
      blank(i, both);
      i++;
      continue;
    }

    // inside a string of some kind
    if (c === '\\') {
      blank(i, strOnly);
      if (i + 1 < n) blank(i + 1, strOnly);
      i += 2;
      continue;
    }
    if (mode === 'tpl' && c === '$' && c2 === '{') {
      blank(i, strOnly);
      blank(i + 1, strOnly);
      frames.push({ braces: 0 });
      mode = 'code';
      lastSignificant = '(';
      i += 2;
      continue;
    }
    if (
      (mode === 'sq' && c === "'") ||
      (mode === 'dq' && c === '"') ||
      (mode === 'tpl' && c === '`')
    ) {
      blank(i, strOnly);
      mode = 'code';
      lastSignificant = c;
      i++;
      continue;
    }
    if ((mode === 'sq' || mode === 'dq') && c === '\n') {
      // unterminated literal, resync rather than eat the rest of the file
      mode = 'code';
      i++;
      continue;
    }
    blank(i, strOnly);
    i++;
  }

  return { code: code.join(''), bare: bare.join('') };
}

function canStartRegex(prev) {
  if (prev === '') return true;
  return !/[\w$)\]'"`]/.test(prev);
}

function skipRegex(src, start, both, blank) {
  let i = start + 1;
  let inClass = false;
  while (i < src.length) {
    const c = src[i];
    if (c === '\\') {
      i += 2;
      continue;
    }
    if (c === '\n') return start + 1; // not a regex after all
    if (c === '[') inClass = true;
    else if (c === ']') inClass = false;
    else if (c === '/' && !inClass) {
      // blank the body so quotes inside it cannot desync anything downstream
      for (let k = start + 1; k < i; k++) blank(k, [both[1]]);
      return i + 1;
    }
    i++;
  }
  return start + 1;
}

/** Byte offset -> 1-based line number, via binary search over line starts. */
export function lineIndexer(src) {
  const starts = [0];
  for (let i = 0; i < src.length; i++) if (src[i] === '\n') starts.push(i + 1);
  return (index) => {
    let lo = 0;
    let hi = starts.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (starts[mid] <= index) lo = mid;
      else hi = mid - 1;
    }
    return lo + 1;
  };
}

/** Yield every regex match in `text` with its 1-based line number. */
export function* matches(text, re, lineOf) {
  const rx = new RegExp(re.source, re.flags.includes('g') ? re.flags : re.flags + 'g');
  let m;
  while ((m = rx.exec(text)) !== null) {
    yield { match: m, index: m.index, line: lineOf(m.index) };
    if (m[0] === '') rx.lastIndex++;
  }
}

/**
 * From an opening bracket at `open`, return the index of its match, honouring
 * the masked copy so brackets inside strings and comments do not count.
 */
export function matchBracket(masked, open) {
  const pairs = { '(': ')', '[': ']', '{': '}' };
  const close = pairs[masked[open]];
  if (!close) return -1;
  let depth = 0;
  for (let i = open; i < masked.length; i++) {
    if (masked[i] === masked[open]) depth++;
    else if (masked[i] === close) {
      depth--;
      if (depth === 0) return i;
    }
  }
  return -1;
}

/** The full text of a call expression starting at the `(` at `open`. */
export function callArgs(raw, masked, open) {
  const end = matchBracket(masked, open);
  if (end === -1) return '';
  return raw.slice(open + 1, end);
}

/** Split a top-level argument list on commas, ignoring nested brackets. */
export function splitArgs(argText, maskedArgText) {
  const out = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < maskedArgText.length; i++) {
    const c = maskedArgText[i];
    if (c === '(' || c === '[' || c === '{') depth++;
    else if (c === ')' || c === ']' || c === '}') depth--;
    else if (c === ',' && depth === 0) {
      out.push(argText.slice(start, i).trim());
      start = i + 1;
    }
  }
  out.push(argText.slice(start).trim());
  return out.filter((s) => s.length > 0);
}

export function lineAt(lines, n) {
  return lines[n - 1] ?? '';
}
