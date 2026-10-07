# Migrations

`Pandployer.sql` is a full schema dump. It only ever runs against an empty
database, so editing it fixes new environments and does nothing for one that
already has data. Anything that changes the shape of a live database needs a
file here as well, in the same commit.

## How they run

[dbmate](https://github.com/amacneil/dbmate) applies every migration in this
folder that the database has not run yet, in number order, and records each one
in the `schema_migrations` table. It connects with the same `DATABASE_URL` the
API uses (from `api/.env` locally).

They run automatically every time the API starts: `npm start`, and so
`npm run dev:api` and the Docker image, run `npm run db:migrate` first. To run
them on their own:

```sh
npm run db:migrate
```

If a migration fails, it is not recorded and the API does not start. Fix the
migration and start the API again.

To see what a database has run:

```sh
cd api && npx dbmate --migrations-dir ../database-files/migrations --no-dump-schema status
```

## Existing databases

A database built from `Pandployer.sql` before dbmate arrived has no
`schema_migrations` table, so the first start runs every migration here against
it. That is safe because every migration must be safe to run twice (see the
rules below): `001` to `005` were checked against an existing local database and
left its data unchanged. After that first start, each migration runs once.

## Adding a migration

Name it with the next number, for example `006-what-it-does.sql`, and use this
shape. dbmate needs both marker lines; the `down` block can stay empty, since we
do not roll migrations back:

```sql
-- migrate:up
-- What this migration is for, and what it deletes, if anything.
CREATE TABLE IF NOT EXISTS ...;

-- migrate:down
```

Also update `Pandployer.sql`, so new databases get the change, and add a row to
the migration list at the bottom of this file.

CI fails a PR that adds a migration without both marker lines, numbers it out
of order, or edits an existing one.

## Rules

- Number files in order and never edit one that has been applied anywhere. The
  one exception is adding or removing dbmate's `-- migrate:` marker lines, which
  are SQL comments and change nothing.
- Every migration must be safe to run twice. Check before you alter.
- If a migration adds a constraint, clean up the rows that violate it first.
  Production has data that the new schema forbids; that is the whole reason the
  constraint is being added.
- Say in a comment what the migration is for and what it deletes, if anything.

## Migration list

| File                               | What                                                                        |
| ---------------------------------- | --------------------------------------------------------------------------- |
| `001-resume-unique-vote.sql`       | One vote row per student per resume, and dedupe                             |
| `002-offers-unique-per-group.sql`  | One offer row per group per class, and dedupe                               |
| `003-resume-checked-per-group.sql` | `Resume.checked` is group-level; realign drifted rows                       |
| `004-group-confirmations.sql`      | `GroupConfirmations` table; res-review-group confirm state survives refresh |
| `005-step-completion.sql`          | `Step_Completion` table; the group barrier survives an API restart          |
