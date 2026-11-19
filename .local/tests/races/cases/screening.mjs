// screening.repository.ts: queueing a class's screens, which an upload and an
// assignment can do at the same moment, and a professor changing a posting's
// keywords from several tabs at once.

import { WRITERS, expectCounts, inRaceRange } from '../harness.mjs';

const GROUPS = [1, 2];
const RESUMES = 3;

// A class with one posting assigned to two groups and three resumes, all
// needed for Screening_Results' foreign keys. Returns the posting's id.
async function classWithAPosting(db, classId, keywords = ['Python']) {
  await db.moderator.create({ data: { crn: classId, admin_email: 'race@example.edu' } });
  const job = await db.job_descriptions.create({
    data: {
      title: 'Race Co-op',
      file_path: 'uploads/jobdescription/race.pdf',
      class_id: classId,
      keywords,
    },
  });
  for (const group of GROUPS) {
    await db.job_Assignment.create({ data: { group, class: classId, job: job.title } });
  }
  for (let r = 0; r < RESUMES; r++) {
    await db.resume_pdfs.create({
      data: { title: `race ${r}`, file_path: `uploads/resumes/race-${r}.pdf`, class_id: classId },
    });
  }
  return job.id;
}

const screening = (repository, db) => repository('screening').createScreeningRepository(db);

export default {
  async cleanup(db) {
    // Postings, resumes, assignments and results all cascade from the class.
    await db.moderator.deleteMany({ where: { crn: inRaceRange } });
  },

  cases: [
    {
      name: 'screening.queueAssigned',
      setup: ({ db }, classId) => classWithAPosting(db, classId),
      write: async ({ db, repository }, classId) =>
        `queued ${await screening(repository, db).queueAssigned(classId)}`,
      check: async ({ db }, classId, labels) => {
        const rows = await db.screening_Results.count({ where: { class: classId } });
        const queued = labels.reduce((sum, label) => sum + Number(label.split(' ')[1] || 0), 0);
        const want = GROUPS.length * RESUMES;
        return [
          ...expectCounts(labels, {}),
          ...(rows === want ? [] : [`expected ${want} rows, found ${rows}`]),
          // Each row counted by exactly one writer: none queued twice, none lost.
          ...(queued === want ? [] : [`writers reported ${queued} queued, not ${want}`]),
        ];
      },
    },
    {
      name: 'screening.replaceJobKeywords',
      setup: async ({ db, repository }, classId) => {
        await classWithAPosting(db, classId);
        await screening(repository, db).queueAssigned(classId);
      },
      write: async ({ db, repository }, classId, i) => {
        const job = await db.job_descriptions.findFirst({ where: { class_id: classId } });
        const change = await screening(repository, db).replaceJobKeywords(classId, job.id, [
          `keyword ${i}`,
        ]);
        return change.changed ? 'changed' : 'unchanged';
      },
      check: async ({ db }, classId, labels) => {
        const job = await db.job_descriptions.findFirst({ where: { class_id: classId } });
        const rows = await db.screening_Results.findMany({ where: { class: classId } });
        const writer = Number(job.keywords?.[0]?.replace('keyword ', ''));
        const runs = new Set(rows.map((row) => row.run));
        return [
          ...expectCounts(labels, { changed: WRITERS }),
          ...(writer >= 0 && writer < WRITERS
            ? []
            : [`keywords are ${JSON.stringify(job.keywords)}`]),
          ...(rows.every((row) => row.status === 'pending') ? [] : ['a row is not pending']),
          // Every change bumped every row once, in its own transaction.
          ...(runs.size === 1 && runs.has(WRITERS)
            ? []
            : [`runs are ${[...runs]}, not ${WRITERS}`]),
        ];
      },
    },
  ],
};
