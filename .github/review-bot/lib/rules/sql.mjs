// SQL rules. Every query here is hand-written against mysql2, there is no ORM,
// and two of the existing transaction blocks are silently no-ops.
import { API_TS, collect, snippet, sqlLiterals, argsAfter, matchBracket } from './helpers.mjs';

// Tables that hold work a group would lose.
const STUDENT_WORK =
  /\b(Notes|Res|Resume|Resumepage|Offers|Offer_Status|Interview_Status|InterviewPage|InterviewPopup|MakeOfferPage|Progress|Job_Assignment|GroupsInfo)\b/i;

const SAFE_INTERPOLATION =
  /^\s*(placeholders?|PLACEHOLDERS|columns?|sortColumn|orderBy|direction|table|limitClause)\s*$/;

export default [
  {
    id: 'sql/fake-transaction',
    severity: 'error',
    title: 'Transaction statement issued as a query on the pool',
    doc: 'AGENTS.md rule 6 - "Transactions need a connection, not the pool"',
    files: API_TS,
    fix: 'const conn = await pool.promise().getConnection(); try { await conn.beginTransaction(); ... await conn.commit(); } catch (e) { await conn.rollback(); throw e; } finally { conn.release(); }',
    run(ctx) {
      const out = [];
      for (const sql of sqlLiterals(ctx)) {
        if (!/^\s*(START\s+TRANSACTION|BEGIN|COMMIT|ROLLBACK)\s*;?\s*$/i.test(sql.body)) continue;
        out.push({
          line: sql.line,
          message:
            'Each pooled query may land on a different connection, so the statements in this "transaction" are not atomic and the ROLLBACK is a no-op that leaves half-finished writes behind.',
          evidence: snippet(ctx, sql.line),
        });
      }
      return out;
    },
  },
  {
    id: 'sql/transaction-without-connection',
    severity: 'error',
    title: 'beginTransaction without a checked-out connection',
    doc: 'AGENTS.md rule 6 - "Transactions need a connection, not the pool"',
    files: API_TS,
    fix: 'Check out one connection with getConnection() and run every statement of the transaction on it.',
    run(ctx) {
      if (!/\bbeginTransaction\s*\(/.test(ctx.bare)) return [];
      if (/\bgetConnection\s*\(/.test(ctx.bare)) return [];
      const idx = ctx.bare.search(/\bbeginTransaction\s*\(/);
      const line = ctx.lineOf(idx);
      return [
        {
          line,
          message:
            'This file starts a transaction but never checks out a connection, so the transaction covers nothing.',
          evidence: snippet(ctx, line),
        },
      ];
    },
  },
  {
    id: 'sql/connection-leak',
    severity: 'error',
    title: 'Connection checked out more often than it is released',
    doc: 'AGENTS.md rule 6 - "always release it"',
    files: API_TS,
    fix: 'Release in a finally block so an early throw cannot leak the connection.',
    run(ctx) {
      const acquires = (ctx.bare.match(/\bgetConnection\s*\(/g) || []).length;
      const releases = (ctx.bare.match(/\.\s*release\s*\(/g) || []).length;
      if (acquires === 0 || releases >= acquires) return [];
      const idx = ctx.bare.search(/\bgetConnection\s*\(/);
      const line = ctx.lineOf(idx);
      return [
        {
          line,
          message: `getConnection() appears ${acquires} time(s) and release() ${releases} time(s). A leaked connection exhausts the pool and the API stops answering mid-class.`,
          evidence: snippet(ctx, line),
        },
      ];
    },
  },
  {
    id: 'sql/release-not-in-finally',
    severity: 'warn',
    title: 'Connection released outside a finally block',
    doc: 'AGENTS.md rule 6',
    files: API_TS,
    fix: 'Move the release() into finally { }.',
    run(ctx) {
      if (!/\bgetConnection\s*\(/.test(ctx.bare)) return [];
      if (!/\.\s*release\s*\(/.test(ctx.bare)) return [];
      if (/finally\s*\{[\s\S]{0,400}?\.\s*release\s*\(/.test(ctx.bare)) return [];
      const idx = ctx.bare.search(/\.\s*release\s*\(/);
      const line = ctx.lineOf(idx);
      return [
        {
          line,
          message:
            'release() is not inside a finally, so any throw between checkout and release leaks the connection.',
          evidence: snippet(ctx, line),
        },
      ];
    },
  },
  {
    id: 'sql/interpolated-value',
    severity: 'error',
    title: 'Value interpolated into SQL instead of parameterised',
    doc: 'AGENTS.md rule 7 - "Parameterize every query"',
    files: API_TS,
    fix: "await conn.query('... WHERE id = ?', [id])",
    run(ctx) {
      const out = [];
      // Work on raw so the interpolations are still visible.
      const re = /`((?:\\.|[^`])*)`/g;
      let m;
      while ((m = re.exec(ctx.raw)) !== null) {
        const body = m[1];
        if (
          !/\b(SELECT|INSERT\s+INTO|UPDATE|DELETE\s+FROM|REPLACE\s+INTO|WHERE|VALUES)\b/i.test(body)
        )
          continue;
        const interps = body.match(/\$\{([^}]*)\}/g) || [];
        for (const interp of interps) {
          const expr = interp.slice(2, -1);
          if (SAFE_INTERPOLATION.test(expr)) continue;
          out.push({
            line: ctx.lineOf(m.index),
            message: `\`${interp}\` is interpolated into the query text. Pass it as a ? placeholder value instead; this is a SQL injection either today or the next time the caller changes.`,
            evidence: body.replace(/\s+/g, ' ').trim().slice(0, 180),
          });
        }
      }
      return out;
    },
  },
  {
    id: 'sql/concatenated-query',
    severity: 'error',
    title: 'Query assembled with +',
    doc: 'AGENTS.md rule 7 - "Parameterize every query"',
    files: API_TS,
    fix: 'Build the placeholder list separately and pass the values as an array.',
    run(ctx) {
      const out = [];
      for (const sql of sqlLiterals(ctx)) {
        const after = ctx.code.slice(sql.index, sql.index + sql.body.length + 60);
        if (!/['"`]\s*\+\s*\w/.test(after)) continue;
        out.push({
          line: sql.line,
          message: 'A concatenated query. Use ? placeholders and pass values separately.',
          evidence: snippet(ctx, sql.line),
        });
      }
      return out;
    },
  },
  {
    id: 'sql/delete-without-where',
    severity: 'error',
    title: 'DELETE or UPDATE with no WHERE clause',
    doc: 'AGENTS.md rule 5 - "Guard destructive actions, and mean it"',
    files: API_TS,
    fix: 'Scope it by (group_id, class) at minimum.',
    run(ctx) {
      const out = [];
      for (const sql of sqlLiterals(ctx)) {
        const body = sql.body.replace(/\s+/g, ' ');
        const destructive = /\b(DELETE\s+FROM|UPDATE)\b/i.test(body);
        if (!destructive) continue;
        if (/\bWHERE\b/i.test(body)) continue;
        if (/\bCREATE\s+TABLE\b/i.test(body)) continue;
        out.push({
          line: sql.line,
          message:
            'This statement has no WHERE, so it hits every row in the table across every course section.',
          evidence: body.trim().slice(0, 180),
        });
      }
      return out;
    },
  },
  {
    id: 'sql/destroys-student-work',
    severity: 'warn',
    title: 'Deletes student work',
    doc: 'AGENTS.md rule 5 - "Guard destructive actions, and mean it"',
    files: API_TS,
    fix: 'Require an explicit UI confirmation naming what is lost, describe what it actually affects rather than a hardcoded list, and check whether the group already submitted an offer.',
    run(ctx) {
      const out = [];
      for (const sql of sqlLiterals(ctx)) {
        if (!/\b(DELETE\s+FROM|TRUNCATE)\b/i.test(sql.body)) continue;
        const table = /\b(?:DELETE\s+FROM|TRUNCATE(?:\s+TABLE)?)\s+`?(\w+)`?/i.exec(sql.body);
        if (!table || !STUDENT_WORK.test(table[1])) continue;
        out.push({
          line: sql.line,
          message: `Deleting from \`${table[1]}\` throws away work a group did in class. Offers is not cleared by the same path, so a wiped group can end up permanently locked out.`,
          evidence: sql.body.replace(/\s+/g, ' ').trim().slice(0, 180),
        });
      }
      return out;
    },
  },
  {
    id: 'sql/unawaited-query',
    severity: 'error',
    title: 'Promise-style query without await',
    doc: 'An unawaited query throws into the void and the handler responds before the write lands.',
    files: API_TS,
    fix: 'await the call, or pass a callback if you are deliberately on the callback API.',
    run(ctx) {
      const out = [];
      const re = /\b(conn|connection|db|promiseDb|pool|this\.db)\s*\.\s*(query|execute)\s*\(/g;
      const starts = collect(ctx, 'bare', re, (h) => ({
        line: h.line,
        index: h.index,
        match: h.match,
      }));
      for (const h of starts) {
        const before = ctx.bare.slice(Math.max(0, h.index - 40), h.index);
        if (/\b(await|return|yield)\s*$/.test(before)) continue;
        const { text } = argsAfter(ctx, h.index + h.match[0].length - 1);
        if (/=>|function\s*\(|\berr\b/.test(text)) continue; // callback API
        const open = ctx.code.indexOf('(', h.index);
        const end = matchBracket(ctx.code, open);
        const trailing = end === -1 ? '' : ctx.bare.slice(end, end + 40);
        if (/^\s*\)?\s*\.\s*(then|catch|finally)\b/.test(trailing)) continue;
        out.push({
          line: h.line,
          message:
            'This query is neither awaited nor given a callback, so its result and any error are dropped.',
          evidence: snippet(ctx, h.line),
        });
      }
      return out;
    },
  },
  {
    id: 'sql/query-inside-loop',
    severity: 'warn',
    title: 'Query inside a loop',
    doc: 'One round trip per student adds up on a classroom network.',
    files: API_TS,
    fix: 'Use a single statement with an IN (...) placeholder list, or a bulk insert.',
    run(ctx) {
      const out = [];
      const re = /\b(for|while)\s*\(|\.\s*forEach\s*\(/g;
      const starts = collect(ctx, 'bare', re, (h) => ({ line: h.line, index: h.index }));
      for (const h of starts) {
        const open = ctx.code.indexOf('{', h.index);
        if (open === -1) continue;
        const end = matchBracket(ctx.code, open);
        if (end === -1) continue;
        const body = ctx.bare.slice(open, end);
        if (body.length > 4000) continue;
        if (!/\.\s*(query|execute)\s*\(/.test(body)) continue;
        out.push({
          line: h.line,
          message: 'A database round trip per iteration. Batch it into one statement.',
          evidence: snippet(ctx, h.line),
        });
      }
      return out;
    },
  },
  {
    id: 'sql/select-star',
    severity: 'info',
    title: 'SELECT *',
    doc: 'Column drift silently changes the shape of every response built from this row.',
    files: API_TS,
    fix: 'Name the columns you need.',
    run(ctx) {
      const out = [];
      for (const sql of sqlLiterals(ctx)) {
        if (!/SELECT\s+\*/i.test(sql.body)) continue;
        out.push({
          line: sql.line,
          message: 'Name the columns instead.',
          evidence: snippet(ctx, sql.line),
        });
      }
      return out;
    },
  },
  {
    id: 'sql/schema-change',
    severity: 'warn',
    title: 'Schema file changed',
    doc: 'AGENTS.md - "MySQL, 21 tables, schema in database-files/Pandployer.sql"',
    files: /^database-files\/.*\.sql$/,
    always: true,
    fix: 'Say in the PR body how an already-deployed database gets to this shape, and whether .local/seed.sql still matches.',
    run(ctx) {
      return [
        {
          line: 1,
          message:
            'This is the schema a deployed database was created from. There is no migration tooling here, so state explicitly how the running database is brought to the new shape.',
          evidence: ctx.path,
        },
      ];
    },
  },
];
