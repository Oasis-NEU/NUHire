import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Pool } from 'mysql2';
import type { Response } from 'express';
import type { Server as SocketIOServer } from 'socket.io';
import { initializeSocketHandlers } from '../src/config/socket';
import { VoteController } from '../src/controller/vote.controller';
import type { AuthRequest } from '../src/models/AuthRequest';
import type { User } from '../src/models/User';

// The group vote end to end against a fake pool that keeps its rows in arrays:
// who a ballot is filed under, which group's rows each query touches, what the
// group room and the class's teachers hear, and how the final pick becomes the
// offer the professor accepts or rejects.

type Row = Record<string, unknown>;
type Emit = { room: string; event: string; payload: Row };

interface Member {
  id: number;
  email: string;
  group_id: number;
  class: number;
  present: boolean;
}

const CLASS = 1;
const advisor = { id: 1, email: 'advisor@northeastern.edu', affiliation: 'admin' as const };
const otherTeacher = { id: 2, email: 'prof9001@northeastern.edu', affiliation: 'admin' as const };
const moderators = [
  { admin_email: advisor.email, crn: CLASS },
  { admin_email: otherTeacher.email, crn: 9001 },
];

const student = (id: number, group = 2, present = true): Member => ({
  id,
  email: `student${id}@northeastern.edu`,
  group_id: group,
  class: CLASS,
  present,
});

interface Round {
  id: number;
  class: number;
  group_id: number;
  kind: string;
  round: number;
  options: string;
  status: string;
  winners: string | null;
  tied: string | null;
  decided_by: string | null;
  deadline_at: string | null;
}

// Answers each statement the vote code sends by what it is shaped like, from
// in-memory tables. Every statement and its params are recorded.
function fakeDb(members: Member[], opts: { resumes?: number[]; checked?: number[] } = {}) {
  const resumes = opts.resumes ?? [11, 12, 13];
  const rounds: Round[] = [];
  const ballots: { round_id: number; student_id: number; resume_id: number; vote: string }[] = [];
  const offers: { group_id: number; class_id: number; candidate_id: number; status: string }[] = [];
  const calls: { sql: string; params: unknown[] }[] = [];
  const connections = { checkedOut: 0, released: 0 };

  const roundRow = (r: Round): Row => ({ ...r });

  const query = async (sql: string, params: unknown[] = []): Promise<unknown[]> => {
    calls.push({ sql, params });
    if (sql.includes('SET present_at = ?')) return [{ affectedRows: 0 }];
    if (sql.includes('present_at IS NOT NULL')) {
      const [groupId, classId] = params;
      return [
        members
          .filter((m) => m.present && m.group_id === groupId && m.class === classId)
          .map((m) => ({ id: m.id, email: m.email, present_at: new Date() })),
      ];
    }
    if (sql.includes('FROM Users') && sql.includes('email = ?')) {
      return [members.filter((m) => m.email === params[0])];
    }
    if (sql.includes('FROM Moderator m')) {
      const [crn, email] = params;
      return [moderators.filter((m) => m.crn === crn && m.admin_email === email)];
    }
    if (sql.includes('FROM Step_Completion')) return [[]];
    if (sql.includes('FROM Resume_pdfs')) return [resumes.map((id) => ({ id }))];
    if (sql.includes('FROM Resume') && sql.includes('MAX(checked)')) {
      return [(opts.checked ?? []).map((n) => ({ resume_number: n }))];
    }
    if (sql.includes('FROM Candidates')) {
      return [[{ f_name: 'Ada', l_name: `Lovelace${params[0]}` }]];
    }
    if (sql.includes('FROM Group_Vote_Ballot b')) {
      const [classId, groupId, kind, studentId] = params;
      const mine = rounds.filter(
        (r) => r.class === classId && r.group_id === groupId && r.kind === kind
      );
      const latest = mine.sort((a, b) => b.round - a.round)[0];
      return [
        ballots
          .filter((b) => b.round_id === latest?.id && b.student_id === studentId)
          .map((b) => ({ resume_id: b.resume_id, vote: b.vote })),
      ];
    }
    if (sql.includes('SELECT status FROM Group_Vote_Round')) {
      const [id, classId, groupId] = params;
      return [
        rounds
          .filter((r) => r.id === id && r.class === classId && r.group_id === groupId)
          .map((r) => ({ status: r.status })),
      ];
    }
    if (sql.includes('FROM Group_Vote_Round') && sql.includes('kind = ?')) {
      const [classId, groupId, kind] = params;
      return [
        rounds
          .filter((r) => r.class === classId && r.group_id === groupId && r.kind === kind)
          .sort((a, b) => a.round - b.round)
          .map(roundRow),
      ];
    }
    if (sql.includes('FROM Group_Vote_Round WHERE class = ?')) {
      return [rounds.filter((r) => r.class === params[0]).map(roundRow)];
    }
    if (sql.startsWith('SELECT') && sql.includes('FROM Group_Vote_Ballot WHERE round_id = ?')) {
      return [ballots.filter((b) => b.round_id === params[0])];
    }
    if (sql.includes('INSERT IGNORE INTO Group_Vote_Round')) {
      const revote = sql.includes('deadline_at');
      const [classId, groupId, kind] = params as [number, number, string];
      const round = revote ? (params[3] as number) : 1;
      if (
        rounds.some(
          (r) =>
            r.class === classId && r.group_id === groupId && r.kind === kind && r.round === round
        )
      ) {
        return [{ affectedRows: 0 }];
      }
      rounds.push({
        id: rounds.length + 1,
        class: classId,
        group_id: groupId,
        kind,
        round,
        options: (revote ? params[4] : params[3]) as string,
        status: 'open',
        winners: null,
        tied: null,
        decided_by: null,
        deadline_at: revote ? (params[6] as string) : null,
      });
      return [{ affectedRows: 1 }];
    }
    if (sql.includes('UPDATE Group_Vote_Round')) {
      const id = params[params.length - 1];
      const round = rounds.find((r) => r.id === id)!;
      if (sql.includes("decided_by = 'majority'") || sql.includes("decided_by = 'professor'")) {
        round.status = 'decided';
        round.winners = params[0] as string;
        round.decided_by = sql.includes("'majority'") ? 'majority' : 'professor';
      } else {
        round.status = params[0] as string;
        round.winners = params[1] as string;
        round.tied = params[2] as string;
      }
      return [{ affectedRows: 1 }];
    }
    if (sql.includes('DELETE FROM Group_Vote_Ballot')) {
      const [roundId, studentId] = params;
      for (let i = ballots.length - 1; i >= 0; i--) {
        if (ballots[i].round_id === roundId && ballots[i].student_id === studentId)
          ballots.splice(i, 1);
      }
      return [{ affectedRows: 1 }];
    }
    if (sql.includes('INSERT INTO Group_Vote_Ballot')) {
      for (let i = 0; i < params.length; i += 5) {
        const [round_id, student_id, resume_id, vote] = params.slice(i, i + 4) as [
          number,
          number,
          number,
          string,
        ];
        const same = ballots.find(
          (b) => b.round_id === round_id && b.student_id === student_id && b.resume_id === resume_id
        );
        if (same) same.vote = vote;
        else ballots.push({ round_id, student_id, resume_id, vote });
      }
      return [{ affectedRows: 1 }];
    }
    if (sql.includes('INSERT INTO Offers')) {
      const [group_id, class_id, candidate_id] = params as number[];
      const same = offers.find((o) => o.group_id === group_id && o.class_id === class_id);
      if (same) same.candidate_id = candidate_id;
      else offers.push({ group_id, class_id, candidate_id, status: 'pending' });
      return [{ affectedRows: 1, insertId: 1 }];
    }
    throw new Error(`Unexpected query in fake pool: ${sql}`);
  };

  const conn = {
    query,
    beginTransaction: async () => {},
    commit: async () => {},
    rollback: async () => {},
    release: () => {
      connections.released++;
    },
  };

  const db = {
    promise: () => ({
      query,
      getConnection: async () => {
        connections.checkedOut++;
        return conn;
      },
    }),
    // emitToClassModerators's callback lookup.
    query: (sql: string, params: unknown[], cb: (err: null, rows: Row[]) => void) => {
      calls.push({ sql, params });
      cb(
        null,
        moderators.filter((m) => m.crn === params[0]).map((m) => ({ admin_email: m.admin_email }))
      );
    },
  } as unknown as Pool;

  return { db, rounds, ballots, offers, calls, connections };
}

function fakeIo() {
  const emitted: Emit[] = [];
  const io = {
    to: (room: string) => ({
      emit: (event: string, payload: Row) => emitted.push({ room, event, payload }),
    }),
  } as unknown as SocketIOServer;
  return { io, emitted };
}

// A socket.io server driven by hand, as in socketAuth.test.ts.
function fakeServer(db: Pool) {
  const { io: base, emitted } = fakeIo();
  let middleware: (socket: unknown, next: (err?: Error) => void) => void = () => {};
  let onConnection: (socket: unknown) => void = () => {};
  const io = {
    use: (fn: typeof middleware) => (middleware = fn),
    on: (_event: 'connection', fn: typeof onConnection) => (onConnection = fn),
    to: base.to,
  } as unknown as SocketIOServer;
  initializeSocketHandlers(io, db);

  const connect = (user: { id: number; email: string; affiliation: string }) => {
    const handlers: Record<string, (payload?: unknown) => void> = {};
    const own: { event: string; payload: unknown }[] = [];
    const socket = {
      id: `socket-${user.email}`,
      request: { user },
      data: {},
      on: (event: string, handler: (payload?: unknown) => void) => (handlers[event] = handler),
      join: () => {},
      emit: (event: string, payload: unknown) => own.push({ event, payload }),
      to: base.to,
    };
    middleware(socket, () => {});
    onConnection(socket);
    return { own, send: (event: string, payload?: unknown) => handlers[event]?.(payload) };
  };
  return { emitted, connect, io };
}

function fakeRes() {
  const out: { status: number; body: Row } = { status: 200, body: {} };
  const res = {
    status(code: number) {
      out.status = code;
      return res;
    },
    json(body: Row) {
      out.body = body;
      return res;
    },
  };
  return { res: res as unknown as Response, out };
}

const asReq = (user: Partial<User>, extra: Partial<AuthRequest> = {}) =>
  ({ user, params: {}, body: {}, query: {}, ...extra }) as unknown as AuthRequest;

const studentUser = (m: Member): Partial<User> => ({
  id: m.id,
  email: m.email,
  affiliation: 'student',
  group_id: m.group_id,
  class: m.class,
});

const settle = () => new Promise((resolve) => setTimeout(resolve, 50));
const events = (emitted: Emit[], name: string) => emitted.filter((e) => e.event === name);

// Each listed student casts their sheet over HTTP, in order.
async function castAll(
  controller: VoteController,
  kind: string,
  ballots: [Member, Row][]
): Promise<{ status: number; body: Row }[]> {
  const results = [];
  for (const [m, body] of ballots) {
    const { res, out } = fakeRes();
    await controller.castVote(asReq(studentUser(m), { params: { kind }, body }), res);
    results.push(out);
  }
  return results;
}

const sheet = (votes: Record<number, string>) => ({
  votes: Object.entries(votes).map(([resumeId, vote]) => ({ resumeId: Number(resumeId), vote })),
});

describe('group vote', () => {
  let warn: ReturnType<typeof vi.spyOn>;
  beforeEach(() => {
    warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
  });
  afterEach(() => {
    warn.mockRestore();
    vi.useRealTimers();
  });

  it("opens the caller's own group's vote from the session, not the URL", async () => {
    const me = student(10);
    const { db, rounds, calls } = fakeDb([me, student(20, 1)]);
    const { io, emitted } = fakeIo();
    const { res, out } = fakeRes();

    await new VoteController(db, io).getVoteState(
      asReq(studentUser(me), {
        params: { kind: 'resume_review', group_id: '1' } as never,
        query: { groupId: '1', classId: '9001' } as never,
      }),
      res
    );

    expect(out.status).toBe(200);
    expect(out.body).toMatchObject({
      classId: CLASS,
      groupId: 2,
      round: 1,
      status: 'open',
      options: [11, 12, 13],
      presentCount: 1,
      votedCount: 0,
      tally: null,
      myVotes: [],
    });
    expect(rounds).toHaveLength(1);
    expect(rounds[0]).toMatchObject({ class: CLASS, group_id: 2 });
    // Every vote statement is scoped by this group and class.
    for (const call of calls.filter(
      (c) => /Group_Vote_Round/.test(c.sql) && !/WHERE id = \?/.test(c.sql)
    )) {
      expect(call.params).toEqual(expect.arrayContaining([2, CLASS]));
    }
    expect(emitted).toEqual([
      expect.objectContaining({ room: 'group_2_class_1', event: 'groupVoteUpdated' }),
    ]);
    expect(emitted[0].payload).toMatchObject({ change: 'opened', round: 1 });
  });

  it('refuses a poll from someone who is not in a group', async () => {
    const { db } = fakeDb([]);
    const { io } = fakeIo();
    const { res, out } = fakeRes();
    await new VoteController(db, io).getVoteState(
      asReq(
        { id: 5, email: 'x@northeastern.edu', affiliation: 'student' },
        { params: { kind: 'final_pick' } }
      ),
      res
    );
    expect(out).toEqual({ status: 400, body: { error: 'You are not in a group yet' } });
  });

  it('files a socket ballot under the sender and their own group, whatever the payload says', async () => {
    const me = student(10);
    const { db, ballots, rounds } = fakeDb([me, student(11), student(30, 1)]);
    const { connect, emitted } = fakeServer(db);

    connect({ id: me.id, email: me.email, affiliation: 'student' }).send('castGroupVote', {
      kind: 'final_pick',
      resumeId: 11,
      group_id: 1,
      class: 9001,
      student_id: 30,
    });
    await settle();

    // No shortlist yet, so nothing is filed and the sender alone is told why.
    expect(ballots).toEqual([]);
    expect(rounds).toEqual([]);

    connect({ id: me.id, email: me.email, affiliation: 'student' }).send('castGroupVote', {
      kind: 'resume_review',
      resumeId: 12,
      vote: 'yes',
      group_id: 1,
      student_id: 30,
    });
    await settle();

    expect(rounds[0]).toMatchObject({ class: CLASS, group_id: 2 });
    expect(ballots).toEqual([{ round_id: 1, student_id: 10, resume_id: 12, vote: 'yes' }]);
    const updates = events(emitted, 'groupVoteUpdated');
    expect(updates.every((e) => e.room === 'group_2_class_1')).toBe(true);
    expect(updates.map((e) => e.payload.change)).toEqual(['opened', 'ballot']);
    // Progress only while open: the tally stays hidden.
    expect(updates[1].payload).toMatchObject({ votedCount: 0, presentCount: 2, tally: null });
  });

  it('tells only the sender when their ballot is refused', async () => {
    const me = student(10);
    const { db } = fakeDb([me]);
    const { connect, emitted } = fakeServer(db);
    const socket = connect({ id: me.id, email: me.email, affiliation: 'student' });

    socket.send('castGroupVote', { kind: 'final_pick', resumeId: 11 });
    await settle();

    expect(socket.own).toEqual([
      {
        event: 'groupVoteError',
        payload: { kind: 'final_pick', error: expect.stringMatching(/shortlist/) },
      },
    ]);
    expect(events(emitted, 'groupVoteUpdated')).toEqual([]);
  });

  it('decides a resume vote by the majority of present students, leaving the absent out', async () => {
    // Odd group of three present; student 14 is rostered but absent, and their
    // ballots would flip resume 12.
    const [a, b, c] = [student(10), student(11), student(12)];
    const absent = student(14, 2, false);
    const { db, rounds } = fakeDb([a, b, c, absent]);
    const { io, emitted } = fakeIo();
    const controller = new VoteController(db, io);

    const results = await castAll(controller, 'resume_review', [
      [absent, sheet({ 11: 'yes', 12: 'yes', 13: 'yes' })],
      [a, sheet({ 11: 'yes', 12: 'no', 13: 'no' })],
      [b, sheet({ 11: 'yes', 12: 'no', 13: 'yes' })],
      [c, sheet({ 11: 'no', 12: 'yes', 13: 'yes' })],
    ]);

    expect(results.every((r) => r.status === 200)).toBe(true);
    expect(rounds).toHaveLength(1);
    expect(rounds[0]).toMatchObject({ status: 'decided', decided_by: 'majority' });
    const last = results[results.length - 1].body;
    expect(last).toMatchObject({
      status: 'decided',
      result: [11, 13],
      presentCount: 3,
      votedCount: 3,
    });
    expect(last.tally).toEqual([
      { resumeId: 11, yes: 2, no: 1 },
      { resumeId: 12, yes: 1, no: 2 },
      { resumeId: 13, yes: 2, no: 1 },
    ]);
    const decided = events(emitted, 'groupVoteUpdated').filter(
      (e) => e.payload.change === 'decided'
    );
    expect(decided).toHaveLength(1);
    expect(decided[0].room).toBe('group_2_class_1');
  });

  it('opens one revote on a tie, escalates a second tie, and lets the professor decide', async () => {
    const [a, b] = [student(10), student(11)];
    const { db, rounds, connections } = fakeDb([a, b]);
    const { io, emitted } = fakeIo();
    const controller = new VoteController(db, io);

    // Even group of two: 11 is in, 12 ties, 13 is out.
    await castAll(controller, 'resume_review', [
      [a, sheet({ 11: 'yes', 12: 'yes', 13: 'no' })],
      [b, sheet({ 11: 'yes', 12: 'no', 13: 'no' })],
    ]);
    expect(rounds.map((r) => [r.round, r.status])).toEqual([
      [1, 'tied'],
      [2, 'open'],
    ]);
    expect(JSON.parse(rounds[1].options)).toEqual([12]);
    expect(rounds[1].deadline_at).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/);
    const revote = events(emitted, 'groupVoteUpdated').find((e) => e.payload.change === 'revote');
    expect(revote?.payload).toMatchObject({ round: 2, options: [12], status: 'open' });
    expect(revote?.payload.secondsLeft).toBeGreaterThan(50);

    // A vote on 11 in the revote is refused: only the tie is on the ballot.
    const [stray] = await castAll(controller, 'resume_review', [[a, sheet({ 11: 'no' })]]);
    expect(stray.status).toBe(400);

    await castAll(controller, 'resume_review', [
      [a, sheet({ 12: 'yes' })],
      [b, sheet({ 12: 'no' })],
    ]);
    expect(rounds[1].status).toBe('escalated');
    const escalated = events(emitted, 'groupVoteEscalated');
    expect(escalated).toEqual([
      {
        room: advisor.email,
        event: 'groupVoteEscalated',
        payload: { classId: CLASS, groupId: 2, kind: 'resume_review', tied: [12], winners: [] },
      },
    ]);
    expect(
      events(emitted, 'groupVoteUpdated').find((e) => e.payload.change === 'escalated')?.payload
    ).toMatchObject({ status: 'escalated', tied: [12], result: null });

    const { res, out } = fakeRes();
    await controller.decideVote(
      asReq(advisor, {
        body: { class_id: CLASS, group_id: 2, kind: 'resume_review', winners: [12] },
      }),
      res
    );
    expect(out.status).toBe(200);
    expect(out.body).toMatchObject({ status: 'decided', decidedBy: 'professor', result: [11, 12] });
    expect(
      events(emitted, 'groupVoteUpdated').find((e) => e.payload.change === 'professor_decided')
        ?.room
    ).toBe('group_2_class_1');
    expect(events(emitted, 'groupVoteResolved')).toEqual([
      {
        room: advisor.email,
        event: 'groupVoteResolved',
        payload: { classId: CLASS, groupId: 2, kind: 'resume_review', winners: [12] },
      },
    ]);
    // Every checked-out connection went back to the pool.
    expect(connections.released).toBe(connections.checkedOut);
  });

  it('escalates a revote that runs out of time, even after a restart, on the next poll', async () => {
    const [a, b] = [student(10), student(11)];
    const { db, rounds } = fakeDb([a, b], { checked: [11, 12] });
    const { io, emitted } = fakeIo();
    const controller = new VoteController(db, io);

    await castAll(controller, 'final_pick', [
      [a, { resumeId: 11 }],
      [b, { resumeId: 12 }],
    ]);
    expect(rounds[1]).toMatchObject({ round: 2, status: 'open' });

    // As if the API restarted and the deadline passed while it was down: no
    // timer survives, only the row.
    rounds[1].deadline_at = '2000-01-01 00:00:00';

    const late = await castAll(controller, 'final_pick', [[a, { resumeId: 11 }]]);
    expect(late[0]).toEqual({ status: 409, body: { error: expect.stringMatching(/Time is up/) } });
    expect(rounds[1].status).toBe('escalated');
    expect(events(emitted, 'groupVoteEscalated')[0].payload).toMatchObject({ tied: [11, 12] });

    const { res, out } = fakeRes();
    await controller.getVoteState(asReq(studentUser(b), { params: { kind: 'final_pick' } }), res);
    expect(out.body).toMatchObject({ status: 'escalated', round: 2, secondsLeft: null });
  });

  it('closes an untouched revote when its deadline passes, with no ballot or poll', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'Date'] });
    const [a, b] = [student(10), student(11)];
    const { db, rounds } = fakeDb([a, b], { checked: [11, 12] });
    const { io, emitted } = fakeIo();

    await castAll(new VoteController(db, io), 'final_pick', [
      [a, { resumeId: 11 }],
      [b, { resumeId: 12 }],
    ]);
    expect(rounds[1].status).toBe('open');

    await vi.advanceTimersByTimeAsync(62_000);
    expect(rounds[1].status).toBe('escalated');
    expect(events(emitted, 'groupVoteEscalated')).toHaveLength(1);
  });

  it('turns a decided final pick into the offer and tells the professor like makeOfferRequest', async () => {
    const [a, b, c] = [student(10), student(11), student(12)];
    const { db, offers } = fakeDb([a, b, c]);
    const { io, emitted } = fakeIo();
    const controller = new VoteController(db, io);

    // The shortlist comes from the group's decided resume vote.
    await castAll(controller, 'resume_review', [
      [a, sheet({ 11: 'yes', 12: 'yes', 13: 'no' })],
      [b, sheet({ 11: 'yes', 12: 'yes', 13: 'no' })],
      [c, sheet({ 11: 'no', 12: 'yes', 13: 'no' })],
    ]);

    const { res, out } = fakeRes();
    await controller.getVoteState(asReq(studentUser(a), { params: { kind: 'final_pick' } }), res);
    expect(out.body).toMatchObject({ round: 1, options: [11, 12] });

    // One pick each; a changed pick replaces the old one rather than adding a second.
    await castAll(controller, 'final_pick', [
      [a, { resumeId: 11 }],
      [a, { resumeId: 12 }],
      [b, { resumeId: 12 }],
      [c, { resumeId: 11 }],
    ]);

    expect(offers).toEqual([{ group_id: 2, class_id: CLASS, candidate_id: 12, status: 'pending' }]);
    expect(events(emitted, 'makeOfferRequest')).toEqual([
      {
        room: advisor.email,
        event: 'makeOfferRequest',
        payload: {
          classId: CLASS,
          groupId: 2,
          candidateId: 12,
          candidateName: 'Ada Lovelace12',
          firstName: 'Ada',
          lastName: 'Lovelace12',
        },
      },
    ]);
    expect(events(emitted, 'groupMemberOffer')).toEqual([
      expect.objectContaining({
        room: 'group_2_class_1',
        payload: expect.objectContaining({ candidateId: 12 }),
      }),
    ]);
    expect(
      events(emitted, 'groupVoteUpdated').find(
        (e) => e.payload.kind === 'final_pick' && e.payload.change === 'decided'
      )?.payload
    ).toMatchObject({ result: [12], decidedBy: 'majority' });
  });

  it("makes the professor's tiebreak on a final pick the offer, over the socket", async () => {
    const [a, b] = [student(10), student(11)];
    const { db, offers, rounds } = fakeDb([a, b], { checked: [11, 12] });
    const { connect, emitted, io } = fakeServer(db);
    const controller = new VoteController(db, io);

    await castAll(controller, 'final_pick', [
      [a, { resumeId: 11 }],
      [b, { resumeId: 12 }],
      [a, { resumeId: 11 }],
      [b, { resumeId: 12 }],
    ]);
    expect(rounds[1].status).toBe('escalated');

    // Neither a student nor a teacher of another class can settle it.
    for (const sender of [{ ...a, affiliation: 'student' }, otherTeacher]) {
      connect(sender).send('decideGroupVote', {
        classId: CLASS,
        groupId: 2,
        kind: 'final_pick',
        winners: [11],
      });
    }
    await settle();
    expect(offers).toEqual([]);

    const prof = connect(advisor);
    prof.send('decideGroupVote', { classId: CLASS, groupId: 2, kind: 'final_pick', winners: [13] });
    await settle();
    expect(prof.own).toEqual([
      {
        event: 'groupVoteError',
        payload: expect.objectContaining({ error: expect.stringMatching(/options/) }),
      },
    ]);

    prof.send('decideGroupVote', { classId: CLASS, groupId: 2, kind: 'final_pick', winners: [11] });
    await settle();
    expect(offers).toEqual([{ group_id: 2, class_id: CLASS, candidate_id: 11, status: 'pending' }]);
    expect(events(emitted, 'makeOfferRequest')).toHaveLength(1);
    expect(
      events(emitted, 'groupVoteUpdated').find((e) => e.payload.change === 'professor_decided')
    ).toMatchObject({ room: 'group_2_class_1', payload: { result: [11], decidedBy: 'professor' } });
  });

  it('lets the professor force a vote that is still open, the override every gate needs', async () => {
    const [a, b] = [student(10), student(11)];
    const { db } = fakeDb([a, b], { checked: [11, 12] });
    const { io } = fakeIo();
    const controller = new VoteController(db, io);
    await castAll(controller, 'final_pick', [[a, { resumeId: 11 }]]);

    const { res, out } = fakeRes();
    await controller.decideVote(
      asReq(advisor, { body: { class_id: CLASS, group_id: 2, kind: 'final_pick', winners: [12] } }),
      res
    );
    expect(out.body).toMatchObject({
      round: 1,
      status: 'decided',
      result: [12],
      decidedBy: 'professor',
    });
  });

  it("lists each group's current round for the professor's poll", async () => {
    const [a, b] = [student(10), student(11)];
    const c = student(20, 3);
    const { db } = fakeDb([a, b, c], { checked: [11, 12] });
    const { io } = fakeIo();
    const controller = new VoteController(db, io);
    await castAll(controller, 'final_pick', [
      [a, { resumeId: 11 }],
      [b, { resumeId: 12 }],
      [c, { resumeId: 11 }],
    ]);

    const { res, out } = fakeRes();
    await controller.getClassVotes(asReq(advisor, { params: { class_id: String(CLASS) } }), res);
    expect(out.body).toEqual([
      expect.objectContaining({
        groupId: 2,
        kind: 'final_pick',
        round: 2,
        status: 'open',
        options: [11, 12],
      }),
      expect.objectContaining({
        groupId: 3,
        kind: 'final_pick',
        round: 1,
        status: 'decided',
        winners: [11],
      }),
    ]);
  });

  it("returns only the caller's group when two groups vote at once", async () => {
    const mine = student(10);
    const theirs = student(20, 3);
    const { db } = fakeDb([mine, theirs], { checked: [11, 12] });
    const { io } = fakeIo();
    const controller = new VoteController(db, io);
    await castAll(controller, 'final_pick', [[theirs, { resumeId: 12 }]]);

    const { res, out } = fakeRes();
    await controller.getVoteState(
      asReq(studentUser(mine), { params: { kind: 'final_pick' } }),
      res
    );
    expect(out.body).toMatchObject({
      groupId: 2,
      round: 1,
      status: 'open',
      votedCount: 0,
      myVotes: [],
    });
  });
});
