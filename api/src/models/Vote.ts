// src/models/Vote.ts

// resume_review: every present student votes yes or no on every resume, and
// the yes-majority resumes form the shortlist. final_pick: every present
// student picks one shortlisted candidate, and the winner becomes the offer.
export type VoteKind = 'resume_review' | 'final_pick';

export const VOTE_KINDS: readonly VoteKind[] = ['resume_review', 'final_pick'];

export type YesNo = 'yes' | 'no';

// `Group_Vote_Round`.`status`. 'tied' only ever appears on round 1 once round
// 2 is open, so the current round of a vote is never 'tied'.
export type VoteRoundStatus = 'open' | 'tied' | 'escalated' | 'decided';

export type VoteDecider = 'majority' | 'professor';

// One `Group_Vote_Round` row, with its JSON columns parsed and its times read
// as dbNow()-shaped UTC strings ('YYYY-MM-DD HH:MM:SS').
export interface VoteRound {
  id: number;
  classId: number;
  groupId: number;
  kind: VoteKind;
  round: number;
  options: number[];
  status: VoteRoundStatus;
  winners: number[];
  tied: number[];
  decidedBy: VoteDecider | null;
  deadlineAt: string | null;
}

// One `Group_Vote_Ballot` row. For final_pick, the student's single row is
// the candidate they picked, always 'yes'.
export interface VoteBallot {
  student_id: number;
  resume_id: number;
  vote: YesNo;
}

// For resume_review, yes and no per resume. For final_pick, `yes` is the
// number of picks and `no` is always 0.
export interface OptionTally {
  resumeId: number;
  yes: number;
  no: number;
}

// What the group page renders, from GET /votes/:kind and every
// 'groupVoteUpdated' event. Tallies stay hidden while a round is open so the
// first few ballots do not steer the rest.
export interface VoteState {
  classId: number;
  groupId: number;
  kind: VoteKind;
  // null when no round has been opened yet.
  round: number | null;
  status: VoteRoundStatus | null;
  // Resume ids on the current round's ballot.
  options: number[];
  presentCount: number;
  votedCount: number;
  // Revote only: seconds until it escalates, counted by the server so a
  // student's clock cannot disagree with it.
  secondsLeft: number | null;
  // The options the professor is being asked to settle.
  tied: number[];
  decidedBy: VoteDecider | null;
  // Set once the vote is decided: the whole shortlist across both rounds for
  // resume_review, or the single winner for final_pick.
  result: number[] | null;
  // The current round's count, only once it has closed.
  tally: OptionTally[] | null;
}

// What changed, so a client can tell a new round from a progress tick.
export type VoteChange =
  'opened' | 'ballot' | 'revote' | 'decided' | 'escalated' | 'professor_decided';

// The student's own ballot on the current round, added to their own poll.
export interface MyVote {
  resumeId: number;
  vote: YesNo;
}

// A refusal the caller can show, with the HTTP status that fits it.
export interface VoteError {
  status: 400 | 404 | 409;
  error: string;
}
