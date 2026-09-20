// Real-time rules. A broadcast that escapes its room reaches every student in
// every section, in the middle of a class.
import { API_TS, FRONTEND_TSX, collect, snippet, argsAfter, blockAfter } from './helpers.mjs';

export default [
  {
    id: 'socket/io-emit',
    severity: 'error',
    title: 'io.emit broadcasts to every connected client',
    doc: 'AGENTS.md rule 4 - "Emit to rooms, never io.emit"',
    files: API_TS,
    fix: 'io.to(`group_${groupId}_class_${classId}`).emit(event, payload)',
    run: (ctx) =>
      collect(ctx, 'bare', /(?:^|[^.\w])(?:this\.)?io\s*\.\s*emit\s*\(/gm, (h) => ({
        message:
          'This reaches every socket in every class. Correctness then depends on clients discarding messages they should never have received.',
        evidence: snippet(ctx, h.line),
      })),
  },
  {
    id: 'socket/broadcast-emit',
    severity: 'error',
    title: 'socket.broadcast.emit escapes the room',
    doc: 'AGENTS.md rule 4 - "Emit to rooms, never io.emit"',
    files: API_TS,
    fix: 'socket.to(roomId).emit(...) or io.to(roomId).emit(...)',
    run: (ctx) =>
      collect(ctx, 'bare', /\.broadcast\s*\.\s*emit\s*\(/g, (h) => ({
        message: 'broadcast.emit reaches every client except the sender, across all sections.',
        evidence: snippet(ctx, h.line),
      })),
  },
  {
    id: 'socket/trusts-payload-identity',
    severity: 'error',
    title: 'Socket handler takes identity from the client payload',
    doc: 'AGENTS.md rule 1 - "Never trust group_id, class, student_id, or email from the client"',
    files: API_TS,
    fix: 'Derive identity from the authenticated socket, not from the event payload.',
    run(ctx) {
      const out = [];
      const starts = collect(ctx, 'bare', /socket\s*\.\s*on\s*\(/g, (h) => ({
        line: h.line,
        index: h.index,
      }));
      for (const h of starts) {
        const { args } = argsAfter(ctx, h.index);
        if (args.length < 2) continue;
        const handler = args.slice(1).join(',');
        const m =
          /\b(student_id|studentId|group_id|groupId|user_email|email|class_id|classId|crn)\b/.exec(
            handler
          );
        if (!m) continue;
        if (/socket\.(data|request|handshake|user)/.test(handler)) continue;
        out.push({
          line: h.line,
          message: `This handler reads \`${m[1]}\` out of the event payload. The socket layer has no auth, so any connected browser can send any value and act as another group.`,
          evidence: snippet(ctx, h.line),
        });
      }
      return out;
    },
  },
  {
    id: 'socket/in-memory-state',
    severity: 'error',
    title: 'Group or session state kept in process memory',
    doc: 'AGENTS.md rule 2 - "Never put group or session state in process memory"',
    files: API_TS,
    fix: 'Persist it in MySQL. A restart mid-class must not strand a group, and the API has to be able to run more than one replica.',
    run(ctx) {
      const out = [];
      const re =
        /^(?:export\s+)?(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*(?::[^=\n]+)?=\s*(?:new\s+(?:Map|Set|WeakMap|WeakSet)\b|\{\s*\}|\[\s*\])/gm;
      const decls = collect(ctx, 'code', re, (h) => ({ line: h.line, name: h.match[1] }));
      for (const d of decls) {
        const name = d.name.replace(/[$]/g, '\\$');
        const mutation = new RegExp(
          `\\b${name}\\s*\\[[^\\]]*\\]\\s*=|\\b${name}\\s*\\.\\s*(?:set|add|push|delete|clear)\\s*\\(|delete\\s+${name}\\s*\\[`
        );
        if (!mutation.test(ctx.bare)) continue;
        out.push({
          line: d.line,
          message: `\`${d.name}\` is module-level mutable state that is written to elsewhere in this file. When the API restarts mid-class it vanishes, and groups waiting on it get stuck with no way out.`,
          evidence: snippet(ctx, d.line),
        });
      }
      return out;
    },
  },
  {
    id: 'socket/global-state',
    severity: 'error',
    title: 'State parked on globalThis',
    doc: 'AGENTS.md rule 2 - "Never put group or session state in process memory"',
    files: API_TS,
    fix: 'Put it in MySQL.',
    run: (ctx) =>
      collect(ctx, 'bare', /\b(?:global|globalThis)\s*\.\s*\w+\s*=[^=]/g, (h) => ({
        message:
          'Process-global state does not survive a restart and does not survive a second replica.',
        evidence: snippet(ctx, h.line),
      })),
  },
  {
    id: 'socket/gate-without-escape-hatch',
    severity: 'warn',
    title: 'Gate or barrier that may have no override and no fallback',
    doc: 'AGENTS.md rule 3 - "Every gate needs a teacher override and a non-socket fallback"',
    files: API_TS,
    fix: 'Add a professor force-past, an endpoint the client can poll to recover, and behaviour for a roster student who never logs in.',
    run(ctx) {
      const re =
        /\b(allFinished|allDone|everyoneDone|allReady|barrier|waitingFor|canProceed|hasEveryone|allMembers|allSubmitted)\b/g;
      const seen = new Set();
      return collect(ctx, 'bare', re, (h) => {
        if (seen.has(h.match[1])) return null;
        seen.add(h.match[1]);
        return {
          message: `\`${h.match[1]}\` looks like a group barrier. Confirm there is a teacher override, a pollable recovery path, and tolerance for a student who never logs in.`,
          evidence: snippet(ctx, h.line),
        };
      });
    },
  },
  {
    id: 'socket/client-listener-not-cleaned-up',
    severity: 'warn',
    title: 'Socket listener registered without cleanup',
    doc: 'Duplicate listeners fire the same handler once per re-render.',
    files: FRONTEND_TSX,
    fix: 'Return a cleanup from the effect that calls socket.off with the same handler reference.',
    run(ctx) {
      const out = [];
      const starts = collect(ctx, 'bare', /useEffect\s*\(/g, (h) => ({
        line: h.line,
        index: h.index,
      }));
      for (const h of starts) {
        const body = blockAfter(ctx, h.index);
        if (!/\bsocket\s*\.\s*on\s*\(/.test(body)) continue;
        if (/\bsocket\s*\.\s*(off|removeListener|disconnect)\s*\(/.test(body)) continue;
        out.push({
          line: h.line,
          message:
            'This effect subscribes to socket events and never unsubscribes, so handlers stack up across re-renders.',
          evidence: snippet(ctx, h.line),
        });
      }
      return out;
    },
  },
];
