-- migrate:up
-- 011: `job_descriptions.keywords`, the terms a posting is screened against,
-- and `Screening_Results.run`, which tells a screen that started before a
-- re-run from one that started after it.
--
-- keywords is a JSON array of strings, set by the professor. NULL or an empty
-- array means the posting is not screened.
--
-- run starts at 0 and goes up by one each time a row is queued again, as when
-- the posting's keywords change. A screen saves its result only to the run it
-- started on, so one that was under way during the change cannot overwrite the
-- re-run with a score from the old keywords.
--
-- NOT destructive: it adds two columns, one nullable and one defaulting to 0.
-- No row is deleted.
--
-- Safe to run twice: ADD COLUMN has no IF NOT EXISTS in MySQL, so each column
-- is checked first.

SET @column_exists := (
  SELECT COUNT(*)
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME   = 'job_descriptions'
    AND COLUMN_NAME  = 'keywords'
);

SET @stmt := IF(
  @column_exists = 0,
  'ALTER TABLE `job_descriptions` ADD COLUMN `keywords` json NULL',
  'SELECT ''job_descriptions.keywords already present, nothing to do'' AS note'
);

PREPARE alter_stmt FROM @stmt;
EXECUTE alter_stmt;
DEALLOCATE PREPARE alter_stmt;

SET @column_exists := (
  SELECT COUNT(*)
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME   = 'Screening_Results'
    AND COLUMN_NAME  = 'run'
);

SET @stmt := IF(
  @column_exists = 0,
  'ALTER TABLE `Screening_Results` ADD COLUMN `run` int unsigned NOT NULL DEFAULT ''0''',
  'SELECT ''Screening_Results.run already present, nothing to do'' AS note'
);

PREPARE alter_stmt FROM @stmt;
EXECUTE alter_stmt;
DEALLOCATE PREPARE alter_stmt;

-- migrate:down
