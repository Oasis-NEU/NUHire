export const MARKER = '<!-- nuhire-review-bot -->';

const LABEL = { error: 'blocking', warn: 'look at this', info: 'note' };

function loc(f) {
  if (!f.file) return '_the branch_';
  return f.line ? `\`${f.file}:${f.line}\`` : `\`${f.file}\``;
}

export function counts(findings) {
  return {
    error: findings.filter((f) => f.severity === 'error').length,
    warn: findings.filter((f) => f.severity === 'warn').length,
    info: findings.filter((f) => f.severity === 'info').length,
  };
}

function section(title, findings, open) {
  if (findings.length === 0) return '';
  const rows = findings
    .map(
      (f) =>
        `- ${loc(f)} — **${f.title}** \`${f.ruleId}\`\n` +
        `  ${f.message}\n` +
        (f.evidence ? `  \`${String(f.evidence).replace(/`/g, "'").slice(0, 200)}\`\n` : '') +
        (f.doc ? `  _${f.doc}_\n` : '')
    )
    .join('\n');
  return `<details${open ? ' open' : ''}>\n<summary><b>${title} (${findings.length})</b></summary>\n\n${rows}\n</details>\n\n`;
}

export function summaryMarkdown({
  findings,
  files,
  mode,
  base,
  head,
  skipped,
  inlineCount,
  ruleCount,
}) {
  const c = counts(findings);
  const head_ = [MARKER, '## NUHire review bot', ''];

  if (findings.length === 0) {
    head_.push(
      `Nothing to flag. ${ruleCount} rules ran over ${files.length} changed file(s).`,
      '',
      '<sub>Rules live in `.github/review-bot/`. Re-run by commenting `/review`.</sub>'
    );
    return head_.join('\n');
  }

  head_.push(
    `**${c.error} blocking**, ${c.warn} worth a look, ${c.info} note(s) — ${ruleCount} rules over ${files.length} changed file(s).`,
    ''
  );
  if (c.error > 0)
    head_.push(
      'Blocking findings fail this check. Fix them, or silence a specific one with a reason (see below).',
      ''
    );
  if (inlineCount > 0) head_.push(`${inlineCount} of these are posted inline on the diff.`, '');

  const body = [
    section(
      'Blocking',
      findings.filter((f) => f.severity === 'error'),
      true
    ),
    section(
      'Worth a look',
      findings.filter((f) => f.severity === 'warn'),
      c.error === 0
    ),
    section(
      'Notes',
      findings.filter((f) => f.severity === 'info'),
      false
    ),
  ].join('');

  const foot = [
    '---',
    '',
    '<sub>',
    'Rules: `.github/review-bot/`. Re-run: comment `/review`. ',
    'Silence one line: `// review-bot-ignore: rule/id -- why`. ',
    'Silence a path: `.github/review-bot/config.json`.',
    skipped?.length ? `Skipped ${skipped.length} oversized file(s).` : '',
    '</sub>',
  ]
    .filter(Boolean)
    .join('\n');

  return head_.join('\n') + body + foot;
}

export function inlineBody(f) {
  const lines = [MARKER, `**${LABEL[f.severity]} · \`${f.ruleId}\`** — ${f.title}`, '', f.message];
  if (f.doc) lines.push('', `> ${f.doc}`);
  if (f.fix) lines.push('', '```ts', f.fix, '```');
  lines.push('', `<sub>Disagree? \`// review-bot-ignore: ${f.ruleId} -- reason\`</sub>`);
  return lines.join('\n');
}

export function consoleReport({ findings, files, ruleCount }) {
  const c = counts(findings);
  const out = [];
  for (const f of findings) {
    const where = f.file ? `${f.file}:${f.line ?? 1}` : '(branch)';
    out.push(`${f.severity.toUpperCase().padEnd(5)} ${where}  [${f.ruleId}]`);
    out.push(`      ${f.message}`);
    if (f.evidence) out.push(`      > ${String(f.evidence).slice(0, 160)}`);
    out.push('');
  }
  out.push(
    `${ruleCount} rules over ${files.length} file(s): ${c.error} blocking, ${c.warn} warnings, ${c.info} notes.`
  );
  return out.join('\n');
}
