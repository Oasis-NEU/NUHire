-- migrate:up
-- 009: `ClassCodes`, the short code a student types to join a class.
--
-- A class has no table of its own; it is a CRN in `Moderator`. Students joined
-- one only through the professor's CSV import. With a code they can join
-- themselves, one class at a time. The API writes a class's row the first time
-- its professor asks for the code, so existing classes need no backfill, and
-- regenerating replaces the code in place, which is what makes an old one stop
-- working.
--
-- NOT destructive: it only adds a table. No existing row is modified or deleted.
--
-- Safe to run twice: CREATE TABLE IF NOT EXISTS is a no-op the second time.

CREATE TABLE IF NOT EXISTS `ClassCodes` (
  -- One code per class, so regenerating is an UPDATE of this row.
  `crn` int NOT NULL,
  -- Six upper-case characters, none that look alike (0/O, 1/I/L). Unique
  -- because the code alone has to identify the class a student is joining.
  `code` char(6) NOT NULL,
  -- When this code was issued; reset on regenerate.
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`crn`),
  UNIQUE KEY `code_UNIQUE` (`code`),
  -- Deleting a class (DELETE /moderator/crns/:crn) must take its code with it,
  -- or the code would keep moving students into a class that no longer exists.
  CONSTRAINT `ClassCodes_ibfk_1` FOREIGN KEY (`crn`) REFERENCES `Moderator` (`crn`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- migrate:down
