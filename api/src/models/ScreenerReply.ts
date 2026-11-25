/** Gemini's reply to one screen. Its JSON Schema is SCREENER_REPLY_SCHEMA in config/screenerPrompt.ts. */
export interface ScreenerReply {
  /** Specific strengths against the job, each quoting the resume. */
  strengths: string[];
  /** What the posting asks for that the resume does not show. */
  gaps: string[];
  /** Why the score from code is what it is. */
  score_explanation: string;
}
