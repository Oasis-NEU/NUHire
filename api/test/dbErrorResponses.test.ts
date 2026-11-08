import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Pool } from 'mysql2';
import type { Response } from 'express';
import type { Server as SocketIOServer } from 'socket.io';
import type { AuthRequest } from '../src/models/AuthRequest';
import type { PdfTextRepository } from '../src/repository/pdfText.repository';
import { JobController } from '../src/controller/job.controller';
import { ModeratorController } from '../src/controller/moderator.controller';
import { OfferController } from '../src/controller/offer.controller';
import { ResumeController } from '../src/controller/resume.controller';
import { UserController } from '../src/controller/user.controller';

// MySQL's error text names tables and columns. It belongs in the server log,
// never in a response the browser can read.

const MYSQL_TEXT = "Table 'nuhire.Offers' doesn't exist";

function failingDb(): Pool {
  const fail = () => Object.assign(new Error(MYSQL_TEXT), { code: 'ER_NO_SUCH_TABLE' });
  const conn = {
    beginTransaction: async () => {},
    query: async () => {
      throw fail();
    },
    rollback: async () => {},
    release: () => {},
  };
  return {
    query: (_sql: string, paramsOrCb: unknown, cb?: (err: Error) => void) => {
      const callback = typeof paramsOrCb === 'function' ? paramsOrCb : cb;
      (callback as (err: Error) => void)(fail());
    },
    promise: () => ({ getConnection: async () => conn }),
  } as unknown as Pool;
}

function fakeRes() {
  const res = { status: vi.fn(), json: vi.fn() };
  res.status.mockReturnValue(res);
  return res as unknown as Response & {
    status: ReturnType<typeof vi.fn>;
    json: ReturnType<typeof vi.fn>;
  };
}

const req = {
  user: { id: 1, email: 'prof@northeastern.edu', affiliation: 'admin', group_id: 1, class: 1 },
  params: {
    student_id: '1',
    group_id: '1',
    class_id: '1',
    class: '1',
    id: '1',
    offer_id: '1',
    title: 'Carbonite',
    crn: '1',
    email: 'prof@northeastern.edu',
  },
  query: { class: '1', class_id: '1', title: 'Carbonite' },
  body: {
    candidate_id: 1,
    status: 'accepted',
    admin_email: 'prof@northeastern.edu',
    crn: 1,
    email: 'student@northeastern.edu',
    class_id: 1,
    group_id: 1,
    f_name: 'Ana',
    l_name: 'Cruz',
  },
} as unknown as AuthRequest;

const io = {} as SocketIOServer;
const db = failingDb();
const user = new UserController(db, io);
const resume = new ResumeController(db, io);
const offer = new OfferController(db);
const job = new JobController(db, io, {});
const moderator = new ModeratorController(db, {} as PdfTextRepository);

type Handler = (req: AuthRequest, res: Response) => unknown;

const handlers: [string, Handler][] = [
  ['user.getAllUsers', user.getAllUsers],
  ['user.getStudents', user.getStudents],
  ['resume.getResumesByStudent', resume.getResumesByStudent],
  ['resume.getResumesByGroup', resume.getResumesByGroup],
  ['resume.getAllResumePdfs', resume.getAllResumePdfs],
  ['resume.getResumePdfById', resume.getResumePdfById],
  ['offer.createOffer', offer.createOffer],
  ['offer.getOffersByGroupAndClass', offer.getOffersByGroupAndClass],
  ['offer.getOffersByClass', offer.getOffersByClass],
  ['offer.updateOffer', offer.updateOffer],
  ['job.getAllJobs', job.getAllJobs],
  ['job.getJobByTitle', job.getJobByTitle],
  ['job.getJobAssignment', job.getJobAssignment],
  ['moderator.addModeratorCRN', moderator.addModeratorCRN],
  ['moderator.getAllModeratorCRNs', moderator.getAllModeratorCRNs],
  ['moderator.deleteModeratorCRN', moderator.deleteModeratorCRN],
  ['moderator.getModeratorCRN', moderator.getModeratorCRN],
  ['moderator.getModeratorClasses', moderator.getModeratorClasses],
  ['moderator.getModeratorClassesFull', moderator.getModeratorClassesFull],
  ['moderator.addStudent', moderator.addStudent],
  ['moderator.deleteStudent', moderator.deleteStudent],
];

describe('a failed query', () => {
  let logged: ReturnType<typeof vi.spyOn>;
  beforeEach(() => {
    logged = vi.spyOn(console, 'error').mockImplementation(() => {});
  });
  afterEach(() => {
    logged.mockRestore();
  });

  it.each(handlers)('%s answers with a fixed message and logs the real one', async (_, handler) => {
    const res = fakeRes();
    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
    const body = res.json.mock.calls[0][0] as { error: string };
    expect(body.error).toMatch(/^Failed to /);
    expect(body.error).not.toContain('nuhire');
    expect(logged).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ message: MYSQL_TEXT })
    );
  });
});
