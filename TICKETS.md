# NUHire Backlog

Built from a full read of the repo plus six adversarial reviews (UI, teacher workflow,
student flow, security, backend/scale, devex). Every claim below is cited to a file.
Duplicates across reviews have been merged.

**Team:** 8 new coders, 10 hrs/wk, ~14 weeks.
**Goal:** pilot with ~30 students in one live CS1210 section, spring.

---

## How to read this

IDs are area-prefixed so you can hand out whole areas once you know who wants what:

| Prefix | Area                                 |
| ------ | ------------------------------------ |
| `DEV`  | Setup, CI, process, docs             |
| `SEC`  | Auth and security                    |
| `API`  | Backend, data model, scale           |
| `TCH`  | Teacher / advisor side               |
| `STU`  | Student simulation flow              |
| `UI`   | Design system, accessibility, layout |

Each ticket carries: **[GFI]** good-first-issue, **[MED]** medium, **[HARD]** hard, plus
an hour estimate. **[SPEC]** means write the spec before handing it to a beginner.
**[LEAD]** means do it yourself; a beginner can't bootstrap it.

**Capacity math.** 8 × 10 × 14 = 1,120 nominal hours. For first-time contributors,
realistically **~600–700 effective hours** after onboarding, meetings, review, and rework.
This backlog is ~**900 hours**, deliberately over-provisioned so you have a priority
queue rather than a to-do list. The critical path is at the bottom.

---

## Decisions you owe the team before week 1

These block tickets and only you can make them.

1. **Employer Panel: finish or cut?** Today a group literally cannot reach "done."
   Cutting is ~12h, building is ~24h and needs content from the instructor. (`STU-2`)
2. **Supported screen size.** The app has **9 responsive breakpoints total**. "1280×800
   laptop floor" scopes `UI-29` to ~14h; including phones roughly triples it.
3. **`sendpopups` and `pending-offers` (~1,000 lines) are unreachable** — nothing links
   to them, and their features were reimplemented inside `ManageGroupsTab`. Wire up or
   delete. (`TCH-13`)
4. **Which GitHub org is canonical?** Docs say `KhourySpecialProjects/NUHire`, you cloned
   `Khoury-Co-op/NUHire`, `frontend/package.json` says `sagashrimproll/Panployer`.
   Do **not** fork — the Coolify webhook secret and self-hosted runner live in the repo's
   settings and a fork gets neither.
5. **Is the 30-second resume timer a rule or a nudge?** It's client-side only and resets
   on refresh. (`STU-17`)
6. **Is "hire nobody" a valid outcome?** The flow hardcodes exactly 4 shortlisted and
   exactly 1 offer. (`STU-35`)

Items 1, 5, 6 need the CS1210 instructor (**Katie Hughes**, listed as product owner).

---

## Answers to the questions you asked

**Why is there an "Admin" button on the login page, and is that login useless?**
It's a second, entirely separate auth system: a plaintext compare against two env vars
in `moderatorLogin` (`api/src/controller/auth.controller.ts:201`). It gates `/mod-dashboard`,
the only UI that writes the `Moderator` table — which is the root of trust for the whole
teacher role. So the _page_ is load-bearing; the _login_ is useless, four times over:
the endpoints behind it (`api/src/routes/moderator.routes.ts:11-13`) have **no auth at
all**; `verifyModerator` is never used as middleware; the creds were `a`/`a` in prod; and
it **fails open** when the env vars are unset, because `undefined === undefined`.
→ `SEC-4`, `SEC-5`

**What does CSV Group Assignment actually do?**
Reads one column whose header contains "email" and ignores everything else — it never
imports names. Email validation is **deliberately disabled**: the real regex is commented
out and replaced with `/^.*$/` (`StudentCSVTab.tsx:44`). The parser is `split(',')`, which
Canvas breaks (quoted names containing commas shift every column). **Every student lands
in group 1** — hardcoded at line 105, despite the comment above saying otherwise. No
dedupe, no diff preview, no confirmation. → `TCH-7` … `TCH-10`, `TCH-23`

**Start All Groups vs Start Group?**
Both just flip `GroupsInfo.started` to 1. **Irreversible** — no code anywhere sets it back
to 0; recovery needs database access. Re-running is harmless. "Start All" has a confirm
dialog; per-group "Start" doesn't. → `TCH-15`, `TCH-19`

**Assign Jobs to All Groups?**
The most dangerous button in the app, and it has **no confirmation**. It deletes every
resume vote, interview rating, and student note for the entire class
(`api/src/controller/job.controller.ts:201-226`). The modal never mentions deleting
anything. Three aggravating factors: the `START TRANSACTION` is issued on a connection
_pool_, so the deletes aren't atomic and the `ROLLBACK` is a no-op; `Offers` is the one
table it doesn't clear, so a group that already submitted gets wiped **and permanently
blocked**; and 4 of the 9 tables it "clears" are dead code. → `TCH-1` … `TCH-4`

**Download CSV?**
Two near-identical implementations. Almost certainly missing the header row Zoom's
pre-assign import needs, uses bare integers as room names, and exports `null,email` rows
for ungrouped students. **Nobody has tested it against real Zoom.** → `TCH-25`

**Can the teacher see Lucas's stats?**
Yes, ~26h, and nearly all the data already exists. Two landmines first: `candidate_id`
actually holds a **`Resume_pdfs.id`**, not a `Candidates.id`, everywhere in the app — so
the obvious lookup silently returns the wrong person. And `Resume` has **no unique key**,
so every vote change inserts a new row instead of updating; the panel would display
contradictory votes until that's fixed. → `TCH-21`, `TCH-22`, blocked by `API-9`

---

# SHORT — weeks 1–4

Goal: the team can work, the app can't silently freeze or crash, the professor can
unstick any group, and every person has landed a merged PR.

## DEV — unblock the team

**DEV-1 [LEAD] [HARD] 8h — Rotate every committed secret and purge git history**
`keycloak/render.yaml` has the Keycloak admin password in plaintext;
`keycloak/realm-export.json:541` has the OIDC client secret. Both are in git history.
The only item with an external clock.

- [ ] Rotate: OIDC client secret, Keycloak admin password, shared Gmail app password, moderator creds, `SESSION_SECRET`, DB password
- [ ] Scrub both files; rewrite history with `git filter-repo`; all collaborators re-clone
- [ ] Enable GitHub secret scanning + push protection
- [ ] New values live only in Coolify env + a password manager you control

**DEV-2 [LEAD] [HARD] 14h — Ship a working one-command local stack**
Highest-leverage ticket here. The committed `compose.yaml` does not run. If 8 freshmen
each burn 6 hours on Docker, that's 48 hours gone before any code. `.local/compose.yaml`
already works — promote it.

- [ ] Promote `.local/compose.yaml` + `.local/realm-export.json` to tracked files; delete the broken one
- [ ] One entrypoint (`make dev`) brings up MySQL + Keycloak, waits on health, installs, migrates, seeds, starts both apps
- [ ] Commit the `COOKIE_SECURE` cookie patch already in `api/src/app.ts` and `auth.controller.ts`
- [ ] Verified on macOS (both chips) and WSL2 by two people who didn't write it
- [ ] Clone → logged-in dashboard in under 15 minutes, measured
- [ ] Delete or fix the root `Dockerfile` (it `COPY`s before `WORKDIR`, building from an empty dir)

**DEV-3 [GFI] 5h — Commit `.env.example` for api and frontend** — deps: DEV-2
A fresh clone gets no env file and no list of what belongs in one. `NEXT_PUBLIC_FRONT_URL`
is read by two pages and documented nowhere; unset, they navigate to `undefined/instructions`.

- [ ] Both `.env.example` files list every var the code reads, with comments and safe defaults
- [ ] API fails fast at boot listing missing vars, instead of crashing in `new URL(undefined)`
- [ ] CI greps `process.env.X` across src and fails if a var is missing from the examples

**DEV-4 [MED] 6h — Fix the API dev script so the backend hot-reloads** — deps: DEV-2
`npm run dev` throws TS2769 on `auth.routes.ts` (`@types/express@5` pinned against
`express@4`). Backend iteration is currently `npm run build && npm start` every time.

- [ ] Pin `@types/express` to `^4.17` everywhere; regenerate lockfiles
- [ ] Swap to `tsx watch`; saving a `.ts` restarts in under 3s
- [ ] `npm run build` and the Docker image still pass

**DEV-5 [LEAD] [MED] 12h — Replace README/BUILD with a real onboarding doc** — deps: DEV-2
Docs are ~8 months stale. `BUILD.md` tells you to clone the wrong repo, `cd` to a
directory that doesn't exist, configure Google OAuth the code can't use, and run
`node server.js` which doesn't exist. Misleading docs are worse than none.

- [ ] `ONBOARDING.md`: clone → running app, in order, with expected output per step
- [ ] `README.md` rewritten to Next 15 + Express + MySQL + Keycloak + Coolify reality
- [ ] Delete `BUILD.md`; move the 12 handover docs to `docs/archive/` with a "historical, do not follow" header
- [ ] `docs/architecture.md` with one diagram

**DEV-6 [LEAD] [MED] 8h — CI on pull requests** — deps: DEV-4
The only automation today is a 6-line webhook on push to main. Nothing checks a PR.

- [ ] Typecheck + build for api and frontend, plus `docker build`, on every PR
- [ ] `npm ci` not `npm install`, so lockfile drift fails loudly
- [ ] GitHub-hosted runners (don't depend on the Khoury self-hosted one being up)
- [ ] Under 5 minutes; job names readable enough that a red X tells you what broke

**DEV-7 [LEAD] [HARD] 16h — Seed a realistic 30-student class** — deps: DEV-2
Current fixture is 1 advisor + 3 students. You cannot see an N+1, an index miss, a
barrier deadlock, or a fan-out bug at n=3. Blocks most of the API work.

- [ ] `npm run seed` builds CRN 99999: 1 advisor, 30 students, 8 groups, jobs assigned, in MySQL **and** the Keycloak dev realm
- [ ] `--scenario=` flag: `fresh`, `mid-resume-review`, `waiting-on-group`, `interview-stage`, `offers-pending`
- [ ] Includes the messy cases: a student who never signs in, one with NULL group, one whose `Progress` points at an old group, a duplicate pending offer
- [ ] Obviously-fake emails (`student01@example.test`), never real Northeastern addresses
- [ ] `npm run seed:reset` in under 60s; runs in CI so it can't rot

**DEV-8 [LEAD] [MED] 8h — Git workflow: branch protection, PR template, CODEOWNERS** — deps: DEV-6
History shows `fix it`, `fix problems`, `merge`, and direct pushes to main.

- [ ] `main` protected: no direct push, 1 review, CI green, branch up to date
- [ ] `CONTRIBUTING.md`, PR template, `CODEOWNERS` routing auth/config/infra to you
- [ ] Squash-merge only; soft 400-line PR size guideline with the reason stated
- [ ] 30-minute session where everyone does a throwaway PR end to end

**DEV-9 [MED] 10h — ESLint + Prettier + `.nvmrc`, then reformat in one commit** — deps: DEV-6
Zero style config today. `npm run lint` is `next lint` with no config behind it, so it has
never run. Node version is also split (api Dockerfile 18, frontend 22).

- [ ] Flat ESLint config covering both packages; start permissive so CI isn't a wall of red
- [ ] Pin one Node version across `.nvmrc`, `engines`, and all Dockerfiles
- [ ] **Whole-repo reformat as one commit, merged before any feature branches exist**; SHA added to `.git-blame-ignore-revs`

**DEV-10 [MED] 6h — Pre-commit hooks and commit conventions** — deps: DEV-9
CI catching a lint error 4 minutes after push teaches worse than a hook catching it in 2
seconds. Also stops someone committing a `.env` or a 152KB `build.log` — both already happened.

- [ ] Husky + lint-staged on staged files only, under 5s
- [ ] Block committing `.env*`, `*.log`, `*.pem`, `*.key`
- [ ] `commitlint` with conventional commits

**DEV-11 [MED] 10h — Test harness + delete the `exit 1` test script** — deps: DEV-4, DEV-6
`"test": "echo \"Error: no test specified\" && exit 1"` is the current state of QA on an
app about to face 30 live students.

- [ ] Vitest in `api/`; at least 3 real passing tests (the `group_<g>_class_<c>` room regex, the progress enum mapping)
- [ ] Wired into CI as a required check; coverage on, no threshold yet
- [ ] `docs/testing.md` with a copyable example
- [ ] Frontend harness scaffolded with one passing component test

**DEV-12 [LEAD] [HARD] 14h — Staging environment, and gate prod behind it** — deps: DEV-6
Biggest operational risk of handing the repo to beginners: a merge to `main` immediately
`curl`s a webhook that redeploys the live app. No build, no test, no approval, no rollback.
One bad merge during class takes down a room of 30 students.

- [ ] Second Coolify app deploys `dev` → `nuhire-staging.khoury.northeastern.edu`, own DB and realm
- [ ] Prod deploy requires CI green + a GitHub Environment with you as required reviewer
- [ ] Tested rollback documented click-by-click in `docs/runbook.md`
- [ ] Default flow becomes `feature → dev → staging`; `main` only on deliberate release

**DEV-13 [LEAD] [MED] 5h — Access tiers** — deps: DEV-1, DEV-12
The instinct when a beginner is blocked is to hand them the prod password. That's how
`a`/`a` ended up in a PDF.

- [ ] Three tiers in `docs/access.md`: local (day one), staging (after first merged PR), prod (you only)
- [ ] No shared accounts; no freshman has repo or Coolify admin
- [ ] **Offboarding checklist** — the step that didn't happen last time

**DEV-14 [LEAD] [MED] 6h — Issue templates and a groomed, labeled backlog** — deps: DEV-8

- [ ] Bug/feature/chore templates; labels incl. `good first issue`, `needs-spec`, `size:S/M/L`
- [ ] ≥15 issues labeled `good first issue` before week 2, each with AC and a file pointer
- [ ] Project board with a WIP limit of 1 per person

**DEV-15 [LEAD] [MED] 6h — Team operating agreement and sustainable review** — deps: DEV-8
8 PRs a week into one reviewer ends in either rubber-stamps or stalled contributors.

- [ ] Review policy: you review auth/config/infra; peer review required on everything else
- [ ] 1-business-day review commitment, stated
- [ ] "30 minutes stuck, then ask" rule; pairing rotation so every area has 2 people
- [ ] Definition of Done written down

**DEV-16 [GFI] 2h — Remove the duplicated `/auth` route registration** — deps: DEV-2
`api/src/app.ts` registers `authRoutes` **twice** under a copy-pasted comment. Perfect
first ticket: two lines, obviously wrong once seen, walks someone through the whole loop.

**DEV-17 [GFI] 4h — Clean stray files and fix package identity** — deps: DEV-2
First impression of the repo is `ls`, which shows a 152KB UTF-16 `build.log`, a Feb-2025
`updates.txt`, and a `test_schema.sql` that disagrees with the real schema.

- [ ] Delete all three; add `*.log` to `.gitignore`
- [ ] Root `package.json`: rename `pandployer` → `nuhire`, drop the bogus `vite --host 0.0.0` script
- [ ] `frontend/package.json`: remove the Feb-2024 changelog from `description`, fix `repository`

**DEV-18 [GFI] 4h — Move the departed author's email out of the seed path** — deps: DEV-3
`api/src/config/database.ts` hardcodes `labit.z@northeastern.edu` as the seeded production
moderator for CRN 1. That person is gone; every deploy recreates their account.

- [ ] Read from `SEED_MODERATOR_EMAIL` / `SEED_MODERATOR_CRN`; skip seeding entirely when unset

## SEC — security

**SEC-1 [GFI] 3h — Determine whether prod is publicly reachable**
Already partly answered: `nuhire.khoury.northeastern.edu` → `10.200.111.68`, an RFC1918
private address, so it's NEU-network-only and both Render services return 503. Confirm
formally, because **every severity rating below depends on it**.

- [ ] Re-verify off-VPN; confirm with Khoury IT whether Coolify apps are edge-exposed by default
- [ ] Record the answer and re-rank this section against it

**SEC-2 [MED] 8h — Require auth and authorization on `POST /users`**
The single worst bug in the repo. `api/src/routes/user.routes.ts:13` has no middleware and
`user.controller.ts:79-81` updates `affiliation` straight from the request body. One
unauthenticated fetch promotes any account to admin — or demotes a real professor.

- [ ] Requires a session; caller may only modify their own record unless admin
- [ ] `affiliation: 'admin'` only accepted when the email has a `Moderator` row, checked **server-side**
- [ ] An existing record's affiliation is never changed by this endpoint
- [ ] Test: forged curl returns 401/403

**SEC-3 [MED] 12h — Real super-admin check; protect the Moderator CRN routes** — deps: SEC-2
`moderator.routes.ts:11-13` lets anyone create, list, or delete teacher grants. `DELETE`
cascades through `GroupsInfo`, `job_descriptions`, `Resume_pdfs`, `Candidates` — one
unauthenticated call erases a class.

- [ ] Define super-admin (owner allowlist or an `is_owner` column) and document it
- [ ] All four `/moderator/crns*` routes require it; `DELETE` also needs a confirmation field
- [ ] `/mod-dashboard` moves behind the Keycloak session

**SEC-4 [GFI] 2h — Patch the empty-body moderator login bypass**
`auth.controller.ts:204` compares against possibly-undefined env vars, so
`POST /auth/moderator-login` with body `{}` **succeeds** when they're unset — and
`BUILD.md` never says to set them. Insurance in case SEC-5 slips.

- [ ] Reject if either env var is missing/empty, or if username/password aren't non-empty strings
- [ ] Startup warning when unset; test that `-d '{}'` returns 401

**SEC-5 [GFI] 6h — Delete the second login system** — deps: SEC-3
Two auth systems in one app, one a shared plaintext password enforced only in a React
`useEffect`. See the answers section.

- [ ] Remove the Admin button, `/mod-signin`, `moderatorLogin`, `verifyModerator`, and their routes
- [ ] Drop `MODERATOR_*` from all env config
- [ ] `/mod-dashboard` still works under the SEC-3 super-admin path

**SEC-6 [MED] 14h — Apply `requireAdmin` to every teacher-only endpoint**
`requireAdmin` and `requireStudent` exist in `auth.middleware.ts` and are applied to
**zero routes**. `group.controller.ts` contains no `req.user` reference at all. So any
logged-in student can start groups, assign jobs (which wipes the class), reassign
classmates, or accept their own group's offer.

- [ ] A route→role table in the PR description, reviewed by the lead
- [ ] `requireAdmin` on group/job/csv/facts/delete/moderator mutations and `PUT /offers/:id`
- [ ] Test file asserting a student session gets 403 on each

**SEC-7 [HARD] [SPEC] 14h — Authenticate Socket.IO connections**
`api/src/config/socket.ts` has no auth in 369 lines. Any client can open a socket and emit
anything. This is a CS class; someone will open devtools.

- [ ] Share the Express session via handshake middleware; reject unauthenticated at `io.use`
- [ ] `socket.data` carries verified email/group/class from the DB, never from the client
- [ ] Existing student and teacher flows still work

**SEC-8 [HARD] [SPEC] 18h — Authorize socket events by role and room** — deps: SEC-7
Today `makeOfferResponse` lets any client fake an advisor's accept; `moveGroup` yanks any
group to any page; `sendPopupToGroups` spams any class; `check` writes arbitrary votes.

- [ ] Admin-only: `sendPopupToGroups`, `moveGroup`, `makeOfferResponse`, `allowGroupAssignment`, `groupAssignmentClosed`
- [ ] Student events derive group/class from `socket.data`, never the payload
- [ ] `joinGroup`/`joinClass` verify membership
- [ ] Test: a student socket emitting an admin event is rejected and logged

**SEC-9 [MED] 10h — Lock down file uploads** — deps: SEC-6
`upload.routes.ts` has no auth on all three endpoints, and `upload.middleware.ts:20` uses
`file.originalname` verbatim with no sanitization, extension check, or size limit. Uploads
are served statically, so an uploaded HTML file is stored XSS on the API origin.

- [ ] `requireAdmin` on all three; server-generated uuid filenames; `originalname` stored as metadata only
- [ ] `limits.fileSize` + MIME and magic-byte check restricted to PDF
- [ ] Test: a file named `../../../x.pdf` writes nothing outside `uploads/`

**SEC-10 [GFI] 5h — Fix path traversal in file serve and delete**
`resume.controller.ts:373` and `:288`, and `job.controller.ts:95`, `path.join` a
`req.params` value and then `sendFile`/`unlinkSync` it.

- [ ] One `safeUploadPath()` helper rejecting separators and `..`, verifying the resolved path stays inside
- [ ] Test: `..%2f..%2f` returns 400

**SEC-11 [MED] 7h — Scope `GET /users` and `GET /users/check/:email`** — deps: SEC-6
`user.controller.ts:10` is `SELECT * FROM Users` with no filter, so any logged-in student
downloads every real name, email, class, and group in every section. `check/:email` has no
auth at all and is an enrollment oracle. Highest-consequence item on the FERPA axis,
because the pilot roster is real Canvas data.

- [ ] `GET /users` requires admin and returns only CRNs the caller owns; named columns, not `SELECT *`
- [ ] `check/:email` requires a session and answers only for the caller

**SEC-12 [GFI] 4h — Session hardening** — deps: DEV-3
`app.ts:85` sets `saveUninitialized: true`, and the session middleware runs _before_
`express.static('/uploads')`, so every PDF fetch writes a MySQL session row too.

- [ ] `saveUninitialized: false`; verify the Keycloak callback still lands its cookie
- [ ] `moderatorLogin` needs an explicit `req.session.save()` (if SEC-5 hasn't landed)
- [ ] Fail fast at boot if `SESSION_SECRET` is unset or under 32 chars
- [ ] Measure `SELECT COUNT(*) FROM sessions` before/after a simulated class

**SEC-13 [GFI] 4h — Protect `/stats` and bound the timestamp arrays**
`app.ts:149` serves a full route-by-route call map to anyone. The same middleware pushes a
timestamp per request into `routeCallTimestamps` and **never trims**, so a 3-hour class
leaks steadily and `/stats` gets slower the longer the server runs.

- [ ] `/stats` requires admin; timestamps capped to a rolling hour or a ring buffer
- [ ] Per-request `console.log` behind a `LOG_LEVEL`
- [ ] Test: array doesn't exceed the cap after 10,000 simulated requests

**SEC-14 [MED] 5h — Verify identity-provider registration is closed** — deps: SEC-1
`realm-export.json:30` has `registrationAllowed: true`. May be moot once Khoury IT SSO
lands, but nobody has checked the live IdP.

- [ ] Confirm which IdP prod uses; disable self-registration; restrict to `northeastern.edu`
- [ ] Try registering an external account and confirm it fails

## API — keep it from falling over

**API-1 [GFI] 3h — Pin the API to a single replica and document why**
`onlineStudents` and `global.completedResReview` are per-process, and Socket.IO rooms have
no adapter. With two replicas, a group splits across them and **never** reaches its
completion count. Coolify makes scaling up a one-click accident.

- [ ] Coolify API service explicitly set to 1 replica
- [ ] Comment block at the top of `socket.ts` naming every piece of in-process state
- [ ] Startup warning if an instance-count env var exceeds 1

**API-2 [GFI] 6h — Stop the process exiting on unhandled errors**
`server.ts:48-55` calls `process.exit(1)` on _any_ unhandled rejection. Several controllers
use callback `db.query` inside `async` methods, where a throw becomes exactly that. One
of them kills the API mid-class, drops all 31 sockets, and erases every in-memory barrier.
`compose.yaml` sets `restart: on-failure:5`, so the fifth crash ends the class.

- [ ] `unhandledRejection` logs with a stack and does **not** exit
- [ ] `uncaughtException` logs, drains 5s, then exits, saying so
- [ ] Express error middleware registered after all routes
- [ ] `restart: unless-stopped` + a `/health` healthcheck

**API-3 [MED] 8h — Bound the DB pool queue so saturation errors instead of hanging** — deps: API-2
`database.ts:51` sets `connectionLimit: 15, queueLimit: 0`. Unlimited queue with no acquire
timeout means a saturated pool produces requests that never resolve **and never error** —
the worst failure mode, because the logs look healthy while 30 laptops spin.

- [ ] `connectionLimit` 25 and env-configurable; finite `queueLimit` returning 503
- [ ] `connectTimeout` and a query timeout so nothing hangs forever
- [ ] `/health/db` reporting free/used/queued

**API-4 [MED] 12h — Replace fake pool-level transactions with real ones** — deps: API-3
`job.controller.ts:176`, `:299`, and `moderator.controller.ts:24` run `START TRANSACTION`
through the **pool**, so each statement can land on a different autocommit connection. The
deletes aren't atomic, the `ROLLBACK` runs on an unrelated connection, and a connection can
be left mid-transaction holding row locks. Fifteen of those and the entire API deadlocks
with zero errors logged.

- [ ] A `withTransaction(db, async conn => {...})` helper that always releases in `finally`
- [ ] All three call sites converted; every query inside uses `conn`
- [ ] Test: force a mid-transaction error, assert zero rows deleted and pool count returns to baseline
- [ ] CI grep: no `START TRANSACTION` outside the helper

**API-5 [MED] [SPEC] 14h — Teacher "force advance group" endpoint** — deps: API-9, API-13
**The highest-value ticket in this backlog.** `moveGroup` is emitted only by _students_ —
no advisor UI emits it. When a group deadlocks the professor has no button; her only
recourse is deleting a database row mid-class. Removing the absent student doesn't help,
because the barrier only re-evaluates when a _new_ completion arrives and nobody is left to send one.

- [ ] `POST /groups/force-advance {class_id, group_id, target_step}`, admin only
- [ ] Writes authoritative step for every member, then emits `moveGroup` to that room only
- [ ] Clears barrier state; idempotent; works when zero members are connected
- [ ] Audit log line

**API-6 [MED] 10h — Teacher "live group status" endpoint** — deps: API-9, API-13, DEV-7
Companion to API-5. When a group stalls the professor needs to know _which student_ is
blocking, in under ten seconds, from the podium. Today the only signal is `console.log`.

- [ ] `GET /groups/live-status/:classId` → per group: roster, per-student step, last seen, socket live?, barrier state ("3/4, waiting on jess@…")
- [ ] One query per class, no N+1; under 200ms against the DEV-7 fixture

**API-7 [HARD] [SPEC] 20h — Introduce database migrations** — blocks: API-9, API-13
The schema is a 424-line `mysqldump` loaded once via `docker-entrypoint-initdb.d`, so it
only runs on a brand-new volume. There's no way to evolve prod, and **the file already
disagrees with the code**: `GroupsInfo.max_students` and `Moderator.nom_groups` are queried
(`group.controller.ts:139,177`, `moderator.controller.ts:258`) but don't exist. On a fresh
DB, student group-join 500s immediately.

- [ ] A migration runner + `schema_migrations` table; migration 001 is the current dump, made idempotent
- [ ] **Dump prod schema and diff it against the repo**; every difference becomes a migration
- [ ] Decide explicitly: add `max_students`/`nom_groups`, or delete the code paths
- [ ] Migrations run on boot before listening; boot fails loudly on failure

**API-8 [MED] 8h — Make boot-time seeding idempotent and opt-in** — deps: API-7
`initializeDatabase()` runs on **every** boot: 26 sequential round trips before the server
accepts a request. It also seeds `Candidates` with literal `resume_id: 1..10` while
`moderator.controller.ts` does the same seeding with _looked-up_ IDs — the two disagree the
moment `Resume_pdfs.id` isn't 1-10, silently attaching candidates to the wrong resumes.

- [ ] Seeding moves to `npm run seed` + a `SEED_ON_BOOT` flag, default off in prod
- [ ] Both paths share one implementation (the lookup-based one is correct)
- [ ] Server starts in under 2s with seeding off; restarting twice changes zero rows

**API-9 [HARD] [SPEC] 24h — Migration: fix the barrier-critical schema defects** — deps: API-7, DEV-7
Five defects that each independently corrupt a live class:

- `Resume` has only `PRIMARY KEY (id)`, so `ON DUPLICATE KEY UPDATE` in `submitVote` **never fires** — every vote change inserts a row. `getFinishedCount`'s `HAVING COUNT(*) >= 10` then counts vote _events_, so a student who flip-flops ten times on one resume reads as finished, releasing the group barrier early.
- `GroupsInfo`'s "unique" key is `(class_id, id)` where `id` is the PK — it constrains nothing, so duplicate `(class_id, group_id)` rows are allowed.
- `Interview_Status`, `Offer_Status`, `Res2_Status` use `PRIMARY KEY (student_id)` — one row per student _globally_.
- `Offers` has no unique key on `(class_id, group_id)` — two members clicking submit create two pending rows.
- `Progress` is keyed on `email` but queried by `(crn, group_id)`, and `updateProgress` never updates those on conflict, so a reassigned student keeps a stale group forever.
- [ ] Dedupe then `UNIQUE (student_id, class, resume_number)` on `Resume`; `getFinishedCount` uses `COUNT(DISTINCT resume_number)`
- [ ] Real `UNIQUE (class_id, group_id)` on `GroupsInfo` and on `Offers`
- [ ] Composite PKs on the three `*_Status` tables
- [ ] `updateProgress` updates `crn` and `group_id` on conflict
- [ ] Each change ships with a before/after test proving the specific bug is fixed

**API-10 [MED] 10h — Index the hot `(group_id, class)` lookups** — deps: API-7, DEV-7
Zero hot paths are indexed. `Users` is queried by `(group_id, class, affiliation)` in four
places with no such index. `Interview_Status.group_id` is `varchar(45)` while everywhere
else it's `int`, forcing implicit conversion that defeats indexing anyway.

- [ ] Indexes on `Users(class, group_id)`, `Resume(group_id, class)`, `InterviewPage`, `Interview_Status`, `Offers`, `Progress(crn, group_id)`
- [ ] `Interview_Status.group_id` and `Offer_Status.group_id` → `int`
- [ ] `EXPLAIN` before/after in the PR, run against the 30-student fixture

**API-11 [GFI] 4h — Trim the request-log arrays and gate the noise**
(Merged with SEC-13 — do them together.)

**API-13 [HARD] [SPEC] 28h — Persist the group-completion barrier in MySQL** — deps: API-7, API-9, SEC-7
**The top live-class risk.** `socket.ts:238-280` keeps completions in
`global.completedResReview`. Every path out of this is a permanent stuck:

- **API restart** → the Set is gone; already-finished students never re-emit, so the count restarts at 0 and can never reach total.
- **Socket reconnect on `/res-review`** → the handler identifies the student by reverse-lookup in `onlineStudents`; that page has no `connect` handler, so after a reconnect the lookup fails and the server logs "Could not identify student" and **returns silently**. That student can never complete.
- **One-shot delivery** → release is emitted to a cached socket id, then the key is `delete`d. A student offline at that instant never gets it and never gets a retry.
- **`reconnectionAttempts: 5`** in `socketContext.tsx:16` means the client gives up permanently after ~5s of bad wifi, with no polling fallback.
- [ ] `Step_Completion (student_id, class, group_id, step, completed_at)`, PK `(student_id, class, step)`
- [ ] Handler upserts a row; identity comes from the authenticated socket (SEC-7), not the reverse lookup
- [ ] Completion evaluated by query, re-evaluated on completion, room join, roster change, and a `GET /groups/barrier-status/...` poll the client can fall back to
- [ ] Remove all `completedResReview` references, including the dead reset in `job.controller.ts:346` whose key format has never matched the writer's
- [ ] Test: restart the API with 3 of 4 done, 4th completes, group releases
- [ ] Test: a member disconnected at release time is released within one poll

---

# MID — weeks 5–9

## TCH — teacher workflow

**TCH-1 [GFI] 5h — Confirmation dialog on "Assign Job"** _(pull to SHORT — do it week 1)_
The most dangerous button in the app has weaker friction than "remove one student."

- [ ] Both the toolbar and per-card buttons route through a confirm step
- [ ] Modal lists what will be erased in plain English, with the affected group count
- [ ] Distinct red warning if any affected group has a pending/accepted offer
- [ ] Requires typing `ERASE` or the CRN; Cancel is default-focused

**TCH-2 [MED] 8h — Split "assign a job" from "reset a group's work"** — deps: TCH-1
Root cause of TCH-1. A professor who just wants to correct a job title has no way to do it
without nuking the class.

- [ ] Endpoints take `reset: boolean`, default `false`; with false, zero DELETEs
- [ ] Two visually separate buttons, only one destructive
- [ ] Test: assign a job mid-interview with `reset:false`, all votes survive

**TCH-3 [GFI] 4h — Remove the dead tables from the delete list**
`MakeOfferPage`, `Resumepage`, `Resumepage2`, `Offer_Status` are **never read or written**
anywhere — only deleted. The reassuring `cleared_tables` array in the response is a
hardcoded string list, not a real report.

- [ ] Confirm with a documented grep (also check `Res2_Status`); remove the DELETEs
- [ ] Replace `cleared_tables` with real affected-row counts
- [ ] Migration dropping the dead tables, or a note on why they're kept

**TCH-4 [GFI] 4h — Clear or void `Offers` when a group is reset** — deps: TCH-2
`Offers` is the one table the reset doesn't clear, so a group that already submitted gets
wiped **and then permanently blocked** from making a new one. Dead-ended, mid-class.

- [ ] Reset deletes or voids that group's offers; `makeOffer` stops blocking on a cancelled one
- [ ] Test: assign → offer → reset → group can offer again

**TCH-7 [GFI] 3h — Turn the CSV email validation back on**
`StudentCSVTab.tsx:44` has the real regex commented out and replaced with `/^.*$/`.

- [ ] Restore a format check (decide with the lead whether to require `@northeastern.edu`)
- [ ] Enforced **server-side** in `csv.controller.ts`, not just the browser
- [ ] Invalid rows listed with row number and value, excluded from submit

**TCH-8 [GFI] 5h — Use a real CSV parser**
`parseCSV` is `split(',')`. Canvas quotes names containing commas, which shifts every
following column. Windows line endings leave `\r` on the last field.

- [ ] `papaparse` or equivalent; fixtures for real Canvas export, quoted names, CRLF, BOM
- [ ] Unit tests per fixture; verified against a real Canvas gradebook export

**TCH-9 [GFI] 4h — Prefer an exact email-column match** — deps: TCH-8
Takes the first header _containing_ "email", so `Secondary Email` silently wins.

- [ ] Prefer exact matches, fall back to substring; dropdown when ambiguous
- [ ] Show the detected column and first 3 parsed values before submit

**TCH-10 [GFI] 5h — Fix "all students land in group 1"** — deps: TCH-8
Hardcoded at line 105, contradicting the comment above it. The professor hand-types 30
group numbers under time pressure, every term.

- [ ] "Students per group" input with auto-assign and optional shuffle
- [ ] Manual per-student override still works

**TCH-13 [GFI] 3h — Link or delete `/pending-offers`**
470 working lines reachable from nowhere, while a partial copy of the same logic lives
inside `ManageGroupsTab`. Two implementations, one invisible, drifting apart.
_(Blocked on your decision #3.)_

**TCH-15 [GFI] 2h — Confirm dialog on per-group "Start Group"**
Fires immediately and is irreversible, while "Start All" gets a confirm.

- [ ] Also fix: a group created _after_ "Start All" can't be started from the toolbar, because the button disables on `groups.every(isStarted)`

**TCH-19 [MED] 6h — Let a professor un-start a group** — deps: SEC-6
No code anywhere sets `started` back to 0. A mis-click needs DBA access to fix; during a
pilot that means the class stops.

- [ ] `PATCH /groups/stop-group` and `/stop-all-groups`, admin only, with confirmation
- [ ] Socket event so students see the gate close

**TCH-21 [MED] [SPEC] 12h — Candidate-stats endpoint** — deps: API-9, SEC-6
The teacher sees only a name and accept/reject. All the data exists but no endpoint joins it.
⚠️ **Join on `Candidates.resume_id`, not `Candidates.id`** — `candidate_id` holds a resume
id everywhere in this app, so the obvious lookup returns the wrong person.

- [ ] `GET /candidates/stats/:classId/:groupId/:candidateId`, admin only
- [ ] Returns name, resume file, interview URL, per-student resume votes joined to names, the group shortlist flag, per-student interview ratings, popup deltas, the offer row
- [ ] Handles "never voted on" without 500ing; scoped to classes the caller moderates

**TCH-22 [MED] 14h — Candidate-stats modal on the offer card** — deps: TCH-21, TCH-13
Gives the professor the evidence to make and discuss the decision, which is the
pedagogical point.

- [ ] Candidate name on a pending-offer card becomes clickable
- [ ] Three sections: résumé PDF, interview video, how the group voted
- [ ] Accept/reject available from inside; never blocks the flow if stats fail to load

**TCH-23 [MED] 12h — CSV import preview/diff before writing** — deps: TCH-7, TCH-8
Submit is currently a blind write. Duplicate emails silently last-write-wins, students
already in a group are silently moved, and students missing from the CSV are silently left.

- [ ] Dry-run showing: N new, N moved (named, from→to), N unchanged, N duplicates, N in class but absent from file
- [ ] Duplicates are a hard error; explicit confirm step; post-import summary

**TCH-24 [MED] 6h — Let CSV import add groups to an existing class** — deps: API-9, TCH-23
`createGroups` returns 400 if any group exists and the frontend **swallows it**, so
re-importing with more groups silently fails to create them and those students vanish
from Manage Groups.

**TCH-25 [MED] 6h — Make the Zoom CSV actually importable**

- [ ] **First: verify against a real Zoom account.** Everything else depends on the answer.
- [ ] Header row; human-readable room names (`Group 1`); exclude `null`-group and non-students with a skipped count
- [ ] Deduplicate the two copies into one helper

**TCH-26 [HARD] 14h — Recompute the barrier when membership changes** — deps: API-13
Group size is counted live from `Users`, so a CSV-imported student who never logs in
inflates the total and the group waits forever. Removing someone mid-class doesn't recount.

- [ ] Barrier counts only students who have actually signed in
- [ ] Add/remove/reassign triggers a recount and notifies **both** old and new rooms
- [ ] Test: roster 4, sign in 3, the 3 can advance

**TCH-28 [MED] 8h — Tell the professor when a popup wasn't delivered** — deps: API-13
`sendPopupToGroups` only reaches students in the in-memory map; anyone who reconnected
silently gets nothing, and the professor sees success either way.

- [ ] Handler acks with `{delivered, missed}`; UI shows "Sent to 3 of 4 — Jane did not receive it"
- [ ] Retry button for missed recipients

**TCH-20 [MED] 12h — Audit log for teacher actions** — deps: SEC-6
Nothing records who clicked what. After a bad class there's no way to reconstruct whether
the professor hit assign-job, a student hit an unprotected endpoint, or the API restarted.

- [ ] `AuditLog(actor_email, action, class_id, group_id, payload, affected_rows, created_at)`
- [ ] Written for: start/assign/reset, CSV import, roster changes, offer decisions, class create/delete
- [ ] Logs before _and_ after destructive actions, with counts
- [ ] Read-only admin view

## STU — student flow

**STU-1 [GFI] 2h — Fix the `/employerPannel` 404** _(pull to SHORT)_
`dashboard/page.tsx:69` links to `/employerPannel`; the folder is `employerPanel`. The page
then writes progress `"employerPannel"`, not in the `Progress.step` enum, so `useProgress`
bounces them to the 404 again. **A group cannot finish the simulation.**

**STU-2 [MED] 14–24h — Build or cut the Employer Panel** — deps: STU-1, STU-30
25 lines: a heading, one sentence, a button. It's the pedagogical payoff and it's empty.
_(Blocked on your decision #1 and the instructor.)_

**STU-3 [GFI] 1h — Remove `NEXT_PUBLIC_FRONT_URL`** _(pull to SHORT)_
Two call sites, documented nowhere, 404s when unset — this broke for you on day one.

- [ ] Both use `router.push("/instructions")` / `("/dashboard")`; no env var needed

**STU-4 [GFI] 2h — Stop the progress guard redirecting to a non-route** _(pull to SHORT)_
`useProgress.tsx:22` does `window.location.replace('/' + progress)` where progress is
`res_1` — not a route. The guard that protects students is itself a 404 generator.

- [ ] A `stepToRoute` map; unknown progress → `/dashboard`, never a bare step name
- [ ] Don't redirect until auth and progress have loaded

**STU-5 [MED] 8h — Persist resume votes as they're cast** — blocks: STU-11
**The single worst student bug.** Votes accumulate in React state and only POST when the
array hits exactly 10 (`res-review/page.tsx:485`). The per-resume _counters_ persist to
localStorage; the _votes array_ doesn't. Refresh at resume 7 → resume at 7, finish all 10
on screen, POST never fires, never counted finished, **group barrier never opens for anyone**.

- [ ] Each decision POSTs immediately (or the array persists alongside the counters)
- [ ] Failed POST surfaces a visible retry, not a `console.error`
- [ ] Test: refresh at 3, 7, and 9; finish; confirm 10 rows and a correct finished-count

**STU-6 — Resume unique key** → merged into **API-9**

**STU-7 [MED] 4h — Stop `/jobdes` resetting progress backwards**
`jobdes/page.tsx:79` calls `updateProgress("job_description")` unconditionally on every
mount, and the API overwrites unconditionally. A student at the interview stage who
re-reads the job description has their progress reset to step 1, every later step re-locks,
and they're ejected mid-activity while their group waits at a barrier.

- [ ] Progress is monotonic; the API ignores a step earlier than the stored one
- [ ] Revisiting an earlier step is read-only

**STU-8 [GFI] 1h — Dashboard reads the wrong progress field**
`dashboard/page.tsx:125` reads `progressData.progress`; the API returns `step`. So it always
resolves to `"none"` and writes that to localStorage — on every `jobUpdated` event. The
professor reassigns a job and every student in that group silently has progress wiped.

**STU-12 [MED] 8h — Persist group-confirmation state**
`teamConfirmations` in `res-review-group/page.tsx:78` is pure client state. Any refresh
resets it to `[]`, and teammates who already confirmed **can't re-confirm** (button
disabled). Permanent deadlock unless the whole group reloads in unison.

- [ ] Stored server-side per (group, class, student), fetched on mount
- [ ] Changing selection after confirming clears confirmations and says why
- [ ] Add unconfirm — the `teamUnconfirmSelection` socket handler exists and nothing triggers it

**STU-13 [MED] 6h — Persist the make-offer selection**
`socket.ts:74` broadcasts the checkbox but **writes nothing**, while `makeOffer` reads
`InterviewPage.checked`, which nothing ever sets. Also uses `socket.to()`, excluding the sender.

**STU-14 [GFI] 3h — Handle group members disagreeing** — deps: STU-13
`makeOffer` renders its controls only when `selectedCount === 1`. Two students checking
different candidates makes **every button vanish** with no message.

**STU-17 [MED] 6h — Fix the res-review timer expiring into a hard lock**
Three bugs: on timeout it calls a handler that bails early while `resumeLoading` is true and
never restarts, so the student sits at `0 sec` forever; all three buttons are disabled while
loading, so a failed PDF locks the student out entirely; and `restricted` is never set true,
making the accept-on-timeout branch dead code.

- [ ] Timeout always advances; PDF failure shows a message with working Skip and Retry
- [ ] Test: block the PDF URL in devtools, confirm the student can still finish

**STU-18 [GFI] 3h — Decide what the timer means** — deps: STU-17
Client-side only, keeps running while reading the job description, resets on refresh,
nothing enforced server-side. _(Blocked on your decision #5.)_

**STU-19 [MED] 6h — Make transitions idempotent against double-clicks**
`sendVoteToBackend` reads `votes` from a stale closure, so two fast clicks lose one vote and
push the length off 10 **forever**. `handleMakeOffer` has no in-flight guard and `Offers` has
no unique key, so a double-click creates two pending offers and the advisor sees the group twice.

**STU-20 [GFI] 2h — Emit before navigating**
`res-review/page.tsx:400` and `interview-stage/page.tsx:661` set `window.location.href` and
_then_ emit `moveGroup`. Navigation can tear down the socket first, so one student advances
and their teammates stay behind.

**STU-21 [GFI] 2h — Fix or remove the dead Back buttons**
Three are hardcoded `disabled={true}`; one is labeled "Back: Interview Stage" and points at
`/jobdes`. A fourth actually works and triggers STU-7. Four different answers to "can I go back."

**STU-22 [GFI] 2h — Stop `/about` wiping localStorage** — deps: STU-4
`about/page.tsx:29` calls `localStorage.clear()`, nuking progress, review counters, and
ratings in one line, for anyone whose `seen` flag isn't 1.

**STU-23 [MED] 5h — Give the interview stage crash-resistance**
Persists `videoIndex` but not the votes array, and only POSTs on the last interview. Refresh
at candidate 3 of 4 → exactly one rating reaches the DB, and unlike STU-5 the student is
still marked finished, so **nothing looks wrong**. `makeOffer` then divides those sums by
group size and shows the group wrong averages to decide on.

**STU-24 [MED] 5h — Handle a YouTube video that doesn't load**
Submit is disabled on `!videoLoaded`, set only by the iframe's `onLoad`. Region block, dead
channel, or campus wifi → "Loading Interview Video…" forever, **cannot submit, cannot
advance, blocks the group's barrier**. No timeout, no fallback.

- [ ] Timeout ~15s and enable Submit with a visible notice; keep résumé and JD tabs usable
- [ ] Audit the seeded video URLs and record who owns that YouTube channel

**STU-25 [GFI] 3h — `checkExistingOffer` reads an array as an object**
The API returns an array; the client does `if (offer && offer.id)`, which is never true. So a
student who refreshes after submitting sees a page that acts like they never made an offer,
and the advisor's decision never re-syncs.

**STU-26 [MED] 10h — Wire up the "candidate didn't show up" curveball**
The professor's headline feature. `noShow` is never set true by anything; the socket handler
re-emits votes and never touches the sliders. It renders as a generic dismissible popup and
**changes nothing**.

- [ ] Confirm intended behavior with the instructor (zero the ratings, or lock them?)
- [ ] Replace the `-10000` magic numbers and `<= -1000` detection with an explicit flag

**STU-27 [MED] 4h — Fix the scrambled rating field mapping** — blocks: STU-26
Three code paths map the same four ratings to `question1..4` **three different ways**, and
`makeOffer` sums two of those mappings together. Students are shown, and hire on,
mislabeled numbers.

- [ ] One named mapping constant; rename the columns to `overall/presence/quality/personality`

**STU-28 [MED] 8h — Popups survive refresh and reach late joiners**
Sent only to cached socket ids, persisted nowhere, dismissed forever on first click. Also
doesn't scope by class unless `classId` is truthy, so a falsy value sends to that group
number in **every** CRN.

**STU-29 [MED] 10h — Route a late joiner to where their group actually is** — deps: STU-7
A student arriving 15 minutes late has progress `none` while their group is at the interview
stage, so they must do 10 timed resume reviews alone while three teammates sit at a barrier.
In a 50-minute class that group does not finish.

**STU-30 [HARD] [SPEC] 18h — Collapse the three progress vocabularies** — deps: API-7, API-9
`Users.current_page`, `Progress.step`, and the route paths are three names for the same six
things with no mapping. Root cause of STU-1, STU-4, STU-7, STU-8, and it will keep generating
bugs all semester. `job.controller.ts:196` also does a bare `UPDATE Progress` that silently
affects **zero rows** when no row exists yet — the common case for a fresh class.

- [ ] One canonical enum shared by api and frontend, with `toRoute()` / `toLabel()`
- [ ] `current_page` derived or dropped; upserts everywhere, never bare UPDATE
- [ ] `POST /progress` validates and 400s instead of letting MySQL throw a truncation 500
- [ ] Migration backfills; one page in `docs/` mapping all three, including historical values

**STU-32 [GFI] 2h — Fix the duplicate socket connection in the notes widget**
`components/note.tsx:7` calls `io()` at **module scope**, outside the provider. The navbar
renders on every page, so every student holds two sockets all class — 60+ connections at 30
students. `adminFacts` also calls `socket.disconnect()` in a cleanup, killing the app-wide
shared socket for every other page.

**STU-33 [GFI] 4h — Make notes usable without leaving the step**
The job-description instructions tell students to take notes, but the Notes menu item
_navigates away_ — which on `/res-review` destroys the timer and the in-memory votes array
(STU-5). No edit, no delete.

**STU-35 [MED] 6h — Handle a group that wants to hire nobody** — deps: STU-14
Hardcodes exactly 4 shortlisted and exactly 1 offer. "None of these is a good fit" is a
legitimate and interesting hiring outcome with no way to express it. Also: `allRejected`
promises a restart from the job description stage, and **no restart mechanism exists**.
_(Blocked on your decision #6.)_

**STU-36 [MED] 6h — Stop hardcoding 10 resumes and 4 candidates**
`>= 10` and `!== 4` are hardcoded in at least six places. If the professor uploads 9 or 12
resumes, the completion check never fires and **every student in that class is permanently
stuck**, with no warning.

## UI — the overhaul

Measured baseline: 11,702 lines, 25 routes, **2 `aria-*` attributes**, **0 `htmlFor`** across
22 `<label>`s, **9 responsive breakpoints**, 0 ESLint config, 0 tests. One loading spinner
copy-pasted **16 times**. The footer written inline **6 times**. Three navbars.

**UI-2 [GFI] 4h — Fix Tailwind class names that silently don't exist** _(pull to SHORT)_
**Highest visible-improvement-per-hour ticket in the backlog.** `bg-springWater` is used on
**12 surfaces** and isn't defined — every one renders transparent, including an entire modal.
Plus `text-northeasterWhite` (missing `n`), `bg-norteasternWhite`, `text-XL`, `text-Black`.

**UI-3 [GFI] 4h — Fix invalid z-index utilities** _(pull to SHORT)_
`z-1`, `z-5`, `z-100` aren't valid Tailwind v3 utilities and **generate no CSS**. Every
"semi-transparent overlay for readability" div over the slideshow is actually `z-index: auto`.
That's why the landing page and waiting room look wrong.

**UI-4 [GFI] 2h — Fix visible text typos** _(pull to SHORT)_
`components/note.tsx:99` ends a `<textarea />` with a stray literal `t`, rendering a floating
"t" in the Notes dropdown on **every page with the student navbar**.

**UI-5 [GFI] 4h — Delete orphaned pages** _(blocked on decision #3)_
`signup`, `studentPopups`, `studentCSV`, `manageGroups` are unreachable and duplicate live
functionality. A new contributor will waste a day editing the wrong file.

**UI-7 [GFI] 3h — Remove permanently-disabled Back buttons** _(merged with STU-21)_

**UI-8 [GFI] 4h — Remove dead state and no-op render branches**
`waitingGroup`'s entire "Authorization Received" UI is unreachable; `makeOffer:1093` has a
ternary whose branches are identical; `sendpopups:530` maps into styled divs with **no children**.

**UI-9 [GFI] 4h — Stop leaking debug output to students** — deps: DEV-9
`interview-stage:1113` renders `File path: {currentVid?.file_path}` **into the student UI**.
`signupform:63` logs `document.cookie`. ~350 `console.log` calls, 85 in one file.

**UI-11 [GFI] 5h — Unify step-name vocabulary in the UI**
"Interview Stage" vs "Interview Page" vs "Interview Review" for the same step, hardcoded in
three places. `instructions` lists 5 steps; `dashboard` shows 6 cards.

**UI-12 [GFI] 4h — Fix the progress bar, which always lies** — deps: UI-11
Each page passes a hardcoded `progress={n}` over a 5-item array, so a student on the **final**
step sees 80% and one on the first sees 0%. It never reflects real saved progress.

**UI-13 [HARD] EPIC — Design system foundation** (children UI-14…UI-21)
There is **no shared component layer at all**. Until primitives exist, every visual fix must
be applied 15 times and 8 people will each invent a different button. Two incompatible visual
languages coexist: student pages use `bg-sand` + `font-rubik`; `ManageGroupsTab` and `new-pdf`
use `bg-gray-50` + `bg-red-600` + `font-sans`. **The advisor's main screen doesn't look like
the same product.**

**UI-14 [MED] 6h — Rewrite the Tailwind theme tokens** — parent UI-13
`tailwind.config.js` defines **`background: "#fff"` and `foreground: "#fff"`**. `sand: "#fff"`
is not sand. `navy: "#000"` is not navy. Every page writes `bg-sand/80` believing it's tinting
warm when it's applying flat white. **The true unlock for the whole overhaul.**

**UI-15 [MED] 8h — `<Button>`** — deps: UI-14. ~40 distinct inline class strings today, several
broken: a red button whose hover is `hover:bg-blue-400`; a navbar button that's white-on-white on hover.

**UI-16 [GFI] 5h — `<Spinner>` / `<PageLoader>`, killing the 16 copies** — parent UI-13.
Most duplicated block in the app; one copy has already drifted to a different color.

**UI-17 [HARD] 10h — Accessible `<Modal>`, consolidating 5 overlay patterns** — parent UI-13.
None has `role="dialog"`, focus trap, Escape, or focus restoration. Two can stack simultaneously.

**UI-18 [MED] 8h — `<FormField>` with real labels** — deps: UI-2. **`htmlFor` appears zero times**
across 22 labels. The signup form is black text fields on a black card with one input that has
no label _and_ no placeholder.

**UI-19 [GFI] 5h — `<Card>` / `<Panel>`** — deps: UI-14. Border widths range 1px–4px with no rule.

**UI-20 [HARD] 12h — `<AppShell>`, deleting duplicated chrome** — deps: UI-14. Six footer
implementations; `jobdes` and `makeOffer` each render **two `<footer>` landmarks**; three navbars.

**UI-21 [GFI] 6h — Component gallery route** — deps: UI-15/16/17/19. Cheapest visual-regression
check for a team with no test infra, and how you stop person #7 writing another bespoke button in week 11.

**UI-22 [MED] 10h — Accessibility audit** — This is a required course at a public university.
2 `aria-*` attributes, 0 `role=`, 0 `htmlFor`, exactly **one** `onKeyDown` in the whole app.

- [ ] axe + Lighthouse on all 21 routes; keyboard-only and VoiceOver passes of the full journey
- [ ] Contrast check of every pair; publish the baseline so improvement is measurable

**UI-23 [MED] 6h — Make dashboard step cards keyboard-operable** — deps: UI-22
The **primary navigation of the entire student experience** is a `<div>` with `onClick`, no
`tabIndex`, no role, no key handler. Locked cards set `pointerEvents: none`, which also
suppresses the tooltip explaining _why_ — so a blocked student gets no feedback at all.

**UI-24 [GFI] 4h — Restore focus indicators** — deps: UI-22. `focus:outline-none` with no
replacement on the **first interactive element on the page**.

**UI-25 [MED] 5h — Fix contrast failures** — deps: UI-22, UI-2. Disabled buttons at ~1.9:1;
white-on-white on hover in two components; `text-white` on a white card.

**UI-26 [MED] 6h — Semantic HTML: headings, landmarks, unnamed controls** — deps: UI-22
`res-review-group` has **no `<h1>` at all** and starts at `<h3>`. Two pages put the page title
in a bare `<div>` and use `<h1>` for a sidebar label. The profile avatar link has **no
accessible name whatsoever**.

**UI-27 [MED] 6h — Responsive audit** _(blocked on decision #2)_
9 breakpoints in 11,702 lines is the entire responsive design. Four of five student step pages
are `h-screen overflow-hidden`, so content that doesn't fit is **unreachable, not scrollable**.

---

# LONG — weeks 10–14

**API-17 [MED] 10h — Scope every broadcast to a room** — deps: SEC-8
Four handlers use `io.emit`. Two of them (`updateOnlineStudents`, `studentPageChange`) have
**zero listeners anywhere in the frontend** — pure waste plus a PII broadcast. At 30 students
that's ~7,400 wasted frames for events nobody consumes. `progress.controller.ts` emits to the
room **and then again globally**.

**API-18 [GFI] 3h — Delete the `message` handler**
Registered **inside** the `studentOnline` handler, so every re-emit stacks another listener on
the same socket and the logs fill with `MaxListenersExceededWarning` during class.
`res-review` emits `studentOnline` twice from two effects. It's also dead code — nothing emits
or listens to `message`.

**API-20 [GFI] 6h — `getCheckedResumes` returns the opposite of what it means** — deps: API-9
`WHERE checked = "True"` against a `tinyint(1)`. MySQL coerces `"True"` to `0`, so it returns
exactly the **unchecked** resumes. Meanwhile `candidate.controller.ts` filters the same column
with `= 1`. The group's shortlist going into the interview stage is wrong.

**API-21 [GFI] 8h — Fix or delete endpoints querying non-existent tables**
`resume.controller.ts:178` queries `resume_votes`; `interview.controller.ts:176` queries
`Interview`. Neither table exists — both always 500. `resume-pdf.routes.ts` declares a param
the controller doesn't read. `group.controller.ts:703` is a second, unrouted
`assignJobToAllGroups` writing a `Progress.job` column that doesn't exist — a trap for anyone
who greps the name.

**API-22 [MED] 12h — Make group-join capacity race-free** — deps: API-4, API-7
Classic check-then-act. All 30 students click join within seconds, every one reads
`current_students = 0`, and 30 land in a 4-person group. Then every barrier waits for 30 people.

**API-23 [MED] 12h — Idempotent popup vote aggregation** — deps: API-9, SEC-7
A pure accumulator with no per-student row, so a double-click or reconnect double-counts with
no way to detect or undo it. The professor's curveball results are quietly wrong.

**API-24 [MED] 14h — Stop leaking raw MySQL errors** — deps: API-2
~25 handlers return `err.message` to the browser, exposing table and column names. Many
callbacks never check `err` at all before touching `results`, which throws inside a callback
and (pre-API-2) kills the process.

**API-25 [MED] 18h — Collapse the advisor dashboard N+1** — deps: API-10, API-17, DEV-7
`ManageGroupsTab` makes **~40 requests per refresh**, and refresh fires on every globally
broadcast `userAdded`. Thirty students signing in produces roughly **1,200 advisor requests in
two minutes** — almost certainly why the ">50 calls/min" warning exists.

**API-27 [MED] 8h — Persist uploads outside the container image**
`compose.yaml` mounts **no volume** for uploads, and the deploy workflow fires on every push to
main. A routine commit mid-semester destroys every resume and job description the professor
uploaded, while the DB rows survive pointing at files that no longer exist.

**API-32 [HARD] [SPEC] 20h — Scope every data endpoint to the caller's own group** — deps: SEC-6, STU-30
`POST /resume/vote` takes `student_id` from the **body**, so a student can vote as a classmate.
Note `updateUserClass` and `updateUserSeen` _do_ check ownership — the pattern exists and just
wasn't applied consistently.

**API-33 [HARD] [SPEC] 18h — Allow more than one teacher per class** — deps: API-7, API-9
`Moderator.crn` is UNIQUE, so exactly one email can own a CRN — a professor plus a TA can't both
run the console. The socket handler already loops over multiple moderators; the schema is what forbids it.

**SEC-15 [MED] 7h — Rate limiting** · **SEC-20 [MED] 8h — Helmet and CSP** (must not break the
YouTube embeds or `react-pdf`) · **SEC-16 [GFI] 3h — Fix the Notes IDOR** (reads `user_email`
from the query string; any student reads any other student's private notes — _pull this to SHORT, it's a 2-hour fix_)

**SEC-22 [HARD] 12h — Settle repo visibility and purge history** — deps: DEV-1
**SEC-23 [MED] 12h — FERPA and data-handling policy** — deps: SEC-11
Real Canvas names and emails, and nobody has written down what's collected, who sees it, how
long it's kept, or who to call if it leaks. Not exploitable, but the item most likely to
actually hurt the course.

**DEV-23 [MED] 16h — Shared frontend API client** — deps: DEV-9, DEV-11
**The ticket that makes 8-way parallel work possible.** 105 raw `fetch(` calls, each
re-declaring `API_BASE_URL` (31 files) and hand-writing `credentials: 'include'` (105 times).
Every beginner copy-pastes the block, gets one detail wrong, and their bug looks like everyone else's.

- [ ] Migrate one route folder per PR so it doesn't conflict with feature work
- [ ] ESLint rule banning bare `fetch(` in `src/app/`

**UI-35 / DEV-24 [HARD] 20h — Break up `ManageGroupsTab.tsx`** — deps: DEV-23, DEV-26
1,717 lines, **38–41 `useState` hooks** in one component, six inline modals. Churn data confirms
it's the top collision file. Two people on advisor features today means daily conflicts.

- [ ] Split into `GroupCard`, `GroupList`, the six modals, and `useGroupData`
- [ ] No file over 300 lines; restyled to the design system so the advisor screen matches the product
- [ ] **A series of small PRs with a declared file freeze**, announced to the team

**DEV-25 [HARD] 14h — Break up `group.controller.ts` (757 lines)** — deps: DEV-26
Also the place to establish one controller shape so 8 beginners stop inventing 8 different ones.

**DEV-26 [HARD] 24h — API integration tests against a real test DB** — deps: DEV-7, DEV-11
The refactors above are unsafe without them. Split across 3 people by domain.

**DEV-31 [HARD] 20h — Playwright smoke test of the full student journey** — deps: DEV-7, DEV-26
**The single highest-value guardrail for a team of beginners.** Catches the one class of
breakage that matters: "a student cannot finish the simulation."

- [ ] Advisor starts a group; student completes every step through to the end
- [ ] A second spec covers the multi-student barrier with 3 parallel browser contexts
- [ ] Trace/video/screenshot artifacts uploaded so a beginner can see what broke

**API-30 / DEV-36 [HARD] 20h — Load test 30 concurrent students** — deps: DEV-12, API-13, DEV-31
Every number in this backlog is a projection until measured. The critical unknown: whether
saturation shows up as **errors** (recoverable) or **hangs** (class over).

- [ ] 30 socket clients plus an advisor through the full journey, including a synchronized-advance burst
- [ ] A chaos case: restart the API mid-run and assert every student recovers (this is API-13's acceptance test)
- [ ] Pass criteria: p95 under 500ms, zero hung requests, zero stuck students

**DEV-35 [HARD] 14h — Error tracking and observability** — deps: DEV-12, UI-9
**DEV-37 [MED] 14h — Pilot-day runbook and a rehearsed incident** — deps: DEV-12, DEV-35

- [ ] Pre-class checklist, health check, restart, rollback, unstick a group, reset a student
- [ ] A manual "unstick group" admin action, so the fix isn't raw SQL typed under pressure
- [ ] Backup verified by performing an actual restore, not by confirming backups exist
- [ ] A game day where the team breaks staging and recovers using only the runbook

**DEV-33 [MED] 8h — Prune dead dependencies** — The three `package.json` files install
`python`, `socket`, `popup`, `fs`, `crypto`, `googleapis`, `vite`, `react-router-dom`, and two
Google OAuth strategies. None are used. A beginner reading dependencies will conclude the app
uses Google OAuth and React Router; it uses neither.

**DEV-34 [MED] 10h — Make the docs self-verifying** — deps: DEV-5, DEV-6
The reason this handover hurt is that docs drifted 8 months with nothing detecting it.

- [ ] CI runs the `ONBOARDING.md` commands on a clean runner and fails if they fail
- [ ] ADR log; backfill the Coolify migration as ADR-001, since that change was invisible outside `git log`

**DEV-38 [MED] 10h — Rename `pandployer` → `nuhire` everywhere** — deps: DEV-12, API-7, DEV-31
Five names for one thing. Deliberately late: it touches the database name and deploy config.

**DEV-39 [MED] 16h — Handover package** — deps: DEV-5, DEV-34
The whole reason this backlog exists is that one person left with everything in their head.
**All 8 of these freshmen will also leave.**

- [ ] Recorded walkthroughs: setup, student journey, advisor journey, deploy + rollback
- [ ] Every subsystem has ≥2 people who have shipped to it; gaps closed by rotation before week 14
- [ ] Dry run: hand `ONBOARDING.md` to someone outside the team and watch them get it running unaided

---

# Critical path

## Week 0–1, you personally, before anyone arrives

`DEV-1` (secrets — external clock) · `DEV-2` (working setup) · `DEV-3` (env example) ·
`DEV-6` (CI) · `DEV-8` (git workflow) · `DEV-14` (groomed backlog)

Without DEV-2 and DEV-14, eight people show up and have nothing they can do.

## Everyone's first PR — 18 good-first-issues, all different files

`DEV-16` · `DEV-17` · `DEV-18` · `UI-2` · `UI-3` · `UI-4` · `UI-8` · `STU-1` · `STU-3` ·
`STU-4` · `STU-8` · `STU-20` · `STU-21` · `STU-22` · `STU-25` · `STU-32` · `SEC-4` · `SEC-16`

`UI-2` + `UI-3` + `UI-4` + `UI-16` are ~15 hours total and fix a genuinely large share of why
the app looks broken. Land those in week 1 and the team _sees_ the UI change immediately,
which matters for eight people who have never shipped before.

## Minimum viable pilot — ~200 hours

If the semester goes badly and you have to cut to the bone:

`API-1` · `API-2` · `API-3` · `API-4` · `API-5` · `API-6` · `API-7` · `API-9` · `API-13` ·
`DEV-7` · `DEV-12` · `SEC-2` · `SEC-6` · `TCH-1` · `STU-1` · `STU-5` · `STU-12`

That buys you: cannot silently freeze, cannot silently crash, the barrier survives a restart,
**the professor can unstick any group**, student votes actually save, and the schema stops
corrupting completion counts.

## Two things that cannot slip

- **`DEV-12` (staging).** Today a merge to `main` redeploys the live app with no gate and no
  rollback. One beginner's bad merge takes down a class of 30.
- **`API-13` (the in-memory barrier), by week 9.** It's the failure most likely to strand a
  whole group during the pilot, and it needs real testing time after the fix.

## Assign deliberately

`SEC-7`, `SEC-8`, `API-9`, `API-13`, `STU-30`, `API-32`, `DEV-26` each need a written spec
before a freshman starts — roughly seven specs of lead time, about a day each. Do **not** hand
Socket.IO auth to someone in their first month.
