// src/config/screeningQueue.ts
//
// Runs queued screens in the background, one at a time. The queue is the
// pending rows of Screening_Results, not anything in memory: an upload or a
// keyword change writes rows and wakes the worker, and the worker takes the
// next pending row until there are none. An API restart loses nothing, since
// the rows are still pending and the worker starts on them at boot.
//
// One at a time, with PAUSE_MS after each screen that called Gemini, holds the
// worker to about 10 screens a minute, so a class's uploads trickle in rather
// than burst at a free-tier requests-per-minute limit. Google does not publish
// that limit for this model; a 429 is a failed call, retried once.
//
// A screen that fails is marked failed and the worker moves on, so one bad
// resume never holds up the rest. If even that write fails, the database is
// in trouble: the worker stops and tries again on the next wake, or within
// POLL_MS.

import { GeminiClient } from './gemini';
import { ScreenResult, screenResume } from './screener';
import { QueueScope, ScreeningRun } from '../models/Screening';
import { ScreeningRepository } from '../repository/screening.repository';

export const PAUSE_MS = 6_000;
export const POLL_MS = 60_000;

export interface ScreeningQueue {
  /** Starts the worker if it is idle. Returns at once; the screens run in the background. */
  wake(): void;
}

export interface ScreeningWorker extends ScreeningQueue {
  /** Resolves once the worker is idle. For tests and shutdown. */
  idle(): Promise<void>;
  stop(): void;
}

export interface ScreeningWorkerDeps {
  screening: ScreeningRepository;
  client: GeminiClient;
  allowRealResumes?: boolean;
  pauseMs?: number;
  pollMs?: number;
  sleep?: (ms: number) => Promise<void>;
}

/** A queue that only collects rows: used when there is no Gemini key. */
export const IDLE_QUEUE: ScreeningQueue = { wake: () => {} };

/** What an upload or an assignment needs to queue screens. */
export interface Screens {
  screening: ScreeningRepository;
  queue: ScreeningQueue;
}

/**
 * Queues the screens an upload or assignment calls for and wakes the worker.
 * Awaits only the rows going in, never a screen. Never throws: the caller's
 * own change has already succeeded, and a lost queue write is logged.
 */
export async function queueScreens(
  { screening, queue }: Screens,
  classId: number,
  scope: QueueScope = {}
): Promise<void> {
  try {
    if ((await screening.queueAssigned(classId, scope)) > 0) queue.wake();
  } catch (err) {
    console.error(`Could not queue screens for class ${classId}:`, err);
  }
}

const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export function startScreeningWorker({
  screening,
  client,
  allowRealResumes,
  pauseMs = PAUSE_MS,
  pollMs = POLL_MS,
  sleep = wait,
}: ScreeningWorkerDeps): ScreeningWorker {
  let running: Promise<void> | null = null;
  // Set by a wake that arrives mid-run, so a row queued after the worker's
  // last look is not left until the next poll.
  let wokenAgain = false;
  let stopped = false;

  const where = ({ group, jobId, resumeId }: ScreeningRun) =>
    `group ${group.groupId}, class ${group.classId}, job ${jobId}, resume ${resumeId}`;

  // Throws only when the row could not even be marked failed.
  async function screenOne(screen: ScreeningRun): Promise<ScreenResult> {
    try {
      const inputs = await screening.inputsFor(screen.jobId, screen.resumeId);
      // No text is a PDF that would not extract, which a retry cannot fix.
      if (!inputs?.job.text || !inputs.resume.text || inputs.job.keywords.length === 0) {
        console.warn(`Screening queue skipped ${where(screen)}: no text or no keywords`);
        await screening.markFailed(screen);
        return 'failed';
      }
      return await screenResume(
        { client, screening, allowRealResumes },
        {
          screen,
          job: { ...inputs.job, text: inputs.job.text },
          resume: { text: inputs.resume.text, names: inputs.resume.names },
        }
      );
    } catch (err) {
      console.error(`Screening queue failed on ${where(screen)}:`, err);
      await screening.markFailed(screen);
      return 'failed';
    }
  }

  async function drain(): Promise<void> {
    try {
      do {
        wokenAgain = false;
        for (let screen = await screening.nextPending(); screen && !stopped;) {
          const result = await screenOne(screen);
          if (result === 'done' || result === 'failed' || result === 'stale') await sleep(pauseMs);
          screen = stopped ? null : await screening.nextPending();
        }
      } while (wokenAgain && !stopped);
    } catch (err) {
      console.error('Screening queue stopped; it starts again on the next wake:', err);
    }
  }

  // Started by the first wake, which server.ts gives once resume text is
  // extracted, so a poll can never screen a resume whose text is still coming.
  let timer: NodeJS.Timeout | null = null;

  const wake = () => {
    if (stopped) return;
    if (!timer) {
      timer = setInterval(wake, pollMs);
      timer.unref();
    }
    if (running) {
      wokenAgain = true;
      return;
    }
    running = drain().finally(() => {
      running = null;
      // A wake between the worker's last look and here would otherwise wait for the poll.
      if (wokenAgain) wake();
    });
  };

  return {
    wake,
    idle: async () => {
      while (running) await running;
    },
    stop: () => {
      stopped = true;
      if (timer) clearInterval(timer);
    },
  };
}
