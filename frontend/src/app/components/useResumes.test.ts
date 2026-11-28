import { afterEach, describe, expect, it, vi } from 'vitest';
import { loadResumes } from './useResumes';

// /resume_pdf requires a login and the API is another origin, so a request
// without credentials 401s for every student.

type Reply = { ok: boolean; status?: number; body?: unknown };
type Call = { url: string; init?: RequestInit };

function stubFetch(reply: Reply) {
  const calls: Call[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: RequestInit) => {
      calls.push({ url, init });
      return { ok: reply.ok, status: reply.status ?? 200, json: async () => reply.body };
    })
  );
  return calls;
}

const realFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = realFetch;
  vi.restoreAllMocks();
});

describe('loadResumes', () => {
  it("asks for the class's resumes with the session cookie", async () => {
    const rows = [
      {
        id: 1,
        title: 'a',
        file_path: 'uploads/a.pdf',
        class_id: 42,
        first_name: 'Aisha',
        last_name: 'Patel',
      },
    ];
    const calls = stubFetch({ ok: true, body: rows });
    expect(await loadResumes(42)).toEqual(rows);
    expect(calls[0].url).toMatch(/\/resume_pdf\?class_id=42$/);
    expect(calls[0].init?.credentials).toBe('include');
  });

  it('throws on an error status rather than returning the error body as resumes', async () => {
    stubFetch({ ok: false, status: 400, body: { error: 'class_id is required' } });
    await expect(loadResumes(42)).rejects.toThrow('400');
  });
});
