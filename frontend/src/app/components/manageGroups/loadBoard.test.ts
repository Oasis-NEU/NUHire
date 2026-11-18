import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Student } from '../../../types';
import { fetchGroupJob, loadBoard } from './loadBoard';

// loadBoard is everything the teacher's Manage Groups board draws for a class,
// fetched as one value. Every roster event reloads it, so one group's lookups
// failing must blank only that card, and a failed roster must fail loudly.

type Reply = { ok: boolean; body?: unknown } | Error;

// Answers each request by its path; a path with no reply gets a 404.
function stubApi(replies: Record<string, Reply>) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      const reply = replies[url] ?? { ok: false };
      if (reply instanceof Error) throw reply;
      return { ok: reply.ok, json: async () => reply.body };
    })
  );
}

const ok = (body: unknown) => ({ ok: true, body });

const student = (id: number, f_name: string, group_id: number | null): Student => ({
  id,
  email: `s${id}@example.test`,
  f_name,
  l_name: 'Test',
  group_id,
  class: 9001,
});

const realFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = realFetch;
  vi.restoreAllMocks();
});

describe('loadBoard', () => {
  it('draws a card per group in order, names sorted, ungrouped students last', async () => {
    const students = [
      student(1, 'Zoe', 2),
      student(2, 'Amir', 2),
      student(3, 'Bea', 1),
      student(4, 'Cal', null),
    ];
    stubApi({
      '/groups/students-by-class/9001': ok(students),
      '/groups?class=9001': ok([1, 2]),
      '/groups/started/9001/1': ok({ started: 1 }),
      '/jobs/assignment/1/9001': ok({ job: 'Carbonite' }),
      '/groups/getProgress/9001/1': ok({ progress: 'res_2' }),
      '/groups/started/9001/2': ok({ started: 0 }),
      '/jobs/assignment/2/9001': ok({ job: null }),
      '/groups/getProgress/9001/2': ok({ progress: null }),
    });

    const board = await loadBoard('9001');

    expect(board.students).toEqual(students);
    expect(board.groupIds).toEqual([1, 2]);
    expect(board.groups.map((g) => [g.group_id, g.students.map((s) => s.f_name)])).toEqual([
      [1, ['Bea']],
      [2, ['Amir', 'Zoe']],
      [-1, ['Cal']],
    ]);
    expect(board.groups[0]).toMatchObject({
      isStarted: true,
      jobAssignment: 'Carbonite',
      progress: 'res_2',
    });
    expect(board.groups[1]).toMatchObject({
      isStarted: false,
      jobAssignment: 'No job assigned',
      progress: 'none',
    });
    expect(board.groups[2]).toMatchObject({ isStarted: false, jobAssignment: 'N/A' });
  });

  it('blanks only the card whose lookups fail', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    stubApi({
      '/groups/students-by-class/9001': ok([student(1, 'Bea', 1), student(2, 'Amir', 2)]),
      '/groups?class=9001': ok([1, 2]),
      '/groups/started/9001/1': new TypeError('Failed to fetch'),
      '/jobs/assignment/1/9001': ok({ job: 'Carbonite' }),
      '/groups/getProgress/9001/1': ok({ progress: 'res_2' }),
      '/groups/started/9001/2': ok({ started: 1 }),
      '/jobs/assignment/2/9001': ok({ job: 'Two Six Labs' }),
      // getProgress for group 2 answers 404.
    });

    const board = await loadBoard('9001');

    expect(board.groups[0]).toMatchObject({
      isStarted: false,
      jobAssignment: 'No job assigned',
      progress: 'none',
    });
    expect(board.groups[1]).toMatchObject({
      isStarted: true,
      jobAssignment: 'Two Six Labs',
      progress: 'none',
    });
  });

  it('shows no cards for a class with no groups, even with ungrouped students', async () => {
    stubApi({
      '/groups/students-by-class/9001': ok([student(1, 'Bea', null)]),
      '/groups?class=9001': ok([]),
    });

    const board = await loadBoard('9001');

    expect(board.groups).toEqual([]);
    expect(board.students).toHaveLength(1);
  });

  it('throws when the roster cannot be loaded', async () => {
    stubApi({ '/groups?class=9001': ok([1]) });

    await expect(loadBoard('9001')).rejects.toThrow('class 9001');
  });
});

describe('fetchGroupJob', () => {
  it('falls back to "No job assigned" when the API has none', async () => {
    stubApi({ '/jobs/assignment/3/9001': ok({ job: null }) });
    expect(await fetchGroupJob('9001', 3)).toBe('No job assigned');
    expect(await fetchGroupJob('9001', 4)).toBe('No job assigned');
  });

  it('lets a network failure through for the caller to handle', async () => {
    stubApi({ '/jobs/assignment/3/9001': new TypeError('Failed to fetch') });
    await expect(fetchGroupJob('9001', 3)).rejects.toThrow('Failed to fetch');
  });
});
