// (group_id, class) is the identity of a team. Dropping `class` leaks one
// section's data into another, which has already happened in this codebase.
import { API_TS, ANY_TS, collect, snippet, sqlLiterals } from './helpers.mjs';

const DOC = 'AGENTS.md - "The central concept: (group_id, class)"';

export default [
  {
    id: 'scope/room-missing-class',
    severity: 'error',
    title: 'Socket.IO room name is missing the class segment',
    doc: DOC,
    files: ANY_TS,
    fix: 'const roomId = `group_${groupId}_class_${classId}`;',
    run: (ctx) =>
      collect(ctx, 'raw', /`group_\$\{[^`}]*\}(?!_class_)/g, (h) => ({
        message:
          "This room is keyed on group_id alone. Group 3 in CRN 12345 and group 3 in CRN 67890 land in the same room, so each section receives the other's events.",
        evidence: snippet(ctx, h.line),
      })),
  },
  {
    id: 'scope/room-concatenated',
    severity: 'error',
    title: 'Room name built by string concatenation',
    doc: DOC,
    files: ANY_TS,
    fix: 'Use the `group_${groupId}_class_${classId}` template so the class segment cannot be forgotten.',
    run: (ctx) =>
      collect(ctx, 'raw', /['"]group_['"]\s*\+/g, (h) => ({
        message:
          'Build room names from the one template literal used everywhere else, not by concatenation.',
        evidence: snippet(ctx, h.line),
      })),
  },
  {
    id: 'scope/sql-group-without-class',
    severity: 'error',
    title: 'Query filters on group_id but not on class',
    doc: DOC,
    files: API_TS,
    fix: 'WHERE group_id = ? AND class = ?',
    run(ctx) {
      const out = [];
      for (const sql of sqlLiterals(ctx)) {
        const body = sql.body;
        if (!/\b(SELECT|UPDATE|DELETE\s+FROM)\b/i.test(body)) continue;
        if (!/\bgroup_id\b/i.test(body)) continue;
        if (!/\b(WHERE|ON)\b/i.test(body)) continue;
        if (/\bclass\b|\bclass_id\b|\bcrn\b/i.test(body)) continue;
        out.push({
          line: sql.line,
          message:
            'group_id on its own is not unique. Without `AND class = ?` this reads or writes rows belonging to a different course section.',
          evidence: body.replace(/\s+/g, ' ').trim().slice(0, 180),
        });
      }
      return out;
    },
  },
  {
    id: 'scope/insert-missing-class',
    severity: 'warn',
    title: 'INSERT writes group_id without class',
    doc: DOC,
    files: API_TS,
    fix: 'Include `class` in the column list so the row can be scoped on read.',
    run(ctx) {
      const out = [];
      for (const sql of sqlLiterals(ctx)) {
        if (!/\bINSERT\s+INTO\b/i.test(sql.body)) continue;
        if (!/\bgroup_id\b/i.test(sql.body)) continue;
        if (/\bclass\b|\bclass_id\b/i.test(sql.body)) continue;
        out.push({
          line: sql.line,
          message:
            'A row written with group_id and no class cannot be filtered by section on the way back out.',
          evidence: sql.body.replace(/\s+/g, ' ').trim().slice(0, 180),
        });
      }
      return out;
    },
  },
  {
    id: 'scope/handler-ignores-class',
    severity: 'warn',
    title: 'File works with group ids and never mentions class',
    doc: DOC,
    files: /^api\/src\/(controller|config)\/.*\.ts$/,
    fix: 'Read the class/CRN alongside the group id and pass it into every query and room name.',
    run(ctx) {
      if (!/\bgroup_?[Ii]d\b/.test(ctx.bare)) return [];
      if (/\bclass\b|\bclass_?[Ii]d\b|\bcrn\b/i.test(ctx.bare)) return [];
      const first = ctx.bare.search(/\bgroup_?[Ii]d\b/);
      if (first < 0) return [];
      const line = ctx.lineOf(first);
      return [
        {
          line,
          message:
            'This file reads group ids and never names class anywhere in it. Every group-scoped read, write and emit needs both halves of the key.',
          evidence: snippet(ctx, line),
        },
      ];
    },
  },
];
