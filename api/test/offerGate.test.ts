import { describe, expect, it } from 'vitest';
import type { Pool } from 'mysql2';
import type { Response } from 'express';
import type { Server as SocketIOServer } from 'socket.io';
import { OfferGateController } from '../src/controller/offerGate.controller';
import type { AuthRequest } from '../src/models/AuthRequest';

// The teacher's override for make offer's "everyone confirms" gate. It must
// only act on a group that is actually at make offer, record the release in
// Step_Completion (so it survives a restart and the barrier poll sees it), and
// tell only that group's room.

type Call = { sql: string; params: unknown[] };

function fakeDb({ roster = [{ id: 7 }, { id: 8 }], steps = ['offer', 'offer'] } = {}) {
  const calls: Call[] = [];
  const done = { committed: false, rolledBack: false, released: false };
  const conn = {
    beginTransaction: async () => {},
    commit: async () => {
      done.committed = true;
    },
    rollback: async () => {
      done.rolledBack = true;
    },
    release: () => {
      done.released = true;
    },
    query: async (sql: string, params: unknown[]) => {
      calls.push({ sql, params });
      if (sql.includes('FROM Users')) return [roster];
      if (sql.includes('FROM Progress')) return [steps.map((step) => ({ step }))];
      return [{ affectedRows: roster.length }];
    },
  };
  const db = { promise: () => ({ getConnection: async () => conn }) } as unknown as Pool;
  return { db, calls, done };
}

function fakeIo() {
  const emits: { room: string; event: string; payload: unknown }[] = [];
  const io = {
    to: (room: string) => ({
      emit: (event: string, payload: unknown) => emits.push({ room, event, payload }),
    }),
  } as unknown as SocketIOServer;
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

const request = (body: Record<string, unknown>) =>
  ({ body, user: { email: 'prof@x.edu' } }) as unknown as AuthRequest;

const completionWrites = (calls: Call[]) =>
  calls.filter((c) => c.sql.includes('INTO Step_Completion'));

describe('release-offer-gate', () => {
  it('records offer done for every member and tells the group', async () => {
    const { db, calls, done } = fakeDb();
    const { io, emits } = fakeIo();
    const { res, out } = fakeRes();

    await new OfferGateController(db, io).release(request({ class_id: 42, group_id: 3 }), res);

    expect(out.status).toBe(200);
    expect(done).toEqual({ committed: true, rolledBack: false, released: true });
    const [write] = completionWrites(calls);
    expect(write.params).toEqual([
      7,
      42,
      3,
      'offer',
      expect.any(String),
      8,
      42,
      3,
      'offer',
      expect.any(String),
    ]);
    expect(emits).toEqual([
      {
        room: 'group_3_class_42',
        event: 'offerGateReleased',
        payload: { groupId: 3, classId: 42 },
      },
    ]);
  });

  it('scopes the roster and progress reads by group and class', async () => {
    const { db, calls } = fakeDb();
    const { res } = fakeRes();
    await new OfferGateController(db, fakeIo().io).release(
      request({ class_id: 42, group_id: 3 }),
      res
    );

    const reads = calls.filter((c) => /^\s*SELECT/i.test(c.sql));
    expect(reads.map((c) => c.params)).toEqual([
      [3, 42],
      [42, 3],
    ]);
  });

  it('refuses a group that is not at make offer, writing and emitting nothing', async () => {
    // One member still on interviews puts the group at interview.
    const { db, calls, done } = fakeDb({ steps: ['offer', 'interview'] });
    const { io, emits } = fakeIo();
    const { res, out } = fakeRes();

    await new OfferGateController(db, io).release(request({ class_id: 42, group_id: 3 }), res);

    expect(out.status).toBe(400);
    expect(out.body).toMatchObject({ current_step: 'interview' });
    expect(completionWrites(calls)).toHaveLength(0);
    expect(emits).toHaveLength(0);
    expect(done).toMatchObject({ committed: false, rolledBack: true, released: true });
  });

  it('answers 404 for a group with nobody on its roster', async () => {
    const { db, calls } = fakeDb({ roster: [] });
    const { io, emits } = fakeIo();
    const { res, out } = fakeRes();

    await new OfferGateController(db, io).release(request({ class_id: 42, group_id: 3 }), res);

    expect(out.status).toBe(404);
    expect(completionWrites(calls)).toHaveLength(0);
    expect(emits).toHaveLength(0);
  });

  it('answers 400 without touching the database when a field is missing', async () => {
    const { db, calls } = fakeDb();
    const { res, out } = fakeRes();

    await new OfferGateController(db, fakeIo().io).release(request({ class_id: 42 }), res);

    expect(out.status).toBe(400);
    expect(calls).toHaveLength(0);
  });
});
