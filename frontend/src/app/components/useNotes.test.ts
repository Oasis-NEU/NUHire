import { afterEach, describe, expect, it, vi } from 'vitest';
import { loadNotes, saveNote } from './useNotes';

// loadNotes and saveNote are the frontend's only notes requests.

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

describe('loadNotes', () => {
  it('returns the notes the API sends, in its order', async () => {
    const notes = [
      { id: 2, content: 'newer' },
      { id: 1, content: 'older' },
    ];
    const calls = stubFetch({ ok: true, body: notes });
    expect(await loadNotes('student@example.test')).toEqual(notes);
    expect(calls[0].url).toMatch(/\/notes\?user_email=student%40example\.test$/);
    expect(calls[0].init?.credentials).toBe('include');
  });

  it('throws on an error status rather than returning the error body as notes', async () => {
    stubFetch({ ok: false, status: 503, body: { error: 'Failed to fetch notes' } });
    await expect(loadNotes('student@example.test')).rejects.toThrow();
  });
});

describe('saveNote', () => {
  it('posts the note with the session cookie', async () => {
    const calls = stubFetch({ ok: true, body: { id: 7, content: 'Strong Java' } });
    expect(await saveNote('student@example.test', 'Strong Java')).toEqual({
      id: 7,
      content: 'Strong Java',
    });
    expect(calls[0].url).toMatch(/\/notes$/);
    expect(calls[0].init?.method).toBe('POST');
    expect(calls[0].init?.credentials).toBe('include');
    expect(JSON.parse(String(calls[0].init?.body))).toEqual({
      user_email: 'student@example.test',
      content: 'Strong Java',
    });
  });

  it('throws on an error status so the caller keeps the draft', async () => {
    stubFetch({ ok: false, status: 400, body: { error: 'Note content is required' } });
    await expect(saveNote('student@example.test', 'x')).rejects.toThrow();
  });
});
