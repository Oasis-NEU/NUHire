// src/config/votes.ts
//
// How a group vote is counted and what happens next. No database here on
// purpose: config/groupVote.ts loads the rows, asks these functions, and writes
// whatever they decide, so every rule below is testable on plain arrays.

import type {
  MyVote,
  OptionTally,
  VoteBallot,
  VoteError,
  VoteKind,
  VoteRound,
  YesNo,
} from '../models/Vote';

// How long the one revote stays open before it goes to the professor. Short on
// purpose: it settles a tie between options everyone has already discussed.
export const REVOTE_SECONDS = 60;

// Round 1 is the vote, round 2 the revote. A tie in round 2 goes to the professor.
export const REVOTE_ROUND = 2;

export type RoundTransition =
  // Still waiting for ballots; nothing to write.
  | { action: 'wait' }
  // Settled by majority.
  | { action: 'decide'; winners: number[]; tally: OptionTally[] }
  // Round 1 tied: open the revote over `tied`. `winners` are the options the
  // round did settle, which for resume_review are already shortlisted.
  | { action: 'revote'; winners: number[]; tied: number[]; tally: OptionTally[] }
  // The revote tied or ran out of time: the professor settles `tied`.
  | { action: 'escalate'; winners: number[]; tied: number[]; tally: OptionTally[] };

// Ballots that count: from a present member, on an option in this round. A
// student who was moved out of the group, or never showed up, leaves rows that
// must not tip a tally they are no longer part of.
export function countedBallots(
  options: number[],
  presentIds: number[],
  ballots: VoteBallot[]
): VoteBallot[] {
  const present = new Set(presentIds);
  const onBallot = new Set(options);
  return ballots.filter((b) => present.has(b.student_id) && onBallot.has(b.resume_id));
}

export function tallyRound(options: number[], counted: VoteBallot[]): OptionTally[] {
  return options.map((resumeId) => {
    const mine = counted.filter((b) => b.resume_id === resumeId);
    return {
      resumeId,
      yes: mine.filter((b) => b.vote === 'yes').length,
      no: mine.filter((b) => b.vote === 'no').length,
    };
  });
}

// Present members who have finished their ballot: a vote on every option for
// resume_review, a pick for final_pick.
export function votedCount(
  kind: VoteKind,
  options: number[],
  presentIds: number[],
  ballots: VoteBallot[]
): number {
  const counted = countedBallots(options, presentIds, ballots);
  return presentIds.filter((id) => {
    const mine = counted.filter((b) => b.student_id === id);
    return kind === 'resume_review' ? mine.length === options.length : mine.length > 0;
  }).length;
}

// What a complete set of ballots settles and what it leaves tied.
//
// resume_review: more yes than no shortlists a resume, more no drops it, equal
// is a tie for that resume alone. final_pick: one option with strictly more
// picks than every other wins; any tie at the top is a tie between those.
export function settle(
  kind: VoteKind,
  tally: OptionTally[]
): { winners: number[]; tied: number[] } {
  if (kind === 'resume_review') {
    return {
      winners: tally.filter((t) => t.yes > t.no).map((t) => t.resumeId),
      tied: tally.filter((t) => t.yes === t.no).map((t) => t.resumeId),
    };
  }
  const top = Math.max(...tally.map((t) => t.yes));
  const leaders = tally.filter((t) => t.yes === top).map((t) => t.resumeId);
  return leaders.length === 1 ? { winners: leaders, tied: [] } : { winners: [], tied: leaders };
}

// dbNow() strings sort in time order, so comparing them needs no time zone.
export function isExpired(deadlineAt: string | null, now: string): boolean {
  return deadlineAt !== null && now >= deadlineAt;
}

export function secondsLeft(deadlineAt: string | null, now: string): number | null {
  if (deadlineAt === null) return null;
  const toMs = (s: string) => Date.parse(`${s.replace(' ', 'T')}Z`);
  return Math.max(0, Math.round((toMs(deadlineAt) - toMs(now)) / 1000));
}

// The next step for an open round, given who is present and what they cast.
//
// A round is decided only when every present member has finished their ballot,
// so a late voter is never outvoted before they could vote. Nobody present is
// unknown, not decided: settling on 0 of 0 would decide for an empty group.
// The revote is also closed by its deadline, and a revote that times out goes
// to the professor rather than being settled by whoever happened to vote.
export function decideRound(input: {
  kind: VoteKind;
  round: number;
  options: number[];
  presentIds: number[];
  ballots: VoteBallot[];
  deadlineAt: string | null;
  now: string;
}): RoundTransition {
  const { kind, round, options, presentIds, ballots, deadlineAt, now } = input;
  const counted = countedBallots(options, presentIds, ballots);
  const tally = tallyRound(options, counted);
  const complete =
    presentIds.length > 0 && votedCount(kind, options, presentIds, ballots) === presentIds.length;

  if (!complete) {
    if (round >= REVOTE_ROUND && isExpired(deadlineAt, now)) {
      return { action: 'escalate', winners: [], tied: [...options], tally };
    }
    return { action: 'wait' };
  }

  const { winners, tied } = settle(kind, tally);
  if (tied.length === 0) return { action: 'decide', winners, tally };
  if (round < REVOTE_ROUND) return { action: 'revote', winners, tied, tally };
  return { action: 'escalate', winners, tied, tally };
}

// The professor's call on the current round of a vote.
//
// On an escalated round they choose among the tied options, and what the
// round already settled stands. On a round still open they are forcing it,
// the override every gate needs (AGENTS.md rule 3), and choose among all of
// its options. For final_pick they choose exactly one candidate; for
// resume_review any subset, including none, is a valid shortlist.
export function professorPick(
  kind: VoteKind,
  round: Pick<VoteRound, 'status' | 'options' | 'winners' | 'tied'>,
  picks: unknown
): { winners: number[] } | VoteError {
  if (round.status === 'decided' || round.status === 'tied') {
    return { status: 409, error: 'This vote has already been decided' };
  }
  if (!Array.isArray(picks) || !picks.every((p) => Number.isInteger(p))) {
    return { status: 400, error: 'winners must be a list of resume ids' };
  }
  const chosen = [...new Set(picks as number[])];
  const allowed = round.status === 'escalated' ? round.tied : round.options;
  if (!chosen.every((p) => allowed.includes(p))) {
    return { status: 400, error: 'Every winner must be one of the options being decided' };
  }
  if (kind === 'final_pick' && chosen.length !== 1) {
    return { status: 400, error: 'Pick exactly one candidate' };
  }
  const winners = round.status === 'escalated' ? [...round.winners, ...chosen] : chosen;
  return { winners: round.options.filter((o) => winners.includes(o)) };
}

// The vote's outcome once its latest round is decided. A shortlist is what
// every round settled together: round 1's clear yeses plus the revote's.
export function voteResult(
  kind: VoteKind,
  rounds: Pick<VoteRound, 'round' | 'status' | 'winners'>[]
): number[] | null {
  const ordered = [...rounds].sort((a, b) => a.round - b.round);
  const last = ordered[ordered.length - 1];
  if (!last || last.status !== 'decided') return null;
  if (kind === 'final_pick') return last.winners;
  return [...new Set(ordered.flatMap((r) => r.winners))];
}

// What a student may cast on this round, normalized to ballot rows.
//
// resume_review takes `{ votes: [{ resumeId, vote }] }` or a single
// `{ resumeId, vote }`, so a page can send one click or the whole sheet.
// final_pick takes `{ resumeId }`.
export function readBallot(
  kind: VoteKind,
  options: number[],
  input: unknown
): MyVote[] | VoteError {
  const body = (input ?? {}) as { votes?: unknown; resumeId?: unknown; vote?: unknown };
  const onBallot = (id: unknown): id is number =>
    typeof id === 'number' && Number.isInteger(id) && options.includes(id);

  if (kind === 'final_pick') {
    if (!onBallot(body.resumeId)) {
      return { status: 400, error: 'Pick one of the candidates on this ballot' };
    }
    return [{ resumeId: body.resumeId, vote: 'yes' }];
  }

  const raw = Array.isArray(body.votes)
    ? body.votes
    : [{ resumeId: body.resumeId, vote: body.vote }];
  const isYesNo = (v: unknown): v is YesNo => v === 'yes' || v === 'no';
  const votes: MyVote[] = [];
  for (const item of raw as { resumeId?: unknown; vote?: unknown }[]) {
    if (!onBallot(item?.resumeId) || !isYesNo(item?.vote)) {
      return { status: 400, error: 'Each vote needs a resume on this ballot and yes or no' };
    }
    votes.push({ resumeId: item.resumeId, vote: item.vote });
  }
  if (votes.length === 0) return { status: 400, error: 'No votes to record' };
  return votes;
}

export function isVoteError(value: unknown): value is VoteError {
  return typeof value === 'object' && value !== null && 'error' in value && 'status' in value;
}
