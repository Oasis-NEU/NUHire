import { afterEach, describe, expect, it, vi } from 'vitest';
import { joinCandidates, loadScreening, orderForScreen } from './useScreeningResults';
import type { ScreeningResult } from '../../types';

// loadScreening reads the group's results and the class's resumes together, so
// each card can name its candidate. Only the results request decides success.

type Reply = { ok: boolean; status?: number; body?: unknown };

function stubFetch(byPath: Record<string, Reply>) {
  const urls: string[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      urls.push(url);
      const key = Object.keys(byPath).find((path) => url.includes(path));
      const reply = (key && byPath[key]) || { ok: false, status: 500 };
      return {
        ok: reply.ok,
        status: reply.status ?? (reply.ok ? 200 : 500),
        json: async () => reply.body,
      };
    })
  );
  return urls;
}

const realFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = realFetch;
  vi.restoreAllMocks();
});

const result = (resumeId: number, fields: Partial<ScreeningResult> = {}): ScreeningResult => ({
  job_id: 7,
  resume_id: resumeId,
  status: 'pending',
  score: null,
  matched_keywords: [],
  missed_keywords: [],
  summary: null,
  ...fields,
});

describe('joinCandidates', () => {
  it("names each result by its candidate and keeps the result's fields", () => {
    const done = result(42, { status: 'done', score: 67, matched_keywords: ['SQL'] });
    expect(
      joinCandidates(
        [done],
        [{ id: 42, first_name: 'Maya', last_name: 'Collins', file_path: 'uploads/resumes/a.pdf' }]
      )
    ).toEqual([{ ...done, name: 'Maya Collins', filePath: 'uploads/resumes/a.pdf' }]);
  });

  it('falls back to the resume number when there is no candidate name', () => {
    expect(joinCandidates([result(9)], [])).toEqual([
      { ...result(9), name: 'Resume 9', filePath: null },
    ]);
    expect(joinCandidates([result(9)], [{ id: 9, first_name: null, last_name: '' }])[0].name).toBe(
      'Resume 9'
    );
  });
});

describe('loadScreening', () => {
  it("asks for this group's results for the posting, and the class's resumes", async () => {
    const urls = stubFetch({
      '/screening/101/3/jobs/7': { ok: true, body: [result(42)] },
      '/resume_pdf?class_id=101': {
        ok: true,
        body: [{ id: 42, first_name: 'Hana', last_name: 'Kobayashi' }],
      },
    });
    const loaded = await loadScreening(101, 3, 7);
    expect(loaded.error).toBeNull();
    expect(loaded.candidates?.map((c) => c.name)).toEqual(['Hana Kobayashi']);
    expect(urls).toHaveLength(2);
  });

  it('still shows every result when the resume list fails', async () => {
    stubFetch({ '/screening/': { ok: true, body: [result(42), result(43)] } });
    const loaded = await loadScreening(101, 3, 7);
    expect(loaded.candidates?.map((c) => c.name)).toEqual(['Resume 42', 'Resume 43']);
  });

  it('reports a refused group as "forbidden", and any other error as "failed"', async () => {
    stubFetch({ '/screening/': { ok: false, status: 403 } });
    expect(await loadScreening(101, 3, 7)).toEqual({ candidates: null, error: 'forbidden' });
    stubFetch({ '/screening/': { ok: false, status: 500 } });
    expect(await loadScreening(101, 3, 7)).toEqual({ candidates: null, error: 'failed' });
  });

  it('reports a request that throws as "network"', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new TypeError('Failed to fetch');
      })
    );
    expect(await loadScreening(101, 3, 7)).toEqual({ candidates: null, error: 'network' });
  });
});

describe('orderForScreen', () => {
  it('puts screened resumes first by score, then pending, then failed', () => {
    const candidates = joinCandidates(
      [
        result(1, { status: 'failed' }),
        result(2, { status: 'done', score: 40 }),
        result(3),
        result(4, { status: 'done', score: 90 }),
      ],
      []
    );
    expect(orderForScreen(candidates).map((c) => c.resume_id)).toEqual([4, 2, 3, 1]);
  });
});
