// Identity rules. Most endpoints in this repo still take identity from the
// request, which is a known bug and not a pattern to copy.
import { API_TS, collect, snippet, argsAfter } from './helpers.mjs';

const IDENTITY = '(student_id|studentId|group_id|groupId|user_email|email|class_id|classId|crn)';
const GUARD = /require(Auth|Admin|Student)|passport\s*\.\s*authenticate|ensureAuthenticated/;

export default [
  {
    id: 'auth/client-supplied-identity',
    severity: 'error',
    title: 'Identity read straight off the request',
    doc: 'AGENTS.md rule 1 - "Never trust group_id, class, student_id, or email from the client"',
    files: API_TS,
    fix: 'const studentId = req.user!.id; const groupId = req.user!.group_id;',
    run(ctx) {
      const out = [];
      // destructured: const { group_id } = req.body
      const destructure = /(?:const|let|var)\s*\{([^}]*)\}\s*=\s*req\s*\.\s*(body|params|query)/g;
      out.push(
        ...collect(ctx, 'bare', destructure, (h) => {
          const names = h.match[1];
          const m = new RegExp('\\b' + IDENTITY + '\\b').exec(names);
          if (!m) return null;
          return {
            message: `\`${m[1]}\` comes from req.${h.match[2]} here, so a student can act as any other student or group by editing the request. Derive it from req.user instead.`,
            evidence: snippet(ctx, h.line),
          };
        })
      );
      // direct: req.body.group_id / req.params.classId
      const direct = new RegExp(
        'req\\s*\\.\\s*(body|params|query)\\s*\\.\\s*' + IDENTITY + '\\b',
        'g'
      );
      out.push(
        ...collect(ctx, 'bare', direct, (h) => ({
          message: `\`${h.match[2]}\` comes from req.${h.match[1]} here. Anything the client sends is attacker-controlled: take identity from req.user.`,
          evidence: snippet(ctx, h.line),
        }))
      );
      return out;
    },
  },
  {
    id: 'auth/route-without-guard',
    severity: 'error',
    title: 'Route mounted with no auth middleware',
    doc: 'AGENTS.md - routes/ define "the auth middleware per route"',
    files: /^api\/src\/routes\/.*\.ts$/,
    fix: "router.get('/thing', requireAuth, controller.getThing);",
    run(ctx) {
      const out = [];
      const starts = collect(
        ctx,
        'bare',
        /\brouter\s*\.\s*(get|post|put|patch|delete|all)\s*\(/g,
        (h) => ({
          line: h.line,
          index: h.index,
          verb: h.match[1],
        })
      );
      for (const h of starts) {
        const { args, text } = argsAfter(ctx, h.index);
        if (args.length === 0) continue;
        if (GUARD.test(text)) continue;
        out.push({
          line: h.line,
          message: `This \`${h.verb.toUpperCase()}\` route has no requireAuth / requireStudent / requireAdmin in front of it, so it answers unauthenticated requests.`,
          evidence: snippet(ctx, h.line),
        });
      }
      return out;
    },
  },
  {
    id: 'auth/teacher-route-without-admin-guard',
    severity: 'error',
    title: 'Teacher-facing route guarded only by requireAuth',
    doc: 'AGENTS.md - middleware/ requireAuth, requireAdmin, requireStudent',
    files: /^api\/src\/routes\/.*\.ts$/,
    fix: 'Use requireAdmin for anything a student must not be able to call.',
    run(ctx) {
      const out = [];
      const starts = collect(
        ctx,
        'bare',
        /\brouter\s*\.\s*(get|post|put|patch|delete|all)\s*\(/g,
        (h) => ({
          line: h.line,
          index: h.index,
        })
      );
      for (const h of starts) {
        const { args, text } = argsAfter(ctx, h.index);
        const path = args[0] ?? '';
        if (!/mod|admin|teacher|professor|advisor|instructor|grade|override|force/i.test(path))
          continue;
        if (/requireAdmin/.test(text)) continue;
        out.push({
          line: h.line,
          message:
            'The path looks teacher-only but the guard is not requireAdmin. Any logged-in student could call it during the activity.',
          evidence: snippet(ctx, h.line),
        });
      }
      return out;
    },
  },
  {
    id: 'auth/plaintext-password-compare',
    severity: 'error',
    title: 'Password compared as plain text',
    doc: 'AGENTS.md rule 8 - "two auth systems: Keycloak, plus a plaintext password check"',
    files: API_TS,
    fix: 'Do not extend the legacy password path. New access control goes through Keycloak.',
    run: (ctx) =>
      collect(ctx, 'bare', /\b(password|passwd|pwd|secret)\w*\s*(===|==|!==|!=)\s*/gi, (h) => ({
        message:
          'A direct string comparison on a password. The plaintext admin check is the legacy auth system that is scheduled for removal, not something to build on.',
        evidence: snippet(ctx, h.line),
      })),
  },
  {
    id: 'auth/new-auth-mechanism',
    severity: 'warn',
    title: 'Third way to authenticate',
    doc: 'AGENTS.md rule 8 - "Do not add a third way to do something"',
    files: API_TS,
    fix: 'Extend the Keycloak strategy in config/passport.ts rather than adding a parallel one.',
    run: (ctx) =>
      collect(
        ctx,
        'bare',
        /passport\s*\.\s*use\s*\(|new\s+(LocalStrategy|JwtStrategy|BasicStrategy)\b/g,
        (h) => ({
          message:
            'This repo already has two auth systems and is trying to get back to one. Adding a strategy needs a deliberate decision.',
          evidence: snippet(ctx, h.line),
        })
      ),
  },
  {
    id: 'auth/missing-ownership-check',
    severity: 'warn',
    title: 'Query scoped by a value that was never checked against the session',
    doc: 'AGENTS.md rule 1',
    files: /^api\/src\/controller\/.*\.ts$/,
    fix: 'Compare the requested group/class against req.user before querying, or take them from req.user outright.',
    run(ctx) {
      if (!/req\s*\.\s*(body|params|query)/.test(ctx.bare)) return [];
      if (/req\s*\.\s*user/.test(ctx.bare)) return [];
      const idx = ctx.bare.search(/req\s*\.\s*(body|params|query)/);
      if (idx < 0) return [];
      const line = ctx.lineOf(idx);
      return [
        {
          line,
          message:
            'This controller reads request input and never once consults req.user, so nothing in the file can tell whose data it is operating on.',
          evidence: snippet(ctx, line),
        },
      ];
    },
  },
];
