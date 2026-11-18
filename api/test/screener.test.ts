import { afterEach, describe, expect, it, vi } from 'vitest';
import { GeminiClient } from '../src/config/gemini';
import {
  parseScreenerReply,
  realResumesAllowed,
  ScreenRequest,
  screenResume,
} from '../src/config/screener';
import { DbBool } from '../src/models/DbBool';
import { ScreeningRepository } from '../src/repository/screening.repository';
import { contactLeaks, NO_LEAKS } from './contactLeaks';

// Gemini is mocked throughout: no test here sends anything anywhere.

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

// Made up, but written to look like a real student's resume.
const REAL_LOOKING = `Jordan Rivera
12 Elm Street, Apt 3B, Boston, MA 02115 | (617) 555-0134 | jordan.rivera@example.com
linkedin.com/in/jordan-rivera | https://github.com/jrivera
EDUCATION
Northeastern University — B.S. Computer Science, GPA 3.85/4.00, 2021 – 2025
EXPERIENCE
Acme Robotics, Software Co-op, Jan 2024 – Jun 2024
Built REST APIs in Python and SQL; cut triage time by 30%.`;

const SCREEN = { group: { groupId: 3, classId: 101 }, jobId: 7, resumeId: 42, run: 2 };

const REQUEST: ScreenRequest = {
  screen: SCREEN,
  job: {
    title: 'Backend Co-op',
    text: 'Build REST APIs in Python.',
    keywords: ['Python', 'SQL', 'Docker'],
  },
  resume: { text: REAL_LOOKING, names: ['Jordan', 'Rivera'] },
};

const REPLY = {
  strengths: ['"Built REST APIs in Python and SQL" fits the backend work.'],
  gaps: ['No Docker, which the posting lists.'],
  score_explanation: 'Two of three keywords appear; Docker is missing.',
};

function setup(isSample: DbBool | null, ...replies: (string | Error)[]) {
  const generate = vi.fn<GeminiClient['generate']>();
  for (const reply of replies) {
    if (reply instanceof Error) generate.mockRejectedValueOnce(reply);
    else generate.mockResolvedValueOnce(reply);
  }
  const screening = {
    queue: vi.fn(),
    queueAssigned: vi.fn(),
    replaceJobKeywords: vi.fn(),
    nextPending: vi.fn(),
    inputsFor: vi.fn(),
    listForGroup: vi.fn(),
    findOne: vi.fn(),
    isSample: vi.fn(async () => isSample),
    saveDone: vi.fn(async () => true),
    markFailed: vi.fn(async () => true),
  } satisfies ScreeningRepository;
  return { client: { generate }, screening, generate };
}

describe('screenResume: the real-resume guard', () => {
  it('refuses a real-looking resume not marked as a sample while the flag is off, sending nothing', async () => {
    const deps = setup(0, JSON.stringify(REPLY));
    vi.spyOn(console, 'warn').mockImplementation(() => {});

    expect(await screenResume({ ...deps, allowRealResumes: false }, REQUEST)).toBe('refused');
    expect(deps.generate).not.toHaveBeenCalled();
    expect(deps.screening.markFailed).toHaveBeenCalledWith(SCREEN);
    expect(deps.screening.saveDone).not.toHaveBeenCalled();
  });

  it('is off by default: refuses with no flag set', async () => {
    const deps = setup(0, JSON.stringify(REPLY));
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.stubEnv('SCREENER_ALLOW_REAL_RESUMES', '');

    expect(await screenResume(deps, REQUEST)).toBe('refused');
    expect(deps.generate).not.toHaveBeenCalled();
  });

  it('reads whether a resume is a sample from its queued row', async () => {
    const deps = setup(1, JSON.stringify(REPLY));
    expect(await screenResume({ ...deps, allowRealResumes: false }, REQUEST)).toBe('done');
    expect(deps.screening.isSample).toHaveBeenCalledWith(SCREEN.group, SCREEN);
  });

  it('sends a real resume once the flag is on', async () => {
    const deps = setup(0, JSON.stringify(REPLY));
    expect(await screenResume({ ...deps, allowRealResumes: true }, REQUEST)).toBe('done');
    expect(deps.generate).toHaveBeenCalledTimes(1);
  });

  it('turns on only for exactly "true"', () => {
    expect(realResumesAllowed({})).toBe(false);
    for (const value of ['', 'false', '1', 'yes', 'TRUE', ' true']) {
      expect(realResumesAllowed({ SCREENER_ALLOW_REAL_RESUMES: value })).toBe(false);
    }
    expect(realResumesAllowed({ SCREENER_ALLOW_REAL_RESUMES: 'true' })).toBe(true);
  });

  it('does nothing for a resume that was never queued', async () => {
    const deps = setup(null, JSON.stringify(REPLY));
    expect(await screenResume({ ...deps, allowRealResumes: true }, REQUEST)).toBe('not_queued');
    expect(deps.generate).not.toHaveBeenCalled();
    expect(deps.screening.markFailed).not.toHaveBeenCalled();
    expect(deps.screening.saveDone).not.toHaveBeenCalled();
  });
});

describe('screenResume: the call', () => {
  it('sends the stripped resume, with the job and the score from code in the instructions', async () => {
    const deps = setup(1, JSON.stringify(REPLY));
    await screenResume(deps, REQUEST);

    const [instructions, resume] = deps.generate.mock.calls[0];
    expect(contactLeaks(resume.text, REQUEST.resume.names)).toEqual(NO_LEAKS);
    expect(resume.text).toContain('Built REST APIs in Python and SQL');
    expect(instructions).toContain('# Resume screener');
    expect(instructions).toContain('Title: Backend Co-op');
    expect(instructions).toContain('Build REST APIs in Python.');
    expect(instructions).toContain('Score: 67 out of 100 (2 of 3 keywords found).');
    expect(instructions).toContain('Matched keywords: Python, SQL');
    expect(instructions).toContain('Missing keywords: Docker');
    expect(instructions).not.toContain('jordan.rivera@example.com');
  });

  it("stores the score from code and the reply's fields, whatever score Gemini adds", async () => {
    const deps = setup(1, JSON.stringify({ ...REPLY, score: 100 }));
    expect(await screenResume(deps, REQUEST)).toBe('done');
    expect(deps.screening.saveDone).toHaveBeenCalledWith(SCREEN, {
      score: 67,
      matched_keywords: ['Python', 'SQL'],
      missed_keywords: ['Docker'],
      ai_summary: JSON.stringify(REPLY),
    });
    expect(deps.screening.markFailed).not.toHaveBeenCalled();
  });
});

describe('screenResume: a re-run while it ran', () => {
  it('reports stale, not done, when the row was queued again before the result was saved', async () => {
    const deps = setup(1, JSON.stringify(REPLY));
    deps.screening.saveDone.mockResolvedValueOnce(false);
    expect(await screenResume(deps, REQUEST)).toBe('stale');
    expect(deps.screening.saveDone).toHaveBeenCalledWith(SCREEN, expect.anything());
  });
});

describe('screenResume: retries', () => {
  it('tries once more after a reply that is not valid JSON', async () => {
    const deps = setup(1, 'Here is my analysis: strong candidate.', JSON.stringify(REPLY));
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(await screenResume(deps, REQUEST)).toBe('done');
    expect(deps.generate).toHaveBeenCalledTimes(2);
  });

  it('tries once more after a call that fails', async () => {
    const deps = setup(1, new Error('Gemini answered HTTP 503'), JSON.stringify(REPLY));
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(await screenResume(deps, REQUEST)).toBe('done');
    expect(deps.generate).toHaveBeenCalledTimes(2);
  });

  it('marks the row failed after two bad replies, and stops there', async () => {
    const deps = setup(1, '{"strengths": "not a list"}', new Error('timeout'), '{}');
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});

    expect(await screenResume(deps, REQUEST)).toBe('failed');
    expect(deps.generate).toHaveBeenCalledTimes(2);
    expect(deps.screening.markFailed).toHaveBeenCalledWith(SCREEN);
    expect(deps.screening.saveDone).not.toHaveBeenCalled();
  });

  it('does not ask Gemini again when storing a good reply fails', async () => {
    const deps = setup(1, JSON.stringify(REPLY), JSON.stringify(REPLY));
    deps.screening.saveDone.mockRejectedValueOnce(new Error('pool busy'));
    await expect(screenResume(deps, REQUEST)).rejects.toThrow('pool busy');
    expect(deps.generate).toHaveBeenCalledTimes(1);
  });

  it('logs no resume text when it fails', async () => {
    const deps = setup(1, 'not json', 'still not json');
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    await screenResume(deps, REQUEST);

    const logged = [...warn.mock.calls, ...error.mock.calls].flat().map(String).join('\n');
    expect(logged).toContain('group 3, class 101, job 7, resume 42');
    expect(logged).not.toContain('Acme Robotics');
    expect(logged).not.toContain('not json');
  });
});

describe('parseScreenerReply', () => {
  it('accepts a reply with every field, and drops any other', () => {
    expect(parseScreenerReply(JSON.stringify(REPLY))).toEqual(REPLY);
    expect(parseScreenerReply(JSON.stringify({ ...REPLY, score: 90 }))).toEqual(REPLY);
    expect(parseScreenerReply(JSON.stringify({ ...REPLY, gaps: [] }))).toEqual({
      ...REPLY,
      gaps: [],
    });
  });

  it('rejects anything else', () => {
    for (const raw of [
      '',
      'not json',
      'null',
      '[]',
      '"text"',
      JSON.stringify({ ...REPLY, strengths: 'one string' }),
      JSON.stringify({ ...REPLY, gaps: [1, 2] }),
      JSON.stringify({ ...REPLY, gaps: ['  '] }),
      JSON.stringify({ ...REPLY, score_explanation: '' }),
      JSON.stringify({ strengths: REPLY.strengths, gaps: REPLY.gaps }),
    ]) {
      expect(parseScreenerReply(raw)).toBeNull();
    }
  });
});
