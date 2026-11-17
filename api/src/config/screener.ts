// src/config/screener.ts
//
// Screens one queued resume with Gemini and stores the result on its
// Screening_Results row. In order:
//
// 1. The guard. While SCREENER_ALLOW_REAL_RESUMES is not exactly "true", which
//    is the default, a resume not queued as sample data is refused: it is
//    never sent, and its row is marked failed so nothing waits on it. Whether
//    it is a sample is read from the row, not taken from the caller.
// 2. The score and keyword lists, from matchKeywords. Gemini explains them and
//    never computes them.
// 3. The call, through askGemini, so the resume is stripped of contact details
//    first. The instructions come from api/GEMINI.md, with the posting and the
//    score added in code.
// 4. The reply is checked against ScreenerReply. A failed call or a reply that
//    does not match is tried once more; a second failure marks the row failed.
//
// The reply is stored in ai_summary as JSON, holding only ScreenerReply's
// fields.

import { askGemini, GeminiClient } from './gemini';
import { matchKeywords } from './keywordMatch';
import { screenerInstructions } from './screenerPrompt';
import { ScreeningRepository } from '../repository/screening.repository';
import { GroupKey } from '../models/GroupKey';
import { ScreenerReply } from '../models/ScreenerReply';

/** Off unless set to exactly "true", so a deploy that leaves it unset sends no real resume. */
export const realResumesAllowed = (env: NodeJS.ProcessEnv = process.env): boolean =>
  env.SCREENER_ALLOW_REAL_RESUMES === 'true';

const ATTEMPTS = 2;

export interface ScreenRequest {
  group: GroupKey;
  jobId: number;
  job: { title: string; text: string; keywords: readonly string[] };
  /** `names` are the candidate's own, from their Candidates row. */
  resume: { id: number; text: string; names: readonly string[] };
}

export interface ScreenerDeps {
  client: GeminiClient;
  screening: ScreeningRepository;
  allowRealResumes?: boolean;
}

/**
 * - `done`: stored with its score and Gemini's reply
 * - `failed`: Gemini failed twice, or the prompt could not be read; the row is failed
 * - `refused`: not sample data while real resumes are off; never sent, the row is failed
 * - `not_queued`: no row for this resume, group and posting; nothing sent or stored
 */
export type ScreenResult = 'done' | 'failed' | 'refused' | 'not_queued';

const isStringList = (value: unknown): value is string[] =>
  Array.isArray(value) && value.every((item) => typeof item === 'string' && item.trim() !== '');

/** Gemini's reply as a ScreenerReply, or null if it is not one. Other fields are dropped. */
export function parseScreenerReply(raw: string): ScreenerReply | null {
  let reply: unknown;
  try {
    reply = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof reply !== 'object' || reply === null) return null;
  const { strengths, gaps, score_explanation } = reply as Record<string, unknown>;
  if (!isStringList(strengths) || !isStringList(gaps)) return null;
  if (typeof score_explanation !== 'string' || score_explanation.trim() === '') return null;
  return { strengths, gaps, score_explanation };
}

export async function screenResume(
  { client, screening, allowRealResumes = realResumesAllowed() }: ScreenerDeps,
  { group, jobId, job, resume }: ScreenRequest
): Promise<ScreenResult> {
  const where = `group ${group.groupId}, class ${group.classId}, job ${jobId}, resume ${resume.id}`;
  const target = { jobId, resumeId: resume.id };

  const isSample = await screening.isSample(group, target);
  if (isSample === null) return 'not_queued';
  if (isSample === 0 && !allowRealResumes) {
    console.warn(
      `Screener refused ${where}: not sample data, and SCREENER_ALLOW_REAL_RESUMES is off`
    );
    await screening.markFailed(group, target);
    return 'refused';
  }

  const match = matchKeywords(resume.text, job.keywords);
  let instructions: string;
  try {
    instructions = await screenerInstructions(job, match);
  } catch (err) {
    console.error(`Screener could not build instructions for ${where}:`, err);
    await screening.markFailed(group, target);
    return 'failed';
  }

  const reply = await askUntilValid(client, instructions, resume, where);
  if (!reply) {
    console.error(`Screener gave up on ${where} after ${ATTEMPTS} attempts`);
    await screening.markFailed(group, target);
    return 'failed';
  }
  // Outside the retries: a failed write must not send the resume to Gemini again.
  await screening.saveDone(group, target, { ...match, ai_summary: JSON.stringify(reply) });
  return 'done';
}

/** Gemini's reply, asked for up to ATTEMPTS times; null if none was a ScreenerReply. */
async function askUntilValid(
  client: GeminiClient,
  instructions: string,
  resume: ScreenRequest['resume'],
  where: string
): Promise<ScreenerReply | null> {
  for (let attempt = 1; attempt <= ATTEMPTS; attempt++) {
    try {
      const reply = parseScreenerReply(
        await askGemini(client, instructions, resume.text, resume.names)
      );
      if (reply) return reply;
      console.warn(`Screener attempt ${attempt} for ${where}: the reply was not a ScreenerReply`);
    } catch (err) {
      // The error alone: the request it came from holds the resume.
      const reason = err instanceof Error ? err.message : String(err);
      console.warn(`Screener attempt ${attempt} for ${where} failed: ${reason}`);
    }
  }
  return null;
}
