-- migrate:up
-- 010: group votes decided by majority, with one revote and a professor
-- tiebreak (OAS-368).
--
-- A group decides its resume shortlist and its final pick by voting. Each
-- present student votes, the majority of present students wins, a tie opens
-- one short revote over the tied options, and a second tie goes to the
-- professor. The rounds and ballots live here rather than in the API process,
-- so a vote in progress, and the revote's deadline, survive an API restart:
-- the outcome is re-derived from these rows on every ballot, poll and room join.
--
-- Two tables:
--
--   * Group_Vote_Round  - one row per round of one vote for one group. Round 1
--                         is the first vote, round 2 the revote. The options on
--                         the ballot are fixed when the round opens.
--   * Group_Vote_Ballot - one row per student per option per round.
--
-- NOT destructive: it only adds two tables. Nothing existing is modified or
-- deleted, and the shortlist checkboxes (`Resume`.`checked`) and
-- `GroupConfirmations` keep working beside it.
--
-- Safe to run twice: CREATE TABLE IF NOT EXISTS is a no-op the second time.

CREATE TABLE IF NOT EXISTS `Group_Vote_Round` (
  `id` int NOT NULL AUTO_INCREMENT,
  -- The CRN. Groups are keyed on (group_id, class); group_id alone collides
  -- across course sections.
  `class` int NOT NULL,
  `group_id` int NOT NULL,
  -- resume_review: a yes/no vote on every resume, which builds the shortlist.
  -- final_pick: one candidate per student, which becomes the group's offer.
  `kind` enum('resume_review','final_pick') NOT NULL,
  -- 1 is the first vote, 2 the revote. There is never a third.
  `round` tinyint NOT NULL,
  -- Resume_pdfs ids on this round's ballot, as a JSON array. A revote carries
  -- only the options that tied.
  `options` json NOT NULL,
  -- open: taking ballots. tied: closed with a tie, and round 2 is open.
  -- escalated: the revote tied or ran out of time; the professor decides.
  -- decided: closed with a result in `winners`.
  `status` enum('open','tied','escalated','decided') NOT NULL DEFAULT 'open',
  -- Options this round settled. For resume_review that is the resumes it
  -- shortlisted; for final_pick it is the single winner once decided.
  `winners` json DEFAULT NULL,
  -- Options this round could not settle, when it tied or escalated.
  `tied` json DEFAULT NULL,
  `decided_by` enum('majority','professor') DEFAULT NULL,
  -- Written by the API from dbNow(), never by MySQL's clock, like every gate
  -- timestamp. No column default on purpose.
  `opened_at` timestamp NOT NULL,
  -- Revote only: after this the round escalates whether or not everyone voted.
  -- Kept here rather than in a timer so a restart cannot lose it.
  `deadline_at` timestamp NULL DEFAULT NULL,
  `closed_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  -- Also what keeps two members' simultaneous first ballots, or two
  -- evaluations racing to open the revote, from creating a second round.
  UNIQUE KEY `uniq_group_vote_round` (`class`, `group_id`, `kind`, `round`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS `Group_Vote_Ballot` (
  `round_id` int NOT NULL,
  `student_id` int NOT NULL,
  -- The Resume_pdfs id this ballot is about.
  `resume_id` int NOT NULL,
  -- resume_review: the student's yes or no on this resume. final_pick: always
  -- 'yes', on the one candidate the student picked.
  `vote` enum('yes','no') NOT NULL,
  `voted_at` timestamp NOT NULL,
  -- The uniqueness the ballot upsert relies on: a retried or changed vote
  -- overwrites the student's earlier one instead of counting twice.
  PRIMARY KEY (`round_id`, `student_id`, `resume_id`),
  KEY `student_id` (`student_id`),
  -- A round deleted (a job reassigned, a group reset) takes its ballots along.
  CONSTRAINT `Group_Vote_Ballot_round_fk` FOREIGN KEY (`round_id`) REFERENCES `Group_Vote_Round` (`id`) ON DELETE CASCADE,
  -- A student deleted from the roster must not leave a ballot behind.
  CONSTRAINT `Group_Vote_Ballot_user_fk` FOREIGN KEY (`student_id`) REFERENCES `Users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- Confirm the shape landed. Expect eleven rows for Group_Vote_Round and five
-- for Group_Vote_Ballot.
SELECT TABLE_NAME, COLUMN_NAME, COLUMN_TYPE, COLUMN_KEY
FROM information_schema.COLUMNS
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME IN ('Group_Vote_Round', 'Group_Vote_Ballot')
ORDER BY TABLE_NAME, ORDINAL_POSITION;

-- migrate:down
