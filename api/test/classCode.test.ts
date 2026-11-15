import { describe, expect, it, vi } from 'vitest';
import type { NextFunction, Response } from 'express';
import type { Pool } from 'mysql2';
import {
  CLASS_CODE_ALPHABET,
  CLASS_CODE_LENGTH,
  generateClassCode,
  normalizeClassCode,
} from '../src/config/classCode';
import { ClassCodeController } from '../src/controller/classCode.controller';
import { requireClassModerator } from '../src/middleware/auth.middleware';
import type { AuthRequest } from '../src/models/AuthRequest';
import type { User } from '../src/models/User';

// Students join a class by typing the code their professor shows. These pin the
// code's shape, the one-class-at-a-time confirm, and who may see a code.

type Call = { sql: string; params: unknown[] };

// `codes` maps code -> crn, the ClassCodes table as the join lookup sees it.
function fakeDb(codes: Record<string, number> = {}, codeForClass?: string) {
  const calls: Call[] = [];
  const txCalls: Call[] = [];
  const conn = {
    beginTransaction: vi.fn(async () => {}),
    commit: vi.fn(async () => {}),
    rollback: vi.fn(async () => {}),
    release: vi.fn(),
    query: async (sql: string, params: unknown[]) => {
      txCalls.push({ sql, params });
      return [{ affectedRows: 1 }];
    },
  };
  const query = async (sql: string, params: unknown[]) => {
    calls.push({ sql, params });
    if (sql.startsWith('SELECT crn FROM ClassCodes')) {
      const crn = codes[params[0] as string];
      return [crn === undefined ? [] : [{ crn }]];
    }
    if (sql.startsWith('SELECT code FROM ClassCodes')) {
      return [codeForClass ? [{ code: codeForClass }] : []];
    }
    if (sql.startsWith('SELECT')) return [[]];
    return [{ affectedRows: 1 }];
  };
  const db = {
    promise: () => ({ query, getConnection: async () => conn }),
    // emitToClassModerators still uses the callback form.
    query: (_sql: string, _params: unknown[], cb: (err: null, rows: unknown[]) => void) =>
      cb(null, [{ admin_email: 'prof@northeastern.edu' }]),
  } as unknown as Pool;
  return { db, calls, txCalls, conn };
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
  const out: { status: number; body: Record<string, unknown> } = { status: 200, body: {} };
  const res = {
    status(code: number) {
      out.status = code;
      return res;
    },
    json(body: Record<string, unknown>) {
      out.body = body;
      return res;
    },
  };
  return { res: res as unknown as Response, out };
}

const student = (over: Partial<User> = {}): Partial<User> => ({
  id: 7,
  email: 's@northeastern.edu',
  affiliation: 'student',
  class: 101,
  group_id: 3,
  ...over,
});

async function join(db: Pool, user: Partial<User>, body: Record<string, unknown>) {
  const { io, emits } = fakeIo();
  const { res, out } = fakeRes();
  await new ClassCodeController(db, io as never).joinClass(
    { user, body } as unknown as AuthRequest,
    res
  );
  return { out, emits };
}

const writes = (calls: Call[]) => calls.filter((c) => /^\s*(UPDATE|DELETE|INSERT)/i.test(c.sql));

describe('class code format', () => {
  it('is six characters from the unambiguous alphabet', () => {
    for (let i = 0; i < 200; i++) {
      const code = generateClassCode();
      expect(code).toHaveLength(CLASS_CODE_LENGTH);
      expect([...code].every((ch) => CLASS_CODE_ALPHABET.includes(ch))).toBe(true);
    }
    expect(CLASS_CODE_ALPHABET).not.toMatch(/[0O1IL]/);
  });

  it('normalizes case and surrounding space', () => {
    expect(normalizeClassCode('  abc234 ')).toBe('ABC234');
  });

  it('rejects anything that cannot be a code', () => {
    for (const bad of ['', 'ABC23', 'ABC2345', 'ABC10O', 'AB C23', 42, null, undefined]) {
      expect(normalizeClassCode(bad)).toBeNull();
    }
  });
});

describe('POST /classes/join', () => {
  it('joins a student with no class yet, ungrouped, and grants the student role', async () => {
    const { db, txCalls, conn } = fakeDb({ ABC234: 202 });
    const { out, emits } = await join(
      db,
      student({ affiliation: 'none', class: undefined, group_id: undefined }),
      { code: 'abc234' }
    );
    expect(out.status).toBe(200);
    expect(out.body).toMatchObject({ classId: 202, changed: true });
    const update = txCalls.find((c) => c.sql.includes('UPDATE Users'));
    expect(update?.sql).toMatch(/class = \?, group_id = NULL, affiliation = 'student'/);
    expect(update?.params).toEqual([202, expect.any(String), 7]);
    expect(conn.commit).toHaveBeenCalled();
    expect(conn.release).toHaveBeenCalled();
    // The new class's professor hears about it; there was no old group to tell.
    expect(emits).toEqual([
      { room: 'prof@northeastern.edu', event: 'userAdded', payload: undefined },
    ]);
  });

  it('is a no-op for a student already in that class, and keeps their group', async () => {
    const { db, calls, txCalls } = fakeDb({ ABC234: 101 });
    const { out } = await join(db, student(), { code: 'ABC234' });
    expect(out.status).toBe(200);
    expect(out.body).toMatchObject({ classId: 101, changed: false });
    expect(writes(calls)).toHaveLength(0);
    expect(txCalls).toHaveLength(0);
  });

  it('asks for a confirm before leaving another class, and writes nothing', async () => {
    const { db, calls, txCalls } = fakeDb({ ABC234: 202 });
    const { out, emits } = await join(db, student(), { code: 'ABC234' });
    expect(out.status).toBe(409);
    expect(out.body).toMatchObject({ requiresConfirm: true, currentClass: 101 });
    expect(typeof out.body.error).toBe('string');
    expect(writes(calls)).toHaveLength(0);
    expect(txCalls).toHaveLength(0);
    expect(emits).toHaveLength(0);
  });

  it('treats a truthy non-boolean confirm as no confirm', async () => {
    const { db, txCalls } = fakeDb({ ABC234: 202 });
    const { out } = await join(db, student(), { code: 'ABC234', confirm: 'yes' });
    expect(out.status).toBe(409);
    expect(txCalls).toHaveLength(0);
  });

  it('with confirm, moves them ungrouped and clears their old gate rows', async () => {
    const { db, txCalls, conn } = fakeDb({ ABC234: 202 });
    const { out, emits } = await join(db, student(), { code: 'ABC234', confirm: true });
    expect(out.status).toBe(200);
    expect(out.body).toMatchObject({ classId: 202, changed: true });
    expect(conn.beginTransaction).toHaveBeenCalled();
    expect(txCalls.map((c) => c.sql.trim().split(/\s+/).slice(0, 3).join(' '))).toEqual([
      'DELETE FROM GroupConfirmations',
      'DELETE FROM Step_Completion',
      'UPDATE Users SET',
    ]);
    expect(txCalls[0].params).toEqual([7]);
    expect(txCalls[1].params).toEqual([7]);
    // Votes, ratings and notes stay, as when a professor moves a student.
    expect(txCalls.some((c) => /Resume|Notes|Interview/.test(c.sql))).toBe(false);
    expect(emits).toContainEqual({
      room: 'group_3_class_101',
      event: 'studentRemovedFromGroup',
      payload: { email: 's@northeastern.edu', groupId: 3, classId: 101 },
    });
    // Both classes' professors refresh their rosters.
    expect(emits.filter((e) => e.event === 'userAdded')).toHaveLength(2);
  });

  it('rolls back and answers with a fixed message when the move fails', async () => {
    const { db, conn } = fakeDb({ ABC234: 202 });
    conn.query = async () => {
      throw new Error("Table 'Users' is locked");
    };
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { out } = await join(db, student(), { code: 'ABC234', confirm: true });
    error.mockRestore();
    expect(out.status).toBe(500);
    expect(out.body.error).not.toMatch(/Users/);
    expect(conn.rollback).toHaveBeenCalled();
    expect(conn.release).toHaveBeenCalled();
  });

  it('rejects a malformed code with a 400 before touching the database', async () => {
    const { db, calls } = fakeDb({ ABC234: 202 });
    const { out } = await join(db, student(), { code: 'ABC' });
    expect(out.status).toBe(400);
    expect(out.body.error).toMatch(/6-character/);
    expect(calls).toHaveLength(0);
  });

  it('rejects an unknown or replaced code with a 404 that says why', async () => {
    // The class's code was regenerated to XYZ789, so ABC234 no longer matches.
    const { db, txCalls } = fakeDb({ XYZ789: 202 });
    const { out } = await join(db, student(), { code: 'ABC234', confirm: true });
    expect(out.status).toBe(404);
    expect(out.body.error).toMatch(/replaced/);
    expect(txCalls).toHaveLength(0);
  });

  it('refuses professors', async () => {
    const { db, calls } = fakeDb({ ABC234: 202 });
    const { out } = await join(db, student({ affiliation: 'admin' }), { code: 'ABC234' });
    expect(out.status).toBe(403);
    expect(calls).toHaveLength(0);
  });
});

describe('professor code endpoints', () => {
  async function call(db: Pool, action: 'getClassCode' | 'regenerateClassCode', classId = '202') {
    const { io } = fakeIo();
    const { res, out } = fakeRes();
    await new ClassCodeController(db, io as never)[action](
      { params: { class_id: classId } } as unknown as AuthRequest,
      res
    );
    return out;
  }

  it('returns the existing code without writing', async () => {
    const { db, calls } = fakeDb({}, 'ABC234');
    const out = await call(db, 'getClassCode');
    expect(out.body).toEqual({ classId: 202, code: 'ABC234' });
    expect(writes(calls)).toHaveLength(0);
  });

  it('creates a code the first time a class is asked for one', async () => {
    const { db, calls } = fakeDb();
    const out = await call(db, 'getClassCode');
    expect(normalizeClassCode(out.body.code)).toBe(out.body.code);
    const insert = writes(calls)[0];
    expect(insert.sql).toMatch(/^INSERT INTO ClassCodes/);
    expect(insert.params[0]).toBe(202);
  });

  it('retries when a generated code is already taken', async () => {
    const { db, calls } = fakeDb();
    let inserts = 0;
    const base = db.promise();
    const query = async (sql: string, params: unknown[]) => {
      if (sql.startsWith('INSERT') && inserts++ === 0) {
        calls.push({ sql, params });
        throw Object.assign(new Error('Duplicate'), { code: 'ER_DUP_ENTRY' });
      }
      return base.query(sql, params);
    };
    (db as unknown as { promise: () => unknown }).promise = () => ({ ...base, query });
    const out = await call(db, 'getClassCode');
    expect(out.status).toBe(200);
    expect(calls.filter((c) => c.sql.startsWith('INSERT'))).toHaveLength(2);
  });

  it('regenerate replaces the stored code in place', async () => {
    const { db, calls } = fakeDb({}, 'ABC234');
    const out = await call(db, 'regenerateClassCode');
    const update = writes(calls)[0];
    expect(update.sql).toMatch(/^UPDATE ClassCodes SET code = \?/);
    expect(update.params).toEqual([out.body.code, expect.any(String), 202]);
  });

  it('only a professor who teaches the class gets past the route guard', async () => {
    const guard = async (affiliation: string, moderatorRows: unknown[]) => {
      const db = {
        promise: () => ({ query: async () => [moderatorRows] }),
      } as unknown as Pool;
      const { res, out } = fakeRes();
      const next = vi.fn() as unknown as NextFunction;
      const req = {
        isAuthenticated: () => true,
        user: { email: 'prof@northeastern.edu', affiliation },
        params: { class_id: '202' },
      } as unknown as AuthRequest;
      requireClassModerator(db)(req, res, next);
      await new Promise((resolve) => setImmediate(resolve));
      return { next, out };
    };
    expect((await guard('admin', [{ 1: 1 }])).next).toHaveBeenCalled();
    const otherProf = await guard('admin', []);
    expect(otherProf.next).not.toHaveBeenCalled();
    expect(otherProf.out.status).toBe(403);
    const aStudent = await guard('student', [{ 1: 1 }]);
    expect(aStudent.next).not.toHaveBeenCalled();
    expect(aStudent.out.status).toBe(403);
  });
});
