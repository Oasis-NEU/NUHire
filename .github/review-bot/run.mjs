#!/usr/bin/env node
// NUHire review bot.
//
//   node .github/review-bot/run.mjs                      review this branch against main
//   node .github/review-bot/run.mjs --base origin/main   pick the base explicitly
//   node .github/review-bot/run.mjs --all                audit the whole repo
//   node .github/review-bot/run.mjs --post --pr 42       post the review on a PR
//
// Exit status is 1 when there is a blocking finding, unless --no-fail.
import { writeFileSync, appendFileSync } from 'node:fs';
import { scan, loadConfig } from './lib/scan.mjs';
import { summaryMarkdown, consoleReport, counts } from './lib/report.mjs';
import { client } from './lib/github.mjs';
import { gitOk, mergeBase } from './lib/diff.mjs';
import { allRules } from './lib/rules/index.mjs';

function parseArgs(argv) {
  const out = { mode: 'diff', post: false, fail: true, maxInline: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--all') out.mode = 'all';
    else if (a === '--post') out.post = true;
    else if (a === '--no-fail') out.fail = false;
    else if (a === '--base') out.base = argv[++i];
    else if (a === '--head') out.head = argv[++i];
    else if (a === '--pr') out.pr = argv[++i];
    else if (a === '--repo') out.repo = argv[++i];
    else if (a === '--max-inline') out.maxInline = Number(argv[++i]);
    else if (a === '--json') out.json = argv[++i];
    else if (a === '--md') out.md = argv[++i];
    else if (a === '--help' || a === '-h') out.help = true;
    else console.error(`review-bot: ignoring unknown argument ${a}`);
  }
  return out;
}

function resolveBase(requested) {
  const candidates = requested
    ? [requested, `origin/${requested}`]
    : [
        process.env.GITHUB_BASE_REF && `origin/${process.env.GITHUB_BASE_REF}`,
        'origin/main',
        'main',
        'origin/master',
      ].filter(Boolean);
  for (const c of candidates) {
    if (gitOk(['rev-parse', '--verify', '--quiet', c])) return c;
  }
  return null;
}

const args = parseArgs(process.argv.slice(2));
if (args.help) {
  console.log(
    [
      'NUHire review bot',
      '',
      '  --base <ref>     base to diff against (default: the PR base, else origin/main)',
      '  --head <ref>     head to review (default: HEAD)',
      '  --all            scan every tracked file instead of the diff',
      '  --post           post the result on the pull request',
      '  --pr <number>    pull request number (default: from the event payload)',
      '  --repo <o/r>     owner/repo (default: $GITHUB_REPOSITORY)',
      '  --max-inline <n> cap inline comments (default: config.json, else 25)',
      '  --json <path>    write findings as JSON',
      '  --md <path>      write the markdown summary',
      '  --no-fail        always exit 0',
      '',
      `${allRules.length} rules loaded.`,
    ].join('\n')
  );
  process.exit(0);
}

const root = gitOk(['rev-parse', '--show-toplevel']);
if (!root) {
  console.error('review-bot: not inside a git repository');
  process.exit(2);
}
process.chdir(root);

const config = loadConfig(root);
const maxInline = args.maxInline ?? config.maxInlineComments ?? 25;
const head = args.head ?? 'HEAD';

let base = null;
if (args.mode !== 'all') {
  const resolved = resolveBase(args.base);
  if (!resolved) {
    console.error(
      'review-bot: could not resolve a base ref. Pass --base, or fetch the base branch first.'
    );
    process.exit(2);
  }
  base = mergeBase(resolved, head);
}

const { findings, files, skipped } = scan({ root, base, head, mode: args.mode, config });
const c = counts(findings);

const inline = findings
  .filter((f) => f.file && f.line && f.onDiff && f.severity !== 'info')
  .slice(0, maxInline);

const markdown = summaryMarkdown({
  findings,
  files,
  mode: args.mode,
  base,
  head,
  skipped,
  inlineCount: args.post ? inline.length : 0,
  ruleCount: allRules.length,
});

console.log(consoleReport({ findings, files, ruleCount: allRules.length }));

if (args.json)
  writeFileSync(args.json, JSON.stringify({ base, head, counts: c, findings }, null, 2));
if (args.md) writeFileSync(args.md, markdown);
if (process.env.GITHUB_STEP_SUMMARY)
  appendFileSync(process.env.GITHUB_STEP_SUMMARY, markdown + '\n');

if (args.post) {
  const token = process.env.GITHUB_TOKEN;
  const repo = args.repo ?? process.env.GITHUB_REPOSITORY;
  const pull = args.pr ?? process.env.REVIEW_BOT_PR_NUMBER;
  if (!token || !repo || !pull) {
    console.error(
      'review-bot: --post needs GITHUB_TOKEN, a repo and a PR number. Skipping the post, the summary is still above.'
    );
  } else {
    const [owner, name] = repo.split('/');
    const gh = client({ token, owner, repo: name, pull });
    try {
      await gh.clearInline();
      if (inline.length > 0) {
        await gh.postReview(
          inline,
          `${c.error} blocking, ${c.warn} worth a look. Full summary in the comment below.`
        );
      }
      await gh.upsertSummary(markdown);
      console.log(
        `review-bot: posted ${inline.length} inline comment(s) and updated the summary on #${pull}`
      );
    } catch (e) {
      console.error(`review-bot: could not post to GitHub: ${e.message}`);
      if (e.status === 403)
        console.error(
          'review-bot: the token has no write access (fork pull requests get a read-only token).'
        );
    }
  }
}

process.exit(args.fail && c.error > 0 ? 1 : 0);
