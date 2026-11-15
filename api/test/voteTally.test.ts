import { describe, expect, it } from 'vitest';
import {
  countedBallots,
  decideRound,
  isExpired,
  professorPick,
  readBallot,
  REVOTE_SECONDS,
  secondsLeft,
  settle,
  tallyRound,
  voteResult,
  votedCount,
} from '../src/config/votes';
import type { VoteBallot, VoteKind, VoteRound, YesNo } from '../src/models/Vote';

// The rules a group vote is decided by, on plain arrays. A wrong answer here
// shortlists the wrong resumes or sends the wrong offer in front of the class.

const yes = (student: number, resume: number): VoteBallot => ({
  student_id: student,
  resume_id: resume,
  vote: 'yes',
});
// A final-pick ballot is the student's one 'yes'.
const pick = yes;

// Every student's yes/no on every resume, from a grid: sheet[student][i] is
// their vote on options[i].
function sheet(options: number[], votes: Record<number, YesNo[]>): VoteBallot[] {
  return Object.entries(votes).flatMap(([student, row]) =>
    row.map((vote, i) => ({ student_id: Number(student), resume_id: options[i], vote }))
  );
}

const NOW = '2026-11-15 10:00:00';
const decide = (
  kind: VoteKind,
  round: number,
  options: number[],
  presentIds: number[],
  ballots: VoteBallot[],
  deadlineAt: string | null = null,
  now = NOW
) => decideRound({ kind, round, options, presentIds, ballots, deadlineAt, now });

describe('resume review tally', () => {
  const options = [11, 12, 13];

  it('shortlists a yes-majority in an odd group, where a full vote cannot tie', () => {
    const ballots = sheet(options, {
      1: ['yes', 'no', 'yes'],
      2: ['yes', 'no', 'no'],
      3: ['no', 'no', 'yes'],
    });
    expect(decide('resume_review', 1, options, [1, 2, 3], ballots)).toMatchObject({
      action: 'decide',
      winners: [11, 13],
    });
  });

  it('treats an even split as a tie for that resume only', () => {
    const ballots = sheet(options, {
      1: ['yes', 'yes', 'no'],
      2: ['yes', 'no', 'no'],
      3: ['no', 'yes', 'no'],
      4: ['yes', 'no', 'no'],
    });
    // 11: 3-1 in, 12: 2-2 tie, 13: 0-4 out.
    expect(decide('resume_review', 1, options, [1, 2, 3, 4], ballots)).toMatchObject({
      action: 'revote',
      winners: [11],
      tied: [12],
    });
  });

  it('counts yes and no per resume', () => {
    const tally = tallyRound(
      options,
      sheet(options, { 1: ['yes', 'no', 'yes'], 2: ['no', 'no', 'yes'] })
    );
    expect(tally).toEqual([
      { resumeId: 11, yes: 1, no: 1 },
      { resumeId: 12, yes: 0, no: 2 },
      { resumeId: 13, yes: 2, no: 0 },
    ]);
    expect(settle('resume_review', tally)).toEqual({ winners: [13], tied: [11] });
  });
});

describe('final pick tally', () => {
  const options = [21, 22, 23];

  it('elects a single top choice in an odd group', () => {
    const ballots = [pick(1, 21), pick(2, 21), pick(3, 22)];
    expect(decide('final_pick', 1, options, [1, 2, 3], ballots)).toMatchObject({
      action: 'decide',
      winners: [21],
    });
  });

  it('elects a plurality winner even without a strict majority', () => {
    // 2 of 5 is not a majority of the group, but it is strictly more than any other.
    const ballots = [pick(1, 21), pick(2, 21), pick(3, 22), pick(4, 23), pick(5, 24)];
    expect(decide('final_pick', 1, [...options, 24], [1, 2, 3, 4, 5], ballots)).toMatchObject({
      action: 'decide',
      winners: [21],
    });
  });

  it('ties an even group split down the middle', () => {
    const ballots = [pick(1, 21), pick(2, 21), pick(3, 22), pick(4, 22)];
    expect(decide('final_pick', 1, options, [1, 2, 3, 4], ballots)).toMatchObject({
      action: 'revote',
      winners: [],
      tied: [21, 22],
    });
  });

  it('ties a three-way split in an odd group', () => {
    const ballots = [pick(1, 21), pick(2, 22), pick(3, 23)];
    expect(decide('final_pick', 1, options, [1, 2, 3], ballots)).toMatchObject({
      action: 'revote',
      tied: [21, 22, 23],
    });
  });

  it('only ties at the top: a lower tie does not matter', () => {
    const ballots = [pick(1, 21), pick(2, 21), pick(3, 22), pick(4, 23)];
    expect(decide('final_pick', 1, options, [1, 2, 3, 4], ballots)).toMatchObject({
      action: 'decide',
      winners: [21],
    });
  });
});

describe('who counts', () => {
  it('leaves absent students out of the count and never waits for them', () => {
    // Student 9 is on the roster but not present; their ballots exist (left
    // from before they were moved, say) and would turn a 1-1 tie into a win.
    const ballots = [pick(1, 21), pick(2, 22), pick(9, 21)];
    expect(decide('final_pick', 1, [21, 22], [1, 2], ballots)).toMatchObject({
      action: 'revote',
      tied: [21, 22],
    });
    expect(countedBallots([21, 22], [1, 2], ballots)).toHaveLength(2);
  });

  it('waits until every present member has finished their ballot', () => {
    const options = [11, 12];
    // Student 2 has voted on one of two resumes.
    const ballots = [yes(1, 11), yes(1, 12), yes(2, 11)];
    expect(decide('resume_review', 1, options, [1, 2], ballots)).toEqual({ action: 'wait' });
    expect(votedCount('resume_review', options, [1, 2], ballots)).toBe(1);
  });

  it('ignores ballots on options not in this round', () => {
    // A revote over 12 only; a stray ballot on 11 must not finish anyone.
    expect(votedCount('resume_review', [12], [1], [yes(1, 11)])).toBe(0);
  });

  it('does not decide for a group with nobody present', () => {
    expect(decide('final_pick', 1, [21], [], [])).toEqual({ action: 'wait' });
  });
});

describe('revote and escalation', () => {
  it('a revote is held over the tied options only', () => {
    const r1 = decide(
      'final_pick',
      1,
      [21, 22, 23],
      [1, 2, 3, 4],
      [pick(1, 21), pick(2, 22), pick(3, 21), pick(4, 22)]
    );
    expect(r1).toMatchObject({ action: 'revote', tied: [21, 22] });
    // Ballots on 23 in the revote are ignored; it is not on the ballot.
    expect(votedCount('final_pick', [21, 22], [1], [pick(1, 23)])).toBe(0);
  });

  it('a second tie goes to the professor', () => {
    const ballots = [pick(1, 21), pick(2, 22)];
    expect(decide('final_pick', 2, [21, 22], [1, 2], ballots)).toMatchObject({
      action: 'escalate',
      tied: [21, 22],
    });
  });

  it('a revote that settles is decided by majority', () => {
    const ballots = [pick(1, 21), pick(2, 21)];
    expect(decide('final_pick', 2, [21, 22], [1, 2], ballots)).toMatchObject({
      action: 'decide',
      winners: [21],
    });
  });

  it('a revote that runs out of time goes to the professor', () => {
    const deadline = '2026-11-15 10:01:00';
    const ballots = [pick(1, 21)];
    expect(
      decide('final_pick', 2, [21, 22], [1, 2], ballots, deadline, '2026-11-15 10:00:59')
    ).toEqual({
      action: 'wait',
    });
    expect(decide('final_pick', 2, [21, 22], [1, 2], ballots, deadline, deadline)).toMatchObject({
      action: 'escalate',
      winners: [],
      tied: [21, 22],
    });
  });

  it('round 1 has no time limit', () => {
    expect(
      decide('final_pick', 1, [21, 22], [1, 2], [pick(1, 21)], null, '2030-01-01 00:00:00')
    ).toEqual({
      action: 'wait',
    });
  });

  it('counts the revote time in whole seconds, from strings in UTC', () => {
    expect(REVOTE_SECONDS).toBeGreaterThan(0);
    expect(secondsLeft('2026-11-15 10:01:00', '2026-11-15 10:00:15')).toBe(45);
    expect(secondsLeft('2026-11-15 10:01:00', '2026-11-15 10:02:00')).toBe(0);
    expect(secondsLeft(null, NOW)).toBeNull();
    expect(isExpired(null, NOW)).toBe(false);
  });
});

describe('professor decision', () => {
  const escalated: Pick<VoteRound, 'status' | 'options' | 'winners' | 'tied'> = {
    status: 'escalated',
    options: [11, 12, 13],
    winners: [11],
    tied: [12, 13],
  };

  it('settles the tied resumes and keeps what the round already shortlisted', () => {
    expect(professorPick('resume_review', escalated, [13])).toEqual({ winners: [11, 13] });
    expect(professorPick('resume_review', escalated, [])).toEqual({ winners: [11] });
  });

  it('refuses a pick that was not tied', () => {
    expect(professorPick('resume_review', escalated, [11, 99])).toMatchObject({ status: 400 });
  });

  it('picks exactly one final candidate', () => {
    const tie = { status: 'escalated' as const, options: [21, 22], winners: [], tied: [21, 22] };
    expect(professorPick('final_pick', tie, [22])).toEqual({ winners: [22] });
    expect(professorPick('final_pick', tie, [21, 22])).toMatchObject({ status: 400 });
    expect(professorPick('final_pick', tie, [])).toMatchObject({ status: 400 });
    expect(professorPick('final_pick', tie, 'x')).toMatchObject({ status: 400 });
  });

  it('can force an open round from any of its options', () => {
    const open = { status: 'open' as const, options: [21, 22, 23], winners: [], tied: [] };
    expect(professorPick('final_pick', open, [23])).toEqual({ winners: [23] });
  });

  it('refuses a round that is already decided', () => {
    const done = { status: 'decided' as const, options: [21], winners: [21], tied: [] };
    expect(professorPick('final_pick', done, [21])).toMatchObject({ status: 409 });
  });
});

describe('vote result', () => {
  it('a shortlist is what both rounds settled together', () => {
    expect(
      voteResult('resume_review', [
        { round: 2, status: 'decided', winners: [14] },
        { round: 1, status: 'tied', winners: [11, 12] },
      ])
    ).toEqual([11, 12, 14]);
  });

  it('a final pick is the last round winner', () => {
    expect(
      voteResult('final_pick', [
        { round: 1, status: 'tied', winners: [] },
        { round: 2, status: 'decided', winners: [22] },
      ])
    ).toEqual([22]);
  });

  it('has no result while the vote is open or escalated', () => {
    expect(voteResult('final_pick', [{ round: 2, status: 'escalated', winners: [] }])).toBeNull();
    expect(voteResult('final_pick', [])).toBeNull();
  });
});

describe('reading a ballot', () => {
  it('takes a whole resume sheet or a single click', () => {
    expect(
      readBallot('resume_review', [11, 12], {
        votes: [
          { resumeId: 11, vote: 'yes' },
          { resumeId: 12, vote: 'no' },
        ],
      })
    ).toHaveLength(2);
    expect(readBallot('resume_review', [11], { resumeId: 11, vote: 'no' })).toEqual([
      { resumeId: 11, vote: 'no' },
    ]);
  });

  it('refuses a resume not on this round, or a vote that is not yes or no', () => {
    expect(readBallot('resume_review', [12], { resumeId: 11, vote: 'yes' })).toMatchObject({
      status: 400,
    });
    expect(readBallot('resume_review', [11], { resumeId: 11, vote: 'maybe' })).toMatchObject({
      status: 400,
    });
    expect(readBallot('resume_review', [11], { votes: [] })).toMatchObject({ status: 400 });
  });

  it('takes one candidate for a final pick', () => {
    expect(readBallot('final_pick', [21, 22], { resumeId: 22 })).toEqual([
      { resumeId: 22, vote: 'yes' },
    ]);
    expect(readBallot('final_pick', [21, 22], { resumeId: 23 })).toMatchObject({ status: 400 });
    expect(readBallot('final_pick', [21], undefined)).toMatchObject({ status: 400 });
  });
});
