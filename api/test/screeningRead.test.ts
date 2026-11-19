import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import type { Server } from 'http';
import type { AddressInfo } from 'net';
import type { Pool } from 'mysql2';
import screeningRoutes from '../src/routes/screening.routes';
import type { User } from '../src/models/User';
import type { ScreeningResult } from '../src/models/Screening';
import { fakeScreens } from './fakeScreens';

// The read endpoints through the real router and requireGroupMember, with the
// session user and the repository faked. Class 101, group 3 is the caller's.

const SUMMARY = {
  strengths: ['"Built REST APIs in Python" fits the backend work.'],
  gaps: ['No Docker.'],
  score_explanation: 'Two of three keywords appear.',
};

const row = (resumeId: number, fields: Partial<ScreeningResult>): ScreeningResult => ({
  class: 101,
  group_id: 3,
  job_id: 7,
  resume_id: resumeId,
  status: 'pending',
  score: null,
  matched_keywords: [],
  missed_keywords: [],
  ai_summary: null,
  is_sample: 1,
  ...fields,
});

const PENDING = row(40, {});
const FAILED = row(41, { status: 'failed' });
const DONE = row(42, {
  status: 'done',
  score: 67,
  matched_keywords: ['Python', 'SQL'],
  missed_keywords: ['Docker'],
  ai_summary: JSON.stringify(SUMMARY),
});

const STUDENT: Partial<User> = {
  id: 9,
  email: 's@northeastern.edu',
  affiliation: 'student',
  class: 101,
  group_id: 3,
};

let user: Partial<User> | null = STUDENT;
let moderatorRows: unknown[] = [];
const fake = fakeScreens();
let server: Server;
let base: string;

beforeAll(async () => {
  const db = { promise: () => ({ query: async () => [moderatorRows] }) } as unknown as Pool;
  const app = express();
  app.use((req, _res, next) => {
    Object.assign(req, { isAuthenticated: () => user !== null, user: user ?? undefined });
    next();
  });
  app.use('/screening', screeningRoutes(db, fake.screens));
  server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/screening`;
});

afterAll(() => new Promise((resolve) => server.close(resolve)));

beforeEach(() => {
  user = STUDENT;
  moderatorRows = [];
  vi.mocked(fake.listForGroup).mockReset().mockResolvedValue([PENDING, FAILED, DONE]);
  vi.mocked(fake.findOne).mockReset().mockResolvedValue(DONE);
});

const get = async (path: string) => {
  const res = await fetch(`${base}${path}`);
  return { status: res.status, body: await res.json() };
};

describe('who may read a group’s screening results', () => {
  it('a student in another class gets 403, even with the same group number', async () => {
    user = { ...STUDENT, class: 202 };
    expect((await get('/101/3/jobs/7')).status).toBe(403);
    expect((await get('/101/3/jobs/7/resumes/42')).status).toBe(403);
    expect(fake.listForGroup).not.toHaveBeenCalled();
    expect(fake.findOne).not.toHaveBeenCalled();
  });

  it('a student in another group of the same class gets 403', async () => {
    user = { ...STUDENT, group_id: 4 };
    expect(await get('/101/3/jobs/7')).toEqual({
      status: 403,
      body: { error: 'Forbidden: that is not your group' },
    });
  });

  it('a student with no group yet gets 403', async () => {
    user = { ...STUDENT, class: undefined, group_id: undefined };
    expect((await get('/101/3/jobs/7')).status).toBe(403);
  });

  it('nobody signed in gets 401', async () => {
    user = null;
    expect((await get('/101/3/jobs/7')).status).toBe(401);
  });

  it('a professor reads a class they teach, and gets 403 for one they do not', async () => {
    user = { id: 1, email: 'prof@northeastern.edu', affiliation: 'admin' };
    moderatorRows = [{ 1: 1 }];
    expect((await get('/101/3/jobs/7')).status).toBe(200);
    moderatorRows = [];
    expect((await get('/101/3/jobs/7')).status).toBe(403);
  });

  it('answers 400 for ids that are not positive integers', async () => {
    expect((await get('/abc/3/jobs/7')).status).toBe(400);
    expect((await get('/101/0/jobs/7')).status).toBe(400);
    expect((await get('/101/3/jobs/x')).status).toBe(400);
    expect((await get('/101/3/jobs/7/resumes/-1')).status).toBe(400);
  });
});

describe('GET /screening/:classId/:groupId/jobs/:jobId', () => {
  it("lists the caller's group's pending, failed and done rows for the job", async () => {
    const { status, body } = await get('/101/3/jobs/7');
    expect(status).toBe(200);
    expect(fake.listForGroup).toHaveBeenCalledWith({ classId: 101, groupId: 3 }, 7);
    expect(body).toEqual([
      {
        job_id: 7,
        resume_id: 40,
        status: 'pending',
        score: null,
        matched_keywords: [],
        missed_keywords: [],
        summary: null,
      },
      {
        job_id: 7,
        resume_id: 41,
        status: 'failed',
        score: null,
        matched_keywords: [],
        missed_keywords: [],
        summary: null,
      },
      {
        job_id: 7,
        resume_id: 42,
        status: 'done',
        score: 67,
        matched_keywords: ['Python', 'SQL'],
        missed_keywords: ['Docker'],
        summary: SUMMARY,
      },
    ]);
  });

  it('sends neither the raw reply nor whether a resume is sample data', async () => {
    const { body } = await get('/101/3/jobs/7');
    for (const result of body) {
      expect(result).not.toHaveProperty('ai_summary');
      expect(result).not.toHaveProperty('is_sample');
    }
  });

  it('answers an empty list for a job with no results', async () => {
    vi.mocked(fake.listForGroup).mockResolvedValue([]);
    expect(await get('/101/3/jobs/7')).toEqual({ status: 200, body: [] });
  });

  it('answers 500 with a fixed message when the database fails', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.mocked(fake.listForGroup).mockRejectedValue(new Error('ER_CON_COUNT_ERROR: detail'));
    expect(await get('/101/3/jobs/7')).toEqual({
      status: 500,
      body: { error: 'Could not load the screening results' },
    });
  });
});

describe('GET /screening/:classId/:groupId/jobs/:jobId/resumes/:resumeId', () => {
  it('fetches one done row, with its summary', async () => {
    const { status, body } = await get('/101/3/jobs/7/resumes/42');
    expect(status).toBe(200);
    expect(fake.findOne).toHaveBeenCalledWith(
      { classId: 101, groupId: 3 },
      { jobId: 7, resumeId: 42 }
    );
    expect(body).toMatchObject({ resume_id: 42, status: 'done', score: 67, summary: SUMMARY });
  });

  it('fetches a pending row and a failed row with no score or summary', async () => {
    vi.mocked(fake.findOne).mockResolvedValueOnce(PENDING).mockResolvedValueOnce(FAILED);
    expect((await get('/101/3/jobs/7/resumes/40')).body).toMatchObject({
      status: 'pending',
      score: null,
      summary: null,
    });
    expect((await get('/101/3/jobs/7/resumes/41')).body).toMatchObject({
      status: 'failed',
      score: null,
      summary: null,
    });
  });

  it('reads a done row whose stored reply is not a ScreenerReply as no summary', async () => {
    vi.mocked(fake.findOne).mockResolvedValue({ ...DONE, ai_summary: '{"note":"old shape"}' });
    expect((await get('/101/3/jobs/7/resumes/42')).body).toMatchObject({
      status: 'done',
      score: 67,
      summary: null,
    });
  });

  it('answers 404 for a resume with no result', async () => {
    vi.mocked(fake.findOne).mockResolvedValue(null);
    expect((await get('/101/3/jobs/7/resumes/99')).status).toBe(404);
  });
});
