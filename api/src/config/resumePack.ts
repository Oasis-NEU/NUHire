// src/config/resumePack.ts

import { PackResume } from '../models/ResumePack';
import { DEFAULT_CANDIDATES } from './database';

// Made-up resumes of varied quality, aimed at the seeded postings, so the
// screener can be tried on data that is plainly not a real student's. Every
// email is on a reserved example domain, every phone number is in the
// 555-0100 to 0199 range, and each page says the resume is fictional.
//
// There are ten so a professor can swap them for the default ten without
// changing the review step's count. None has an interview of its own, so each
// borrows a default candidate's video rather than leaving the interview stage
// with nothing to play.
const PEOPLE: readonly [string, string][] = [
  ['Priya', 'Raman'],
  ['Marcus', 'Okafor'],
  ['Elena', 'Sokolova'],
  ['Diego', 'Alvarez'],
  ['Hana', 'Kobayashi'],
  ['Tyler', 'Brennan'],
  ['Samira', 'Haddad'],
  ['Kevin', 'Thornton'],
  ['Nadia', 'Petrova'],
  ['Oliver', 'Grant'],
];

/** The fictional resumes a professor can load into a class, all screened as samples. */
export const RESUME_PACK: readonly PackResume[] = PEOPLE.map(([f_name, l_name], i) => ({
  title: `sample-pack-${i + 1}`,
  file_path: `uploads/resumes/sample-pack-${i + 1}.pdf`,
  f_name,
  l_name,
  interview: DEFAULT_CANDIDATES[i % DEFAULT_CANDIDATES.length].interview,
}));
