// src/config/groupVote.ts
//
// A group's votes, read from and written to MySQL. config/votes.ts decides
// what a set of ballots means; this file loads the rows, applies what it
// decides, and tells the group. Every outcome is re-derived from the tables on
// each ballot, poll and room join, so nothing here is lost when the API
// restarts mid-vote (AGENTS.md rule 2).

import { Pool, ResultSetHeader, RowDataPacket } from 'mysql2';
import type { PoolConnection } from 'mysql2/promise';
import { Server as SocketIOServer } from 'socket.io';
import { dbNow } from './database';
import { announceGroupOffer, emitToClassModerators, presentMembers } from './socket';
import {
  decideRound,
  isExpired,
  professorPick,
  readBallot,
  REVOTE_SECONDS,
  secondsLeft,
  tallyRound,
  countedBallots,
  voteResult,
  votedCount,
  isVoteError,
} from './votes';
import { UPSERT_GROUP_OFFER_SQL } from '../controller/offer.controller';
import {
  MyVote,
  VOTE_KINDS,
  VoteBallot,
  VoteChange,
  VoteError,
  VoteKind,
  VoteRound,
  VoteState,
} from '../models/Vote';

// The pool's promise wrapper and a checked-out connection both answer this.
type Queryable = Pick<PoolConnection, 'query'>;

export function isVoteKind(kind: unknown): kind is VoteKind {
  return typeof kind === 'string' && (VOTE_KINDS as readonly string[]).includes(kind);
}

const roomOf = (classId: number, groupId: number) => `group_${groupId}_class_${classId}`;

// Times come back as dbNow()-shaped strings so they compare with dbNow()
// directly; mysql2 would otherwise read them as the API host's local time.
const ROUND_COLUMNS = `id, class, group_id, kind, round, options, status, winners, tied,
  decided_by, DATE_FORMAT(deadline_at, '%Y-%m-%d %H:%i:%s') AS deadline_at`;

// mysql2 parses JSON columns, but a driver setting or a test can hand over the text.
function ids(value: unknown): number[] {
  const parsed: unknown = typeof value === 'string' ? JSON.parse(value) : value;
  return Array.isArray(parsed) ? parsed.map(Number) : [];
}

function toRound(row: RowDataPacket): VoteRound {
  return {
    id: row.id,
    classId: row.class,
    groupId: row.group_id,
    kind: row.kind,
    round: row.round,
    options: ids(row.options),
    status: row.status,
    winners: ids(row.winners),
    tied: ids(row.tied),
    decidedBy: row.decided_by ?? null,
    deadlineAt: row.deadline_at ?? null,
  };
}

// Every round of one vote for one group, oldest first. The last is current.
// `lock` takes the rows FOR UPDATE, so a ballot, an evaluation and a professor
// decision on the same vote run one at a time.
async function loadRounds(
  q: Queryable,
  classId: number,
  groupId: number,
  kind: VoteKind,
  lock = false
): Promise<VoteRound[]> {
  const [rows] = await q.query<RowDataPacket[]>(
    `SELECT ${ROUND_COLUMNS} FROM Group_Vote_Round
      WHERE class = ? AND group_id = ? AND kind = ?
      ORDER BY round${lock ? ' FOR UPDATE' : ''}`,
    [classId, groupId, kind]
  );
  return rows.map(toRound);
}

async function loadBallots(q: Queryable, roundId: number): Promise<VoteBallot[]> {
  const [rows] = await q.query<(RowDataPacket & VoteBallot)[]>(
    'SELECT student_id, resume_id, vote FROM Group_Vote_Ballot WHERE round_id = ?',
    [roundId]
  );
  return rows;
}

async function presentIds(db: Pool, classId: number, groupId: number): Promise<number[]> {
  return (await presentMembers(db, classId, groupId)).map((member) => member.id);
}

// What round 1 is a vote between.
//
// resume_review: every resume uploaded for the class, the same list the review
// pages show. final_pick: the shortlist the group's resume vote decided. A
// group that never held a resume vote falls back to the shortlist checkboxes
// (`Resume`.`checked`), which still exist beside this until OAS-366 removes them.
async function firstRoundOptions(
  db: Pool,
  classId: number,
  groupId: number,
  kind: VoteKind
): Promise<number[] | VoteError> {
  if (kind === 'resume_review') {
    const [rows] = await db
      .promise()
      .query<RowDataPacket[]>('SELECT id FROM Resume_pdfs WHERE class_id = ? ORDER BY id', [
        classId,
      ]);
    if (rows.length === 0) {
      return { status: 409, error: 'No resumes have been uploaded for this class yet' };
    }
    return rows.map((row) => Number(row.id));
  }

  const review = await loadRounds(db.promise(), classId, groupId, 'resume_review');
  let shortlist: number[];
  if (review.length > 0) {
    const decided = voteResult('resume_review', review);
    if (decided === null) {
      return { status: 409, error: 'Your group has not finished voting on resumes' };
    }
    shortlist = decided;
  } else {
    const [rows] = await db.promise().query<RowDataPacket[]>(
      `SELECT resume_number FROM Resume
        WHERE group_id = ? AND class = ?
        GROUP BY resume_number
       HAVING MAX(checked) = 1
        ORDER BY resume_number`,
      [groupId, classId]
    );
    shortlist = rows.map((row) => Number(row.resume_number));
  }
  if (shortlist.length === 0) {
    return { status: 409, error: 'Your group has no shortlisted candidates to choose from' };
  }
  return shortlist;
}

// The vote's rounds, opening round 1 if nobody has yet. The unique key on
// (class, group_id, kind, round) means two members arriving at once open one
// round between them, and only the one whose insert landed announces it.
export async function ensureRound(
  io: SocketIOServer,
  db: Pool,
  classId: number,
  groupId: number,
  kind: VoteKind
): Promise<VoteRound[] | VoteError> {
  const existing = await loadRounds(db.promise(), classId, groupId, kind);
  if (existing.length > 0) return existing;

  const options = await firstRoundOptions(db, classId, groupId, kind);
  if (isVoteError(options)) return options;

  const [result] = await db.promise().query<ResultSetHeader>(
    `INSERT IGNORE INTO Group_Vote_Round
       (class, group_id, kind, round, options, status, opened_at)
     VALUES (?, ?, ?, 1, ?, 'open', ?)`,
    [classId, groupId, kind, JSON.stringify(options), dbNow()]
  );
  if (result.affectedRows === 1) {
    await broadcastVote(io, db, classId, groupId, kind, 'opened');
  }
  return loadRounds(db.promise(), classId, groupId, kind);
}

// The vote as the group page shows it.
export async function voteState(
  db: Pool,
  classId: number,
  groupId: number,
  kind: VoteKind
): Promise<VoteState> {
  const rounds = await loadRounds(db.promise(), classId, groupId, kind);
  const present = await presentIds(db, classId, groupId);
  const current = rounds[rounds.length - 1];
  const base = { classId, groupId, kind, presentCount: present.length };

  if (!current) {
    return {
      ...base,
      round: null,
      status: null,
      options: [],
      votedCount: 0,
      secondsLeft: null,
      tied: [],
      decidedBy: null,
      result: null,
      tally: null,
    };
  }

  const ballots = await loadBallots(db.promise(), current.id);
  const open = current.status === 'open';
  return {
    ...base,
    round: current.round,
    status: current.status,
    options: current.options,
    votedCount: votedCount(kind, current.options, present, ballots),
    secondsLeft: open ? secondsLeft(current.deadlineAt, dbNow()) : null,
    tied: current.status === 'escalated' ? current.tied : [],
    decidedBy: current.decidedBy,
    result: voteResult(kind, rounds),
    tally: open
      ? null
      : tallyRound(current.options, countedBallots(current.options, present, ballots)),
  };
}

// The caller's own ballot on the current round, for their own poll only.
export async function myVotes(
  db: Pool,
  classId: number,
  groupId: number,
  kind: VoteKind,
  studentId: number
): Promise<MyVote[]> {
  const [rows] = await db.promise().query<RowDataPacket[]>(
    `SELECT b.resume_id, b.vote
       FROM Group_Vote_Ballot b
       JOIN Group_Vote_Round r ON r.id = b.round_id
      WHERE r.class = ? AND r.group_id = ? AND r.kind = ? AND b.student_id = ?
        AND r.round = (SELECT MAX(round) FROM Group_Vote_Round
                        WHERE class = ? AND group_id = ? AND kind = ?)`,
    [classId, groupId, kind, studentId, classId, groupId, kind]
  );
  return rows.map((row) => ({ resumeId: Number(row.resume_id), vote: row.vote }));
}

// Tell the whole group, through its room, what the vote looks like now.
export async function broadcastVote(
  io: SocketIOServer,
  db: Pool,
  classId: number,
  groupId: number,
  kind: VoteKind,
  change: VoteChange
): Promise<void> {
  const state = await voteState(db, classId, groupId, kind);
  io.to(roomOf(classId, groupId)).emit('groupVoteUpdated', { ...state, change });
}

// A nudge so a revote nobody touches still escalates on time. Only a trigger:
// the deadline itself is in Group_Vote_Round, and after a restart the next
// ballot, poll or room join finds it passed and escalates the same way.
function scheduleDeadlineCheck(
  io: SocketIOServer,
  db: Pool,
  classId: number,
  groupId: number,
  kind: VoteKind
): void {
  const timer = setTimeout(
    () => {
      evaluateVote(io, db, classId, groupId, kind).catch((err) => {
        console.error(`Could not close the revote for group ${groupId} in ${classId}:`, err);
      });
    },
    (REVOTE_SECONDS + 1) * 1000
  );
  timer.unref?.();
}

// Run a write against a checked-out connection inside a transaction (AGENTS.md
// rule 6), and always hand the connection back.
async function inTransaction<T>(db: Pool, work: (conn: PoolConnection) => Promise<T>): Promise<T> {
  const conn = await db.promise().getConnection();
  try {
    await conn.beginTransaction();
    const result = await work(conn);
    await conn.commit();
    return result;
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

// Move the vote on if its current round can be settled: everyone present has
// voted, or the revote's deadline has passed. Safe to call as often as anyone
// likes; most calls find an open round still waiting and write nothing.
export async function evaluateVote(
  io: SocketIOServer,
  db: Pool,
  classId: number,
  groupId: number,
  kind: VoteKind
): Promise<VoteChange | null> {
  // A cheap look first, so a room join on a decided vote never takes a lock.
  const peek = await loadRounds(db.promise(), classId, groupId, kind);
  if (peek[peek.length - 1]?.status !== 'open') return null;

  const present = await presentIds(db, classId, groupId);
  const outcome = await inTransaction(db, async (conn) => {
    const rounds = await loadRounds(conn, classId, groupId, kind, true);
    const current = rounds[rounds.length - 1];
    if (current?.status !== 'open') return null;

    const now = dbNow();
    const transition = decideRound({
      kind,
      round: current.round,
      options: current.options,
      presentIds: present,
      ballots: await loadBallots(conn, current.id),
      deadlineAt: current.deadlineAt,
      now,
    });
    if (transition.action === 'wait') return null;

    if (transition.action === 'decide') {
      await conn.query(
        `UPDATE Group_Vote_Round
            SET status = 'decided', winners = ?, decided_by = 'majority', closed_at = ?
          WHERE id = ?`,
        [JSON.stringify(transition.winners), now, current.id]
      );
      if (kind === 'final_pick') {
        await conn.query(UPSERT_GROUP_OFFER_SQL, [groupId, classId, transition.winners[0]]);
      }
      return { change: 'decided' as const, winners: transition.winners, tied: [] };
    }

    const status = transition.action === 'revote' ? 'tied' : 'escalated';
    await conn.query(
      `UPDATE Group_Vote_Round SET status = ?, winners = ?, tied = ?, closed_at = ? WHERE id = ?`,
      [status, JSON.stringify(transition.winners), JSON.stringify(transition.tied), now, current.id]
    );
    if (transition.action === 'escalate') {
      return { change: 'escalated' as const, winners: transition.winners, tied: transition.tied };
    }

    await conn.query(
      `INSERT IGNORE INTO Group_Vote_Round
         (class, group_id, kind, round, options, status, opened_at, deadline_at)
       VALUES (?, ?, ?, ?, ?, 'open', ?, ?)`,
      [
        classId,
        groupId,
        kind,
        current.round + 1,
        JSON.stringify(transition.tied),
        now,
        dbNow(new Date(Date.now() + REVOTE_SECONDS * 1000)),
      ]
    );
    return { change: 'revote' as const, winners: transition.winners, tied: transition.tied };
  });

  if (!outcome) return null;

  await broadcastVote(io, db, classId, groupId, kind, outcome.change);
  if (outcome.change === 'revote') {
    scheduleDeadlineCheck(io, db, classId, groupId, kind);
  } else if (outcome.change === 'escalated') {
    emitToClassModerators(io, db, classId, 'groupVoteEscalated', {
      classId,
      groupId,
      kind,
      tied: outcome.tied,
      winners: outcome.winners,
    });
  } else if (kind === 'final_pick') {
    await announceGroupOffer(io, db, classId, groupId, outcome.winners[0]);
  }
  return outcome.change;
}

// Both votes, for a room join: a reconnected student may be the first to see
// that a revote ran out while the API was down.
export async function reevaluateVotes(
  io: SocketIOServer,
  db: Pool,
  classId: number,
  groupId: number
): Promise<void> {
  for (const kind of VOTE_KINDS) {
    await evaluateVote(io, db, classId, groupId, kind);
  }
}

// Record a student's ballot on their own group's current round, then see
// whether it settles the round. The student is whoever is logged in; the input
// only says what they voted.
export async function castBallot(
  io: SocketIOServer,
  db: Pool,
  student: { id: number; classId: number; groupId: number },
  kind: unknown,
  input: unknown
): Promise<VoteError | null> {
  if (!isVoteKind(kind)) return { status: 400, error: 'Unknown vote' };
  const { id, classId, groupId } = student;

  const rounds = await ensureRound(io, db, classId, groupId, kind);
  if (isVoteError(rounds)) return rounds;
  const current = rounds[rounds.length - 1];

  if (current.status === 'open' && isExpired(current.deadlineAt, dbNow())) {
    await evaluateVote(io, db, classId, groupId, kind);
    return { status: 409, error: 'Time is up on this revote; your professor will decide' };
  }

  const votes = readBallot(kind, current.options, input);
  if (isVoteError(votes)) return votes;

  const refusal = await inTransaction(db, async (conn): Promise<VoteError | null> => {
    // Re-read under the lock: the round may have closed since the look above,
    // and a ballot landing on a closed round would change nothing but confuse
    // the count shown afterwards.
    const [locked] = await conn.query<RowDataPacket[]>(
      'SELECT status FROM Group_Vote_Round WHERE id = ? AND class = ? AND group_id = ? FOR UPDATE',
      [current.id, classId, groupId]
    );
    if (locked[0]?.status !== 'open') return { status: 409, error: 'This vote is closed' };

    // One pick per student in final_pick, so a changed pick replaces the old one.
    if (kind === 'final_pick') {
      await conn.query('DELETE FROM Group_Vote_Ballot WHERE round_id = ? AND student_id = ?', [
        current.id,
        id,
      ]);
    }
    const now = dbNow();
    await conn.query(
      `INSERT INTO Group_Vote_Ballot (round_id, student_id, resume_id, vote, voted_at)
       VALUES ${votes.map(() => '(?, ?, ?, ?, ?)').join(', ')}
       ON DUPLICATE KEY UPDATE vote = VALUES(vote), voted_at = VALUES(voted_at)`,
      votes.flatMap((v) => [current.id, id, v.resumeId, v.vote, now])
    );
    return null;
  });
  if (refusal) return refusal;

  const change = await evaluateVote(io, db, classId, groupId, kind);
  if (!change) await broadcastVote(io, db, classId, groupId, kind, 'ballot');
  return null;
}

// The professor settles a group's vote: the tiebreak on an escalated round, or
// the override on one still open. A decided final pick becomes the offer.
export async function professorDecide(
  io: SocketIOServer,
  db: Pool,
  decision: { classId: number; groupId: number; kind: unknown; winners: unknown }
): Promise<VoteError | null> {
  const { classId, groupId, kind, winners } = decision;
  if (!isVoteKind(kind)) return { status: 400, error: 'Unknown vote' };
  if (!Number.isInteger(classId) || !Number.isInteger(groupId)) {
    return { status: 400, error: 'class and group are required' };
  }

  const outcome = await inTransaction(db, async (conn) => {
    const rounds = await loadRounds(conn, classId, groupId, kind, true);
    const current = rounds[rounds.length - 1];
    if (!current) {
      return { status: 404, error: 'This group has not started that vote' } as VoteError;
    }
    const pick = professorPick(kind, current, winners);
    if (isVoteError(pick)) return pick;

    await conn.query(
      `UPDATE Group_Vote_Round
          SET status = 'decided', winners = ?, decided_by = 'professor', closed_at = ?
        WHERE id = ?`,
      [JSON.stringify(pick.winners), dbNow(), current.id]
    );
    if (kind === 'final_pick') {
      await conn.query(UPSERT_GROUP_OFFER_SQL, [groupId, classId, pick.winners[0]]);
    }
    return pick;
  });
  if (isVoteError(outcome)) return outcome;

  await broadcastVote(io, db, classId, groupId, kind, 'professor_decided');
  // Every teacher of the class clears the escalation, not only the one who chose.
  emitToClassModerators(io, db, classId, 'groupVoteResolved', {
    classId,
    groupId,
    kind,
    winners: outcome.winners,
  });
  if (kind === 'final_pick') {
    await announceGroupOffer(io, db, classId, groupId, outcome.winners[0]);
  }
  return null;
}

// Each group's current round of each vote in a class, for the professor's view
// of who is waiting on them. The non-socket way to find an escalation.
export async function classVotes(db: Pool, classId: number): Promise<VoteRound[]> {
  const [rows] = await db
    .promise()
    .query<RowDataPacket[]>(
      `SELECT ${ROUND_COLUMNS} FROM Group_Vote_Round WHERE class = ? ORDER BY group_id, kind, round`,
      [classId]
    );
  const current = new Map<string, VoteRound>();
  for (const round of rows.map(toRound)) current.set(`${round.groupId}:${round.kind}`, round);
  return [...current.values()];
}
