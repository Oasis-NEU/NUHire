import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Pool } from 'mysql2';
import type { Response } from 'express';
import { JobController } from '../src/controller/job.controller';
import { ResumeController } from '../src/controller/resume.controller';
import { ScreeningController } from '../src/controller/screening.controller';
import type { AuthRequest } from '../src/models/AuthRequest';
import { fakeScreens } from './fakeScreens';

// What queues screens: a resume upload, assigning a job, and changing a job's
// keywords. Each only writes rows and wakes the worker; none waits on Gemini.

function fakeRes() {
  const out: { status: number; body: unknown } = { status: 200, body: undefined };
  const res = {
    status(code: number) {
      out.status = code;
      return res;
    },
    json(body: unknown) {
      out.body = body;
      return res;
    },
  };
  return { res: res as unknown as Response, out };
}

const io = { to: () => ({ emit: () => {} }) } as never;

function assignmentDb() {
  const conn = {
    beginTransaction: async () => {},
    commit: async () => {},
    rollback: async () => {},
    release: () => {},
    query: async (sql: string) =>
      sql.includes('FROM `GroupsInfo`') ? [[{ group_id: 1 }, { group_id: 2 }]] : [{}],
  };
  return { promise: () => ({ getConnection: async () => conn }) } as unknown as Pool;
}

afterEach(() => vi.restoreAllMocks());

describe('assigning a job queues its screens', () => {
  it('for the one group, after the assignment commits', async () => {
    const fake = fakeScreens();
    const { res, out } = fakeRes();
    await new JobController(assignmentDb(), io, {}, fake.screens).updateJob(
      { body: { job_group_id: '3', class_id: '42', job: 'Carbonite' } } as AuthRequest,
      res
    );
    expect(out.status).toBe(200);
    expect(fake.queueAssigned).toHaveBeenCalledWith(42, { groupIds: [3] });
    expect(fake.wake).toHaveBeenCalledTimes(1);
  });

  it('for every group in the class', async () => {
    const fake = fakeScreens();
    const { res, out } = fakeRes();
    await new JobController(assignmentDb(), io, {}, fake.screens).assignJobToAllGroups(
      { body: { class_id: '42', job_title: 'Carbonite' } } as AuthRequest,
      res
    );
    expect(out.status).toBe(200);
    expect(fake.queueAssigned).toHaveBeenCalledWith(42, { groupIds: [1, 2] });
  });

  it('still answers 200 when queueing fails, and does not wake an empty queue', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const failing = fakeScreens();
    failing.queueAssigned.mockRejectedValueOnce(new Error('pool busy'));
    const { res, out } = fakeRes();
    await new JobController(assignmentDb(), io, {}, failing.screens).updateJob(
      { body: { job_group_id: '3', class_id: '42', job: 'Carbonite' } } as AuthRequest,
      res
    );
    expect(out.status).toBe(200);
    expect(failing.wake).not.toHaveBeenCalled();

    const nothing = fakeScreens(0);
    await new JobController(assignmentDb(), io, {}, nothing.screens).updateJob(
      { body: { job_group_id: '3', class_id: '42', job: 'Carbonite' } } as AuthRequest,
      fakeRes().res
    );
    expect(nothing.wake).not.toHaveBeenCalled();
  });
});

describe('uploading a resume queues its screens', () => {
  it('for the new resume, and answers without waiting on a screen', async () => {
    const fake = fakeScreens();
    const db = {
      query: (sql: string, _params: unknown[], done: (err: null, result: unknown) => void) =>
        done(null, sql.startsWith('INSERT INTO Resume_pdfs') ? { insertId: 77 } : {}),
    } as unknown as Pool;
    const { res, out } = fakeRes();
    const body = {
      resTitle: 'Jordan',
      filePath: 'uploads/resumes/missing.pdf',
      f_name: 'Jordan',
      l_name: 'Rivera',
      vid: 'https://example.com/v',
      class_id: '42',
    };

    await new ResumeController(db, io, fake.screens).createResumePdf({ body } as AuthRequest, res);
    await vi.waitFor(() => expect(out.body).toBeDefined());

    expect(out.body).toMatchObject({ resumeId: 77 });
    expect(fake.queueAssigned).toHaveBeenCalledWith(42, { resumeId: 77 });
    expect(fake.wake).toHaveBeenCalledTimes(1);
  });
});

describe('PUT /jobs/:job_id/keywords', () => {
  const call = async (
    fake: ReturnType<typeof fakeScreens>,
    params: Record<string, string>,
    body: unknown
  ) => {
    const { res, out } = fakeRes();
    await new ScreeningController(fake.screens).setKeywords(
      { params, body } as unknown as AuthRequest,
      res
    );
    return out;
  };

  it('stores trimmed keywords, queues the posting again and wakes the worker', async () => {
    const fake = fakeScreens();
    fake.replaceJobKeywords.mockResolvedValue({ changed: true, requeued: 30, cleared: 0 });
    const out = await call(
      fake,
      { job_id: '7' },
      { class_id: 42, keywords: [' Python ', '', 'SQL'] }
    );

    expect(out.status).toBe(200);
    expect(fake.replaceJobKeywords).toHaveBeenCalledWith(42, 7, ['Python', 'SQL']);
    expect(fake.wake).toHaveBeenCalled();
    expect(fake.queueAssigned).toHaveBeenCalledWith(42, { jobId: 7 });
    expect(out.body).toEqual({
      job_id: 7,
      keywords: ['Python', 'SQL'],
      changed: true,
      requeued: 30,
      cleared: 0,
    });
  });

  it('queues nothing when the keywords are unchanged or emptied', async () => {
    const same = fakeScreens();
    same.replaceJobKeywords.mockResolvedValue({ changed: false, requeued: 0, cleared: 0 });
    await call(same, { job_id: '7' }, { class_id: 42, keywords: ['Python'] });
    expect(same.wake).not.toHaveBeenCalled();
    expect(same.queueAssigned).not.toHaveBeenCalled();

    const emptied = fakeScreens();
    emptied.replaceJobKeywords.mockResolvedValue({ changed: true, requeued: 0, cleared: 12 });
    const out = await call(emptied, { job_id: '7' }, { class_id: 42, keywords: [] });
    expect(out.body).toMatchObject({ keywords: [], cleared: 12 });
    expect(emptied.wake).not.toHaveBeenCalled();
    expect(emptied.queueAssigned).not.toHaveBeenCalled();
  });

  it('answers 404 for a job that is not in the class', async () => {
    const fake = fakeScreens();
    fake.replaceJobKeywords.mockResolvedValue(null);
    expect((await call(fake, { job_id: '7' }, { class_id: 42, keywords: ['Go'] })).status).toBe(
      404
    );
  });

  it('answers 400 for bad ids or keywords, without touching the database', async () => {
    const fake = fakeScreens();
    for (const [params, body] of [
      [{ job_id: 'x' }, { class_id: 42, keywords: ['Go'] }],
      [{ job_id: '7' }, { class_id: 0, keywords: ['Go'] }],
      [{ job_id: '7' }, { class_id: 42 }],
      [{ job_id: '7' }, { class_id: 42, keywords: 'Go, SQL' }],
      [{ job_id: '7' }, { class_id: 42, keywords: ['Go', 3] }],
      [{ job_id: '7' }, { class_id: 42, keywords: Array.from({ length: 51 }, (_, i) => `k${i}`) }],
      [{ job_id: '7' }, { class_id: 42, keywords: ['x'.repeat(101)] }],
    ] as const) {
      expect((await call(fake, params, body)).status).toBe(400);
    }
    expect(fake.replaceJobKeywords).not.toHaveBeenCalled();
  });

  it('answers 500 with a fixed message when the database fails', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const fake = fakeScreens();
    fake.replaceJobKeywords.mockRejectedValue(new Error('ER_LOCK_DEADLOCK: secret detail'));
    const out = await call(fake, { job_id: '7' }, { class_id: 42, keywords: ['Go'] });
    expect(out).toEqual({ status: 500, body: { error: 'Could not save the keywords' } });
  });
});
