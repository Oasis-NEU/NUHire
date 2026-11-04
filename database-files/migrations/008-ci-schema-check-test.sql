-- migrate:up
-- 008: test only, for REPO-2. Adds a nullable column and deletes nothing. Do not merge.
--
-- Safe to run twice: ADD COLUMN has no IF NOT EXISTS in MySQL, so it is checked
-- first.

SET @column_exists := (
  SELECT COUNT(*)
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME   = 'Notes'
    AND COLUMN_NAME  = 'ci_schema_check'
);

SET @stmt := IF(
  @column_exists = 0,
  'ALTER TABLE `Notes` ADD COLUMN `ci_schema_check` int NULL DEFAULT NULL',
  'SELECT ''ci_schema_check already present, nothing to do'' AS note'
);

PREPARE alter_stmt FROM @stmt;
EXECUTE alter_stmt;
DEALLOCATE PREPARE alter_stmt;

-- migrate:down
