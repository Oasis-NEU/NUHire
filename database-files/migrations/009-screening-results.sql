-- migrate:up
-- 009: `Screening_Results`, the screener's result for each resume a group
-- reviews, against the job posting the group is hiring for.
--
-- A row starts `pending` when a resume is queued and ends `done` with a score
-- and keywords, or `failed`. `is_sample` marks a result produced from sample
-- data rather than a real screen.
--
-- NOT destructive: it only adds a table. No existing row is modified or deleted.
--
-- Safe to run twice: CREATE TABLE IF NOT EXISTS is a no-op the second time.

CREATE TABLE IF NOT EXISTS `Screening_Results` (
  -- The CRN. Groups are keyed on the pair; group_id alone would mix course
  -- sections.
  `class` int NOT NULL,
  `group_id` int NOT NULL,
  -- The posting the resume was screened against. A group can be reassigned a
  -- job, and a screen against the old posting must not read as one against
  -- the new.
  `job_id` int NOT NULL,
  `resume_id` int NOT NULL,
  `status` enum('pending','done','failed') NOT NULL DEFAULT 'pending',
  -- 0 to 100. NULL until the screen is done.
  `score` tinyint unsigned DEFAULT NULL,
  -- JSON arrays of strings. NULL until the screen is done.
  `matched_keywords` json DEFAULT NULL,
  `missed_keywords` json DEFAULT NULL,
  `ai_summary` text,
  `is_sample` tinyint(1) NOT NULL DEFAULT '0',
  -- One result per resume per group per posting, so queueing a resume twice
  -- cannot screen it twice. The group pair leads, so a group's results are a
  -- prefix lookup on this key.
  PRIMARY KEY (`class`, `group_id`, `job_id`, `resume_id`),
  KEY `screening_results_job_idx` (`job_id`),
  KEY `screening_results_resume_idx` (`resume_id`),
  -- Deleting a resume or posting, or the class, which cascades to both, takes
  -- its results with it.
  CONSTRAINT `screening_results_job_fk` FOREIGN KEY (`job_id`) REFERENCES `job_descriptions` (`id`) ON DELETE CASCADE,
  CONSTRAINT `screening_results_resume_fk` FOREIGN KEY (`resume_id`) REFERENCES `Resume_pdfs` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- migrate:down
