import { describe, expect, it } from 'vitest';
import type { Pool } from 'mysql2';
import type { Response } from 'express';
import { InterviewController } from '../src/controller/interview.controller';
import { UserController } from '../src/controller/user.controller';
import type { AuthRequest } from '../src/models/AuthRequest';

// The frontend gates compare a count against GET /interview/group-size. When
// that size counted only present students and nobody had been stamped, it was
// 0 and every `count >= size` gate opened. When the finished count included
// rows the size did not, the interview gate's `count === total` never matched.

type Row = Record<string, unknown>;
type Call = { sql: string; params: unknown[] };

// `present` and `roster` are Users ids; `finished` are the Interview_Status
// rows with finished = 1 for this (group, class). The finished-count query is
// answered by counting the rows whose student is in its IN (...) list, so a
// test sees exactly which members the controller chose to count.
function fakeDb({
  present = [],
  roster = [],
  finished = [],
}: {
  present?: number[];
  roster?: number[];
  finished?: number[];
}) {
  const calls: Call[] = [];
  const query = async (sql: string, params: unknown[] = []) => {
    calls.push({ sql, params });
    if (sql.includes('present_at IS NOT NULL')) {
      return [present.map((id): Row => ({ id, present_at: new Date() }))];
    }
    if (sql.includes('SELECT id FROM Users')) return [roster.map((id): Row => ({ id }))];
    if (sql.includes('COUNT(*) AS finishedCount')) {
      const counted = new Set(params.slice(2));
      return [[{ finishedCount: finished.filter((id) => counted.has(id)).length }]];
    }
    return [{ affectedRows: 1 }];
  };
  const db = {
    promise: () => ({ query }),
    query: (sql: string, params: unknown[], cb: (err: null) => void) => {
      calls.push({ sql, params });
      cb(null);
    },
  } as unknown as Pool;
  return { db, calls };
}

function fakeIo() {
  const emits: { room: string; event: string; payload: unknown }[] = [];
  const io = {
    to: (room: string) => ({
      emit: (event: string, payload: unknown) => emits.push({ room, event, payload }),
    }),
  };
  return { io, emits };
}

function fakeRes() {
  const out: { status: number; body: unknown } = { status: 200, body: undefined };
  const res = {
    status(code: number) {
      out.status = code;
      return res;
    },
    json(body: unknown) {
      out.body = body;
      return res;
    },
  };
  return { res: res as unknown as Response, out };
}

const groupSize = async (db: Pool) => {
  const { res, out } = fakeRes();
  const req = { params: { group_id: '3', class_id: '42' } } as unknown as AuthRequest;
  await new InterviewController(db, fakeIo().io).getGroupSize(req, res);
  return out.body as { count: number };
};

describe('GET /interview/group-size', () => {
  it('counts only present members once anyone is stamped', async () => {
    const { db } = fakeDb({ present: [8, 9], roster: [8, 9, 10] });
    expect((await groupSize(db)).count).toBe(2);
  });

  it('falls back to the whole roster when nobody is stamped yet', async () => {
    // 0 here opened every gate on the client at 0 of 0.
    const { db, calls } = fakeDb({ present: [], roster: [8, 9, 10] });
    expect((await groupSize(db)).count).toBe(3);
    const rosterQuery = calls.find((c) => c.sql.includes('SELECT id FROM Users'))!;
    expect(rosterQuery.sql).toMatch(/class = \?/);
    expect(rosterQuery.params).toEqual(['3', '42']);
  });
});

describe('interview finished count', () => {
  it('counts only present members, so the count cannot pass the total', async () => {
    // 10 is on the roster and finished on some earlier visit but is not
    // present now; 7 was moved out and their row stayed behind.
    const { db, calls } = fakeDb({ present: [8, 9], roster: [8, 9, 10], finished: [7, 8, 10] });
    const { io, emits } = fakeIo();
    const { res } = fakeRes();
    const body = { student_id: 8, finished: true, group_id: 3, class: 42 };
    await new InterviewController(db, io).updateFinishedStatus({ body } as AuthRequest, res);

    expect(emits).toEqual([
      {
        room: 'group_3_class_42',
        event: 'interviewStatusUpdated',
        payload: { count: 1, total: 2 },
      },
    ]);
    const countQuery = calls.find((c) => c.sql.includes('finishedCount'))!;
    expect(countQuery.sql).toMatch(/JOIN Users u/);
    expect(countQuery.sql).toMatch(/s\.class = \?/);
    expect(countQuery.params).toEqual([3, 42, 8, 9]);
  });

  it('answers the poll with the same scoped count', async () => {
    const { db } = fakeDb({ present: [8, 9], finished: [7, 8, 9] });
    const { res, out } = fakeRes();
    const req = { query: { group_id: '3', class_id: '42' } } as unknown as AuthRequest;
    await new InterviewController(db, fakeIo().io).getFinishedCount(req, res);
    expect(out.body).toEqual({ finishedCount: 2 });
  });

  it('reports 0 of 0 for an empty group without querying the counts', async () => {
    const { db, calls } = fakeDb({});
    const { io, emits } = fakeIo();
    const { res } = fakeRes();
    const body = { student_id: 8, finished: true, group_id: 3, class: 42 };
    await new InterviewController(db, io).updateFinishedStatus({ body } as AuthRequest, res);
    expect(emits[0].payload).toEqual({ count: 0, total: 0 });
    expect(calls.some((c) => c.sql.includes('finishedCount'))).toBe(false);
  });
});

describe('POST /users/update-currentpage attendance', () => {
  const stamps = (calls: Call[]) => calls.filter((c) => c.sql.includes('SET present_at'));
  const call = async (user: Row) => {
    const { db, calls } = fakeDb({});
    const { res } = fakeRes();
    const req = {
      user,
      body: { page: 'dashboard', user_email: 'someone-else@x.edu' },
    } as unknown as AuthRequest;
    await new UserController(db, fakeIo().io).updateCurrentPage(req, res);
    return calls;
  };

  it('stamps the session user, not the email in the body', async () => {
    const calls = await call({
      id: 8,
      email: 's8@x.edu',
      affiliation: 'student',
      present_at: null,
    });
    expect(stamps(calls)).toHaveLength(1);
    expect(stamps(calls)[0].sql).toMatch(/present_at IS NULL/);
    expect(stamps(calls)[0].params).toEqual([8]);
  });

  it('does not write again once the student is stamped', async () => {
    const calls = await call({
      id: 8,
      email: 's8@x.edu',
      affiliation: 'student',
      present_at: new Date(),
    });
    expect(stamps(calls)).toHaveLength(0);
  });

  it('does not stamp an admin', async () => {
    const calls = await call({
      id: 1,
      email: 'prof@x.edu',
      affiliation: 'admin',
      present_at: null,
    });
    expect(stamps(calls)).toHaveLength(0);
  });
});
