// Frontend rules. The client is what the room is looking at, so a stuck
// spinner is the whole failure mode.
import { FRONTEND_TSX, collect, snippet, argsAfter, matchBracket } from './helpers.mjs';

export default [
  {
    id: 'react/dangerous-html',
    severity: 'error',
    title: 'dangerouslySetInnerHTML',
    doc: 'Student-entered notes and names flow through this UI.',
    files: FRONTEND_TSX,
    fix: 'Render the value as text.',
    run: (ctx) =>
      collect(ctx, 'raw', /dangerouslySetInnerHTML/g, (h) => ({
        message:
          'Any student-supplied text rendered this way executes as HTML for everyone who sees it.',
        evidence: snippet(ctx, h.line),
      })),
  },
  {
    id: 'react/effect-without-deps',
    severity: 'warn',
    title: 'useEffect with no dependency array',
    doc: 'It runs after every render.',
    files: FRONTEND_TSX,
    fix: 'Add the dependency array, even if it is empty.',
    run(ctx) {
      const out = [];
      const starts = collect(ctx, 'bare', /useEffect\s*\(/g, (h) => ({
        line: h.line,
        index: h.index,
      }));
      for (const h of starts) {
        const { args } = argsAfter(ctx, h.index + 'useEffect'.length);
        if (args.length >= 2) continue;
        out.push({
          line: h.line,
          message:
            'No dependency array, so this effect fires on every render. If it fetches or emits, it does so in a loop.',
          evidence: snippet(ctx, h.line),
        });
      }
      return out;
    },
  },
  {
    id: 'react/state-explosion',
    severity: 'warn',
    title: 'Too much local state in one file',
    doc: 'AGENTS.md known-bad areas - ManageGroupsTab.tsx, ~40 useState in one component',
    files: FRONTEND_TSX,
    always: true,
    fix: 'Group related fields into a reducer or split the component.',
    run(ctx) {
      const count = (ctx.bare.match(/\buseState\s*[(<]/g) || []).length;
      if (count < 15) return [];
      const idx = ctx.bare.search(/\buseState\s*[(<]/);
      return [
        {
          line: ctx.lineOf(idx),
          message: `${count} useState calls in this file. This is the shape ManageGroupsTab took before it became unmaintainable.`,
          evidence: ctx.path,
        },
      ];
    },
  },
  {
    id: 'react/list-without-key',
    severity: 'warn',
    title: 'Rendered list without a key',
    doc: 'React silently re-uses the wrong DOM nodes.',
    files: FRONTEND_TSX,
    fix: 'Give each element a stable key from the data, not the array index.',
    run(ctx) {
      const out = [];
      const starts = collect(ctx, 'bare', /\.\s*map\s*\(/g, (h) => ({
        line: h.line,
        index: h.index,
      }));
      for (const h of starts) {
        const open = ctx.code.indexOf('(', h.index);
        const end = matchBracket(ctx.code, open);
        if (end === -1) continue;
        const body = ctx.raw.slice(open, end);
        if (body.length > 3000) continue;
        if (!/<[A-Za-z]/.test(body)) continue;
        if (/\bkey\s*=/.test(body)) continue;
        out.push({
          line: h.line,
          message: 'This map renders elements with no key.',
          evidence: snippet(ctx, h.line),
        });
      }
      return out;
    },
  },
  {
    id: 'react/index-as-key',
    severity: 'info',
    title: 'Array index used as key',
    doc: 'Breaks as soon as the list reorders.',
    files: FRONTEND_TSX,
    fix: 'Key on the row id.',
    run: (ctx) =>
      collect(ctx, 'raw', /key\s*=\s*\{\s*(index|i|idx)\s*\}/g, (h) => ({
        message:
          'Index keys go wrong the moment a student is added, removed or reassigned mid-activity.',
        evidence: snippet(ctx, h.line),
      })),
  },
  {
    id: 'react/fetch-without-error-path',
    severity: 'warn',
    title: 'Request with no failure path',
    doc: 'AGENTS.md rule 3 - the client must be able to recover',
    files: FRONTEND_TSX,
    fix: 'Handle the rejection and show the student something other than a spinner.',
    run(ctx) {
      const out = [];
      const starts = collect(ctx, 'bare', /\b(axios\s*\.\s*\w+|fetch)\s*\(/g, (h) => ({
        line: h.line,
        index: h.index,
      }));
      for (const h of starts) {
        const window = ctx.bare.slice(Math.max(0, h.index - 500), h.index + 600);
        if (/\btry\s*\{|\.\s*catch\s*\(|catch\s*\(/.test(window)) continue;
        out.push({
          line: h.line,
          message:
            'No catch anywhere around this call. When it fails during class the student sees a spinner that never resolves.',
          evidence: snippet(ctx, h.line),
        });
      }
      return out;
    },
  },
  {
    id: 'react/component-defined-in-render',
    severity: 'warn',
    title: 'Component defined inside another component',
    doc: 'It is a new type every render, so its whole subtree remounts.',
    files: FRONTEND_TSX,
    fix: 'Move it to module scope.',
    run: (ctx) =>
      collect(
        ctx,
        'bare',
        /^\s{2,}(?:const|function)\s+([A-Z][\w$]*)\s*(?:=\s*(?:\([^)]*\)|\w+)\s*=>|\()/gm,
        (h) => ({
          message: `\`${h.match[1]}\` is declared inside another component, so React remounts its entire subtree on every render and any input inside it loses focus.`,
          evidence: snippet(ctx, h.line),
        })
      ),
  },
  {
    id: 'react/client-side-gate',
    severity: 'warn',
    title: 'Access decided in the browser',
    doc: 'AGENTS.md known-bad areas - useProgress.tsx does client-side-only gating',
    files: FRONTEND_TSX,
    fix: 'Enforce it on the API as well; the client check is only a convenience.',
    run: (ctx) =>
      collect(ctx, 'bare', /\brouter\s*\.\s*(push|replace)\s*\(/g, (h) => {
        const before = ctx.bare.slice(Math.max(0, h.index - 200), h.index);
        if (
          !/\b(isAdmin|isTeacher|role|isModerator|canAccess|allowed|current_page|step)\b/.test(
            before
          )
        )
          return null;
        return {
          message:
            'A redirect standing in for authorisation. Anyone who types the URL still reaches whatever the API will serve them.',
          evidence: snippet(ctx, h.line),
        };
      }),
  },
];
