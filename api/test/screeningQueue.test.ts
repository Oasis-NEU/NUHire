import { afterEach, describe, expect, it, vi } from 'vitest';
import { GeminiClient } from '../src/config/gemini';
import { ScreeningWorker, startScreeningWorker } from '../src/config/screeningQueue';
import {
  ScreeningInputs,
  ScreeningOutcome,
  ScreeningRun,
  ScreeningTarget,
} from '../src/models/Screening';
import { ScreeningRepository } from '../src/repository/screening.repository';

// The worker against an in-memory Screening_Results, with Gemini mocked. Each
// test's rows stand in for the database, which is what survives a restart.

const CLASS = 101;
const GROUP = { groupId: 3, classId: CLASS };
const JOB = 7;

interface Row {
  resumeId: number;
  status: 'pending' | 'done' | 'failed';
  run: number;
  isSample: boolean;
  outcome?: ScreeningOutcome;
}

const REPLY = JSON.stringify({
  strengths: ['"Built APIs in Python" fits the posting.'],
  gaps: ['No SQL.'],
  score_explanation: 'One of two keywords appears.',
});

function database(resumeIds: number[], { keywords = ['Python', 'SQL'], isSample = true } = {}) {
  const rows = new Map<number, Row>(
    resumeIds.map((resumeId) => [resumeId, { resumeId, status: 'pending', run: 0, isSample }])
  );
  const job = { title: 'Backend Co-op', text: 'Python and SQL.', keywords };
  const texts = new Map<number, string | null>(
    resumeIds.map((id) => [id, `Resume ${id}. Built APIs in Python.`])
  );

  const runOf = (screen: ScreeningRun) => {
    const row = rows.get(screen.resumeId);
    return row && row.run === screen.run ? row : undefined;
  };
  const screening: ScreeningRepository = {
    queue: vi.fn(),
    queueAssigned: vi.fn(),
    listForGroup: vi.fn(),
    // What the keyword endpoint commits: new keywords, and every row queued again.
    replaceJobKeywords: vi.fn(async (_classId: number, _jobId: number, keywords: string[]) => {
      job.keywords = keywords;
      for (const row of rows.values()) {
        row.status = 'pending';
        row.outcome = undefined;
        row.run++;
      }
      return { changed: true, requeued: rows.size, cleared: 0 };
    }),
    nextPending: vi.fn(async () => {
      const row = [...rows.values()]
        .sort((a, b) => a.resumeId - b.resumeId)
        .find((r) => r.status === 'pending');
      return row ? { group: GROUP, jobId: JOB, resumeId: row.resumeId, run: row.run } : null;
    }),
    inputsFor: vi.fn(async (_jobId: number, resumeId: number): Promise<ScreeningInputs | null> => ({
      job: { ...job, keywords: [...job.keywords] },
      resume: { text: texts.get(resumeId) ?? null, names: ['Aisha', 'Patel'] },
    })),
    isSample: vi.fn(async (_group, { resumeId }: ScreeningTarget) => {
      const row = rows.get(resumeId);
      return row ? (row.isSample ? 1 : 0) : null;
    }),
    saveDone: vi.fn(async (screen: ScreeningRun, outcome: ScreeningOutcome) => {
      const row = runOf(screen);
      if (!row) return false;
      row.status = 'done';
      row.outcome = outcome;
      return true;
    }),
    markFailed: vi.fn(async (screen: ScreeningRun) => {
      const row = runOf(screen);
      if (!row) return false;
      row.status = 'failed';
      row.outcome = undefined;
      return true;
    }),
  };
  const statuses = () => [...rows.values()].map((row) => `${row.resumeId}:${row.status}`);
  return { rows, job, texts, screening, statuses };
}

const workers: ScreeningWorker[] = [];
function worker(
  screening: ScreeningRepository,
  generate: GeminiClient['generate'],
  options: { allowRealResumes?: boolean; sleep?: (ms: number) => Promise<void> } = {}
) {
  const started = startScreeningWorker({
    screening,
    client: { generate },
    pauseMs: 6000,
    pollMs: 3_600_000,
    sleep: options.sleep ?? (async () => {}),
    allowRealResumes: options.allowRealResumes,
  });
  workers.push(started);
  started.wake();
  return started;
}

afterEach(() => {
  workers.splice(0).forEach((w) => w.stop());
  vi.restoreAllMocks();
});

const quiet = () => {
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
};

describe('startScreeningWorker', () => {
  it('moves every pending row to done, one Gemini call at a time, pausing after each', async () => {
    const db = database([1, 2, 3]);
    let inFlight = 0;
    let most = 0;
    const generate = vi.fn<GeminiClient['generate']>(async () => {
      most = Math.max(most, ++inFlight);
      await new Promise((resolve) => setTimeout(resolve, 5));
      inFlight--;
      return REPLY;
    });
    const sleep = vi.fn(async () => {});

    await worker(db.screening, generate, { sleep }).idle();

    expect(db.statuses()).toEqual(['1:done', '2:done', '3:done']);
    expect(generate).toHaveBeenCalledTimes(3);
    expect(most).toBe(1);
    expect(sleep.mock.calls).toEqual([[6000], [6000], [6000]]);
    expect(db.rows.get(1)?.outcome?.score).toBe(50);
  });

  it('marks a resume Gemini keeps failing on as failed, and screens the rest', async () => {
    quiet();
    const db = database([1, 2, 3]);
    const generate = vi.fn<GeminiClient['generate']>(async (_instructions, resume) => {
      if (resume.text.includes('Resume 2.')) throw new Error('Gemini answered HTTP 500');
      return REPLY;
    });

    await worker(db.screening, generate).idle();
    expect(db.statuses()).toEqual(['1:done', '2:failed', '3:done']);
  });

  it('marks a row failed when reading its inputs throws, and screens the rest', async () => {
    quiet();
    const db = database([1, 2]);
    vi.mocked(db.screening.inputsFor).mockRejectedValueOnce(new Error('connection lost'));

    await worker(
      db.screening,
      vi.fn(async () => REPLY)
    ).idle();
    expect(db.statuses()).toEqual(['1:failed', '2:done']);
  });

  it('fails a resume with no text, or a posting with no keywords, without calling Gemini', async () => {
    quiet();
    const db = database([1, 2]);
    db.texts.set(1, null);
    const generate = vi.fn(async () => REPLY);
    await worker(db.screening, generate).idle();
    expect(db.statuses()).toEqual(['1:failed', '2:done']);
    expect(generate).toHaveBeenCalledTimes(1);

    const none = database([1], { keywords: [] });
    await worker(none.screening, generate).idle();
    expect(none.statuses()).toEqual(['1:failed']);
    expect(generate).toHaveBeenCalledTimes(1);
  });

  it('refuses real resumes while the flag is off, without pausing for them', async () => {
    quiet();
    const db = database([1, 2], { isSample: false });
    const generate = vi.fn(async () => REPLY);
    const sleep = vi.fn(async () => {});

    await worker(db.screening, generate, { allowRealResumes: false, sleep }).idle();
    expect(db.statuses()).toEqual(['1:failed', '2:failed']);
    expect(generate).not.toHaveBeenCalled();
    expect(sleep).not.toHaveBeenCalled();
  });

  it('picks up a row queued while it is running', async () => {
    const db = database([1]);
    let release = () => {};
    const generate = vi
      .fn<GeminiClient['generate']>()
      .mockImplementationOnce(() => new Promise((resolve) => (release = () => resolve(REPLY))))
      .mockResolvedValue(REPLY);
    const running = worker(db.screening, generate);
    await vi.waitFor(() => expect(generate).toHaveBeenCalledTimes(1));

    db.rows.set(2, { resumeId: 2, status: 'pending', run: 0, isSample: true });
    db.texts.set(2, 'Resume 2. Built APIs in Python.');
    running.wake();
    release();
    await running.idle();
    expect(db.statuses()).toEqual(['1:done', '2:done']);
  });

  it('resumes the queue after a restart in the middle of a run', async () => {
    const db = database([1, 2, 3]);
    // The first process dies while Gemini is screening resume 2: its call never returns.
    const dying = vi
      .fn<GeminiClient['generate']>()
      .mockResolvedValueOnce(REPLY)
      .mockImplementationOnce(() => new Promise(() => {}));
    const first = worker(db.screening, dying);
    await vi.waitFor(() => expect(dying).toHaveBeenCalledTimes(2));
    first.stop();
    expect(db.statuses()).toEqual(['1:done', '2:pending', '3:pending']);

    // The restarted process starts on the same rows.
    const fresh = vi.fn(async () => REPLY);
    await worker(db.screening, fresh).idle();
    expect(db.statuses()).toEqual(['1:done', '2:done', '3:done']);
    expect(fresh).toHaveBeenCalledTimes(2);
  });

  it('re-screens with the new keywords when they change mid-screen, dropping the old result', async () => {
    const db = database([1]);
    let release = () => {};
    const generate = vi
      .fn<GeminiClient['generate']>()
      .mockImplementationOnce(() => new Promise((resolve) => (release = () => resolve(REPLY))))
      .mockResolvedValue(REPLY);
    const running = worker(db.screening, generate);
    await vi.waitFor(() => expect(generate).toHaveBeenCalledTimes(1));

    await db.screening.replaceJobKeywords(CLASS, JOB, ['Python']);
    release();
    await running.idle();

    expect(generate).toHaveBeenCalledTimes(2);
    expect(db.rows.get(1)).toMatchObject({ status: 'done', run: 1 });
    expect(db.rows.get(1)?.outcome).toMatchObject({ score: 100, matched_keywords: ['Python'] });
  });

  it('stops when even marking a row failed throws, and carries on at the next wake', async () => {
    quiet();
    const db = database([1, 2]);
    vi.mocked(db.screening.inputsFor).mockRejectedValueOnce(new Error('database down'));
    vi.mocked(db.screening.markFailed).mockRejectedValueOnce(new Error('database down'));

    const running = worker(
      db.screening,
      vi.fn(async () => REPLY)
    );
    await running.idle();
    expect(db.statuses()).toEqual(['1:pending', '2:pending']);

    running.wake();
    await running.idle();
    expect(db.statuses()).toEqual(['1:done', '2:done']);
  });

  it('polls once first woken, so a row no wake announced is not stranded', async () => {
    vi.useFakeTimers();
    try {
      const db = database([]);
      const running = startScreeningWorker({
        screening: db.screening,
        client: { generate: vi.fn(async () => REPLY) },
        pollMs: 60_000,
        sleep: async () => {},
      });
      workers.push(running);
      expect(vi.getTimerCount()).toBe(0);
      running.wake();
      await vi.advanceTimersByTimeAsync(0);
      db.rows.set(1, { resumeId: 1, status: 'pending', run: 0, isSample: true });
      db.texts.set(1, 'Resume 1. Built APIs in Python.');

      await vi.advanceTimersByTimeAsync(60_000);
      await running.idle();
      expect(db.statuses()).toEqual(['1:done']);
    } finally {
      vi.useRealTimers();
    }
  });
});
