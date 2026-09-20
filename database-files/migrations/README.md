# Migrations

`Pandployer.sql` is a full schema dump. It only ever runs against an empty
database, so editing it fixes new environments and does nothing for one that
already has data. Anything that changes the shape of a live database needs a
file here as well, in the same commit.

There is no migration runner yet. Apply one by hand:

```
mysql -h <host> -u <user> -p <database> < database-files/migrations/001-resume-unique-vote.sql
```

Rules:

- Number files in order and never edit one that has been applied anywhere.
- Every migration must be safe to run twice. Check before you alter.
- If a migration adds a constraint, clean up the rows that violate it first.
  Production has data that the new schema forbids; that is the whole reason the
  constraint is being added.
- Say in a comment what the migration is for and what it deletes, if anything.

Applied so far:

| File                          | What                                              |
| ----------------------------- | ------------------------------------------------- |
| `001-resume-unique-vote.sql`  | One vote row per student per resume, and dedupe    |
