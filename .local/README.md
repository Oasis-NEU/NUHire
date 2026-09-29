# Local dev

Everything here is local-only: throwaway credentials, a throwaway Keycloak realm
and seed rows for a handful of test accounts. It is tracked on purpose so a
clean clone can start the stack. Nothing in here is a production secret and
nothing in here should ever become one.

## Start

From the repo root, with Docker Desktop running:

    docker compose up --watch OR npm run all

The root `compose.yaml` extends MySQL and Keycloak from
[`compose.yaml`](compose.yaml) in this folder and adds the API and frontend.
Keycloak has to be reachable at the _same_ URL from the browser and from the
API (OAuth redirect, then a server-side token exchange), so the API container
shares Keycloak's network and `http://localhost:8080` means Keycloak inside it
too. `--watch` syncs `api/src` and `frontend/src` into the containers on save
and rebuilds an image when its lockfile changes. Ctrl+C stops everything.

In Docker the apps read the `.env.example` files directly, with
`DATABASE_URL` pointed at `db:3306`, so there is nothing to copy first.

### Running the apps on the host instead

Useful for attaching a debugger. Copy the env files once, then:

    cp api/.env.example api/.env
    cp frontend/.env.example frontend/.env.local
    npm run install:all

    npm run dev:services     # just MySQL + Keycloak, waits until healthy
    npm run dev:api
    npm run dev:frontend

Both ways share the same containers and database, so stop one before
starting the other.

- app http://localhost:3000
- api http://localhost:5001
- keycloak http://localhost:8080 (admin console: admin / admin)
- mysql 127.0.0.1:3307 (root / nuhire, db `nuhire`)

On the host, run the API from its compiled build (`npm run dev:api`), the same
path prod uses. Do NOT use `npm run dev` in `api/`: the `ts-node` dev script
throws TS2769 overload errors on `auth.routes.ts` (an `@types/express@5` vs
`express@4` mismatch in the lockfile). `tsc` itself passes with `skipLibCheck`,
so `npm run build` and the Docker images are fine; only ts-node trips. On the
host that means no API hot reload: rebuild and restart. In Docker the API
hot-reloads via `tsc --watch` (see `api/dockerfile.dev`).

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
