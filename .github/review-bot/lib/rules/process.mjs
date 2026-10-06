// Whole-PR rules. These look at the shape of the change rather than at any one
// line: what moved, what was deleted, what got committed by accident.

const UI_CONCEPTS = [
  'modal',
  'spinner',
  'loader',
  'loading',
  'footer',
  'header',
  'navbar',
  'popup',
  'toast',
  'dropdown',
  'tooltip',
  'sidebar',
];

const ARTIFACTS = [
  { re: /(^|\/)\.env(\.|$)(?!example)/, what: 'an environment file' },
  { re: /\.log$/, what: 'a log file' },
  { re: /(^|\/)(dist|build|out)\//, what: 'build output' },
  { re: /(^|\/)\.next\//, what: 'a Next.js build directory' },
  { re: /(^|\/)node_modules\//, what: 'a dependency directory' },
  { re: /(^|\/)\.DS_Store$/, what: 'a macOS directory file' },
  { re: /\.(tsbuildinfo|pid|swp)$/, what: 'a local tooling artifact' },
];

const DEPENDENCY_FIELDS = [
  'dependencies',
  'devDependencies',
  'optionalDependencies',
  'peerDependencies',
];

/** Every package name a package.json depends on, or null if it does not parse. */
function dependencyNames(text) {
  if (text == null) return null;
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    return null;
  }
  const names = new Set();
  for (const field of DEPENDENCY_FIELDS) {
    for (const name of Object.keys(json?.[field] ?? {})) names.add(name);
  }
  return names;
}

export default [
  {
    id: 'process/moved-and-changed',
    scope: 'pr',
    severity: 'error',
    title: 'File moved and edited in the same change',
    doc: 'AGENTS.md - "You did not move code and change behaviour in the same commit"',
    fix: 'Split it: one commit that only moves, one that only changes.',
    run(pr) {
      return pr.files
        .filter((f) => f.status === 'R' && f.similarity > 0 && f.similarity < 95)
        .map((f) => ({
          file: f.path,
          line: 1,
          message: `Moved from \`${f.from}\` and rewritten at the same time (${f.similarity}% similar). Mixing a move with a behaviour change makes the diff unreadable, which is exactly when behaviour changes slip through.`,
          evidence: `${f.from} -> ${f.path}`,
        }));
    },
  },
  {
    id: 'process/deleted-page-still-reachable',
    scope: 'pr',
    severity: 'error',
    title: 'Deleted page may still be reachable from the API',
    doc: 'AGENTS.md rule 9 - "Check both sides before deleting anything"',
    fix: 'grep -rn "routeName" frontend/src and grep -rn "FRONT_URL" api/src before deleting a route.',
    run(pr) {
      const out = [];
      const deleted = pr.files.filter(
        (f) => f.status === 'D' && /^frontend\/src\/app\/([^/]+)\/page\.tsx$/.test(f.path)
      );
      if (deleted.length === 0) return out;
      const apiSources = pr.tracked.filter((p) => p.startsWith('api/src/'));
      const apiText = apiSources.map((p) => pr.read(p) || '').join('\n');
      for (const f of deleted) {
        const route = /^frontend\/src\/app\/([^/]+)\/page\.tsx$/.exec(f.path)[1];
        if (!new RegExp(`['"\`/]${route}\\b`).test(apiText)) continue;
        out.push({
          file: f.path,
          line: 1,
          message: `\`${route}\` is still referenced from api/src, which redirects to frontend routes after login. A frontend-only grep makes pages like this look dead when they are not.`,
          evidence: route,
        });
      }
      return out;
    },
  },
  {
    id: 'process/committed-artifact',
    scope: 'pr',
    severity: 'error',
    title: 'Generated or local file committed',
    doc: 'AGENTS.md conventions - "Do not commit .env, *.log, or build output"',
    fix: 'Remove it from the branch and add it to .gitignore.',
    run(pr) {
      const out = [];
      for (const f of pr.files) {
        if (f.status === 'D') continue;
        for (const a of ARTIFACTS) {
          if (!a.re.test(f.path)) continue;
          out.push({
            file: f.path,
            line: 1,
            message: `This is ${a.what}. It should not be in the repository.`,
            evidence: f.path,
          });
          break;
        }
      }
      return out;
    },
  },
  {
    id: 'process/large-binary',
    scope: 'pr',
    severity: 'warn',
    title: 'Large binary added',
    doc: 'Binaries stay in history forever.',
    fix: 'Confirm it is content the activity needs, not a stray asset.',
    run(pr) {
      return pr.files
        .filter((f) => f.status !== 'D' && f.binary && f.size > 512 * 1024)
        .map((f) => ({
          file: f.path,
          line: 1,
          message: `${Math.round(f.size / 1024)} KB of binary added to git history.`,
          evidence: f.path,
        }));
    },
  },
  {
    id: 'process/dependency-added',
    scope: 'pr',
    severity: 'warn',
    title: 'New dependency',
    doc: 'AGENTS.md rule 8 - "Do not add a third way to do something"',
    fix: 'Say in the PR why the existing libraries do not cover it. This repo already carries packages nothing imports.',
    run(pr) {
      const out = [];
      for (const f of pr.files) {
        if (!/(^|\/)package\.json$/.test(f.path) || f.status === 'D') continue;
        // Parsed rather than diffed, so scripts and version bumps are not new
        // dependencies. A file that does not parse fails `npm ci` in CI anyway.
        const head = dependencyNames(pr.read(f.path));
        if (!head) continue;
        const base = f.status === 'A' ? new Set() : dependencyNames(pr.readBase(f.from ?? f.path));
        if (!base) continue;
        const added = [...head].filter((name) => !base.has(name));
        if (added.length === 0) continue;
        out.push({
          file: f.path,
          line: 1,
          message: `Adds ${added.map((a) => '`' + a + '`').join(', ')}. Each one is a thing to keep working during a live class.`,
          evidence: added.join(', '),
        });
      }
      return out;
    },
  },
  {
    id: 'process/parallel-ui-component',
    scope: 'pr',
    severity: 'warn',
    title: 'New component duplicates an existing concept',
    doc: 'AGENTS.md rule 8 - "multiple hand-rolled versions of the same UI: loading spinners, modals, footers"',
    fix: 'Use the existing one, or fix the existing one in place.',
    run(pr) {
      const out = [];
      const added = pr.files.filter(
        (f) => f.status === 'A' && /^frontend\/src\/.*\.(tsx|jsx)$/.test(f.path)
      );
      for (const f of added) {
        const base = f.path.split('/').pop().toLowerCase();
        for (const concept of UI_CONCEPTS) {
          if (!base.includes(concept)) continue;
          const existing = pr.tracked.filter(
            (p) =>
              p !== f.path &&
              /^frontend\/src\/.*\.(tsx|jsx)$/.test(p) &&
              p.split('/').pop().toLowerCase().includes(concept)
          );
          if (existing.length === 0) continue;
          out.push({
            file: f.path,
            line: 1,
            message: `There ${existing.length === 1 ? 'is already' : 'are already'} ${existing.length} file(s) for "${concept}": ${existing
              .slice(0, 3)
              .map((p) => '`' + p + '`')
              .join(', ')}. Adding another is how this codebase ended up with three of everything.`,
            evidence: f.path,
          });
          break;
        }
      }
      return out;
    },
  },
  {
    id: 'process/deploy-path-changed',
    scope: 'pr',
    severity: 'warn',
    title: 'Deploy or container configuration changed',
    doc: 'AGENTS.md - "Deployed via Coolify on a Khoury self-hosted runner"',
    fix: 'Say what you did to verify it, and who can roll it back if a class is starting.',
    run(pr) {
      // Only what production runs: deploy.yml calls Coolify, which builds
      // compose.yaml from these two Dockerfiles. Dev and CI files stay out.
      return pr.files
        .filter((f) =>
          /^(\.github\/workflows\/deploy\.yml|compose\.yaml|api\/dockerfile|frontend\/Dockerfile\.prod)$/.test(
            f.path
          )
        )
        .map((f) => ({
          file: f.path,
          line: 1,
          message:
            'This file is part of the live deploy path. A mistake here takes the app down rather than producing a failing test.',
          evidence: f.path,
        }));
    },
  },
  {
    id: 'process/untested-realtime-change',
    scope: 'pr',
    severity: 'warn',
    title: 'Socket or group change with no two-session verification noted',
    doc: 'AGENTS.md - "Anything touching groups, barriers, or sockets needs two browser sessions in the same group"',
    fix: 'Say in the PR body that you ran two sessions in one group, and what you saw.',
    run(pr) {
      const risky = pr.files.filter(
        (f) => /socket|group|progress|offer|interview/i.test(f.path) && /\.(ts|tsx)$/.test(f.path)
      );
      if (risky.length === 0) return [];
      const body = (pr.prBody || '').toLowerCase();
      if (
        /two (browser )?(sessions|windows|tabs)|second session|two students|both sessions/.test(
          body
        )
      )
        return [];
      return [
        {
          file: risky[0].path,
          line: 1,
          message: `This change touches real-time or group code (${risky.length} file(s)) and the PR body does not say it was tested with two sessions in one group. There are no automated tests here, so the description is the only record that it was verified.`,
          evidence: risky
            .slice(0, 4)
            .map((f) => f.path)
            .join(', '),
        },
      ];
    },
  },
  {
    id: 'process/schema-doc-drift',
    scope: 'pr',
    severity: 'info',
    title: 'Schema changed, architecture doc did not',
    doc: 'AGENTS.md - stale docs are a standing problem in this repo',
    fix: 'Update docs/ARCHITECTURE.md in the same PR.',
    run(pr) {
      const changed = new Set(pr.files.map((f) => f.path));
      const schema = [...changed].some((p) => p.startsWith('database-files/'));
      if (!schema) return [];
      if ([...changed].some((p) => p.startsWith('docs/') && !p.startsWith('docs/archive/')))
        return [];
      return [
        {
          file: [...changed].find((p) => p.startsWith('database-files/')),
          line: 1,
          message:
            'The schema moved and no document did. That is how the docs in this repo went stale the first time.',
          evidence: 'docs/ARCHITECTURE.md',
        },
      ];
    },
  },
  {
    id: 'process/vague-commit-message',
    scope: 'pr',
    severity: 'info',
    title: 'Commit message says nothing',
    doc: 'The git log is the only history of why anything here is the way it is.',
    fix: 'Say what changed and why.',
    run(pr) {
      return pr.commits
        .filter((c) =>
          /^(wip|fix|update|updates|changes|stuff|misc|test|temp|asdf|\.)\s*$/i.test(
            c.subject.trim()
          )
        )
        .map((c) => ({
          file: null,
          line: null,
          message: `\`${c.subject.trim()}\` (${c.sha.slice(0, 7)}) does not say what changed.`,
          evidence: c.subject.trim(),
        }));
    },
  },
];
