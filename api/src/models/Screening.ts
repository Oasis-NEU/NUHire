import { DbBool } from './DbBool';

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

/** What a finished screen stores. */
export interface ScreeningOutcome {
  score: number;
  matched_keywords: string[];
  missed_keywords: string[];
  ai_summary: string | null;
}
