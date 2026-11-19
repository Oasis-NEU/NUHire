import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import type { Server } from 'http';
import type { AddressInfo } from 'net';
import type { Pool } from 'mysql2';
import type { PrismaDb } from '../src/config/database';
import { stripContactInfo } from '../src/config/contactInfo';
import { NORTH_AMERICAN_PHONE } from '../src/config/contactPatterns';
import { extractPdfText } from '../src/config/pdfText';
import { RESUME_PACK } from '../src/config/resumePack';
import { ResumePackController } from '../src/controller/resumePack.controller';
import { requireClassModerator } from '../src/middleware/auth.middleware';
import type { PackResumeWithText } from '../src/models/ResumePack';
import type { User } from '../src/models/User';
import {
  createResumePackRepository,
  ResumePackRepository,
} from '../src/repository/resumePack.repository';
import { contactLeaks, NO_LEAKS } from './contactLeaks';
import { fakeScreens } from './fakeScreens';

describe('the sample resume pack', () => {
  const texts = new Map<string, string>();
  beforeAll(async () => {
    for (const resume of RESUME_PACK) {
      texts.set(resume.title, (await extractPdfText('Resume_pdfs', resume.file_path)) ?? '');
    }
  });

  it('holds 10 to 15 resumes, each with its own title, file and interview', () => {
    expect(RESUME_PACK.length).toBeGreaterThanOrEqual(10);
    expect(RESUME_PACK.length).toBeLessThanOrEqual(15);
    expect(new Set(RESUME_PACK.map((r) => r.title)).size).toBe(RESUME_PACK.length);
    expect(new Set(RESUME_PACK.map((r) => r.file_path)).size).toBe(RESUME_PACK.length);
    for (const resume of RESUME_PACK) expect(resume.interview).toMatch(/^https:\/\/www\.youtube/);
  });

  it("ships every PDF with readable text that names the pack's candidate", () => {
    for (const resume of RESUME_PACK) {
      const text = texts.get(resume.title) ?? '';
      expect(text, resume.file_path).toContain(`${resume.f_name} ${resume.l_name}`);
    }
  });

  it('is clearly fake: says so on the page, with only reserved emails and phone numbers', () => {
    for (const resume of RESUME_PACK) {
      const text = texts.get(resume.title) ?? '';
      expect(text, resume.file_path).toContain('Fictional resume made for NUHire practice');

      const emails = text.match(/[\w.+-]+@[\w.-]+\.\w+/g) ?? [];
      expect(emails.length, resume.file_path).toBeGreaterThan(0);
      for (const email of emails) expect(email).toMatch(/@example\.(com|org|net)$/);

      const phones = text.match(NORTH_AMERICAN_PHONE) ?? [];
      expect(phones.length, resume.file_path).toBeGreaterThan(0);
      for (const phone of phones) expect(phone.replace(/\D/g, '')).toMatch(/^1?\d{3}55501\d{2}$/);
    }
  });

  it('leaves no contact details once stripped, like any resume sent to Gemini', () => {
    for (const resume of RESUME_PACK) {
      const names = [resume.f_name, resume.l_name];
      const stripped = stripContactInfo(texts.get(resume.title) ?? '', names).text;
      expect(contactLeaks(stripped, names), resume.file_path).toEqual(NO_LEAKS);
    }
  });
});

describe('POST /resume_pdf/sample-pack', () => {
  const PROF: Partial<User> = { id: 1, email: 'prof@northeastern.edu', affiliation: 'admin' };
  let user: Partial<User> = PROF;
  let teaches = true;
  const load = vi.fn<ResumePackRepository['load']>();
  const readText = vi.fn<typeof extractPdfText>();
  const fake = fakeScreens();
  let server: Server;
  let url: string;

  beforeAll(async () => {
    const db = {
      promise: () => ({ query: async () => [teaches ? [{ 1: 1 }] : []] }),
    } as unknown as Pool;
    const controller = new ResumePackController({ load }, fake.screens, readText);
    const app = express();
    app.use(express.json());
    app.use((req, _res, next) => {
      Object.assign(req, { isAuthenticated: () => true, user });
      next();
    });
    app.post('/sample-pack', requireClassModerator(db), controller.load);
    server = app.listen(0);
    await new Promise((resolve) => server.once('listening', resolve));
    url = `http://127.0.0.1:${(server.address() as AddressInfo).port}/sample-pack`;
  });

  afterAll(() => new Promise((resolve) => server.close(resolve)));

  beforeEach(() => {
    user = PROF;
    teaches = true;
    load.mockReset().mockResolvedValue({ added: RESUME_PACK.length, alreadyLoaded: 0 });
    readText.mockReset().mockImplementation(async (_table, filePath) => `text of ${filePath}`);
    fake.queueAssigned.mockClear();
    fake.wake.mockClear();
    vi.restoreAllMocks();
  });

  const post = async (body: unknown) => {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    return { status: res.status, body: await res.json() };
  };

  it('loads the whole pack into the class in one call, with each PDF’s text', async () => {
    expect(await post({ class_id: 101 })).toEqual({
      status: 200,
      body: { added: RESUME_PACK.length, alreadyLoaded: 0 },
    });
    expect(load).toHaveBeenCalledTimes(1);
    const [classId, resumes] = load.mock.calls[0];
    expect(classId).toBe(101);
    expect(resumes).toEqual(
      RESUME_PACK.map((resume) => ({ ...resume, extracted_text: `text of ${resume.file_path}` }))
    );
  });

  it("queues the class's screens once resumes are added", async () => {
    await post({ class_id: 101 });
    expect(fake.queueAssigned).toHaveBeenCalledWith(101, {});
    expect(fake.wake).toHaveBeenCalled();
  });

  it('adds and queues nothing when the class already has the pack', async () => {
    load.mockResolvedValue({ added: 0, alreadyLoaded: RESUME_PACK.length });
    expect((await post({ class_id: 101 })).body).toEqual({
      added: 0,
      alreadyLoaded: RESUME_PACK.length,
    });
    expect(fake.queueAssigned).not.toHaveBeenCalled();
  });

  it('refuses a professor who does not teach the class, and a student', async () => {
    teaches = false;
    expect((await post({ class_id: 101 })).status).toBe(403);
    teaches = true;
    user = { id: 9, email: 's@northeastern.edu', affiliation: 'student' };
    expect((await post({ class_id: 101 })).status).toBe(403);
    expect(load).not.toHaveBeenCalled();
  });

  it('answers 400 without a class', async () => {
    expect((await post({})).status).toBe(400);
    expect(load).not.toHaveBeenCalled();
  });

  it('stores nothing when a pack file is missing or unreadable', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    readText.mockImplementation(async (_table, filePath) =>
      filePath.endsWith('sample-pack-4.pdf') ? null : 'text'
    );
    expect(await post({ class_id: 101 })).toEqual({
      status: 500,
      body: { error: 'The sample resume files are missing on the server' },
    });
    expect(load).not.toHaveBeenCalled();
  });

  it('answers a fixed message when the database fails', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    load.mockRejectedValue(new Error('ER_LOCK_WAIT_TIMEOUT: detail'));
    expect(await post({ class_id: 101 })).toEqual({
      status: 500,
      body: { error: 'Could not load the sample resumes' },
    });
  });
});

describe('resume pack repository', () => {
  const RESUMES: PackResumeWithText[] = RESUME_PACK.slice(0, 3).map((resume) => ({
    ...resume,
    extracted_text: `text of ${resume.title}`,
  }));

  function withClass(titles: string[]) {
    let nextId = 500;
    const tx = {
      resume_pdfs: {
        findMany: vi.fn(async () => titles.map((title) => ({ title }))),
        create: vi.fn(async () => ({ id: nextId++ })),
      },
      candidates: { create: vi.fn(async () => ({})) },
    };
    const $transaction = vi.fn(async (run: (client: typeof tx) => Promise<unknown>) => run(tx));
    const db = { $transaction } as unknown as PrismaDb;
    return { packs: createResumePackRepository(db), tx, $transaction };
  }

  it('adds each resume with its candidate, in one transaction', async () => {
    const { packs, tx, $transaction } = withClass([]);
    expect(await packs.load(101, RESUMES)).toEqual({ added: 3, alreadyLoaded: 0 });
    expect($transaction).toHaveBeenCalledTimes(1);
    expect(tx.resume_pdfs.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { class_id: 101, title: { in: RESUMES.map((r) => r.title) } },
      })
    );
    expect(tx.resume_pdfs.create).toHaveBeenCalledWith({
      data: {
        title: RESUMES[0].title,
        file_path: RESUMES[0].file_path,
        class_id: 101,
        extracted_text: RESUMES[0].extracted_text,
      },
      select: { id: true },
    });
    expect(tx.candidates.create).toHaveBeenCalledWith({
      data: {
        resume_id: 500,
        f_name: RESUMES[0].f_name,
        l_name: RESUMES[0].l_name,
        interview: RESUMES[0].interview,
      },
    });
    expect(tx.candidates.create).toHaveBeenCalledTimes(3);
  });

  it('skips the titles the class already has', async () => {
    const { packs, tx } = withClass([RESUMES[1].title]);
    expect(await packs.load(101, RESUMES)).toEqual({ added: 2, alreadyLoaded: 1 });
    const added = tx.resume_pdfs.create.mock.calls.map(
      (call) => (call as unknown as [{ data: { title: string } }])[0].data.title
    );
    expect(added).toEqual([RESUMES[0].title, RESUMES[2].title]);
  });
});
