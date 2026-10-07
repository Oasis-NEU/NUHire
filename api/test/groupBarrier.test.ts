import { describe, expect, it } from 'vitest';
import type { Pool } from 'mysql2';
import { evaluateGroupBarrier, RES_REVIEW_BARRIER_STEP } from '../src/config/socket';

// evaluateGroupBarrier decides whether a group may leave a "wait for everyone"
// step. Every bug in it has stranded a real group mid-class, so each case below
// is one of those ways.

type Row = Record<string, unknown>;

function fakeDb(members: Row[], completions: Row[]) {
  const calls: { sql: string; params: unknown[] }[] = [];
  const db = {
    promise: () => ({
      query: async (sql: string, params: unknown[]) => {
        calls.push({ sql, params });
        return [sql.includes('FROM Users') ? members : completions];
      },
    }),
  } as unknown as Pool;
  return { db, calls };
}

describe('evaluateGroupBarrier', () => {
  it('releases once every current member has finished', async () => {
    const { db } = fakeDb([{ id: 8 }, { id: 9 }], [{ student_id: 8 }, { student_id: 9 }]);
    const status = await evaluateGroupBarrier(db, 1, 1, RES_REVIEW_BARRIER_STEP);
    expect(status).toEqual({ step: 'res_1', completedCount: 2, totalCount: 2, released: true });
  });

  it('holds the group while anyone is still working', async () => {
    const { db } = fakeDb([{ id: 8 }, { id: 9 }], [{ student_id: 8 }]);
    const status = await evaluateGroupBarrier(db, 1, 1, RES_REVIEW_BARRIER_STEP);
    expect(status.released).toBe(false);
    expect(status.completedCount).toBe(1);
  });

  it('ignores completions left behind by a student moved to another group', async () => {
    // Student 7 finished, then was moved out. Counting their row would release
    // a group in which student 9 has not finished.
    const { db } = fakeDb([{ id: 8 }, { id: 9 }], [{ student_id: 8 }, { student_id: 7 }]);
    const status = await evaluateGroupBarrier(db, 1, 1, RES_REVIEW_BARRIER_STEP);
    expect(status.completedCount).toBe(1);
    expect(status.released).toBe(false);
  });

  it('does not release a group with nobody in it', async () => {
    const { db } = fakeDb([], []);
    const status = await evaluateGroupBarrier(db, 1, 1, RES_REVIEW_BARRIER_STEP);
    expect(status.totalCount).toBe(0);
    expect(status.released).toBe(false);
  });

  it('scopes both queries by class as well as group', async () => {
    // group_id alone collides across course sections.
    const { db, calls } = fakeDb([{ id: 8 }], [{ student_id: 8 }]);
    await evaluateGroupBarrier(db, 42, 3, RES_REVIEW_BARRIER_STEP);
    expect(calls).toHaveLength(2);
    for (const call of calls) {
      expect(call.sql).toMatch(/group_id = \?/);
      expect(call.sql).toMatch(/class = \?/);
      expect(call.params).toEqual(expect.arrayContaining([3, 42]));
    }
  });
});
