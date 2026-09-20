import { matches, matchBracket, callArgs, splitArgs } from '../text.mjs';

export const API_TS = /^api\/src\/.*\.ts$/;
export const API_CONTROLLER = /^api\/src\/(controller|config|routes)\/.*\.ts$/;
export const FRONTEND_TSX = /^frontend\/src\/.*\.(tsx|ts)$/;
export const ANY_TS = /^(api|frontend)\/src\/.*\.(ts|tsx)$/;
export const ANY_SOURCE = /^(api|frontend)\/src\/.*\.(ts|tsx|js|jsx|mjs)$/;

/** Iterate regex hits over one of the masked views of the file. */
export function* hits(ctx, view, re) {
  const text = view === 'raw' ? ctx.raw : view === 'code' ? ctx.code : ctx.bare;
  yield* matches(text, re, ctx.lineOf);
}

export function collect(ctx, view, re, build) {
  const out = [];
  for (const hit of hits(ctx, view, re)) {
    const finding = build(hit);
    if (!finding) continue;
    if (Array.isArray(finding)) out.push(...finding);
    else out.push({ line: hit.line, ...finding });
  }
  return out;
}

/** Trimmed source line, for quoting back in the comment. */
export function snippet(ctx, line, max = 160) {
  const text = (ctx.lines[line - 1] ?? '').trim();
  return text.length > max ? text.slice(0, max) + '…' : text;
}

/** The argument list of the call whose `(` follows `index`. */
export function argsAfter(ctx, index) {
  const open = ctx.code.indexOf('(', index);
  if (open === -1) return { text: '', args: [], end: -1 };
  const end = matchBracket(ctx.code, open);
  if (end === -1) return { text: '', args: [], end: -1 };
  const text = ctx.raw.slice(open + 1, end);
  return { text, args: splitArgs(text, ctx.code.slice(open + 1, end)), end };
}

/** Body of the block whose `{` follows `index`, on the raw text. */
export function blockAfter(ctx, index) {
  const open = ctx.code.indexOf('{', index);
  if (open === -1) return '';
  const end = matchBracket(ctx.code, open);
  if (end === -1) return '';
  return ctx.raw.slice(open + 1, end);
}

/** Every string literal that looks like SQL, with its start line. */
export function sqlLiterals(ctx) {
  const out = [];
  const re = /(['"`])((?:\\.|(?!\1)[\s\S])*?)\1/g;
  let m;
  while ((m = re.exec(ctx.code)) !== null) {
    const body = m[2];
    if (
      !/\b(SELECT|INSERT\s+INTO|UPDATE|DELETE\s+FROM|REPLACE\s+INTO|TRUNCATE|ALTER\s+TABLE|CREATE\s+TABLE|DROP\s+TABLE|START\s+TRANSACTION|COMMIT|ROLLBACK)\b/i.test(
        body
      )
    )
      continue;
    out.push({ body, line: ctx.lineOf(m.index), index: m.index, quote: m[1] });
  }
  return out;
}

export { matchBracket, callArgs, splitArgs, matches };
