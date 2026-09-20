// Configuration rules. A missing env var here does not crash, it renders a page
// that navigates to "undefined/instructions". That bug actually shipped.
import { ANY_SOURCE, collect, snippet } from './helpers.mjs';

const BUILTIN = new Set([
  'NODE_ENV',
  'PORT',
  'CI',
  'TZ',
  'HOME',
  'PATH',
  'PWD',
  'npm_package_version',
  'NEXT_RUNTIME',
  'ANALYZE',
  'DEBUG',
]);

export default [
  {
    id: 'env/undocumented-variable',
    severity: 'error',
    title: 'Environment variable missing from .env.example',
    doc: 'AGENTS.md rule 10 - "If you add a new variable, add it to the example file in the same commit"',
    files: ANY_SOURCE,
    fix: 'Add the variable to api/.env.example or frontend/.env.example with a comment saying what it is for.',
    run(ctx) {
      const isApi = ctx.path.startsWith('api/');
      const known = isApi ? ctx.repo.apiEnv : ctx.repo.frontendEnv;
      const example = isApi ? 'api/.env.example' : 'frontend/.env.example';
      const seen = new Set();
      return collect(
        ctx,
        'bare',
        /process\s*\.\s*env\s*(?:\.\s*([A-Z0-9_]+)|\[\s*['"]([A-Z0-9_]+)['"]\s*\])/g,
        (h) => {
          const name = h.match[1] || h.match[2];
          if (!name || BUILTIN.has(name) || known.has(name) || seen.has(name)) return null;
          seen.add(name);
          return {
            message: `\`${name}\` is read here but is not in ${example}. The next person to set the project up gets a silent undefined instead of a clear failure.`,
            evidence: snippet(ctx, h.line),
          };
        }
      );
    },
  },
  {
    id: 'env/server-var-in-client',
    severity: 'error',
    title: 'Non-public env var read in frontend code',
    doc: 'Next.js only inlines NEXT_PUBLIC_* into the browser bundle.',
    files: /^frontend\/src\/.*\.(ts|tsx|js|jsx)$/,
    fix: 'Rename it to NEXT_PUBLIC_* if the browser needs it, or move the read to the API.',
    run(ctx) {
      const seen = new Set();
      return collect(ctx, 'bare', /process\s*\.\s*env\s*\.\s*([A-Z0-9_]+)/g, (h) => {
        const name = h.match[1];
        if (name.startsWith('NEXT_PUBLIC_') || BUILTIN.has(name) || seen.has(name)) return null;
        seen.add(name);
        return {
          message: `\`${name}\` is undefined in the browser. Anything this guards silently takes the false branch in production.`,
          evidence: snippet(ctx, h.line),
        };
      });
    },
  },
  {
    id: 'env/secret-exposed-to-browser',
    severity: 'error',
    title: 'Secret-shaped value published to the client bundle',
    doc: 'NEXT_PUBLIC_* is compiled into JavaScript anyone can read.',
    files: /^(frontend|api)\/.*$/,
    fix: 'Keep it server-side and proxy the call through the API.',
    run: (ctx) =>
      collect(
        ctx,
        'raw',
        /NEXT_PUBLIC_[A-Z0-9_]*(SECRET|PASSWORD|TOKEN|PRIVATE|CREDENTIAL)[A-Z0-9_]*/g,
        (h) => ({
          message: `\`${h.match[0]}\` ships to every browser that loads the app.`,
          evidence: snippet(ctx, h.line),
        })
      ),
  },
  {
    id: 'env/silent-fallback',
    severity: 'warn',
    title: 'Environment variable with a silent default',
    doc: 'AGENTS.md rule 10 - "A missing env var should fail loudly at boot"',
    files: ANY_SOURCE,
    fix: "Throw at boot: if (!process.env.X) throw new Error('X is required');",
    run: (ctx) =>
      collect(
        ctx,
        'raw',
        /process\s*\.\s*env\s*\.\s*([A-Z0-9_]+)\s*(\|\||\?\?)\s*(['"`])/g,
        (h) => ({
          message: `\`${h.match[1]}\` falls back to a literal, so a misconfigured deploy looks healthy and misbehaves later.`,
          evidence: snippet(ctx, h.line),
        })
      ),
  },
  {
    id: 'env/hardcoded-url',
    severity: 'error',
    title: 'Hardcoded host or port',
    doc: 'AGENTS.md rule 10 - "Write to a .env, never a hardcoded value"',
    files: ANY_SOURCE,
    fix: 'Read it from process.env and document it in the matching .env.example.',
    run: (ctx) =>
      collect(
        ctx,
        'raw',
        /['"`]https?:\/\/(localhost|127\.0\.0\.1|0\.0\.0\.0|\d{1,3}(?:\.\d{1,3}){3})(:\d+)?/g,
        (h) => ({
          message: `\`${h.match[0].slice(1)}\` only works on the machine it was written on. It breaks in the deploy and it breaks for the next person on a different port.`,
          evidence: snippet(ctx, h.line),
        })
      ),
  },
  {
    id: 'env/hardcoded-external-host',
    severity: 'warn',
    title: 'Hardcoded deployed hostname',
    doc: 'AGENTS.md rule 10',
    files: ANY_SOURCE,
    fix: 'Move the origin into an env var.',
    run: (ctx) =>
      collect(
        ctx,
        'raw',
        /['"`]https?:\/\/(?!localhost|127\.|0\.0\.0\.0|\d)[a-z0-9.-]*\.(com|net|org|edu|io|dev|app)[^'"`]*/gi,
        (h) => {
          const url = h.match[0].slice(1);
          if (
            /(w3\.org|schema\.org|json-schema\.org|github\.com|npmjs\.com|nextjs\.org|socket\.io|mozilla\.org)/i.test(
              url
            )
          )
            return null;
          return {
            message: `\`${url}\` is pinned in source. Environments differ; this belongs in a .env.`,
            evidence: snippet(ctx, h.line),
          };
        }
      ),
  },
];
