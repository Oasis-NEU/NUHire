# Onboarding

You know React and Node. You have never seen this repo. This gets you from
nothing to a running app and a first ticket in about an hour.

**Trust the code over any document, including this one.** This project was
built by co-ops in 2025 who have all left. The docs they wrote contradict each
other. Every claim below was checked against the source, and where I could not
verify something I say so instead of guessing.

Read in order:

1. [What this is](#1-what-this-is) — the product, ten minutes
2. [The codebase](#2-the-codebase) — structure, stack, how a request flows
3. [Running it](#3-running-it-locally) — setup, teacher access, the click-through
4. [Your first ticket](#4-your-first-ticket)

---

# 1. What this is

NUHire is a hiring simulation used as a **live, instructor-led activity** in
CS 1210, Northeastern's intro co-op class. Students play the employer.

The activity, start to finish:

1. Read a job description
2. Skim 10 resumes, ~30 seconds each, accept / reject / no response
3. As a group, shortlist 4
4. Watch recorded interviews for those 4 and rate each candidate
5. As a group, extend one offer
6. The professor accepts or rejects it

All candidates are fake. The professor runs it in real time and can fire
curveballs mid-activity: a candidate no-showed, showed up late, came through an
internal referral.

### Three roles

| Role        | Who           | How the app knows                                     |
| ----------- | ------------- | ----------------------------------------------------- |
| **admin**   | adds teachers | `Users.affiliation = 'admin'`, plus a `Moderator` row |
| **teacher** | runs a class  | same as admin — see the honest note below             |
| **student** | does it       | `Users.affiliation = 'student'`                       |

**Be aware:** the code does not actually distinguish admin from teacher.
`Users.affiliation` is `enum('student','admin','none')` and the only role guard
is `requireAdmin`, which checks `affiliation === 'admin'`. What separates a
"teacher" from an "admin" in practice is whether they own a row in the
`Moderator` table, which maps `admin_email` to a CRN (a course section number).
If you hear someone say the app has three roles, it has two, plus a table that
says which classes you own.

### The one constraint that explains everything

**It runs live, in a classroom, with a professor in front of 30 students.** A
bug here does not page an on-call engineer. It derails a class, in front of
people, with no way to recover except the professor apologising.

That is why you will see rules in [AGENTS.md](AGENTS.md) that look
over-cautious. They exist because each of them has already gone wrong.

### Current state, honestly

- Never tested above two users. Nobody has run it with 30.
- Not currently hosted. Local Docker only.
- No automated tests at all. The api test script is literally `exit 1`.
- A large fix pass just landed (auth, the group barrier, file uploads, schema).
  See the "Recently closed" table in [TICKETS.md](TICKETS.md).

---

# 2. The codebase

## Stack

Versions from `package.json`, not from memory.

| Piece       | What                                      | Version                                                   |
| ----------- | ----------------------------------------- | --------------------------------------------------------- |
| Node        | `.nvmrc`                                  | 22                                                        |
| `frontend/` | Next.js App Router                        | `next ^15.3.0`                                            |
|             | React                                     | `^19.0.0`                                                 |
|             | Tailwind                                  | `^3.4.17`                                                 |
|             | Socket.IO client                          | `^4.8.1`                                                  |
|             | `react-pdf` (resumes, job descriptions)   | `^9.2.1`                                                  |
|             | TypeScript                                | `5.7.3`                                                   |
| `api/`      | Express                                   | `^4.21.2`                                                 |
|             | Socket.IO server                          | `^4.8.1`                                                  |
|             | `mysql2`                                  | `^3.12.0`                                                 |
|             | Passport + Keycloak OIDC                  | `passport ^0.7.0`, `passport-keycloak-oauth2-oidc ^1.0.5` |
|             | `express-session`                         | `^1.18.2`                                                 |
|             | TypeScript                                | `^5.0.0`                                                  |
| MySQL       | schema in `database-files/Pandployer.sql` | 8.4 locally                                               |
| Keycloak    | login                                     | 26.3 locally                                              |

Both packages are `strict: true`. There are ~100 `: any` annotations already;
do not add more.

## Repo structure

```
api/src/
  server.ts            entrypoint: env checks, boot, process handlers
  app.ts               express setup, session, middleware, route mounting
  config/
    database.ts        mysql pool, boot-time seeding, pool stats
    passport.ts        keycloak OIDC strategy, serialize/deserialize
    socket.ts          ALL realtime behaviour, plus the group barrier
  routes/              path -> controller, and the auth guard per route
  controller/          request handling and raw SQL. No service layer.
  middleware/          requireAuth, requireAdmin, requireStudent, requireModerator
  models/types.ts      shared types including socket event payloads

frontend/src/
  app/
    page.tsx           landing
    dashboard/         student hub, defines the step list
    jobdes/            step 1, read the job description
    res-review/        step 2, the 10 resumes at 30s each
    res-review-group/  step 3, group shortlist
    interview-stage/   step 4, watch interviews and rate
    makeOffer/         step 5, extend an offer
    employerPanel/     step 6 — a STUB, see gotchas
    advisor-dashboard/ the teacher's screen
    components/        shared UI and React contexts
  types/index.ts       canonical shared types (partially migrated)
  lib/                 small helpers

database-files/
  Pandployer.sql       full schema dump, ~21 tables
  migrations/          numbered, applied by hand. Read its README.

.local/                the local dev stack. Start here.
```

Notable: the database is named `pandployer`, an old project name. Renaming it
is a ticket nobody has done.

## How a request flows

There is no service or repository layer. It is deliberately flat:

```
frontend fetch()
  -> api/src/app.ts                 session + passport populate req.user
  -> api/src/routes/X.routes.ts     picks the auth guard
  -> api/src/middleware/auth.*      requireAuth / requireAdmin / requireStudent
  -> api/src/controller/X.controller.ts   raw SQL via mysql2
  -> MySQL
```

Worked example, a student voting on a resume:

1. `frontend/src/app/res-review/page.tsx` POSTs to `/resume/vote` with
   `credentials: 'include'`
2. `api/src/routes/resume.routes.ts` has
   `router.post('/vote', requireAuth, resumeController.submitVote)`
3. `submitVote` in `api/src/controller/resume.controller.ts` runs an
   `INSERT ... ON DUPLICATE KEY UPDATE` against `Resume`
4. It emits `voteUpdated` to the group's socket room

**Do not introduce a service layer for one endpoint.** If you are doing a
planned refactor across a whole area, that is a different conversation.

## How auth works

Login is Keycloak OIDC through Passport.

```
student clicks Login
  -> GET /auth/keycloak                     (api/src/routes/auth.routes.ts)
  -> redirect to Keycloak, with a state param
  -> student authenticates at Keycloak
  -> GET /auth/keycloak/callback
  -> api/src/config/passport.ts strategy callback:
       looks up Users by email
       if no row, INSERTs one with affiliation 'none'
       returns the full Users row as `user`
  -> api/src/controller/auth.controller.ts decides where to send them
```

`passport.serializeUser` stores `user.id`. `deserializeUser` re-reads the whole
`Users` row on every request, so **`req.user` is the live database row**,
including `affiliation`, `group_id` and `class`.

### How it decides teacher vs student

In `auth.controller.ts`, after login, in this order:

1. `affiliation === 'admin'` → `/advisor-dashboard`
2. missing `f_name` / `l_name`, or `affiliation === 'none'` → `/signupform`
3. otherwise a student: if their group has `started = 1` they go to
   `/dashboard` (or `/about` if `seen` is 0), else `/waitingGroup`

Guards, in `api/src/middleware/auth.middleware.ts`:

| Guard              | Passes when                                        |
| ------------------ | -------------------------------------------------- |
| `requireAuth`      | any logged-in session                              |
| `requireAdmin`     | `req.user.affiliation === 'admin'`                 |
| `requireStudent`   | `req.user.affiliation === 'student'`               |
| `requireModerator` | admin **or** the legacy `session.isModerator` flag |

**There is a second, legacy auth system.** `/mod-signin` posts a plaintext
username and password checked against `MODERATOR_USERNAME` /
`MODERATOR_PASSWORD` env vars, and sets `session.isModerator`. It gates
`/mod-dashboard`, the page that grants teacher access. It exists because of a
bootstrap problem: that page creates the first admin, so it cannot itself
require an admin. Retiring it is an open ticket (`SEC-4b`). Do not build
anything new on it.

## The one concept to internalise: `(group_id, class)`

Almost every table and query is keyed on the **pair** `(group_id, class)`, where
`class` is the CRN. That pair identifies one team of students. Group 2 exists in
every section.

Socket rooms are named `group_<group_id>_class_<class>`.

**If you write a group-scoped query or emit and leave out `class`, it leaks
across course sections.** This has already happened more than once. Scope by
both, always.

## How the realtime layer keeps a group in sync

All of it is in `api/src/config/socket.ts`.

**Identity.** The Express session runs over the Socket.IO handshake
(`api/src/app.ts` calls `io.engine.use(sessionMiddleware)`), so
`socket.data.user` is the logged-in user. Room joins are checked against it: a
student can only join their own group's room.

**Rooms.**

| Room                             | Who is in it             |
| -------------------------------- | ------------------------ |
| `group_<group_id>_class_<class>` | one team of students     |
| `class_<class>`                  | everyone in a section    |
| the advisor's email address      | that teacher's dashboard |

The advisor dashboard is **not** in the group room. To notify a class's
teachers use `emitToClassModerators(io, db, classId, event, payload)` from
`config/socket.ts`. Never use bare `io.emit`; it reaches every client in every
class. There are currently zero bare `io.emit` calls and it should stay that way.

**A socket that reconnects gets a new id and is in no rooms.** Anything that
joins a room must re-join on `'connect'`, not once on mount. `res-review` and
`makeOffer` show the correct pattern.

**The group barrier.** Several steps block a student until every member of their
group finishes. That state lives in the `Step_Completion` table and is answered
by a query, re-evaluated on completion and on room join. It used to live in a
plain JavaScript object in the API process, which meant an API restart stranded
every group permanently. Do not put it back in memory.

Two recovery paths exist:

- `GET /groups/barrier-status/:classId/:groupId` — a poll, so a client that
  missed the socket event can ask
- `POST /groups/force-advance` — the teacher's override, admin only

Both work; **neither has any UI yet.** That is ticket `CU-7`.

---

# 3. Running it locally

MySQL and Keycloak run in Docker. The API and frontend run on your host,
because Keycloak must be reachable at the _same_ URL from both your browser and
the API process, and `localhost` inside a container is not the `localhost` your
browser sees.

## Prerequisites

- Docker Desktop running
- Node 22 (`nvm use` picks it up from `.nvmrc`)

## Steps

```bash
git clone git@github.com:Khoury-Co-op/NUHire.git
cd NUHire
nvm use
npm run install:all
```

Create the two env files:

```bash
cp api/.env.example api/.env
cp frontend/.env.example frontend/.env.local
```

The defaults in both example files work with the local stack as-is. You do not
need to edit anything to get started.

Start the services, then the two apps in separate terminals:

```bash
npm run dev:services     # MySQL + Keycloak in Docker
npm run dev:api          # builds, then runs the compiled API on :5001
npm run dev:frontend     # Next dev server on :3000
```

Wait for MySQL to report healthy before starting the API:

```bash
docker ps   # nuhire-mysql should say (healthy)
```

| Service  | URL                   | Credentials                |
| -------- | --------------------- | -------------------------- |
| app      | http://localhost:3000 |                            |
| api      | http://localhost:5001 |                            |
| Keycloak | http://localhost:8080 | admin / admin              |
| MySQL    | 127.0.0.1:3307        | root / nuhire, db `nuhire` |

## Env vars

Every variable the code actually reads, found by grepping
`process.env` across both packages.

### `api/.env` — required

| Var                                         | What                                                                                                                                                       | Local value                                    |
| ------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------- |
| `DATABASE_URL`                              | MySQL connection. Note port **3307** on the host                                                                                                           | `mysql://root:nuhire@127.0.0.1:3307/nuhire`    |
| `BACKEND_PORT`                              | API port                                                                                                                                                   | `5001`                                         |
| `SESSION_SECRET`                            | Signs session cookies. **The API refuses to boot if this is unset or under 32 characters.**                                                                | any 32+ char string                            |
| `REACT_APP_FRONT_URL`                       | Where the frontend lives. Used for CORS and every post-login redirect. Badly named; it is not a React var                                                  | `http://localhost:3000`                        |
| `KEYCLOAK_URL`                              | Must be reachable at this URL from **both** the browser and the API process                                                                                | `http://localhost:8080`                        |
| `KEYCLOAK_REALM`                            |                                                                                                                                                            | `NUHire-Realm`                                 |
| `KEYCLOAK_CLIENT_ID`                        |                                                                                                                                                            | `NUHire-Client`                                |
| `KEYCLOAK_CLIENT_SECRET`                    | In the committed realm export, so treat it as public                                                                                                       | see `.env.example`                             |
| `KEYCLOAK_CALLBACK_URL`                     |                                                                                                                                                            | `http://localhost:5001/auth/keycloak/callback` |
| `COOKIE_SECURE`                             | **Must be `false` locally.** Browsers drop `Secure` cookies over plain http, so without this every request comes back unauthenticated with a fresh session | `false`                                        |
| `MODERATOR_USERNAME` / `MODERATOR_PASSWORD` | The legacy `/mod-dashboard` login                                                                                                                          | `admin` / `admin`                              |

### `api/.env` — optional, sane defaults

`INSTANCE_COUNT` (leave at 1 — the socket layer keeps per-process state, so two
replicas split a group and it never finishes), `SOCKET_AUTH_REQUIRED`
(ships `false`, see gotchas), `LOG_LEVEL`, `LOG_PRETTY`, `NODE_ENV`, and the
`DB_POOL_*` tuning vars documented inline in `.env.example`.

### `frontend/.env.local`

| Var                        | What             | Local value             |
| -------------------------- | ---------------- | ----------------------- |
| `NEXT_PUBLIC_API_BASE_URL` | Where the API is | `http://localhost:5001` |
| `NEXT_PUBLIC_LOG_LEVEL`    | optional         |                         |

**If you add an env var, add it to the matching `.env.example` in the same
commit.** A missing var should fail loudly at boot, not produce a page that
navigates to `undefined/instructions`. That bug actually shipped.

## Test accounts

Seeded into both Keycloak and MySQL by `.local/seed.sql`. Password for all of
them is `nuhire`.

| Email                       | Role    | Group | Lands on             |
| --------------------------- | ------- | ----- | -------------------- |
| `advisor@northeastern.edu`  | admin   | —     | `/advisor-dashboard` |
| `student1@northeastern.edu` | student | 1     | `/waitingGroup`      |
| `student2@northeastern.edu` | student | 1     | `/waitingGroup`      |
| `student3@northeastern.edu` | student | 2     | `/waitingGroup`      |

All in class (CRN) 1. `advisor@northeastern.edu` already owns CRN 1 in the
`Moderator` table, which is what makes them a teacher.

## Giving yourself teacher access

The student side does nothing until a teacher starts a group, so you need this
before anything is clickable.

**Easiest:** log in as `advisor@northeastern.edu` / `nuhire`. Already set up.

**To make your own account a teacher**, you need two things: `affiliation` set
to `admin`, and a `Moderator` row owning a CRN.

```bash
docker exec -it nuhire-mysql mysql -uroot -pnuhire nuhire

UPDATE Users SET affiliation = 'admin' WHERE email = 'you@northeastern.edu';
INSERT INTO Moderator (admin_email, crn) VALUES ('you@northeastern.edu', 2);
```

`Moderator.crn` is `UNIQUE`, so **one email per CRN and one CRN per email**. You
cannot share CRN 1 with the seeded advisor; pick a different number. A professor
and a TA cannot both own a class today, which is open ticket `API-19`.

Log out and back in — `affiliation` is read at login, so the redirect will not
change until you do.

## Reset the database

```bash
docker compose -f .local/compose.yaml down -v
docker compose -f .local/compose.yaml up -d
```

`-v` drops the volume, so the schema and seed re-run. Without `-v` your data
survives and the seed does not re-run.

## Walking the full activity

Do this once before you touch code. You need **two browsers**, or one normal
window and one private window, because you will be two users at once.

### As the teacher

1. Log in as `advisor@northeastern.edu` at http://localhost:3000
2. You land on `/advisor-dashboard`. Open **Manage Groups**
3. Select class 1. You should see groups 1 and 2 with the seeded students
4. Assign a job description to the groups
   **Careful:** assigning a job **deletes all of that group's work** — resume
   votes, interview ratings, notes. That is a known design problem
   (tickets `TCH-1`, `TCH-2`), not something you broke
5. Click **Start** on group 1

### As a student, in the other browser

6. Log in as `student1@northeastern.edu`
7. Before the teacher started the group you sit on `/waitingGroup`. After, you
   land on `/about`, then `/dashboard`
8. Work the steps in order:
   `/jobdes` → `/res-review` → `/res-review-group` → `/interview-stage` →
   `/makeOffer`
9. At `/res-review` you get 10 resumes at 30 seconds each
10. `/res-review-group` will **block you until every member of group 1 has
    finished** `/res-review`. That is the barrier. To get past it, log in as
    `student2@northeastern.edu` in a third session and finish their resumes too.
    This is why two sessions is the minimum for testing anything group-shaped
11. Extend an offer at `/makeOffer`

### Back as the teacher

12. The pending offer appears on the advisor dashboard. Accept or reject it
13. The student sees the decision

**`/employerPanel`, the final step, is a stub.** It is a heading, one sentence
and a button. A group cannot actually finish the simulation. Build-or-cut is an
open product decision (`STU-27`).

---

## Known gotchas

Things that will cost you an hour if nobody tells you.

**Do not run `npm run dev` inside `api/`.** The `ts-node` script throws TS2769
on `auth.routes.ts` because the lockfile pins `@types/express@5` against
`express@4`. `tsc` itself passes. Use `npm run dev:api` from the root, which
builds and runs the compiled output — the same path production uses. The
tradeoff is no hot reload on the API: rebuild and restart after edits. Fixing
the dev script is an open ticket.

**`COOKIE_SECURE=false` is mandatory locally.** Forget it and every request
comes back unauthenticated with a brand-new session, and nothing in the UI tells
you why.

**Two sessions minimum for anything group-shaped.** Barriers, group
confirmations and socket rooms cannot be tested with one browser. If you tested
with one, you did not test it.

**Nothing socket-shaped has ever been tested with two real browsers.** Not the
barrier, not room scoping, not group confirmations. All of it is verified by
typecheck, request-level tests and headless socket clients only. Treat it as
unverified no matter how confident a commit message sounds.

**`SOCKET_AUTH_REQUIRED` ships as `false`.** The socket layer reads identity
from the session and refuses cross-group room joins, but it does not yet _drop_
a session-less socket. Turning it on is the single change most able to
disconnect every client at once, so it waits for a real two-browser test.

**Migrations are applied by hand.** `database-files/Pandployer.sql` only ever
runs against an empty database. Any schema change needs a numbered file in
`database-files/migrations/` **and** an edit to the dump. Read that directory's
README first.

**Three vocabularies for "what step is a student on"**: `Users.current_page`
(`'dashboard' | 'resumepage' | 'resumepage2' | 'jobdes' | 'interviewpage' |
'makeofferpage'`), `Progress.step` (`'none' | 'job_description' | 'res_1' |
'res_2' | 'interview' | 'offer' | 'employer'`), and the route paths. They do not
map to each other. Collapsing them is ticket `STU-16`. Until then, check which
one a piece of code means.

**`npm run lint` does not work.** No ESLint config exists anywhere, so
`next lint` drops into an interactive setup prompt. Ticket `INFRA-5`.

**There are no tests.** `npx tsc --noEmit` in both packages is your entire
safety net. Run it before every push.

**Uploads are committed to git** and the upload directory is not on a volume, so
a deploy would wipe files the professor uploaded while the database rows survive
pointing at nothing. Ticket `INFRA-11`.

**The whole repo runs on one replica.** `onlineStudents` lives in process
memory. Two replicas split a group and it never reaches its completion count.

---

# 4. Your first ticket

Read [AGENTS.md](AGENTS.md) before you write code. It is short and every rule in
it exists because the obvious approach went wrong here.

Then pick one. Twelve starter tickets below, verified as genuinely open. Each
names the files. Fuller detail lives in [TICKETS.md](TICKETS.md) and
[CLEANUP.md](CLEANUP.md).

| #   | Ticket                                                                                                                                                                                                             | Level | Est | Files                                                                                                                         |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----- | --- | ----------------------------------------------------------------------------------------------------------------------------- |
| 1   | **`ONB-1`** Run the app and write down every place these docs lied. Do it on a fresh clone in a temp directory, not your existing checkout                                                                         | GFI   | 3h  | `ONBOARDING.md`                                                                                                               |
| 2   | **`CU-2`** A Keycloak account with no `name` claim crashes login. `profile.name.split(' ')` assumes the claim exists and that names have exactly two words                                                         | GFI   | 2h  | `api/src/config/passport.ts:56`, `api/src/controller/auth.controller.ts:109`                                                  |
| 3   | **`CU-4`** CSV import picks the first header _containing_ "email", so Canvas's `Secondary Email` column can win and the whole class is imported under unusable addresses                                           | GFI   | 2h  | `frontend/src/app/components/StudentCSVTab.tsx:184`                                                                           |
| 4   | **`CU-1`** The interview shortlist query filters on `group_id` alone, so it leaks across course sections and returns one duplicate row per group member                                                            | MED   | 3h  | `api/src/controller/resume.controller.ts:169`, `api/src/routes/resume.routes.ts`, `frontend/src/app/interview-stage/page.tsx` |
| 5   | **`CU-7`** The teacher's force-advance override and the student's barrier poll both exist on the server with no UI. Two PRs                                                                                        | MED   | 5h  | `frontend/src/app/components/ManageGroupsTab.tsx`, `frontend/src/app/res-review/page.tsx`                                     |
| 6   | **`TCH-1`** "Assign Job" deletes every vote, rating and note for the whole class with no confirmation, and the modal never mentions deleting anything                                                              | GFI   | 5h  | `frontend/src/app/components/ManageGroupsTab.tsx`                                                                             |
| 7   | **`STU-8`** `/jobdes` calls `updateProgress` unconditionally on mount, so a student who re-reads the job description is reset to step 1 and ejected mid-activity                                                   | MED   | 4h  | `frontend/src/app/jobdes/page.tsx`, `api/src/controller/progress.controller.ts`                                               |
| 8   | **`STU-13`** A YouTube video that never loads leaves Submit disabled forever, so one student blocks their whole group's barrier                                                                                    | MED   | 5h  | `frontend/src/app/interview-stage/page.tsx`                                                                                   |
| 9   | **`STU-25`** "10 resumes" and "4 candidates" are hardcoded in at least six places. Upload 9 or 12 and every student in that class is permanently stuck                                                             | MED   | 6h  | `frontend/src/app/res-review/page.tsx`, `res-review-group/`, `interview-stage/`                                               |
| 10  | **`UI-9`** `tailwind.config.js` defines `background: '#fff'` and `foreground: '#fff'`; `sand` is white and `navy` is black. Every page writes `bg-sand/80` thinking it tints warm. Agree a palette as a team first | MED   | 6h  | `frontend/tailwind.config.js`                                                                                                 |
| 11  | **`INFRA-5`** ESLint does not exist, so `npm run lint` hangs on an interactive prompt. Add a flat config for both packages, `no-console` as a warning                                                              | MED   | 10h | root, `api/`, `frontend/`                                                                                                     |
| 12  | **`SEC-8`** _(hard, ask the lead for a spec)_ Socket events are not authorized by role. Any client can fake an advisor's accept, yank a group to any page, or spam a class with popups                             | HARD  | 18h | `api/src/config/socket.ts`                                                                                                    |

Before opening a PR:

- [ ] Both packages typecheck: `npm run typecheck`
- [ ] You walked the affected flow locally
- [ ] Group or socket changes tested with **two sessions in one group**
- [ ] `npm run format`
- [ ] No new `console.log`, no new `any`, no new env var missing from `.env.example`
- [ ] You did not move code and change behaviour in the same commit

---

## What I could not verify

Being explicit so you do not take any of this on faith:

- **Deployment.** `.github/workflows/deploy.yml` fires a Coolify webhook on push
  to `main`. I could not reach Coolify, the runner, or any hosted instance, so
  everything above about deployment comes from reading that file. The app is not
  currently hosted.
- **Keycloak against Khoury IT SSO.** The local realm is a throwaway. How this
  behaves against real Northeastern SSO is untested, and the `CU-2` bug above is
  most likely to surface exactly there.
- **The seeded interview videos.** They are YouTube embeds on a channel nobody
  on the current team owns. If they are deleted or region-blocked, step 4 breaks
  and there is no fallback. Nobody has checked who controls that channel.
- **Anything at 30 users.** Every capacity claim in this repo is a projection.
  The app has never been run above two.
- **Windows.** Setup above was verified on macOS only. WSL2 should work but no
  one has done it. If you are on Windows, `ONB-1` is genuinely useful work.
