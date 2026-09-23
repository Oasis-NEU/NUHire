# Local dev

The repo's root `compose.yaml` is stale — it predates the current code, which
wants `DATABASE_URL` / `BACKEND_PORT` and authenticates against Keycloak rather
than Google OAuth. Use this directory instead.

Everything here is local-only: throwaway credentials, a throwaway Keycloak realm
and seed rows for a handful of test accounts. It is tracked on purpose so a
clean clone can start the stack. Nothing in here is a production secret and
nothing in here should ever become one.

MySQL and Keycloak run in Docker. The API and frontend run on the host, because
Keycloak has to be reachable at the _same_ URL from both the browser and the API
process (OAuth redirect + server-side token exchange), and `localhost` inside a
container is not the `localhost` the browser sees.

## Start

    docker compose -f .local/compose.yaml up -d
    (cd api && npm run build && npm start)
    (cd frontend && npm run dev)

- app http://localhost:3000
- api http://localhost:5001
- keycloak http://localhost:8080 (admin console: admin / admin)
- mysql 127.0.0.1:3307 (root / nuhire, db `nuhire`)

Run the API from its compiled build (`npm run build && npm start`), the same
path prod uses. Do NOT use `npm run dev`: the `ts-node` dev script throws
TS2769 overload errors on `auth.routes.ts` (an `@types/express@5` vs
`express@4` mismatch in the lockfile). `tsc` itself passes with `skipLibCheck`,
so `npm run build` and the Docker image are fine; only ts-node trips. That means
no hot-reload for API edits right now: rebuild + restart, or fix the dev script
(a ticket). The frontend has hot-reload as normal.

## Accounts

Seeded into the Keycloak realm and the DB. Password for all: `nuhire`.

| email                     | role    | group | lands on           |
| ------------------------- | ------- | ----- | ------------------ |
| advisor@northeastern.edu  | admin   | —     | /advisor-dashboard |
| student1@northeastern.edu | student | 1     | /waitingGroup      |
| student2@northeastern.edu | student | 2     | /waitingGroup      |
| student3@northeastern.edu | student | 2     | /waitingGroup      |

Group membership is whatever `seed.sql` last set, and it drifts once anyone
moves students around in Manage Groups. Check the database rather than trusting
this table:

```bash
docker exec nuhire-mysql mysql -uroot -pnuhire nuhire \
  -e "SELECT email, group_id, class FROM Users WHERE affiliation='student';"
```

Students sit on /waitingGroup until the advisor starts their group from Manage
Groups. The separate "Admin" button on the landing page is the moderator login,
a plain env-var check: `admin` / `admin`.

`seed.sql` claims `crn = 1` for the test advisor. The API seeds its own advisor
row with `INSERT IGNORE` and `crn` is UNIQUE, so ours wins and class 1 lines up
with the job descriptions and resumes the API seeds for `class_id = 1`.

## Reset the database

    docker compose -f .local/compose.yaml down -v && docker compose -f .local/compose.yaml up -d

## Stop

    docker compose -f .local/compose.yaml down

## Source changes this needed

Two tracked files were patched, both env-gated so deployed behaviour is
unchanged (`COOKIE_SECURE` unset => the old `secure: true` / `sameSite: 'none'`):

- `api/src/app.ts` — session cookie
- `api/src/controller/auth.controller.ts` — the explicit `res.cookie` after login

Browsers drop `Secure` cookies over plain http, so without this every request
came back unauthenticated with a fresh session id.
