// House style. These are the ones AGENTS.md states outright, so they are
// errors rather than opinions.
import { ANY_TS, ANY_SOURCE, collect, snippet, matchBracket } from './helpers.mjs';

export default [
  {
    id: 'ts/any',
    severity: 'error',
    title: 'New `any`',
    doc: 'AGENTS.md conventions - "There are 111 existing `: any` annotations; do not add the 112th"',
    files: ANY_TS,
    fix: 'Type it, or use `unknown` and narrow.',
    run: (ctx) =>
      collect(
        ctx,
        'bare',
        /:\s*any\b|\bas\s+any\b|<\s*any\s*>|\bany\[\]|Array<\s*any\s*>|Record<[^>]*,\s*any\s*>/g,
        (h) => ({
          message:
            '`any` switches off the only checking this codebase has. Type it or use `unknown` and narrow.',
          evidence: snippet(ctx, h.line),
        })
      ),
  },
  {
    id: 'ts/suppression-comment',
    severity: 'error',
    title: 'Type or lint error suppressed',
    doc: 'AGENTS.md conventions - "Do not add `any` to silence an error"',
    files: ANY_SOURCE,
    fix: 'Fix the underlying error.',
    run: (ctx) =>
      collect(
        ctx,
        'raw',
        /@ts-(ignore|nocheck|expect-error)|eslint-disable(-next-line|-line)?/g,
        (h) => ({
          message: `\`${h.match[0]}\` hides the problem rather than fixing it, and it stays hidden for everyone after you.`,
          evidence: snippet(ctx, h.line),
        })
      ),
  },
  {
    id: 'log/console-log',
    severity: 'error',
    title: 'New console.log',
    doc: 'AGENTS.md conventions - "There are ~440 already and they bury real errors during a live class"',
    files: ANY_SOURCE,
    fix: 'Remove it, or make it conditional on a debug flag.',
    run: (ctx) =>
      collect(ctx, 'bare', /\bconsole\s*\.\s*log\s*\(/g, (h) => ({
        message:
          'Remove it or gate it behind a debug flag. Real errors are already hard to find in this output.',
        evidence: snippet(ctx, h.line),
      })),
  },
  {
    id: 'log/console-noise',
    severity: 'warn',
    title: 'console.debug / console.info / console.table',
    doc: 'AGENTS.md conventions - "If you need diagnostics, make them conditional"',
    files: ANY_SOURCE,
    fix: 'Gate it behind a flag.',
    run: (ctx) =>
      collect(ctx, 'bare', /\bconsole\s*\.\s*(debug|info|table|dir|trace)\s*\(/g, (h) => ({
        message: `\`console.${h.match[1]}\` adds to the noise that buries real errors.`,
        evidence: snippet(ctx, h.line),
      })),
  },
  {
    id: 'quality/debugger',
    severity: 'error',
    title: 'debugger statement',
    doc: 'Leftover from local debugging.',
    files: ANY_SOURCE,
    fix: 'Delete it.',
    run: (ctx) =>
      collect(ctx, 'bare', /\bdebugger\s*;?/g, () => ({ message: 'Delete this before merging.' })),
  },
  {
    id: 'quality/merge-conflict-marker',
    severity: 'error',
    title: 'Merge conflict marker committed',
    doc: 'The file does not parse.',
    files: /.*/,
    fix: 'Finish the merge.',
    run: (ctx) =>
      collect(ctx, 'raw', /^(<{7}|={7}|>{7})(\s|$)/gm, (h) => ({
        message: 'An unresolved conflict marker is in the committed file.',
        evidence: snippet(ctx, h.line),
      })),
  },
  {
    id: 'quality/empty-catch',
    severity: 'warn',
    title: 'Error swallowed',
    doc: 'A failure that produces no signal is a failure nobody can debug during class.',
    files: ANY_SOURCE,
    fix: 'Log it with console.error, respond with a status, or rethrow.',
    run(ctx) {
      const out = [];
      const starts = collect(ctx, 'bare', /\bcatch\s*(\([^)]*\))?\s*\{/g, (h) => ({
        line: h.line,
        index: h.index,
      }));
      for (const h of starts) {
        const open = ctx.code.indexOf('{', h.index);
        const end = matchBracket(ctx.code, open);
        if (end === -1) continue;
        const body = ctx.bare.slice(open + 1, end);
        if (body.trim().length === 0) {
          out.push({
            line: h.line,
            message: 'Empty catch block. The error disappears entirely.',
            evidence: snippet(ctx, h.line),
          });
          continue;
        }
        if (/\b(throw|reject|console|logger|res\s*\.|next\s*\(|setError|toast)\b/.test(body))
          continue;
        out.push({
          line: h.line,
          message: 'This catch block neither reports nor rethrows, so the failure is invisible.',
          evidence: snippet(ctx, h.line),
        });
      }
      return out;
    },
  },
  {
    id: 'quality/todo-without-ticket',
    severity: 'info',
    title: 'TODO with no ticket',
    doc: 'AGENTS.md - "TICKETS.md has the full backlog with file references"',
    files: ANY_SOURCE,
    fix: 'Add a line to TICKETS.md and reference it, or do the work now.',
    run: (ctx) =>
      collect(ctx, 'raw', /\b(TODO|FIXME|HACK|XXX)\b[^\n]*/g, (h) => {
        if (/#\d+|TICKETS\.md|\bT-\d+/.test(h.match[0])) return null;
        return {
          message: 'Point this at a TICKETS.md entry so it does not become permanent.',
          evidence: snippet(ctx, h.line),
        };
      }),
  },
  {
    id: 'quality/commented-out-code',
    severity: 'info',
    title: 'Commented-out code',
    doc: 'Git already remembers the old version.',
    files: ANY_SOURCE,
    fix: 'Delete it.',
    run: (ctx) =>
      collect(
        ctx,
        'raw',
        /^\s*\/\/\s*(?:const|let|var|if|for|while|return|await|function|import|export|console|res\.|router\.)[^\n]*[;{)]\s*$/gm,
        (h) => ({
          message: 'Delete it, git has the history.',
          evidence: snippet(ctx, h.line),
        })
      ),
  },
  {
    id: 'quality/file-too-long',
    severity: 'warn',
    title: 'File is very long',
    doc: 'AGENTS.md known-bad areas - ManageGroupsTab.tsx, 1,717 lines',
    files: ANY_SOURCE,
    always: true,
    fix: 'Split it before it becomes the next ManageGroupsTab.',
    run(ctx) {
      const n = ctx.lines.length;
      if (n < 600) return [];
      return [
        {
          line: 1,
          message: `${n} lines. The repo already has one file nobody can safely change; this is heading the same way.`,
          evidence: ctx.path,
        },
      ];
    },
  },
  {
    id: 'quality/function-too-long',
    severity: 'warn',
    title: 'Very long function',
    doc: 'Long handlers are where the transaction and scoping bugs in this repo live.',
    files: ANY_SOURCE,
    fix: 'Pull the distinct steps out.',
    run(ctx) {
      const out = [];
      const re =
        /\b(?:async\s+)?(?:function\s+([A-Za-z_$][\w$]*)|([A-Za-z_$][\w$]*)\s*=\s*(?:async\s*)?\()/g;
      const starts = collect(ctx, 'bare', re, (h) => ({
        line: h.line,
        index: h.index,
        name: h.match[1] || h.match[2],
      }));
      for (const h of starts) {
        const open = ctx.code.indexOf('{', h.index);
        if (open === -1) continue;
        const end = matchBracket(ctx.code, open);
        if (end === -1) continue;
        const span = ctx.lineOf(end) - h.line;
        if (span < 150) continue;
        out.push({
          line: h.line,
          message: `\`${h.name ?? 'this function'}\` runs ${span} lines. Nobody reviews the middle of it.`,
          evidence: snippet(ctx, h.line),
        });
      }
      return out;
    },
  },
  {
    id: 'naming/file-convention',
    severity: 'warn',
    title: 'Filename does not follow the folder convention',
    doc: 'AGENTS.md conventions - "Controllers are <thing>.controller.ts, routes are <thing>.routes.ts"',
    files: /^api\/src\/(controller|routes)\/.*\.ts$/,
    always: true,
    fix: 'Rename to match the folder.',
    run(ctx) {
      const base = ctx.path.split('/').pop();
      const inController = ctx.path.includes('/controller/');
      const ok = inController ? /\.controller\.ts$/.test(base) : /\.routes\.ts$/.test(base);
      if (ok) return [];
      return [
        {
          line: 1,
          message: `\`${base}\` does not match the ${inController ? '<thing>.controller.ts' : '<thing>.routes.ts'} convention for this folder.`,
          evidence: ctx.path,
        },
      ];
    },
  },
  {
    id: 'quality/stale-deploy-claim',
    severity: 'error',
    title: 'Documentation names the wrong deploy target',
    doc: 'AGENTS.md - "Deployed via Coolify. Not Render, not Railway, whatever old docs say"',
    files: /\.(md|mdx)$/,
    fix: 'The deploy is Coolify on a Khoury self-hosted runner, driven by .github/workflows/deploy.yml.',
    run: (ctx) =>
      collect(
        ctx,
        'raw',
        /\b(render\.com|Render\b(?!ing|ed|er)|railway\.app|Railway|Heroku|Vercel deploy)/g,
        (h) => {
          if (/render(ing|ed|er|s)\b/i.test(h.match[0])) return null;
          return {
            message: `This says \`${h.match[0]}\`. The deploy is Coolify on a Khoury self-hosted runner. Stale deploy docs are how people end up debugging the wrong system.`,
            evidence: snippet(ctx, h.line),
          };
        }
      ),
  },
];
