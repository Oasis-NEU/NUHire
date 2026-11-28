// src/config/gemini.ts
//
// The only way a resume reaches Gemini. GeminiClient takes the resume as
// StrippedText, which only stripContactInfo makes, so tsc rejects a client
// call with raw resume text; askGemini is the one place that makes it.

import { StrippedText, stripContactInfo } from './contactInfo';

/** What the Gemini client implements. */
export interface GeminiClient {
  generate(instructions: string, resume: StrippedText): Promise<string>;
}

/**
 * Sends a resume to Gemini with the candidate's contact details stripped.
 * `names` are the candidate's own, from their Candidates row.
 */
export function askGemini(
  client: GeminiClient,
  instructions: string,
  resumeText: string,
  names: readonly string[]
): Promise<string> {
  return client.generate(instructions, stripContactInfo(resumeText, names));
}
