import { describe, expect, it, vi } from 'vitest';
import type { DbClient } from '../src/config/database';
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

  function withResults(count = 1, rows: unknown[] = []) {
    const createMany = vi.fn(async () => ({ count }));
    const findMany = vi.fn(async () => rows);
    const updateMany = vi.fn(async () => ({ count }));
    const db = { screening_Results: { createMany, findMany, updateMany } } as unknown as DbClient;
    return { screening: createScreeningRepository(db), createMany, findMany, updateMany };
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

  it('stores a finished screen on the queued row', async () => {
    const { screening, updateMany } = withResults();
    const outcome = {
      score: 75,
      matched_keywords: ['linux'],
      missed_keywords: ['python'],
      ai_summary: 'Strong on systems.',
    };
    expect(await screening.saveDone(GROUP, 7, 42, outcome)).toBe(true);
    expect(updateMany).toHaveBeenCalledWith({ where: KEY, data: { status: 'done', ...outcome } });
  });

  it('marks a screen failed and clears any earlier result', async () => {
    const { screening, updateMany } = withResults();
    expect(await screening.markFailed(GROUP, 7, 42)).toBe(true);
    expect(updateMany).toHaveBeenCalledWith({
      where: KEY,
      data: {
        status: 'failed',
        score: null,
        matched_keywords: Prisma.DbNull,
        missed_keywords: Prisma.DbNull,
        ai_summary: null,
      },
    });
  });

  it('says so when a result is written for a resume that was never queued', async () => {
    const { screening } = withResults(0);
    expect(
      await screening.saveDone(GROUP, 7, 42, {
        score: 1,
        matched_keywords: [],
        missed_keywords: [],
        ai_summary: null,
      })
    ).toBe(false);
    expect(await screening.markFailed(GROUP, 7, 42)).toBe(false);
  });
});
