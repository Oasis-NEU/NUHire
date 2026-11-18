import { DbBool } from './DbBool';
import { GroupKey } from './GroupKey';
import { ScreenerReply } from './ScreenerReply';

export type ScreeningStatus = 'pending' | 'done' | 'failed';

/** A row of `Screening_Results`: one resume, screened for one group against one posting. */
export interface ScreeningResult {
  class: number;
  group_id: number;
  job_id: number;
  resume_id: number;
  status: ScreeningStatus;
  /** 0 to 100; null until the screen is done. */
  score: number | null;
  /** Empty until the screen is done. */
  matched_keywords: string[];
  missed_keywords: string[];
  ai_summary: string | null;
  is_sample: DbBool;
}

/** Which resume, screened against which posting. One object, so the two ids cannot be swapped. */
export interface ScreeningTarget {
  jobId: number;
  resumeId: number;
}

/** What a finished screen stores. */
export type ScreeningOutcome = Pick<
  ScreeningResult,
  'matched_keywords' | 'missed_keywords' | 'ai_summary'
> & { score: number };

/**
 * One queued screen: a row's key and the run it was queued on. A result is
 * saved only to the run it started on, so a re-run is never overwritten.
 */
export interface ScreeningRun extends ScreeningTarget {
  group: GroupKey;
  run: number;
}

/** What a screen needs. Text is null until extracted from the PDF. */
export interface ScreeningInputs {
  job: { title: string; text: string | null; keywords: string[] };
  /** `names` are the candidate's own, from their Candidates row. */
  resume: { text: string | null; names: string[] };
}

/** Which assigned groups and resumes to queue; each field left out means all. */
export interface QueueScope {
  jobId?: number;
  resumeId?: number;
  groupIds?: readonly number[];
}

/** What replacing a posting's keywords did to its results. */
export interface KeywordChange {
  /** False when the new list was the same, so nothing was touched. */
  changed: boolean;
  /** Results queued again against the new keywords. */
  requeued: number;
  /** Results deleted because the posting now has no keywords. */
  cleared: number;
}

/**
 * A result as the read endpoints send it. `summary` is Gemini's reply, null
 * until the screen is done; `score` and the keyword lists are from code.
 */
export interface ScreeningView {
  job_id: number;
  resume_id: number;
  status: ScreeningStatus;
  score: number | null;
  matched_keywords: string[];
  missed_keywords: string[];
  summary: ScreenerReply | null;
}
