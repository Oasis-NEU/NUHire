// src/controller/screening.controller.ts

import { Response } from 'express';
import { AuthRequest } from '../models/AuthRequest';
import { queueScreens, Screens } from '../config/screeningQueue';

// Long enough for any real skill or tool, short enough that a pasted
// paragraph is rejected rather than stored as one keyword.
const MAX_KEYWORDS = 50;
const MAX_KEYWORD_LENGTH = 100;

const positiveInt = (value: unknown): number | null => {
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : null;
};

/** The keywords as sent, trimmed, without blanks; null if they are not a list of strings. */
function parseKeywords(value: unknown): string[] | null {
  if (!Array.isArray(value) || !value.every((word) => typeof word === 'string')) return null;
  const words = value.map((word: string) => word.trim()).filter((word) => word !== '');
  if (words.length > MAX_KEYWORDS || words.some((word) => word.length > MAX_KEYWORD_LENGTH)) {
    return null;
  }
  return words;
}

export class ScreeningController {
  constructor(private screens: Screens) {}

  // PUT /jobs/:job_id/keywords  { class_id, keywords: string[] }
  // A change queues the posting's screens again; an empty list clears them.
  setKeywords = async (req: AuthRequest, res: Response): Promise<void> => {
    const jobId = positiveInt(req.params.job_id);
    const classId = positiveInt(req.body?.class_id);
    const keywords = parseKeywords(req.body?.keywords);
    if (jobId === null || classId === null) {
      res.status(400).json({ error: 'job_id and class_id must be positive integers' });
      return;
    }
    if (keywords === null) {
      res.status(400).json({
        error: `keywords must be a list of up to ${MAX_KEYWORDS} words, each up to ${MAX_KEYWORD_LENGTH} characters`,
      });
      return;
    }

    try {
      const change = await this.screens.screening.replaceJobKeywords(classId, jobId, keywords);
      if (!change) {
        res.status(404).json({ error: 'No such job in this class' });
        return;
      }
      if (change.changed && keywords.length > 0) {
        this.screens.queue.wake();
        // Groups assigned this posting that had no results yet.
        await queueScreens(this.screens, classId, { jobId });
      }
      res.json({ job_id: jobId, keywords, ...change });
    } catch (err) {
      console.error(`Could not set keywords for job ${jobId} in class ${classId}:`, err);
      res.status(500).json({ error: 'Could not save the keywords' });
    }
  };
}
