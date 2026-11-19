// resumePack.repository.ts: a professor's "Load sample resumes" clicked from
// several tabs, or twice, at once. Each resume must go in once, with its
// candidate, however many loads race.

import { expectCounts, inRaceRange } from '../harness.mjs';

const PACK = [1, 2, 3].map((n) => ({
  title: `race pack ${n}`,
  file_path: `uploads/resumes/race-pack-${n}.pdf`,
  f_name: 'Race',
  l_name: `Candidate ${n}`,
  interview: 'https://www.youtube.com/embed/race',
  extracted_text: `Race resume ${n}.`,
}));

export default {
  async cleanup(db) {
    // Resumes cascade from the class, and candidates from their resume.
    await db.moderator.deleteMany({ where: { crn: inRaceRange } });
  },

  cases: [
    {
      name: 'resumePack.load',
      setup: ({ db }, classId) =>
        db.moderator.create({ data: { crn: classId, admin_email: 'race@example.edu' } }),
      write: async ({ db, repository }, classId) => {
        const loaded = await repository('resumePack')
          .createResumePackRepository(db)
          .load(classId, PACK);
        return `added ${loaded.added}`;
      },
      check: async ({ db }, classId, labels) => {
        const resumes = await db.resume_pdfs.findMany({
          where: { class_id: classId },
          include: { Candidates: true },
        });
        const added = labels.reduce((sum, label) => sum + Number(label.split(' ')[1] || 0), 0);
        return [
          ...expectCounts(labels, {}),
          ...(resumes.length === PACK.length
            ? []
            : [`expected ${PACK.length} resumes, found ${resumes.length}`]),
          ...(resumes.every((resume) => resume.Candidates) ? [] : ['a resume has no candidate']),
          // Each resume counted by exactly one writer: none added twice, none lost.
          ...(added === PACK.length ? [] : [`writers reported ${added} added, not ${PACK.length}`]),
        ];
      },
    },
  ],
};
