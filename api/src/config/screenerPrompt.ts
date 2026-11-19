// src/config/screenerPrompt.ts
//
// Builds the screener's instructions to Gemini. What Gemini is told to do
// lives in api/GEMINI.md, read on every call, so editing the file changes the
// next screen without a code change. This code adds what must not be edited
// there: the job posting, the score from keywordMatch.ts, and the reply's JSON
// shape, which the screen depends on.
//
// The resume is not part of the instructions. It goes to Gemini separately,
// through askGemini, which strips its contact details first.

import { readFile } from 'fs/promises';
import path from 'path';
import { KeywordMatch } from './keywordMatch';
import { ScreenerReply } from '../models/ScreenerReply';

// api/GEMINI.md, from src/config in development and dist/config in the image.
export const SCREENER_PROMPT_PATH = path.resolve(__dirname, '../../GEMINI.md');

// The editing notes at the top of the file are for people, not Gemini.
const HEADER = /^\s*<!--[\s\S]*?-->/;

const list = (description: string) => ({
  type: 'array',
  items: { type: 'string' },
  description,
});

/** The JSON Schema Gemini's reply must match. */
export const SCREENER_REPLY_SCHEMA = {
  type: 'object',
  properties: {
    strengths: list('Specific strengths against the job, each quoting the resume.'),
    gaps: list('What the posting asks for that the resume does not show.'),
    score_explanation: {
      type: 'string',
      description: 'Why the score from code is what it is, in 2 to 4 sentences.',
    },
  } satisfies Record<keyof ScreenerReply, object>,
  required: ['strengths', 'gaps', 'score_explanation'] satisfies (keyof ScreenerReply)[],
  additionalProperties: false,
};

export interface ScreenerJob {
  title: string;
  /** The posting's text, as extracted from its PDF. */
  text: string;
}

const keywords = (words: string[]) => (words.length > 0 ? words.join(', ') : 'none');

/**
 * Gemini's instructions for screening one resume against `job`: the current
 * api/GEMINI.md, then the posting, the score and the reply format.
 */
export async function screenerInstructions(
  job: ScreenerJob,
  match: KeywordMatch,
  promptPath: string = SCREENER_PROMPT_PATH
): Promise<string> {
  let file: string;
  try {
    file = await readFile(promptPath, 'utf8');
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    throw new Error(`The screener prompt could not be read from ${promptPath}: ${reason}`);
  }
  const behaviour = file.replace(HEADER, '').trim();
  if (!behaviour) {
    throw new Error(`The screener prompt at ${promptPath} has no instructions below its header`);
  }

  const total = match.matched_keywords.length + match.missed_keywords.length;
  return [
    behaviour,
    '## The job posting',
    `Title: ${job.title}`,
    `<job_posting>\n${job.text.trim()}\n</job_posting>`,
    '## The score, computed by code',
    `Score: ${match.score} out of 100 (${match.matched_keywords.length} of ${total} keywords found).`,
    `Matched keywords: ${keywords(match.matched_keywords)}`,
    `Missing keywords: ${keywords(match.missed_keywords)}`,
    '## Reply format',
    'Reply with one JSON object and nothing else. It must match this JSON Schema:',
    JSON.stringify(SCREENER_REPLY_SCHEMA, null, 2),
    'The resume follows these instructions.',
  ].join('\n\n');
}
