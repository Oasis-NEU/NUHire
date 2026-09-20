// Security rules. The threat model here is mostly "a student with devtools
// open during the activity", which is a realistic and motivated attacker.
import { ANY_SOURCE, API_TS, collect, snippet, argsAfter } from './helpers.mjs';

const PLACEHOLDER = /(your[-_]|xxx|placeholder|changeme|example|\.\.\.|<[^>]+>|TODO|\$\{)/i;

export default [
  {
    id: 'sec/hardcoded-credential',
    severity: 'error',
    title: 'Credential-shaped literal in source',
    doc: 'AGENTS.md rule 10 - "Write to a .env, never a hardcoded value"',
    files: /^(?!.*\.env\.example$).*\.(ts|tsx|js|jsx|mjs|yml|yaml|json|sql|sh)$/,
    fix: 'Move it to a .env, document the name in the matching .env.example, and rotate the value that was committed.',
    run: (ctx) =>
      collect(
        ctx,
        'raw',
        /\b(api[_-]?key|apikey|secret|client[_-]?secret|password|passwd|pwd|token|access[_-]?key|private[_-]?key)\b\s*[:=]\s*['"]([^'"\n]{8,})['"]/gi,
        (h) => {
          if (PLACEHOLDER.test(h.match[2])) return null;
          if (/^process\.env/.test(h.match[2])) return null;
          return {
            message: `A literal value assigned to \`${h.match[1]}\`. If this is real, it is now in git history forever and needs rotating, not just deleting.`,
            evidence: snippet(ctx, h.line).replace(h.match[2], '*'.repeat(8)),
          };
        }
      ),
  },
  {
    id: 'sec/known-token-format',
    severity: 'error',
    title: 'Live credential pattern',
    doc: 'These prefixes only appear on real keys.',
    files: /.*/,
    fix: 'Revoke the key, then remove it from the branch.',
    run: (ctx) =>
      collect(
        ctx,
        'raw',
        /(sk-ant-[A-Za-z0-9_-]{16,}|gh[pousr]_[A-Za-z0-9]{20,}|AKIA[0-9A-Z]{16}|-----BEGIN [A-Z ]*PRIVATE KEY-----|eyJhbGciOi[A-Za-z0-9_-]{10,})/g,
        (h) => ({
          message: `This matches a live credential format (\`${h.match[0].slice(0, 12)}…\`). Revoke it first, then rewrite the branch.`,
          evidence: '(redacted)',
        })
      ),
  },
  {
    id: 'sec/cors-wildcard',
    severity: 'error',
    title: 'CORS open to every origin',
    doc: 'The API runs with session cookies.',
    files: API_TS,
    fix: 'Set origin to the configured frontend URL and keep credentials: true.',
    run: (ctx) =>
      collect(ctx, 'raw', /origin\s*:\s*(['"]\*['"]|true)/g, (h) => ({
        message:
          'With credentials enabled, a wildcard origin lets any page in the browser call this API as the logged-in student.',
        evidence: snippet(ctx, h.line),
      })),
  },
  {
    id: 'sec/cookie-flags',
    severity: 'warn',
    title: 'Session cookie flag weakened',
    doc: 'api/.env.example - "Leave COOKIE_SECURE unset in deploys to keep secure + sameSite=none"',
    files: API_TS,
    fix: 'Drive it from COOKIE_SECURE rather than hardcoding false.',
    run: (ctx) =>
      collect(ctx, 'raw', /(httpOnly|secure|sameSite)\s*:\s*(false|['"]none['"])/g, (h) => ({
        message: `\`${h.match[1]}: ${h.match[2]}\` hardcoded. Local dev needs secure:false, deploys must not have it.`,
        evidence: snippet(ctx, h.line),
      })),
  },
  {
    id: 'sec/error-detail-to-client',
    severity: 'warn',
    title: 'Internal error detail sent to the browser',
    doc: 'Stack traces and driver messages expose schema and file paths.',
    files: API_TS,
    fix: 'console.error the detail, send a generic message with the right status code.',
    run: (ctx) =>
      collect(
        ctx,
        'bare',
        /res\s*\.[\s\S]{0,80}?\b(err|error)\s*\.\s*(stack|sqlMessage|sql|message)\b/g,
        (h) => ({
          message:
            'This hands the caller the raw error. Log it server-side and return a generic message.',
          evidence: snippet(ctx, h.line),
        })
      ),
  },
  {
    id: 'sec/path-traversal',
    severity: 'error',
    title: 'Filesystem path built from request input',
    doc: 'api/uploads is served from disk.',
    files: API_TS,
    fix: 'Look the file up by id in the database and resolve the path yourself; never join request text onto a path.',
    run(ctx) {
      const out = [];
      const starts = collect(
        ctx,
        'bare',
        /\b(path\s*\.\s*(join|resolve)|fs\s*\.\s*(readFile|readFileSync|createReadStream|unlink|writeFile))\s*\(/g,
        (h) => ({
          line: h.line,
          index: h.index,
          match: h.match,
        })
      );
      for (const h of starts) {
        const { text } = argsAfter(ctx, h.index + h.match[0].length - 1);
        if (!/\breq\s*\.\s*(params|query|body)/.test(text)) continue;
        out.push({
          line: h.line,
          message:
            'Request input reaches a filesystem path. `../../` in that value reads anything the process can read.',
          evidence: snippet(ctx, h.line),
        });
      }
      return out;
    },
  },
  {
    id: 'sec/open-redirect',
    severity: 'error',
    title: 'Redirect target taken from the request',
    doc: 'The API redirects to frontend routes after login.',
    files: API_TS,
    fix: 'Redirect to a path chosen from a fixed list, based on the configured FRONT_URL.',
    run(ctx) {
      const out = [];
      const starts = collect(ctx, 'bare', /res\s*\.\s*redirect\s*\(/g, (h) => ({
        line: h.line,
        index: h.index,
      }));
      for (const h of starts) {
        const { text } = argsAfter(ctx, h.index + 'res.redirect'.length);
        if (!/\breq\s*\.\s*(params|query|body|headers)/.test(text)) continue;
        out.push({
          line: h.line,
          message:
            'An attacker-controlled redirect target turns the login flow into a phishing hop.',
          evidence: snippet(ctx, h.line),
        });
      }
      return out;
    },
  },
  {
    id: 'sec/dynamic-code',
    severity: 'error',
    title: 'eval or Function constructor',
    doc: 'Never needed here.',
    files: ANY_SOURCE,
    fix: 'Remove it.',
    run: (ctx) =>
      collect(ctx, 'bare', /\beval\s*\(|new\s+Function\s*\(/g, (h) => ({
        message: 'Executing constructed code. There is no case in this app that needs it.',
        evidence: snippet(ctx, h.line),
      })),
  },
  {
    id: 'sec/shell-interpolation',
    severity: 'error',
    title: 'Shell command built by interpolation',
    doc: 'Command injection.',
    files: ANY_SOURCE,
    fix: 'Use execFile with an argument array.',
    run: (ctx) =>
      collect(ctx, 'raw', /\b(exec|execSync|spawnSync|spawn)\s*\(\s*[`'"][^`'"]*\$\{/g, (h) => ({
        message: 'Interpolating into a shell string. Use execFile and pass arguments as an array.',
        evidence: snippet(ctx, h.line),
      })),
  },
  {
    id: 'sec/tls-disabled',
    severity: 'error',
    title: 'TLS verification turned off',
    doc: 'Keycloak and the API talk over the network.',
    files: /.*/,
    fix: 'Fix the certificate instead.',
    run: (ctx) =>
      collect(
        ctx,
        'raw',
        /NODE_TLS_REJECT_UNAUTHORIZED\s*[:=]\s*['"]?0|rejectUnauthorized\s*:\s*false|strictSSL\s*:\s*false/g,
        (h) => ({
          message: 'This disables certificate checking for the whole process.',
          evidence: snippet(ctx, h.line),
        })
      ),
  },
  {
    id: 'sec/weak-hash',
    severity: 'warn',
    title: 'Weak hash for something that looks security relevant',
    doc: 'MD5 and SHA-1 are not password hashes.',
    files: ANY_SOURCE,
    fix: 'Use bcrypt/argon2 for passwords, SHA-256 or better for integrity.',
    run: (ctx) =>
      collect(ctx, 'raw', /createHash\s*\(\s*['"](md5|sha1)['"]/gi, (h) => ({
        message: `\`${h.match[1]}\` is not suitable for anything a user must not forge.`,
        evidence: snippet(ctx, h.line),
      })),
  },
  {
    id: 'sec/math-random-token',
    severity: 'warn',
    title: 'Math.random used for an identifier or token',
    doc: 'Math.random is predictable.',
    files: ANY_SOURCE,
    fix: 'crypto.randomUUID() or crypto.randomBytes().',
    run: (ctx) =>
      collect(
        ctx,
        'raw',
        /(?:token|id|secret|code|key|session)\w*\s*=\s*[^\n;]*Math\s*\.\s*random/gi,
        (h) => ({
          message: 'A guessable value where a unique one is expected.',
          evidence: snippet(ctx, h.line),
        })
      ),
  },
  {
    id: 'sec/upload-unrestricted',
    severity: 'warn',
    title: 'Upload handler with no size or type limit',
    doc: 'Students can upload to this endpoint.',
    files: /^api\/src\/(middleware|routes|controller)\/.*\.ts$/,
    fix: 'Pass limits and fileFilter to multer, and check the mimetype against what the flow actually accepts.',
    run(ctx) {
      if (!/\bmulter\s*\(/.test(ctx.bare)) return [];
      if (/\b(limits|fileFilter)\b/.test(ctx.bare)) return [];
      const idx = ctx.bare.search(/\bmulter\s*\(/);
      const line = ctx.lineOf(idx);
      return [
        {
          line,
          message:
            'multer is configured with neither limits nor fileFilter, so any file of any size is accepted and written to disk.',
          evidence: snippet(ctx, line),
        },
      ];
    },
  },
  {
    id: 'sec/rate-limit-missing-on-auth',
    severity: 'info',
    title: 'Credential endpoint with no rate limit',
    doc: 'The legacy moderator login is a plain password check.',
    files: /^api\/src\/routes\/.*\.ts$/,
    fix: 'Add a limiter on the paths that accept credentials.',
    run(ctx) {
      if (!/(signin|login|moderator|mod-signin|authenticate)/i.test(ctx.bare)) return [];
      if (/rateLimit|slowDown|limiter/i.test(ctx.bare)) return [];
      const idx = ctx.bare.search(/(signin|login|moderator|authenticate)/i);
      const line = ctx.lineOf(idx);
      return [
        {
          line,
          message: 'A credential path with no attempt limiting.',
          evidence: snippet(ctx, line),
        },
      ];
    },
  },
];
