// Thin GitHub REST client. No dependencies: node 22 has fetch.
import { MARKER, inlineBody } from './report.mjs';

const API = process.env.GITHUB_API_URL || 'https://api.github.com';

function headers(token) {
  return {
    authorization: `Bearer ${token}`,
    accept: 'application/vnd.github+json',
    'x-github-api-version': '2022-11-28',
    'content-type': 'application/json',
  };
}

async function call(token, method, path, body) {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: headers(token),
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text();
    const err = new Error(`${method} ${path} -> ${res.status}: ${text.slice(0, 500)}`);
    err.status = res.status;
    throw err;
  }
  return res.status === 204 ? null : res.json();
}

export function client({ token, owner, repo, pull }) {
  const base = `/repos/${owner}/${repo}`;

  return {
    async pullRequest() {
      return call(token, 'GET', `${base}/pulls/${pull}`);
    },

    /** One summary comment that gets rewritten instead of a new one per push. */
    async upsertSummary(body) {
      const comments = await call(token, 'GET', `${base}/issues/${pull}/comments?per_page=100`);
      const mine = comments.find((c) => typeof c.body === 'string' && c.body.includes(MARKER));
      if (mine) return call(token, 'PATCH', `${base}/issues/comments/${mine.id}`, { body });
      return call(token, 'POST', `${base}/issues/${pull}/comments`, { body });
    },

    /** Drop the previous run's inline comments so the diff does not accumulate them. */
    async clearInline() {
      const comments = await call(token, 'GET', `${base}/pulls/${pull}/comments?per_page=100`);
      let removed = 0;
      for (const c of comments) {
        if (typeof c.body !== 'string' || !c.body.includes(MARKER)) continue;
        try {
          await call(token, 'DELETE', `${base}/pulls/comments/${c.id}`);
          removed++;
        } catch {
          // a comment someone replied to cannot always be deleted; leave it
        }
      }
      return removed;
    },

    /**
     * Post findings as one review. GitHub rejects the whole review if any one
     * comment lands off the diff, so retry without the offenders.
     */
    async postReview(findings, summary) {
      const comments = findings.map((f) => ({
        path: f.file,
        line: f.line,
        side: 'RIGHT',
        body: inlineBody(f),
      }));
      const payload = { event: 'COMMENT', body: summary, comments };
      try {
        return await call(token, 'POST', `${base}/pulls/${pull}/reviews`, payload);
      } catch (e) {
        if (comments.length === 0) throw e;
        console.error(
          `review-bot: inline review rejected (${e.message}); posting without inline comments`
        );
        return call(token, 'POST', `${base}/pulls/${pull}/reviews`, {
          event: 'COMMENT',
          body: summary,
        });
      }
    },
  };
}
