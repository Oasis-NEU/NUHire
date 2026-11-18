import path from 'path';
import { DEFAULT_RESUME_PDFS, PrismaDb } from '../config/database';
import { Prisma, Screening_Results } from '../generated/prisma/client';
import { DbBool } from '../models/DbBool';
import { GroupKey } from '../models/GroupKey';
import { withUniqueRetry } from './writes';
import {
  KeywordChange,
  QueueScope,
  ScreeningInputs,
  ScreeningOutcome,
  ScreeningResult,
  ScreeningRun,
  ScreeningTarget,
} from '../models/Screening';

export interface ScreeningRepository {
  /**
   * Queues each resume as pending for this group and posting, skipping any
   * already there, whatever its status. Returns how many were queued.
   */
  queue(group: GroupKey, jobId: number, resumeIds: number[], isSample: DbBool): Promise<number>;
  /**
   * Queues every resume in the class against the posting assigned to each
   * group, for postings with keywords, narrowed by `scope`. A resume is
   * sample data when its file is one of the seeded samples. Skips rows already
   * there; returns how many were queued.
   */
  queueAssigned(classId: number, scope?: QueueScope): Promise<number>;
  /**
   * Replaces a posting's keywords and, in the same transaction, queues every
   * result against it again: pending, result cleared, run one higher. An empty
   * list deletes the results instead, since a posting without keywords is not
   * screened. Nothing changes if the list is the same. Null if the posting is
   * not in this class.
   */
  replaceJobKeywords(
    classId: number,
    jobId: number,
    keywords: string[]
  ): Promise<KeywordChange | null>;
  /** The pending screen to run next, in key order, or null when none is. */
  nextPending(): Promise<ScreeningRun | null>;
  /** The posting and resume a screen needs; null if either is gone. */
  inputsFor(jobId: number, resumeId: number): Promise<ScreeningInputs | null>;
  /**
   * Whether the queued resume is sample data, as it was queued: 1 or 0. Null
   * if the resume was never queued for this group and posting.
   */
  isSample(group: GroupKey, target: ScreeningTarget): Promise<DbBool | null>;
  /** The group's results against one posting, by resume id. */
  listForGroup(group: GroupKey, jobId: number): Promise<ScreeningResult[]>;
  /**
   * Stores a finished screen on the run it started on. False if the resume
   * was never queued or has been queued again since.
   */
  saveDone(screen: ScreeningRun, outcome: ScreeningOutcome): Promise<boolean>;
  /**
   * Marks a screen failed on the run it started on and clears any earlier
   * result, so a failed row never shows a stale score. False if the resume was
   * never queued or has been queued again since.
   */
  markFailed(screen: ScreeningRun): Promise<boolean>;
}

const rowKey = ({ groupId, classId }: GroupKey, { jobId, resumeId }: ScreeningTarget) => ({
  class: classId,
  group_id: groupId,
  job_id: jobId,
  resume_id: resumeId,
});

const runKey = ({ group, run, ...target }: ScreeningRun) => ({
  ...rowKey(group, target),
  run,
});

// A JSON column comes back as any JSON value. Only a list of strings is a
// keyword list; anything else reads as none rather than reaching a page.
const keywords = (value: Prisma.JsonValue): string[] =>
  Array.isArray(value) ? value.filter((word): word is string => typeof word === 'string') : [];

const SAMPLE_FILES = new Set(DEFAULT_RESUME_PDFS.map((pdf) => path.basename(pdf.file_path)));

// Uploads are stored under a random name, so only a seeded sample has a
// sample's file name, and only its text is read for the screen.
const isSampleFile = (filePath: string): boolean => SAMPLE_FILES.has(path.basename(filePath));

const CLEARED = {
  score: null,
  matched_keywords: Prisma.DbNull,
  missed_keywords: Prisma.DbNull,
  ai_summary: null,
};

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

// replaceJobKeywords runs a transaction, which a transaction client cannot open.
export function createScreeningRepository(db: PrismaDb): ScreeningRepository {
  return {
    queue: async (group, jobId, resumeIds, isSample) => {
      if (resumeIds.length === 0) return 0;
      const { count } = await db.screening_Results.createMany({
        data: resumeIds.map((resumeId) => ({
          ...rowKey(group, { jobId, resumeId }),
          is_sample: isSample === 1,
        })),
        skipDuplicates: true,
      });
      return count;
    },

    queueAssigned: async (classId, { jobId, resumeId, groupIds } = {}) => {
      const assignments = await db.job_Assignment.findMany({
        where: {
          class: classId,
          ...(groupIds && { group: { in: [...groupIds] } }),
          job_descriptions: { is: { ...(jobId !== undefined && { id: jobId }) } },
        },
        select: { group: true, job_descriptions: { select: { id: true, keywords: true } } },
      });
      // A posting without keywords is not screened.
      const screened = assignments.flatMap(({ group, job_descriptions: job }) =>
        job && keywords(job.keywords).length > 0 ? [{ groupId: group, jobId: job.id }] : []
      );
      if (screened.length === 0) return 0;

      const resumes = await db.resume_pdfs.findMany({
        where: { class_id: classId, ...(resumeId !== undefined && { id: resumeId }) },
        select: { id: true, file_path: true },
      });
      const data = screened.flatMap(({ groupId, jobId: id }) =>
        resumes.map((resume) => ({
          ...rowKey({ groupId, classId }, { jobId: id, resumeId: resume.id }),
          is_sample: isSampleFile(resume.file_path),
        }))
      );
      if (data.length === 0) return 0;
      const { count } = await db.screening_Results.createMany({ data, skipDuplicates: true });
      return count;
    },

    replaceJobKeywords: (classId, jobId, list) =>
      withUniqueRetry(() =>
        db.$transaction(async (tx) => {
          const job = await tx.job_descriptions.findFirst({
            where: { id: jobId, class_id: classId },
            select: { keywords: true },
          });
          if (!job) return null;
          const before = keywords(job.keywords);
          if (before.length === list.length && before.every((word, i) => word === list[i])) {
            return { changed: false, requeued: 0, cleared: 0 };
          }
          await tx.job_descriptions.update({ where: { id: jobId }, data: { keywords: list } });
          if (list.length === 0) {
            const { count } = await tx.screening_Results.deleteMany({ where: { job_id: jobId } });
            return { changed: true, requeued: 0, cleared: count };
          }
          const { count } = await tx.screening_Results.updateMany({
            where: { job_id: jobId },
            data: { status: 'pending', ...CLEARED, run: { increment: 1 } },
          });
          return { changed: true, requeued: count, cleared: 0 };
        })
      ),

    nextPending: async () => {
      const row = await db.screening_Results.findFirst({
        where: { status: 'pending' },
        orderBy: [{ class: 'asc' }, { group_id: 'asc' }, { job_id: 'asc' }, { resume_id: 'asc' }],
        select: { class: true, group_id: true, job_id: true, resume_id: true, run: true },
      });
      return row
        ? {
            group: { groupId: row.group_id, classId: row.class },
            jobId: row.job_id,
            resumeId: row.resume_id,
            run: row.run,
          }
        : null;
    },

    inputsFor: async (jobId, resumeId) => {
      const [job, resume] = await Promise.all([
        db.job_descriptions.findUnique({
          where: { id: jobId },
          select: { title: true, extracted_text: true, keywords: true },
        }),
        db.resume_pdfs.findUnique({
          where: { id: resumeId },
          select: { extracted_text: true, Candidates: { select: { f_name: true, l_name: true } } },
        }),
      ]);
      if (!job || !resume) return null;
      return {
        job: { title: job.title, text: job.extracted_text, keywords: keywords(job.keywords) },
        resume: {
          text: resume.extracted_text,
          names: resume.Candidates ? [resume.Candidates.f_name, resume.Candidates.l_name] : [],
        },
      };
    },

    isSample: async (group, target) => {
      const row = await db.screening_Results.findUnique({
        where: { class_group_id_job_id_resume_id: rowKey(group, target) },
        select: { is_sample: true },
      });
      return row ? (row.is_sample ? 1 : 0) : null;
    },

    listForGroup: async ({ groupId, classId }, jobId) => {
      const rows = await db.screening_Results.findMany({
        where: { class: classId, group_id: groupId, job_id: jobId },
        orderBy: { resume_id: 'asc' },
      });
      return rows.map(toResult);
    },

    saveDone: async (screen, outcome) => {
      // The column is tinyint unsigned, so MySQL would store 101 to 255 and
      // round a fraction. Throw rather than return false, which means never queued.
      if (!Number.isInteger(outcome.score) || outcome.score < 0 || outcome.score > 100) {
        throw new RangeError(
          `Screening score must be an integer from 0 to 100, got ${outcome.score}`
        );
      }
      const { count } = await db.screening_Results.updateMany({
        where: runKey(screen),
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

    markFailed: async (screen) => {
      const { count } = await db.screening_Results.updateMany({
        where: runKey(screen),
        data: { status: 'failed', ...CLEARED },
      });
      return count > 0;
    },
  };
}
