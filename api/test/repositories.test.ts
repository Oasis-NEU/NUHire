import { describe, expect, it, vi } from 'vitest';
import type { DbClient, PrismaDb } from '../src/config/database';
import { Prisma } from '../src/generated/prisma/client';
import { createFactsRepository } from '../src/repository/facts.repository';
import { createModeratorRepository } from '../src/repository/moderator.repository';
import { createNotesRepository } from '../src/repository/notes.repository';
import { createPdfTextRepository } from '../src/repository/pdfText.repository';
import { createScreeningRepository } from '../src/repository/screening.repository';

// The controllers are tested against fake repositories, so these check the
// other half: each repository asks Prisma for the right rows.

const PROF = 'prof@northeastern.edu';

describe('moderator repository', () => {
  function withModerator(adminEmail: string | null) {
    const findUnique = vi.fn(async () => (adminEmail ? { admin_email: adminEmail } : null));
    const db = { moderator: { findUnique } } as unknown as DbClient;
    return { moderators: createModeratorRepository(db), findUnique };
  }

  it('says a professor teaches the class on their Moderator row', async () => {
    const { moderators, findUnique } = withModerator(PROF);
    expect(await moderators.teaches(PROF, 101)).toBe(true);
    expect(findUnique).toHaveBeenCalledWith(expect.objectContaining({ where: { crn: 101 } }));
  });

  it("says no for another professor's class", async () => {
    const { moderators } = withModerator('other@northeastern.edu');
    expect(await moderators.teaches(PROF, 101)).toBe(false);
  });

  it('says no for a class with no Moderator row', async () => {
    const { moderators } = withModerator(null);
    expect(await moderators.teaches(PROF, 101)).toBe(false);
  });
});

describe('facts repository', () => {
  it("reads one class's facts by its id", async () => {
    const findUnique = vi.fn(async () => null);
    const db = { waitingFacts: { findUnique } } as unknown as DbClient;
    expect(await createFactsRepository(db).findByClass(101)).toBeNull();
    expect(findUnique).toHaveBeenCalledWith(expect.objectContaining({ where: { class_id: 101 } }));
  });

  it('saves all three facts with an upsert, retried when a first save races another', async () => {
    const raced = new Prisma.PrismaClientKnownRequestError('raced', {
      code: 'P2002',
      clientVersion: 'test',
    });
    const upsert = vi.fn().mockRejectedValueOnce(raced).mockResolvedValueOnce({});
    const db = { waitingFacts: { upsert } } as unknown as DbClient;
    await createFactsRepository(db).save(101, { one: 'a', two: null, three: 'c' });
    expect(upsert).toHaveBeenCalledTimes(2);
    expect(upsert).toHaveBeenCalledWith({
      where: { class_id: 101 },
      create: { class_id: 101, one: 'a', two: null, three: 'c' },
      update: { one: 'a', two: null, three: 'c' },
    });
  });
});

describe('notes repository', () => {
  it("lists only the caller's notes, newest first", async () => {
    const findMany = vi.fn(async () => []);
    const db = { notes: { findMany } } as unknown as DbClient;
    await createNotesRepository(db).listForUser('student@northeastern.edu');
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { user_email: 'student@northeastern.edu' },
        orderBy: { created_at: 'desc' },
      })
    );
  });
});

describe('pdf text repository', () => {
  function withTables() {
    const resumes = { findMany: vi.fn(async () => []), updateMany: vi.fn(async () => ({})) };
    const jobs = { findMany: vi.fn(async () => []), updateMany: vi.fn(async () => ({})) };
    const db = { resume_pdfs: resumes, job_descriptions: jobs } as unknown as DbClient;
    return { pdfs: createPdfTextRepository(db), resumes, jobs };
  }

  it('lists only rows with no text, in one class when asked', async () => {
    const { pdfs, resumes, jobs } = withTables();
    await pdfs.listWithoutText('Resume_pdfs', 101);
    await pdfs.listWithoutText('job_descriptions');
    expect(resumes.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { extracted_text: null, class_id: 101 } })
    );
    expect(jobs.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { extracted_text: null } })
    );
  });

  it('never overwrites text another run already stored', async () => {
    const { pdfs, resumes, jobs } = withTables();
    await pdfs.saveText('job_descriptions', 7, 'Software Engineer Co-op');
    expect(jobs.updateMany).toHaveBeenCalledWith({
      where: { id: 7, extracted_text: null },
      data: { extracted_text: 'Software Engineer Co-op' },
    });
    expect(resumes.updateMany).not.toHaveBeenCalled();
  });
});

describe('screening repository', () => {
  const GROUP = { groupId: 3, classId: 101 };
  const KEY = { class: 101, group_id: 3, job_id: 7, resume_id: 42 };
  const TARGET = { jobId: 7, resumeId: 42 };
  const RUN = { group: GROUP, ...TARGET, run: 2 };

  function withResults(count = 1, rows: unknown[] = []) {
    const createMany = vi.fn(async () => ({ count }));
    const findMany = vi.fn(async () => rows);
    const findUnique = vi.fn(async () => rows[0] ?? null);
    const updateMany = vi.fn(async () => ({ count }));
    const db = {
      screening_Results: { createMany, findMany, findUnique, updateMany },
    } as unknown as PrismaDb;
    return {
      screening: createScreeningRepository(db),
      createMany,
      findMany,
      findUnique,
      updateMany,
    };
  }

  it('queues each resume as pending under the group, class and posting, skipping ones already there', async () => {
    const { screening, createMany } = withResults(2);
    expect(await screening.queue(GROUP, 7, [42, 43], 1)).toBe(2);
    expect(createMany).toHaveBeenCalledWith({
      data: [
        { ...KEY, is_sample: true },
        { ...KEY, resume_id: 43, is_sample: true },
      ],
      skipDuplicates: true,
    });
  });

  it('queues nothing, without a query, for no resumes', async () => {
    const { screening, createMany } = withResults();
    expect(await screening.queue(GROUP, 7, [], 0)).toBe(0);
    expect(createMany).not.toHaveBeenCalled();
  });

  it('reads whether a queued resume is sample data, as 0 or 1, by its full key', async () => {
    const sample = withResults(1, [{ is_sample: true }]);
    expect(await sample.screening.isSample(GROUP, TARGET)).toBe(1);
    expect(sample.findUnique).toHaveBeenCalledWith({
      where: { class_group_id_job_id_resume_id: KEY },
      select: { is_sample: true },
    });
    expect(await withResults(1, [{ is_sample: false }]).screening.isSample(GROUP, TARGET)).toBe(0);
    expect(await withResults(1, []).screening.isSample(GROUP, TARGET)).toBeNull();
  });

  it("lists one group's results in one class, with is_sample as 0 or 1 and keywords as strings", async () => {
    const row = {
      ...KEY,
      status: 'done',
      score: 80,
      matched_keywords: ['java', 7, 'sql'],
      missed_keywords: { not: 'a list' },
      ai_summary: null,
      is_sample: false,
    };
    const { screening, findMany } = withResults(1, [row]);
    expect(await screening.listForGroup(GROUP, 7)).toEqual([
      { ...row, matched_keywords: ['java', 'sql'], missed_keywords: [], is_sample: 0 },
    ]);
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { class: 101, group_id: 3, job_id: 7 } })
    );
  });

  it("fetches one result by the group's full key, or null if it was never queued", async () => {
    const stored = {
      ...KEY,
      status: 'done',
      score: 67,
      matched_keywords: ['Python'],
      missed_keywords: [],
      ai_summary: '{}',
      is_sample: true,
    };
    const { screening, findUnique } = withResults(1, [stored]);
    expect(await screening.findOne(GROUP, TARGET)).toEqual({ ...stored, is_sample: 1 });
    expect(findUnique).toHaveBeenCalledWith({ where: { class_group_id_job_id_resume_id: KEY } });
    expect(await withResults(1, []).screening.findOne(GROUP, TARGET)).toBeNull();
  });

  it('stores a finished screen on the queued row', async () => {
    const { screening, updateMany } = withResults();
    const outcome = {
      score: 75,
      matched_keywords: ['linux'],
      missed_keywords: ['python'],
      ai_summary: 'Strong on systems.',
    };
    expect(await screening.saveDone(RUN, outcome)).toBe(true);
    expect(updateMany).toHaveBeenCalledWith({
      where: { ...KEY, run: 2 },
      data: { status: 'done', ...outcome },
    });
  });

  it('marks a screen failed and clears any earlier result', async () => {
    const { screening, updateMany } = withResults();
    expect(await screening.markFailed(RUN)).toBe(true);
    expect(updateMany).toHaveBeenCalledWith({
      where: { ...KEY, run: 2 },
      data: {
        status: 'failed',
        score: null,
        matched_keywords: Prisma.DbNull,
        missed_keywords: Prisma.DbNull,
        ai_summary: null,
      },
    });
  });

  it('stores scores of 0 and 100 and refuses any other score outside 0 to 100 or a fraction', async () => {
    const { screening, updateMany } = withResults();
    const outcome = { matched_keywords: [], missed_keywords: [], ai_summary: null };
    for (const score of [0, 100]) {
      expect(await screening.saveDone(RUN, { ...outcome, score })).toBe(true);
    }
    for (const score of [-1, 101, 75.5, NaN]) {
      await expect(screening.saveDone(RUN, { ...outcome, score })).rejects.toThrow(RangeError);
    }
    expect(updateMany).toHaveBeenCalledTimes(2);
  });

  it('says so when a result is written for a resume never queued, or queued again since', async () => {
    const { screening } = withResults(0);
    expect(
      await screening.saveDone(RUN, {
        score: 1,
        matched_keywords: [],
        missed_keywords: [],
        ai_summary: null,
      })
    ).toBe(false);
    expect(await screening.markFailed(RUN)).toBe(false);
  });
});

describe('screening repository: the queue', () => {
  const RUN = { group: { groupId: 3, classId: 101 }, jobId: 7, resumeId: 42, run: 2 };

  function withQueue({
    assignments = [] as unknown[],
    resumes = [] as unknown[],
    pending = null as unknown,
    job = null as unknown,
    resume = null as unknown,
    count = 1,
  } = {}) {
    const fns = {
      assignments: vi.fn(async () => assignments),
      resumes: vi.fn(async () => resumes),
      resumeOne: vi.fn(async () => resume),
      job: vi.fn(async () => job),
      createMany: vi.fn(async () => ({ count })),
      findFirst: vi.fn(async () => pending),
    };
    const db = {
      job_Assignment: { findMany: fns.assignments },
      resume_pdfs: { findMany: fns.resumes, findUnique: fns.resumeOne },
      job_descriptions: {
        findUnique: fns.job,
      },
      screening_Results: {
        createMany: fns.createMany,
        findFirst: fns.findFirst,
      },
    } as unknown as PrismaDb;
    return { screening: createScreeningRepository(db), ...fns };
  }

  it('queues every resume in the class for each group assigned a posting with keywords', async () => {
    const q = withQueue({
      assignments: [
        { group: 1, job_descriptions: { id: 7, keywords: ['Python'] } },
        { group: 2, job_descriptions: { id: 8, keywords: [] } },
        { group: 3, job_descriptions: { id: 9, keywords: null } },
        { group: 4, job_descriptions: null },
      ],
      resumes: [
        { id: 42, file_path: 'uploads/resumes/sample3.pdf' },
        { id: 43, file_path: 'uploads/resumes/0b6f1c2e-upload.pdf' },
      ],
      count: 2,
    });
    expect(await q.screening.queueAssigned(101)).toBe(2);
    expect(q.assignments).toHaveBeenCalledWith(
      expect.objectContaining({ where: { class: 101, job_descriptions: { is: {} } } })
    );
    expect(q.resumes).toHaveBeenCalledWith(expect.objectContaining({ where: { class_id: 101 } }));
    expect(q.createMany).toHaveBeenCalledWith({
      data: [
        { class: 101, group_id: 1, job_id: 7, resume_id: 42, is_sample: true },
        { class: 101, group_id: 1, job_id: 7, resume_id: 43, is_sample: false },
      ],
      skipDuplicates: true,
    });
  });

  it('narrows to one posting, one resume or some groups', async () => {
    const q = withQueue({
      assignments: [{ group: 5, job_descriptions: { id: 7, keywords: ['SQL'] } }],
      resumes: [{ id: 42, file_path: 'uploads/resumes/sample1.pdf' }],
    });
    await q.screening.queueAssigned(101, { jobId: 7, resumeId: 42, groupIds: [5, 6] });
    expect(q.assignments).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { class: 101, group: { in: [5, 6] }, job_descriptions: { is: { id: 7 } } },
      })
    );
    expect(q.resumes).toHaveBeenCalledWith(
      expect.objectContaining({ where: { class_id: 101, id: 42 } })
    );
  });

  it('queues nothing, without reading resumes, when no assigned posting has keywords', async () => {
    const q = withQueue({ assignments: [{ group: 1, job_descriptions: { id: 7, keywords: [] } }] });
    expect(await q.screening.queueAssigned(101)).toBe(0);
    expect(q.resumes).not.toHaveBeenCalled();
    expect(q.createMany).not.toHaveBeenCalled();
  });

  it('picks the next pending screen in key order, with its run', async () => {
    const q = withQueue({
      pending: { class: 101, group_id: 3, job_id: 7, resume_id: 42, run: 2 },
    });
    expect(await q.screening.nextPending()).toEqual(RUN);
    expect(q.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { status: 'pending' },
        orderBy: [{ class: 'asc' }, { group_id: 'asc' }, { job_id: 'asc' }, { resume_id: 'asc' }],
      })
    );
    expect(await withQueue().screening.nextPending()).toBeNull();
  });

  it("reads a screen's posting and resume, with the candidate's names", async () => {
    const q = withQueue({
      job: { title: 'Backend Co-op', extracted_text: 'Python', keywords: ['Python', 3] },
      resume: { extracted_text: 'Built APIs', Candidates: { f_name: 'Aisha', l_name: 'Patel' } },
    });
    expect(await q.screening.inputsFor(7, 42)).toEqual({
      job: { title: 'Backend Co-op', text: 'Python', keywords: ['Python'] },
      resume: { text: 'Built APIs', names: ['Aisha', 'Patel'] },
    });
    expect(q.job).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 7 } }));
    expect(q.resumeOne).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 42 } }));
  });

  it('reads no inputs when the posting or resume is gone', async () => {
    const resume = { extracted_text: 'x', Candidates: null };
    expect(await withQueue({ resume }).screening.inputsFor(7, 42)).toBeNull();
    const job = { title: 'T', extracted_text: 'x', keywords: [] };
    expect(await withQueue({ job }).screening.inputsFor(7, 42)).toBeNull();
  });

  function withTransaction(before: unknown, count = 3) {
    const tx = {
      job_descriptions: {
        findFirst: vi.fn(async () => (before === undefined ? null : { keywords: before })),
        update: vi.fn(async () => ({})),
      },
      screening_Results: {
        updateMany: vi.fn(async () => ({ count })),
        deleteMany: vi.fn(async () => ({ count })),
      },
    };
    const $transaction = vi.fn(async (run: (client: typeof tx) => Promise<unknown>) => run(tx));
    const db = { $transaction } as unknown as PrismaDb;
    return { screening: createScreeningRepository(db), tx, $transaction };
  }

  it('replaces the keywords and queues every result against the posting again, in one transaction', async () => {
    const { screening, tx, $transaction } = withTransaction(['Python'], 30);
    expect(await screening.replaceJobKeywords(101, 7, ['Python', 'SQL'])).toEqual({
      changed: true,
      requeued: 30,
      cleared: 0,
    });
    expect($transaction).toHaveBeenCalledTimes(1);
    expect(tx.job_descriptions.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 7, class_id: 101 } })
    );
    expect(tx.job_descriptions.update).toHaveBeenCalledWith({
      where: { id: 7 },
      data: { keywords: ['Python', 'SQL'] },
    });
    expect(tx.screening_Results.updateMany).toHaveBeenCalledWith({
      where: { job_id: 7 },
      data: {
        status: 'pending',
        score: null,
        matched_keywords: Prisma.DbNull,
        missed_keywords: Prisma.DbNull,
        ai_summary: null,
        run: { increment: 1 },
      },
    });
    expect(tx.screening_Results.deleteMany).not.toHaveBeenCalled();
  });

  it('deletes the results when the posting is left with no keywords', async () => {
    const { screening, tx } = withTransaction(['Python'], 4);
    expect(await screening.replaceJobKeywords(101, 7, [])).toEqual({
      changed: true,
      requeued: 0,
      cleared: 4,
    });
    expect(tx.screening_Results.deleteMany).toHaveBeenCalledWith({ where: { job_id: 7 } });
    expect(tx.screening_Results.updateMany).not.toHaveBeenCalled();
  });

  it('touches nothing when the keywords are the same', async () => {
    const { screening, tx } = withTransaction(['Python', 'SQL']);
    expect(await screening.replaceJobKeywords(101, 7, ['Python', 'SQL'])).toEqual({
      changed: false,
      requeued: 0,
      cleared: 0,
    });
    expect(tx.job_descriptions.update).not.toHaveBeenCalled();
    expect(tx.screening_Results.updateMany).not.toHaveBeenCalled();
  });

  it('returns null for a posting that is not in the class', async () => {
    const { screening, tx } = withTransaction(undefined);
    expect(await screening.replaceJobKeywords(101, 7, ['Go'])).toBeNull();
    expect(tx.job_descriptions.update).not.toHaveBeenCalled();
  });
});
