// The one place the frontend describes a row that comes back from the API.
//
// `interface User` was declared 15 times across `src/app`, and the two that
// were actually in use disagreed: `id` was `number` in AuthContext and `string`
// in interview-stage, so `user.id === resume.student_id` was false for every
// student in the class. `Note.id`, `Resume.checked` and `Group.group_id` had
// the same split. Every shape below is pinned to the column type in
// `database-files/Pandployer.sql`, which is what `mysql2` actually hands back.
//
// Add to this file rather than redeclaring a shape next to the component that
// consumes it; a local copy is how the drift above happened.

/** `Users.affiliation` is an ENUM. 'none' is what the Keycloak callback writes
 *  for a first login that is not on any roster yet. */
export type Affiliation = 'student' | 'admin' | 'none';

/** MySQL `tinyint(1)`. `mysql2` does not cast these to booleans, so a column
 *  declared BOOLEAN in the dump still arrives as 0 or 1 over JSON. Comparing
 *  one with `=== true` is always false. */
export type DbBool = 0 | 1;

/** The logged-in user, as `/auth/user` returns it. */
export interface User {
  id: number;
  f_name: string;
  l_name: string;
  email: string;
  affiliation: Affiliation;
  group_id: number;
  class: number;
}

/** A roster row from `/groups/students-by-class/:class`.
 *  `group_id` is nullable: `Users.group_id` has no NOT NULL and a student who
 *  is on the roster but not yet in a group comes back with null, which is what
 *  the admin UI shows as the "No Group" bucket. */
export interface Student {
  id: number;
  email: string;
  f_name: string;
  l_name: string;
  group_id: number | null;
  class: number;
}

/** One team, as the admin UI assembles it: a `GroupsInfo` row plus the roster
 *  rows that point at it and the two per-group lookups the cards display. */
export interface Group {
  group_id: number;
  students: Student[];
  isStarted: boolean;
  jobAssignment?: string;
  progress?: string;
}

/** A course section. `crn` is the value every query and socket room calls
 *  `class`. */
export interface ClassInfo {
  crn: number;
  class_name: string;
}

/** A row of `Notes`. `id` is `int AUTO_INCREMENT`, not a string. */
export interface Note {
  id: number;
  content: string;
  user_email?: string;
  created_at?: string;
}

/** A row of `Resume`: one student's vote on one resume.
 *  `checked` is the GROUP's shortlist, not this student's — the `check` socket
 *  handler writes it to every member row for the same
 *  (group_id, class, resume_number). Read it with MAX(checked) GROUP BY
 *  resume_number; off a single row, a student who votes after the group
 *  shortlisted a resume unticks it for everyone. */
export interface Resume {
  student_id: number;
  group_id: number;
  class: number;
  timespent: number;
  resume_number: number;
  vote: 'yes' | 'no' | 'unanswered';
  checked: DbBool;
}

/** A row of `Candidates`. */
export interface Candidate {
  id: number;
  resume_id: number;
  f_name: string;
  l_name: string;
  interview?: string;
}

/** A `job_descriptions` row, trimmed to what the assignment dropdowns read. */
export interface JobOption {
  id: number;
  title: string;
}
