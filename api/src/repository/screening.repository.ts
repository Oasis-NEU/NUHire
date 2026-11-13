import { DbClient } from '../config/database';
import { Prisma, Screening_Results } from '../generated/prisma/client';
import { DbBool } from '../models/DbBool';
import { GroupKey } from '../models/GroupKey';
import { ScreeningOutcome, ScreeningResult } from '../models/Screening';

export interface ScreeningRepository {
  /**
   * Queues each resume as pending for this group and posting, skipping any
   * already there, whatever its status. Returns how many were queued.
   */
  queue(group: GroupKey, jobId: number, resumeIds: number[], isSample: DbBool): Promise<number>;
  /** The group's results against one posting, by resume id. */
  listForGroup(group: GroupKey, jobId: number): Promise<ScreeningResult[]>;
  /** Stores a finished screen. False if the resume was never queued. */
  saveDone(
    group: GroupKey,
    jobId: number,
    resumeId: number,
    outcome: ScreeningOutcome
  ): Promise<boolean>;
  /**
   * Marks a screen failed and clears any earlier result, so a failed row never
   * shows a stale score. False if the resume was never queued.
   */
  markFailed(group: GroupKey, jobId: number, resumeId: number): Promise<boolean>;
}

const rowKey = ({ groupId, classId }: GroupKey, jobId: number, resumeId: number) => ({
  class: classId,
  group_id: groupId,
  job_id: jobId,
  resume_id: resumeId,
});

// A JSON column comes back as any JSON value. Only a list of strings is a
// keyword list; anything else reads as none rather than reaching a page.
const keywords = (value: Prisma.JsonValue): string[] =>
  Array.isArray(value) ? value.filter((word): word is string => typeof word === 'string') : [];

const toResult = (row: Screening_Results): ScreeningResult => ({
  class: row.class,
  group_id: row.group_id,
  job_id: row.job_id,
  resume_id: row.resume_id,
  status: row.status,
  score: row.score,
  matched_keywords: keywords(row.matched_keywords),
  missed_keywords: keywords(row.missed_keywords),
  ai_summary: row.ai_summary,
  // Prisma reads tinyint(1) as a boolean; the rest of the API uses 0 or 1.
  is_sample: row.is_sample ? 1 : 0,
});

export function createScreeningRepository(db: DbClient): ScreeningRepository {
  return {
    queue: async (group, jobId, resumeIds, isSample) => {
      if (resumeIds.length === 0) return 0;
      const { count } = await db.screening_Results.createMany({
        data: resumeIds.map((resumeId) => ({
          ...rowKey(group, jobId, resumeId),
          is_sample: isSample === 1,
        })),
        skipDuplicates: true,
      });
      return count;
    },

    listForGroup: async ({ groupId, classId }, jobId) => {
      const rows = await db.screening_Results.findMany({
        where: { class: classId, group_id: groupId, job_id: jobId },
        orderBy: { resume_id: 'asc' },
      });
      return rows.map(toResult);
    },

    saveDone: async (group, jobId, resumeId, outcome) => {
      const { count } = await db.screening_Results.updateMany({
        where: rowKey(group, jobId, resumeId),
        data: {
          status: 'done',
          score: outcome.score,
          matched_keywords: outcome.matched_keywords,
          missed_keywords: outcome.missed_keywords,
          ai_summary: outcome.ai_summary,
        },
      });
      return count > 0;
    },

    markFailed: async (group, jobId, resumeId) => {
      const { count } = await db.screening_Results.updateMany({
        where: rowKey(group, jobId, resumeId),
        data: {
          status: 'failed',
          score: null,
          matched_keywords: Prisma.DbNull,
          missed_keywords: Prisma.DbNull,
          ai_summary: null,
        },
      });
      return count > 0;
    },
  };
}
