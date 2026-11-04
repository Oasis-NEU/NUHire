import { describe, expect, it } from 'vitest';
import type { Pool } from 'mysql2';
import type { Response } from 'express';
import { retryOnDeadlock } from '../src/config/database';
import { ResumeController } from '../src/controller/resume.controller';
import type { AuthRequest } from '../src/models/AuthRequest';

// Two teammates voting on one resume at once deadlocked the vote upsert. The
// loser got a 500, and in the load test its group waited at the resume barrier
// for the rest of the run. A deadlocked statement is now run again.

const deadlock = () => Object.assign(new Error('Deadlock found'), { code: 'ER_LOCK_DEADLOCK' });

describe('retryOnDeadlock', () => {
  it('runs a deadlocked statement again', async () => {
    let calls = 0;
    const result = await retryOnDeadlock(async () => {
      calls += 1;
      if (calls === 1) throw deadlock();
      return 'saved';
    });
    expect(result).toBe('saved');
    expect(calls).toBe(2);
  });

  it('gives up after three attempts', async () => {
    let calls = 0;
    await expect(
      retryOnDeadlock(async () => {
        calls += 1;
        throw deadlock();
      })
    ).rejects.toMatchObject({ code: 'ER_LOCK_DEADLOCK' });
    expect(calls).toBe(3);
  });

  it('does not repeat any other failure', async () => {
    let calls = 0;
    await expect(
      retryOnDeadlock(async () => {
        calls += 1;
        throw Object.assign(new Error('Duplicate'), { code: 'ER_DUP_ENTRY' });
      })
    ).rejects.toMatchObject({ code: 'ER_DUP_ENTRY' });
    expect(calls).toBe(1);
  });
});

describe('submitVote under a deadlock', () => {
  it('saves the vote when the first insert is the deadlock victim', async () => {
    let inserts = 0;
    const db = {
      promise: () => ({
        query: async (sql: string) => {
          if (sql.startsWith('SELECT vote')) return [[]];
          inserts += 1;
          if (inserts === 1) throw deadlock();
          return [{ affectedRows: 1 }];
        },
      }),
    } as unknown as Pool;
    const emits: string[] = [];
    const io = { to: () => ({ emit: (event: string) => emits.push(event) }) };
    const out: { status: number; body?: unknown } = { status: 200 };
    const res = {
      status(code: number) {
        out.status = code;
        return res;
      },
      json(body: unknown) {
        out.body = body;
        return res;
      },
    } as unknown as Response;

    await new ResumeController(db, io).submitVote(
      {
        body: {
          student_id: 9,
          group_id: 1,
          class: 42,
          timespent: 30,
          resume_number: 3,
          vote: 'yes',
        },
      } as AuthRequest,
      res
    );

    expect(out.status).toBe(200);
    expect(inserts).toBe(2);
    expect(emits).toEqual(['voteUpdated']);
  });
});
