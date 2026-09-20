# NUHire Backlog

Organized by section so you can hand out whole areas once you know who wants
what. Every item is cited to a file. Line numbers were accurate as of the
tooling commit; trust file and symbol names over line numbers.

**Team:** ~8 devs, 10 hrs/wk, ~14 weeks.
**Goal:** pilot-ready by end of fall, run in one CS1210 section (~30 students)
spring 2027.

New here? Read [docs/WHAT_IS_NUHIRE.md](docs/WHAT_IS_NUHIRE.md), then
[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md), then [CLAUDE.md](CLAUDE.md).

---

## Legend

`[GFI]` good first issue · `[MED]` medium · `[HARD]` hard
`[SPEC]` needs a written spec before handing to a beginner
`[LEAD]` lead does this; a dev can't bootstrap it

Sections: **ONB** onboarding · **INFRA** infra & tooling · **SEC** security ·
**API** backend & data · **TCH** teacher side · **STU** student flow · **UI** frontend

**Capacity.** 8 × 10 × 14 = 1,120 nominal hours, realistically ~650–700 shipped.
This backlog is larger than that on purpose so it's a priority queue, not a
to-do list.

---

# START HERE: the first 10 for Sunday

Paste these into Linear first. All independent, all different files, so eight
people can work at once without collisions.

| #   | Ticket                                                               | Est | Level |
| --- | -------------------------------------------------------------------- | --- | ----- |
| 1   | `ONB-1` Run the app locally and write down every place the docs lied | 3h  | GFI   |
| 2   | `UI-1` Fix Tailwind class names that silently don't exist            | 4h  | GFI   |
| 3   | `UI-2` Fix invalid z-index utilities                                 | 4h  | GFI   |
| 4   | `STU-1` Fix the `/employerPannel` 404                                | 2h  | GFI   |
| 5   | `STU-2` Remove `NEXT_PUBLIC_FRONT_URL` from navigation               | 1h  | GFI   |
| 6   | `STU-3` Fix the progress guard redirecting to a 404                  | 2h  | GFI   |
| 7   | `STU-4` Dashboard reads the wrong progress field                     | 1h  | GFI   |
| 8   | `STU-5` Stop `/about` wiping localStorage                            | 2h  | GFI   |
| 9   | `SEC-1` Fix the moderator login that fails open                      | 2h  | GFI   |
| 10  | `SEC-2` Fix the Notes IDOR                                           | 3h  | GFI   |

Three lead tickets should land **before** these get picked up: `INFRA-1`
(working setup), `INFRA-2` (CI), `INFRA-3` (seed data).

---

# ONB — Onboarding

Not NUHire-specific. These exist so eight people get productive and stay
unblocked.

**ONB-1 [GFI] 3h — Run the app locally and log every place the docs lied**
First ticket for every new dev. Proves the setup works and improves it in the
same pass.

- [ ] Follow `ONBOARDING.md` start to finish on your own machine
- [ ] Note every step that was wrong, ambiguous, or missing
- [ ] Open a PR fixing the doc, or an issue if the fix is code
- [ ] Log in as both a student and the advisor; screenshot both dashboards

**ONB-2 [GFI] 4h — Write a walkthrough of one student step**
Forces real reading and produces something the next cohort uses.

- [ ] Pick one step (`jobdes`, `res-review`, `interview-stage`, `makeOffer`)
- [ ] Document the flow: component → API call → controller → SQL → response
- [ ] Note every socket event it emits or listens for
- [ ] Add to `docs/walkthroughs/`

**ONB-3 [GFI] 3h — Do a "what would break with 30 students" review of one file**
Trains the instinct that matters most for this project.

- [ ] Claim a file from the known-bad list in `CLAUDE.md`
- [ ] Write up what fails with 30 users that doesn't with 2
- [ ] File any new issues found

**ONB-4 [LEAD] [MED] 6h — Team operating agreement**
Eight PRs a week into one reviewer ends in rubber stamps or stalled people.

- [ ] Weekly sync, async standup channel, office hours
- [ ] "30 minutes stuck, then ask" rule
- [ ] Review policy: lead reviews auth/config/infra, peer review on everything else
- [ ] One-business-day review commitment
- [ ] Definition of Done written down

**ONB-5 [LEAD] [MED] 6h — Issue templates and a groomed board**

- [ ] Bug / feature / chore templates; `good first issue`, `needs-spec`, `size:S/M/L` labels
- [ ] ≥15 issues labeled `good first issue` before week 2, each with AC and a file pointer
- [ ] WIP limit of 1 per person

**ONB-6 [LEAD] [MED] 8h — Git workflow: branch protection, PR template, CODEOWNERS**
History shows `fix it`, `fix problems`, and direct pushes to main.

- [ ] `main` protected: no direct push, 1 review, CI green
- [ ] `CONTRIBUTING.md`, PR template, CODEOWNERS routing auth/config/infra to lead
- [ ] Squash-merge only; soft 400-line PR guideline
- [ ] 30-minute session where everyone does a throwaway PR end to end

**ONB-7 [LEAD] [MED] 5h — Access tiers**
The instinct when someone's blocked is to hand them the prod password. That's
how `a`/`a` ended up in a PDF.

- [ ] Three tiers: local (day one), staging (after first merged PR), prod (lead only)
- [ ] No shared accounts; no dev has repo or Coolify admin
- [ ] **Offboarding checklist** — the step that didn't happen last time

**ONB-8 [MED] 8h — Pair rotation so every area has two owners**
Bus factor was 1 and that's why we're here.

- [ ] Map each area to who has shipped to it
- [ ] Rotate pairs so every area has ≥2 people by week 14

**ONB-9 [GFI] 4h — Record a demo of the full activity**
Tori has an old one. We need a current one for the next handover.

- [ ] Screen-record the professor flow and the student flow
- [ ] Narrate what's happening and why

**ONB-10 [MED] 10h — Make the docs self-verifying**
Docs drifted 8 months with nothing detecting it. Without a mechanism, everything
we just wrote is stale by the next handover.

- [ ] CI runs the `ONBOARDING.md` commands on a clean runner and fails if they fail
- [ ] Link checker on internal doc links
- [ ] Env-var drift check: every `process.env.X` appears in a `.env.example`
- [ ] ADR log at `docs/decisions/`; backfill the Coolify migration as ADR-001

---

# INFRA — Infra and tooling

**INFRA-1 [LEAD] [HARD] 14h — Working one-command local stack**
Highest-leverage ticket. If eight people each burn six hours on Docker, that's
48 hours gone before any code. `.local/compose.yaml` works; promote it.

- [ ] Promote `.local/compose.yaml` and realm export to tracked files; delete the broken root `compose.yaml`
- [ ] One entrypoint brings up MySQL + Keycloak, waits on health, installs, migrates, seeds, starts both apps
- [ ] Verified on macOS (both chips) and WSL2 by two people who didn't write it
- [ ] Clone → logged-in dashboard under 15 minutes, measured
- [ ] Delete or fix the root `Dockerfile` (it `COPY`s before `WORKDIR`, building from an empty dir)

**INFRA-2 [LEAD] [MED] 8h — CI on pull requests**
The only automation today is a 6-line webhook on push to main. Nothing checks a PR.

- [ ] Typecheck + build for api and frontend, plus `docker build`, on every PR
- [ ] `npm ci` not `npm install`, so lockfile drift fails loudly
- [ ] GitHub-hosted runners, so it doesn't depend on the Khoury self-hosted one
- [ ] Under 5 minutes; job names readable enough that a red X says what broke

**INFRA-3 [LEAD] [HARD] 16h — Seed a realistic 30-student class** — deps: INFRA-1
Current fixture is 1 advisor + 3 students. You cannot see an N+1, an index miss,
or a barrier deadlock at n=3. Blocks most API work.

- [ ] `npm run seed` builds a CRN with 1 advisor, 30 students, 8 groups, jobs assigned, in MySQL **and** the Keycloak realm
- [ ] `--scenario=` flag: `fresh`, `mid-resume-review`, `waiting-on-group`, `interview-stage`, `offers-pending`
- [ ] Include the messy cases: a student who never signs in, one with NULL group, one whose `Progress` points at an old group, a duplicate pending offer
- [ ] Fake emails only (`student01@example.test`), never real Northeastern addresses
- [ ] `npm run seed:reset` under 60s; runs in CI so it can't rot

**INFRA-4 [LEAD] [HARD] 14h — Staging, and gate prod behind it** — deps: INFRA-2
**Cannot slip.** A merge to `main` fires the Coolify webhook and redeploys the
live app. No build, no test, no approval, no rollback. One bad merge during class
takes down a room of 30.

- [ ] Second Coolify app deploys `dev` to a staging domain with its own DB and realm
- [ ] Prod deploy requires CI green plus a GitHub Environment with the lead as reviewer
- [ ] Tested rollback documented click-by-click in `docs/runbook.md`
- [ ] Default flow `feature → dev → staging`; `main` only on deliberate release

**INFRA-5 [MED] 10h — ESLint, and enforce it** — partially done
Prettier, `.editorconfig`, and `.nvmrc` already landed. ESLint has not.

- [ ] Flat ESLint config covering both packages; start permissive
- [ ] `no-console` as a warning now, error after `INFRA-12`
- [ ] Wired into CI

**INFRA-6 [MED] 6h — Pre-commit hooks** — deps: INFRA-5
CI catching a lint error four minutes after push teaches worse than a hook
catching it in two seconds.

- [ ] Husky + lint-staged on staged files only, under 5s
- [ ] Block committing `.env*`, `*.log`, `*.pem`, `*.key`
- [ ] `commitlint` with conventional commits

**INFRA-7 [MED] 10h — Test harness** — deps: INFRA-2
`api` test script is literally `exit 1`.

- [ ] Vitest in `api/`; 3 real passing tests (the room-name regex, the progress enum mapping)
- [ ] Required CI check; coverage on, no threshold yet
- [ ] `docs/testing.md` with a copyable example
- [ ] Frontend harness scaffolded with one component test

**INFRA-8 [HARD] 24h — API integration tests against a real DB** — deps: INFRA-3, INFRA-7
Every refactor below is unsafe without these. Split across 3 people by domain.

- [ ] Supertest plus a MySQL container per run
- [ ] Cover login/session, role routing, group lifecycle, progress, offers
- [ ] A fixture builder ("a class with 2 groups of 3, mid-interview")
- [ ] CI check, under 3 minutes

**INFRA-9 [HARD] 20h — Playwright smoke test of the full journey** — deps: INFRA-3, INFRA-8
The single highest-value guardrail. Catches the only failure that matters: a
student cannot finish the simulation.

- [ ] Advisor starts a group; student completes every step
- [ ] A second spec covers the group barrier with 3 parallel browser contexts
- [ ] Trace, video, and screenshot artifacts uploaded on failure

**INFRA-10 [HARD] [SPEC] 20h — Database migrations** — blocks API-3, API-4
Schema is a 424-line dump loaded once on a fresh volume. No way to evolve prod.
**And it already disagrees with the code:** `GroupsInfo.max_students` and
`Moderator.nom_groups` are queried but don't exist, so student group-join 500s
on a fresh DB.

- [ ] Migration runner plus a `schema_migrations` table; migration 001 is the current dump made idempotent
- [ ] **Dump prod schema and diff it against the repo**; every difference becomes a migration
- [ ] Decide explicitly: add the missing columns, or delete the code paths
- [ ] Migrations run on boot before listening; boot fails loudly on failure

**INFRA-11 [MED] 8h — Persist uploads outside the container image**
No volume is mounted for uploads, and deploy fires on every push to main. A
routine commit destroys every resume the professor uploaded, while the DB rows
survive pointing at missing files.

- [ ] Named volume for the uploads path in compose and Coolify
- [ ] Repo `uploads/` becomes seed-only, copied in if the volume is empty
- [ ] Startup warning for any DB row whose `file_path` is missing on disk

**INFRA-12 [GFI] 12h — Replace ~440 `console.log` with a leveled logger**
Emoji log spam on every request buries real errors during a live class. Split
into two PRs (api, frontend) so it isn't an 8-way conflict.

- [ ] `pino` on the api, a thin wrapper on the frontend
- [ ] Level from `LOG_LEVEL`; logs carry request id, user, group, class
- [ ] `no-console` upgraded to error afterwards

**INFRA-13 [MED] 8h — Prune dead dependencies**
The package files install `python`, `socket`, `popup`, `fs`, `crypto`,
`googleapis`, `react-router-dom`, and two Google OAuth strategies. None are used.
A dev reading dependencies will think this app uses Google OAuth and React
Router. It uses neither.

- [ ] `depcheck` all packages; remove unused after grepping each
- [ ] Resolve the `react-pdf` version conflict between root and frontend
- [ ] `npm ci` clean in both; CI proves it

**INFRA-14 [HARD] 20h — Load test 30 concurrent students** — deps: INFRA-4, API-4, INFRA-9
Every capacity number is a projection until measured. The critical unknown:
whether saturation shows up as **errors** (recoverable) or **hangs** (class over).

- [ ] 30 socket clients plus an advisor through the full journey
- [ ] A synchronized-advance burst where all 30 transition within 2 seconds
- [ ] A chaos case: restart the API mid-run, assert every student recovers
- [ ] Pass criteria: p95 under 500ms, zero hung requests, zero stuck students

**INFRA-15 [HARD] 14h — Error tracking and observability** — deps: INFRA-4
During the pilot the lead needs to know a student is stuck before a hand goes up.

- [ ] Sentry or equivalent on both, with source maps
- [ ] Errors tagged with class, group, step
- [ ] A live dashboard: students online, groups by step, error rate

**INFRA-16 [MED] 14h — Pilot-day runbook and a rehearsed incident** — deps: INFRA-4, INFRA-15

- [ ] Pre-class checklist, health check, restart, rollback, unstick a group, reset a student
- [ ] Backup verified by performing an actual restore, not by confirming backups exist
- [ ] A game day where the team breaks staging and recovers using only the runbook

**INFRA-17 [MED] 10h — Rename `pandployer` to `nuhire` everywhere** — deps: INFRA-4, INFRA-10, INFRA-9
Product is NUHire, the MySQL database is `pandployer`. Scheduled late because it
touches the database name and deploy config. The safe half is already done.

---

# SEC — Security

Context: `nuhire.khoury.northeastern.edu` resolves to a private `10.x` address,
so it's NEU-network-only, not internet-facing. That lowers urgency on most of
this. It does not lower it on `SEC-11`, because the roster is real student data.

**SEC-1 [GFI] 2h — Fix the moderator login that fails open**
`auth.controller.ts:224` compares `username === process.env.MODERATOR_USERNAME`.
If unset, `undefined === undefined` is `true`, so an **empty request body returns
200 and grants moderator**. `BUILD.md` never said to set those vars.

- [ ] Reject if either env var is missing or empty
- [ ] Reject non-string or empty credentials
- [ ] Startup warning when unset
- [ ] Test: `curl -X POST /auth/moderator-login -d '{}'` returns 401

**SEC-2 [GFI] 3h — Fix the Notes IDOR**
`note.controller.ts` reads `user_email` from the query string and returns that
user's notes. Any student reads any other student's private notes by changing a
query param.

- [ ] Both read and create use `req.user.email`, ignoring the client value
- [ ] Test: requesting another email returns only your own notes, or 403

**SEC-3 [MED] 8h — Require auth and authorization on `POST /users`**
The worst bug in the repo. `user.routes.ts:13` has no middleware and the
controller updates `affiliation` straight from the body. **One unauthenticated
request promotes any account to admin**, or demotes a real professor.

- [ ] Requires a session; caller may only modify their own record unless admin
- [ ] `affiliation: 'admin'` only accepted when the email has a `Moderator` row, checked server-side
- [ ] An existing record's affiliation is never changed by this endpoint
- [ ] Test: forged curl returns 401/403

**SEC-4 [MED] 12h — Protect the Moderator CRN routes** — deps: SEC-3
`moderator.routes.ts:11-13` lets anyone create, list, or delete teacher grants.
`DELETE` cascades through `GroupsInfo`, `job_descriptions`, `Resume_pdfs`,
`Candidates`. One unauthenticated call erases a class.

- [ ] Define super-admin (owner allowlist or an `is_owner` column) and document it
- [ ] All four `/moderator/crns*` routes require it; `DELETE` needs a confirmation field
- [ ] `/mod-dashboard` moves behind the Keycloak session

**SEC-5 [GFI] 6h — Delete the second login system** — deps: SEC-4
Two auth systems, one a shared plaintext password enforced only in a React
`useEffect`.

- [ ] Remove the Admin button, `/mod-signin`, `moderatorLogin`, `verifyModerator`, their routes
- [ ] Drop `MODERATOR_*` from all env config
- [ ] `/mod-dashboard` still works under the SEC-4 path

**SEC-6 [MED] 14h — Apply `requireAdmin` to every teacher endpoint**
`requireAdmin` and `requireStudent` exist and are applied to **zero routes**.
`group.controller.ts` contains no `req.user` reference at all. Any logged-in
student can start groups, assign jobs (wiping the class), reassign classmates, or
accept their own group's offer.

- [ ] A route→role table in the PR description
- [ ] `requireAdmin` on group/job/csv/facts/delete/moderator mutations and `PUT /offers/:id`
- [ ] Test file asserting a student session gets 403 on each

**SEC-7 [HARD] [SPEC] 14h — Authenticate Socket.IO**
`socket.ts` has no auth in 369 lines. Any client can open a socket and emit
anything. This is a CS class; someone will open devtools.

- [ ] Share the Express session via handshake middleware; reject unauthenticated at `io.use`
- [ ] `socket.data` carries verified email, group, class from the DB
- [ ] Existing flows still work

**SEC-8 [HARD] [SPEC] 18h — Authorize socket events by role and room** — deps: SEC-7
Today `makeOfferResponse` lets any client fake an advisor's accept, `moveGroup`
yanks any group to any page, `sendPopupToGroups` spams any class.

- [ ] Admin-only: `sendPopupToGroups`, `moveGroup`, `makeOfferResponse`, `allowGroupAssignment`, `groupAssignmentClosed`
- [ ] Student events derive group and class from `socket.data`, never the payload
- [ ] Test: a student socket emitting an admin event is rejected and logged

**SEC-9 [MED] 10h — Lock down file uploads** — deps: SEC-6
`upload.routes.ts:10` has no auth on all three endpoints, and the middleware uses
`file.originalname` verbatim with no sanitization, extension check, or size
limit. Uploads are served statically, so an uploaded HTML file is stored XSS.

- [ ] `requireAdmin` on all three; server-generated uuid filenames
- [ ] `limits.fileSize` plus MIME and magic-byte check restricted to PDF
- [ ] Test: a file named `../../../x.pdf` writes nothing outside `uploads/`

**SEC-10 [GFI] 5h — Fix path traversal in file serve and delete**
`resume.controller.ts` and `job.controller.ts` `path.join` a `req.params` value
and then `sendFile` or `unlinkSync` it.

- [ ] One `safeUploadPath()` helper rejecting separators and `..`
- [ ] Test: `..%2f..%2f` returns 400

**SEC-11 [MED] 7h — Scope `GET /users` and `GET /users/check/:email`** — deps: SEC-6
`SELECT * FROM Users` with no filter, so any logged-in student downloads every
real name, email, class, and group in every section. Highest-consequence item on
the FERPA axis, because the roster is real Canvas data.

- [ ] `GET /users` requires admin, returns only CRNs the caller owns, named columns
- [ ] `check/:email` requires a session, answers only for the caller

**SEC-12 [GFI] 4h — Session hardening**
`app.ts:88` sets `saveUninitialized: true`, and the session middleware runs
before static file serving, so **every PDF fetch writes a MySQL session row**.

- [ ] `saveUninitialized: false`; verify the Keycloak callback still lands its cookie
- [ ] Fail fast at boot if `SESSION_SECRET` is unset or under 32 chars
- [ ] Measure session row count before and after a simulated class

**SEC-13 [GFI] 4h — Protect `/stats` and bound the log arrays**
`/stats` serves a full route call map to anyone, unauthenticated. `app.ts:124`
pushes a timestamp per request and **never trims**, so a 3-hour class leaks
steadily and `/stats` slows down the longer the server runs.

- [ ] `/stats` requires admin; timestamps capped to a rolling hour
- [ ] Test: array doesn't exceed the cap after 10,000 simulated requests

**SEC-14 [LEAD] [HARD] 8h — Rotate committed secrets and purge history**
`keycloak/render.yaml` has the Keycloak admin password in plaintext;
`keycloak/realm-export.json` has the OIDC client secret. Both in git history.
**The only item with an external clock.**

- [ ] Rotate everything: client secret, admin password, shared Gmail, moderator creds, session secret, DB password
- [ ] Rewrite history with `git filter-repo`; all collaborators re-clone
- [ ] Enable secret scanning and push protection
- [ ] New values only in Coolify env plus a password manager the lead controls

**SEC-15 [MED] 12h — FERPA and data-handling policy** — deps: SEC-11
Real Canvas names and emails, and nobody has written down what's collected, who
sees it, how long it's kept, or who to call if it leaks.

- [ ] Document every table holding PII and every endpoint exposing it
- [ ] Retention policy plus an end-of-semester purge script, tested on a copy
- [ ] Incident contact and escalation path

**SEC-16 [MED] 7h — Rate limiting** · **SEC-17 [MED] 8h — Helmet and CSP**
CSP must not break the YouTube embeds or `react-pdf`.

**SEC-18 [HARD] [SPEC] 20h — Scope every data endpoint to the caller's group** — deps: SEC-6, STU-16
`POST /resume/vote` takes `student_id` from the **body**, so a student can vote
as a classmate. Note `updateUserClass` and `updateUserSeen` _do_ check ownership,
so the pattern exists and just wasn't applied.

---

# API — Backend and data

**API-1 [GFI] 3h — Pin the API to one replica and document why**
`onlineStudents` and the completion barrier are per-process, and Socket.IO rooms
have no adapter. With two replicas a group splits across them and **never**
reaches its completion count. Coolify makes scaling up a one-click accident.

- [ ] Coolify API service explicitly set to 1 replica
- [ ] Comment block at the top of `socket.ts` naming every piece of in-process state
- [ ] Startup warning if an instance-count env var exceeds 1

**API-2 [GFI] 6h — Stop the process exiting on unhandled errors**
`server.ts` calls `process.exit(1)` on _any_ unhandled rejection, and several
controllers create them. One kills the API mid-class, drops all sockets, and
erases every barrier. `compose.yaml` sets `restart: on-failure:5`, so the fifth
crash ends the class.

- [ ] `unhandledRejection` logs with a stack and does **not** exit
- [ ] `uncaughtException` logs, drains 5s, then exits, saying so
- [ ] Express error middleware after all routes
- [ ] `restart: unless-stopped` plus a `/health` healthcheck

**API-3 [HARD] [SPEC] 24h — Migration: fix the barrier-critical schema defects** — deps: INFRA-10, INFRA-3
Five defects that each independently corrupt a live class:

- `Resume` has no unique key, so `ON DUPLICATE KEY UPDATE` never fires and every vote change inserts a row. `getFinishedCount`'s `HAVING COUNT(*) >= 10` then counts vote _events_, so a student who flip-flops ten times on one resume reads as finished and **releases the group barrier early**
- `GroupsInfo`'s "unique" key is `(class_id, id)` where `id` is the PK, so it constrains nothing
- `Interview_Status`, `Offer_Status`, `Res2_Status` use `PRIMARY KEY (student_id)`, one row per student _globally_
- `Offers` has no unique key on `(class_id, group_id)`, so two members clicking submit create two pending rows
- `Progress` is keyed on `email` but queried by `(crn, group_id)`, and never updates those on conflict, so a reassigned student keeps a stale group forever
- [ ] Dedupe then `UNIQUE (student_id, class, resume_number)` on `Resume`; `getFinishedCount` uses `COUNT(DISTINCT resume_number)`
- [ ] Real `UNIQUE (class_id, group_id)` on `GroupsInfo` and `Offers`
- [ ] Composite PKs on the three `*_Status` tables
- [ ] Each change ships with a test proving the specific bug is fixed

**API-4 [HARD] [SPEC] 28h — Persist the group-completion barrier in MySQL** — deps: INFRA-10, API-3, SEC-7
**The top live-class risk.** `socket.ts:318` keeps completions in
`global.completedResReview`. Every path out is a permanent stuck:

- **API restart** → the state is gone; already-finished students never re-emit, so the count restarts at 0 and can never reach total
- **Socket reconnect** → the handler identifies the student by reverse-lookup in `onlineStudents`; after a reconnect the lookup fails, the server logs "Could not identify student" and **returns silently**
- **One-shot delivery** → release is emitted to a cached socket id, then the key is deleted. A student offline at that instant never gets it and never gets a retry
- **`reconnectionAttempts: 5`** means the client gives up permanently after ~5s of bad wifi, with no polling fallback
- [ ] `Step_Completion (student_id, class, group_id, step, completed_at)`, PK on the first three
- [ ] Handler upserts; identity from the authenticated socket, not the reverse lookup
- [ ] Completion evaluated by query, re-evaluated on completion, room join, roster change, and a `GET /groups/barrier-status/...` poll
- [ ] Test: restart the API with 3 of 4 done, 4th completes, group releases

**API-5 [MED] [SPEC] 14h — Teacher "force advance group" endpoint** — deps: API-3, API-4
**Highest-value ticket in the backlog.** `moveGroup` is emitted only by
_students_. When a group deadlocks the professor has no button; her only recourse
is editing the database mid-class.

- [ ] `POST /groups/force-advance {class_id, group_id, target_step}`, admin only
- [ ] Writes the step for every member, then emits `moveGroup` to that room only
- [ ] Clears barrier state; idempotent; works when zero members are connected
- [ ] Audit log line

**API-6 [MED] 10h — Teacher "live group status" endpoint** — deps: API-4, INFRA-3
When a group stalls the professor needs to know _which student_ is blocking, in
under ten seconds, from the podium. Today the only signal is `console.log`.

- [ ] `GET /groups/live-status/:classId` → per group: roster, per-student step, last seen, socket live, barrier state ("3/4, waiting on jess@…")
- [ ] One query per class, no N+1; under 200ms against the seeded fixture

**API-7 [MED] 8h — Bound the DB pool queue so saturation errors instead of hanging** — deps: API-2
`connectionLimit: 15, queueLimit: 0`. Unlimited queue with no acquire timeout
means a saturated pool produces requests that never resolve **and never error**.
Worst failure mode: logs look healthy while 30 laptops spin.

- [ ] `connectionLimit` 25 and env-configurable; finite `queueLimit` returning 503
- [ ] `connectTimeout` and a query timeout
- [ ] `/health/db` reporting free, used, queued

**API-8 [MED] 12h — Real transactions** — deps: API-7
`job.controller.ts:180` runs `START TRANSACTION` through the **pool**, so each
statement can land on a different autocommit connection. The deletes aren't
atomic, the `ROLLBACK` runs on an unrelated connection, and a connection can be
left mid-transaction holding row locks. Fifteen of those deadlocks the API with
zero errors logged.

- [ ] A `withTransaction(db, async conn => {...})` helper that always releases in `finally`
- [ ] All three call sites converted
- [ ] Test: force a mid-transaction error, assert zero rows deleted and pool count returns to baseline
- [ ] CI grep: no `START TRANSACTION` outside the helper

**API-9 [MED] 10h — Index the hot `(group_id, class)` lookups** — deps: INFRA-10, INFRA-3
Zero hot paths are indexed. `Interview_Status.group_id` is `varchar(45)` while
everywhere else it's `int`, forcing a conversion that defeats indexing anyway.

- [ ] Indexes on `Users(class, group_id)`, `Resume(group_id, class)`, `InterviewPage`, `Interview_Status`, `Offers`, `Progress(crn, group_id)`
- [ ] `Interview_Status.group_id` and `Offer_Status.group_id` to `int`
- [ ] `EXPLAIN` before and after in the PR, against the 30-student fixture

**API-10 [MED] 10h — Scope every broadcast to a room** — deps: SEC-8
Four handlers use `io.emit`. Two of them (`updateOnlineStudents`,
`studentPageChange`) have **zero listeners anywhere** — pure waste plus a PII
broadcast. At 30 students that's thousands of wasted frames for events nobody
consumes. `progress.controller.ts` emits to the room **and then again globally**.

- [ ] Delete the two unlistened events
- [ ] `makeOfferResponse` (`socket.ts:223`) emits to the group room and the advisor, not globally
- [ ] Grep test: no bare `io.emit(` remains
- [ ] Two-class smoke test: neither class sees the other's traffic

**API-11 [MED] 8h — Make boot-time seeding idempotent and opt-in** — deps: INFRA-10
`initializeDatabase()` runs on **every** boot: 26 sequential round trips before
the server accepts a request. It also seeds `Candidates` with literal
`resume_id: 1..10` while the moderator controller uses _looked-up_ IDs. The two
disagree the moment IDs aren't 1-10, silently attaching candidates to wrong resumes.

- [ ] Seeding moves to `npm run seed` plus a `SEED_ON_BOOT` flag, default off in prod
- [ ] Both paths share one implementation (the lookup-based one is correct)
- [ ] Server starts under 2s with seeding off

**API-12 [GFI] 6h — `getCheckedResumes` returns the opposite of what it means** — deps: API-3
`resume.controller.ts:218` does `WHERE checked = "True"` against a `tinyint(1)`.
MySQL coerces `"True"` to `0`, so it returns exactly the **unchecked** resumes.
The group's shortlist going into the interview stage is wrong.

- [ ] `checked = 1`; decide and document whether `checked` is per-student or per-group

**API-13 [MED] 12h — Make group-join capacity race-free** — deps: API-8, INFRA-10
Classic check-then-act. All 30 students click join within seconds, every one
reads `current_students = 0`, and 30 land in a 4-person group. Then every barrier
waits for 30 people.

**API-14 [MED] 12h — Idempotent popup vote aggregation** — deps: API-3, SEC-7
A pure accumulator with no per-student row, so a double-click or reconnect
double-counts with no way to detect or undo it. The professor's curveball results
are quietly wrong.

**API-15 [MED] 14h — Stop leaking raw MySQL errors** — deps: API-2
~25 handlers return `err.message` to the browser, exposing table and column
names. Many callbacks never check `err` before touching `results`, which throws
inside a callback and kills the process.

**API-16 [MED] 18h — Collapse the advisor dashboard N+1** — deps: API-9, API-10, INFRA-3
`ManageGroupsTab` makes ~40 requests per refresh, and refresh fires on every
globally broadcast `userAdded`. Thirty students signing in produces roughly
**1,200 advisor requests in two minutes** — almost certainly why the
">50 calls/min" warning exists.

**API-17 [GFI] 8h — Fix or delete endpoints querying non-existent tables** — partially done
The `resume_votes` and `Interview` endpoints are already removed. Remaining:
`resume-pdf.routes.ts` declares a param the controller doesn't read.

**API-18 [MED] 12h — Audit log for teacher actions** — deps: SEC-6
Nothing records who clicked what. After a bad class there's no way to reconstruct
whether the professor hit assign-job, a student hit an unprotected endpoint, or
the API restarted.

**API-19 [HARD] [SPEC] 18h — Allow more than one teacher per class** — deps: INFRA-10, API-3
`Moderator.crn` is UNIQUE, so exactly one email can own a CRN. A professor plus a
TA can't both run the console. The socket handler already loops over multiple
moderators; the schema forbids it.

**API-20 [HARD] 14h — Split `group.controller.ts` (737 lines)** — deps: INFRA-8
Also where to establish one controller shape so eight people stop inventing eight.

---

# TCH — Teacher side

**TCH-1 [GFI] 5h — Confirmation dialog on "Assign Job"** — do this week 1
The most dangerous button in the app has weaker friction than "remove one
student." It deletes every resume vote, interview rating, and note for the whole
class, with no confirmation. The modal never mentions deleting anything.

- [ ] Both toolbar and per-card buttons route through a confirm step
- [ ] Modal lists what will be erased in plain English, with the affected group count
- [ ] Distinct warning if any affected group has a pending or accepted offer
- [ ] Requires typing `ERASE` or the CRN; Cancel is default-focused

**TCH-2 [MED] 8h — Split "assign a job" from "reset a group's work"** — deps: TCH-1
Root cause of TCH-1. A professor who just wants to fix a job title has no way to
do it without nuking the class.

- [ ] Endpoints take `reset: boolean`, default `false`; with false, zero DELETEs
- [ ] Two visually separate buttons, only one destructive
- [ ] Test: assign a job mid-interview with `reset:false`, all votes survive

**TCH-3 [GFI] 4h — Clear or void `Offers` when a group is reset** — deps: TCH-2
`Offers` is the one table the reset doesn't clear, so a group that already
submitted gets wiped **and then permanently blocked** from making a new one.
Dead-ended, mid-class.

**TCH-4 [GFI] 3h — Turn the CSV email validation back on**
`StudentCSVTab.tsx:45` has the real regex commented out and replaced with
`/^.*$/`. Any non-empty cell becomes a student, and those rows then count toward
the group barrier and hang real students.

- [ ] Restore a format check, enforced **server-side** too
- [ ] Invalid rows listed with row number and value, excluded from submit

**TCH-5 [GFI] 5h — Use a real CSV parser**
`parseCSV` is `split(',')`. Canvas quotes names containing commas, which shifts
every following column. Windows line endings leave `\r` on the last field.

- [ ] `papaparse` or equivalent; fixtures for a real Canvas export, quoted names, CRLF, BOM
- [ ] Verified against a real Canvas gradebook export

**TCH-6 [GFI] 5h — Fix "all students land in group 1"**
`StudentCSVTab.tsx:107` hardcodes `group_id: 1`, contradicting the comment above
it. The professor hand-types 30 group numbers under time pressure, every term.

- [ ] "Students per group" input with auto-assign and optional shuffle
- [ ] Manual per-student override still works

**TCH-7 [GFI] 4h — Prefer an exact email-column match** — deps: TCH-5
Takes the first header _containing_ "email", so `Secondary Email` silently wins.

**TCH-8 [GFI] 2h — Confirm dialog on per-group "Start Group"**
Fires immediately and is irreversible, while "Start All" gets a confirm. Also fix:
a group created _after_ "Start All" can't be started from the toolbar.

**TCH-9 [MED] 6h — Let a professor un-start a group** — deps: SEC-6
**No code anywhere sets `started` back to 0.** A mis-click needs database access
to fix; during a pilot that means the class stops.

**TCH-10 [GFI] 3h — Link or delete `/pending-offers`** — needs a decision
470 working lines reachable from nowhere, while a partial copy of the same logic
lives inside `ManageGroupsTab`. Two implementations, one invisible, drifting.

**TCH-11 [MED] [SPEC] 12h — Candidate-stats endpoint** — deps: API-3, SEC-6
The teacher sees only a name and accept/reject. All the data exists but nothing
joins it.
⚠️ **Join on `Candidates.resume_id`, not `Candidates.id`** — `candidate_id` holds
a resume id everywhere in this app, so the obvious lookup returns the wrong person.

- [ ] `GET /candidates/stats/:classId/:groupId/:candidateId`, admin only
- [ ] Returns name, resume file, interview URL, per-student votes joined to names, shortlist flag, interview ratings, popup deltas, the offer row
- [ ] Scoped so a caller only reads classes they moderate

**TCH-12 [MED] 14h — Candidate-stats modal on the offer card** — deps: TCH-11, TCH-10
Gives the professor the evidence to make and discuss the decision, which is the
pedagogical point.

- [ ] Candidate name on a pending-offer card becomes clickable
- [ ] Three sections: résumé PDF, interview video, how the group voted
- [ ] Never blocks accept/reject if stats fail to load

**TCH-13 [MED] 12h — CSV import preview and diff** — deps: TCH-4, TCH-5
Submit is a blind write. Duplicate emails silently last-write-wins, students
already in a group are silently moved, students missing from the CSV are silently
left behind.

- [ ] Dry run showing: N new, N moved (named, from→to), N unchanged, N duplicates, N absent from the file
- [ ] Duplicates are a hard error; explicit confirm step

**TCH-14 [MED] 6h — Let CSV import add groups to an existing class** — deps: API-3, TCH-13
`createGroups` returns 400 if any group exists and the frontend **swallows it**,
so re-importing with more groups silently fails and those students vanish from
Manage Groups.

**TCH-15 [MED] 6h — Make the Zoom CSV actually importable**

- [ ] **First: verify against a real Zoom account.** Nobody has. Everything else depends on the answer
- [ ] Header row, human-readable room names, exclude `null`-group students
- [ ] Deduplicate the two copies into one helper

**TCH-16 [HARD] 14h — Recompute the barrier when membership changes** — deps: API-4
A CSV-imported student who never logs in inflates the group total and the group
waits forever. Removing someone mid-class doesn't recount.

- [ ] Barrier counts only students who have actually signed in
- [ ] Add, remove, reassign triggers a recount and notifies **both** old and new rooms

**TCH-17 [MED] 8h — Tell the professor when a popup wasn't delivered** — deps: API-4
Popups only reach students in the in-memory map. Anyone who reconnected silently
gets nothing, and the professor sees success either way.

- [ ] Ack with `{delivered, missed}`; UI shows "Sent to 3 of 4 — Jane did not receive it"

**TCH-18 [HARD] 20h — Break up `ManageGroupsTab.tsx` (2,051 lines)** — deps: UI-10, INFRA-8
~40 `useState` in one component, six modals. The top merge-conflict file. Two
people on advisor features means daily conflicts.

- [ ] Split into `GroupCard`, `GroupList`, the six modals, `useGroupData`
- [ ] No file over 300 lines; restyled to the design system
- [ ] **A series of small PRs with a declared file freeze**

**TCH-19 [HARD] 24h — One "Class Control" screen for live teaching** — deps: TCH-12, TCH-16, TCH-18
Running a class means bouncing between four places with no at-a-glance view of
who's stuck.

- [ ] One row per group: members, who's online, current step, job, started, offer state
- [ ] Stuck groups visually flagged
- [ ] Per-group inline actions: start, popup, force-advance, accept/reject

---

# STU — Student flow

**STU-1 [GFI] 2h — Fix the `/employerPannel` 404**
`dashboard/page.tsx:69` links to `/employerPannel` (double n); the folder is
`employerPanel`. The page then writes progress `"employerPannel"`
(`employerPanel/page.tsx:14`), not a valid `Progress.step`, so the guard bounces
to the 404 again. **A group cannot finish the simulation.**

**STU-2 [GFI] 1h — Remove `NEXT_PUBLIC_FRONT_URL` from navigation**
`about/page.tsx:42` and `instructions/page.tsx` are the only two uses in the repo,
and the var is documented nowhere. Unset, they navigate to
`undefined/instructions` and 404. This broke on day one.

- [ ] Both use `router.push("/instructions")` / `("/dashboard")`; no env var needed

**STU-3 [GFI] 2h — Fix the progress guard redirecting to a 404**
`useProgress.tsx:19` does `window.location.replace('/' + progress)` where progress
is `res_1`, not a route. The guard that protects students is itself a 404 generator.

- [ ] A `stepToRoute` map; unknown progress goes to `/dashboard`
- [ ] Don't redirect until auth and progress have loaded

**STU-4 [GFI] 1h — Dashboard reads the wrong progress field**
`dashboard/page.tsx:136` reads `progressData.progress`; the API returns `step`. So
it always resolves to `"none"` and writes that to localStorage, on every
`jobUpdated` event. The professor reassigns a job and every student in that group
silently has progress wiped.

**STU-5 [GFI] 2h — Stop `/about` wiping localStorage** — deps: STU-3
`about/page.tsx:27` calls `localStorage.clear()`, nuking progress, review counters,
and ratings in one line, for anyone whose `seen` flag isn't 1.

**STU-6 [MED] 8h — Persist resume votes as they're cast**
**The single worst student bug.** Votes accumulate in React state and only POST
when the array hits exactly 10 (`res-review/page.tsx:561`). The per-resume
_counters_ persist to localStorage; the _votes array_ doesn't. Refresh at resume
7, resume at 7, finish all 10 on screen, POST never fires, never counted finished,
**group barrier never opens for anyone**.

- [ ] Each decision POSTs immediately, or the array persists alongside the counters
- [ ] Failed POST surfaces a visible retry
- [ ] Test: refresh at 3, 7, and 9; finish; confirm 10 rows and a correct count

**STU-7 [MED] 8h — Persist group-confirmation state**
`teamConfirmations` in `res-review-group` is pure client state. Any refresh resets
it to `[]`, and teammates who already confirmed **can't re-confirm** because the
button is disabled. Permanent deadlock unless the whole group reloads in unison.

- [ ] Stored server-side per (group, class, student), fetched on mount
- [ ] Add unconfirm — the socket handler exists and nothing triggers it

**STU-8 [MED] 4h — Stop `/jobdes` resetting progress backwards**
It calls `updateProgress("job_description")` unconditionally on mount, and the API
overwrites unconditionally. A student at the interview stage who re-reads the job
description is reset to step 1, every later step re-locks, and they're ejected
mid-activity while their group waits at a barrier.

- [ ] Progress is monotonic; the API ignores a step earlier than the stored one

**STU-9 [MED] 6h — Persist the make-offer selection**
The `checkint` socket handler broadcasts the checkbox but **writes nothing**, while
`makeOffer` reads `InterviewPage.checked`, which nothing ever sets. Also uses
`socket.to()`, excluding the sender.

**STU-10 [GFI] 3h — Handle group members disagreeing** — deps: STU-9
`makeOffer` renders its controls only when `selectedCount === 1`. Two students
checking different candidates makes **every button vanish** with no message.

**STU-11 [MED] 6h — Fix the res-review timer expiring into a hard lock**
On timeout it calls a handler that bails while `resumeLoading` is true and never
restarts, so the student sits at `0 sec` forever. All three buttons are disabled
while loading, so a failed PDF locks the student out entirely.

- [ ] Timeout always advances; PDF failure shows a message with working Skip and Retry
- [ ] Test: block the PDF URL in devtools, confirm the student can finish

**STU-12 [MED] 5h — Give the interview stage crash-resistance**
Persists `videoIndex` but not the votes array, and only POSTs on the last
interview. Refresh at candidate 3 of 4 and exactly one rating reaches the DB, but
the student is **still marked finished**, so nothing looks wrong. `makeOffer` then
shows the group wrong averages to decide on.

**STU-13 [MED] 5h — Handle a YouTube video that doesn't load**
Submit is disabled on `!videoLoaded`, set only by the iframe's `onLoad`. Region
block, dead channel, or campus wifi means "Loading Interview Video…" forever,
**cannot submit, cannot advance, blocks the group's barrier**.

- [ ] Timeout ~15s and enable Submit with a visible notice
- [ ] Audit the seeded video URLs and record who owns that YouTube channel

**STU-14 [MED] 6h — Make transitions idempotent against double-clicks**
`sendVoteToBackend` reads `votes` from a stale closure, so two fast clicks lose one
vote and push the length off 10 **forever**. `handleMakeOffer` has no in-flight
guard and `Offers` has no unique key, so a double-click creates two pending offers.

**STU-15 [GFI] 2h — Emit before navigating**
`res-review` and `interview-stage` set `window.location.href` and _then_ emit
`moveGroup`. Navigation can tear down the socket first, so one student advances and
their teammates stay behind.

**STU-16 [HARD] [SPEC] 18h — Collapse the three progress vocabularies** — deps: INFRA-10, API-3
`Users.current_page`, `Progress.step`, and route paths are three names for the same
six things with no mapping. Root cause of STU-1, STU-3, STU-4, STU-8. Also
`job.controller.ts` does a bare `UPDATE Progress` that silently affects **zero
rows** when no row exists yet, the common case for a fresh class.

- [ ] One canonical enum shared by api and frontend, with `toRoute()` and `toLabel()`
- [ ] Upserts everywhere, never bare UPDATE
- [ ] `POST /progress` validates and 400s instead of a MySQL truncation 500
- [ ] Migration backfills; one doc page mapping all three including historical values

**STU-17 [GFI] 2h — Fix the duplicate socket connection in the notes widget**
`components/note.tsx:7` calls `io()` at **module scope**, outside the provider. The
navbar renders on every page, so every student holds two sockets all class, 60+ at
30 students. `adminFacts` also calls `socket.disconnect()` in a cleanup, killing the
shared socket for every other page.

**STU-18 [MED] 10h — Wire up the "candidate didn't show up" curveball**
The professor's headline feature. `noShow` is never set true by anything; the
handler re-emits votes and never touches the sliders. It renders a generic
dismissible popup and **changes nothing**.

- [ ] Confirm intended behavior with the instructor
- [ ] Replace the `-10000` magic numbers with an explicit flag

**STU-19 [MED] 4h — Fix the scrambled rating field mapping** — blocks STU-18
Three code paths map the same four ratings to `question1..4` **three different
ways**, and `makeOffer` sums two of those mappings together. Students are shown,
and hire on, mislabeled numbers.

**STU-20 [MED] 8h — Popups survive refresh and reach late joiners**
Sent only to cached socket ids, persisted nowhere, dismissed forever on first click.
Also doesn't scope by class unless `classId` is truthy, so a falsy value sends to
that group number in **every** CRN.

**STU-21 [MED] 10h — Route a late joiner to where their group actually is** — deps: STU-8
A student arriving 15 minutes late has progress `none` while their group is at the
interview stage, so they must do 10 timed resume reviews alone while three
teammates sit at a barrier. In a 50-minute class that group does not finish.

**STU-22 [GFI] 3h — `checkExistingOffer` reads an array as an object**
The API returns an array; the client does `if (offer && offer.id)`, never true. A
student who refreshes after submitting sees a page acting like they never made an
offer, and the advisor's decision never re-syncs.

**STU-23 [GFI] 2h — Fix or remove the dead Back buttons**
Three are hardcoded `disabled={true}`; one is labeled "Back: Interview Stage" and
points at `/jobdes`. A fourth works and triggers STU-8. Four different answers to
"can I go back."

**STU-24 [GFI] 4h — Make notes usable without leaving the step**
The job-description instructions tell students to take notes, but the Notes menu
item _navigates away_, which on `/res-review` destroys the timer and the in-memory
votes array. No edit, no delete.

**STU-25 [MED] 6h — Stop hardcoding 10 resumes and 4 candidates**
Hardcoded in at least six places. If the professor uploads 9 or 12 resumes, the
completion check never fires and **every student in that class is permanently
stuck**, with no warning.

**STU-26 [MED] 6h — Handle a group that wants to hire nobody** — deps: STU-10, needs a decision
"None of these is a good fit" is a legitimate hiring outcome with no way to express
it. Also `allRejected` promises a restart from the job description stage, and **no
restart mechanism exists**.

**STU-27 [MED] 14–24h — Build or cut the Employer Panel** — deps: STU-1, STU-16, needs a decision
25 lines: a heading, one sentence, a button. It's the pedagogical payoff and it's
empty.

**STU-28 [MED] 14h — Results and export view for grading** — deps: STU-27, STU-19
No screen anywhere shows what a group decided. The professor runs the activity with
30 students and afterwards has no artifact to grade or discuss.

---

# UI — Frontend

Measured baseline: ~11,700 lines, 25 routes, **2 `aria-*` attributes**,
**0 `htmlFor`** across 22 `<label>`s, **9 responsive breakpoints**, 0 tests.

**UI-1 [GFI] 4h — Fix Tailwind class names that silently don't exist**
**Highest visible-improvement-per-hour ticket in the backlog.** `bg-springWater`
is used on **12 surfaces** and isn't defined, so every one renders transparent,
including an entire modal. Plus `text-northeasterWhite` (missing `n`),
`bg-norteasternWhite`, `text-XL`, `text-Black`.

**UI-2 [GFI] 4h — Fix invalid z-index utilities**
`z-1`, `z-5`, `z-100` aren't valid Tailwind v3 utilities and **generate no CSS**.
Every "semi-transparent overlay for readability" div over the slideshow is actually
`z-index: auto`. That's why the landing page and waiting room look wrong.

**UI-3 [GFI] 2h — Fix visible text typos**
`components/note.tsx` ends a `<textarea />` with a stray literal `t`, rendering a
floating "t" in the Notes dropdown on **every page with the student navbar**.

**UI-4 [GFI] 4h — Remove dead state and no-op render branches**
`waitingGroup`'s entire "Authorization Received" UI is unreachable; `makeOffer` has
a ternary whose branches are identical; `sendpopups` maps into styled divs with **no
children**.

**UI-5 [GFI] 4h — Stop leaking debug output to students**
`interview-stage` renders `File path: {currentVid?.file_path}` **into the student
UI**. `signupform` logs `document.cookie`.

**UI-6 [GFI] 5h — Unify step-name vocabulary in the UI**
"Interview Stage" vs "Interview Page" vs "Interview Review" for the same step,
hardcoded in three places. `instructions` lists 5 steps; `dashboard` shows 6 cards.

**UI-7 [GFI] 4h — Fix the progress bar, which always lies** — deps: UI-6
Each page passes a hardcoded `progress={n}` over a 5-item array, so a student on the
**final** step sees 80% and one on the first sees 0%.

**UI-8 [GFI] 4h — Delete orphaned pages** — needs a decision
`sendpopups/` and `pending-offers/` are ~1,000 lines of _working_ advisor tooling
reachable from nowhere, duplicated inside ManageGroupsTab.

**UI-9 [MED] 6h — Rewrite the Tailwind theme tokens**
`tailwind.config.js` defines **`background: "#fff"` and `foreground: "#fff"`**.
`sand: "#fff"` is not sand. `navy: "#000"` is not navy. Every page writes
`bg-sand/80` believing it's tinting warm when it's applying flat white.
**The true unlock for the whole overhaul.**

**UI-10 [HARD] EPIC — Design system foundation** (children UI-11 … UI-17)
There is **no shared component layer at all**. Until primitives exist, every visual
fix must be applied 15 times and eight people will each invent a different button.
Two incompatible visual languages coexist: student pages use `bg-sand` +
`font-rubik`; the advisor's main screen uses `bg-gray-50` + `font-sans`. **It
doesn't look like the same product.**

**UI-11 [MED] 8h — `<Button>`** — deps: UI-9. ~40 distinct inline class strings,
several broken: a red button whose hover is `hover:bg-blue-400`; a navbar button
that's white-on-white on hover.

**UI-12 [GFI] 5h — `<Spinner>` / `<PageLoader>`** — the same block is copy-pasted
**16 times**; one copy has already drifted to a different color.

**UI-13 [HARD] 10h — Accessible `<Modal>`, consolidating 5 overlay patterns** —
none has `role="dialog"`, focus trap, Escape, or focus restoration. Two can stack.

**UI-14 [MED] 8h — `<FormField>` with real labels** — deps: UI-1. **`htmlFor`
appears zero times** across 22 labels. The signup form is black text fields on a
black card, with one input that has no label _and_ no placeholder.

**UI-15 [GFI] 5h — `<Card>` / `<Panel>`** — deps: UI-9. Border widths range 1px to
4px with no rule.

**UI-16 [HARD] 12h — `<AppShell>`** — deps: UI-9. Six footer implementations; two
pages render **two `<footer>` landmarks**; three navbars.

**UI-17 [GFI] 6h — Component gallery route** — deps: UI-11, UI-12, UI-13, UI-15.
Cheapest visual-regression check for a team with no test infra, and how you stop
person #7 writing another bespoke button in week 11.

**UI-18 [MED] 10h — Accessibility audit**
A required course at a public university. 2 `aria-*`, 0 `role=`, 0 `htmlFor`,
exactly **one** `onKeyDown` in the whole app.

- [ ] axe and Lighthouse on all routes; keyboard-only and screen-reader passes
- [ ] Contrast check of every pair; publish the baseline so improvement is measurable

**UI-19 [MED] 6h — Make dashboard step cards keyboard-operable** — deps: UI-18
The **primary navigation of the entire student experience** is a `<div>` with
`onClick`, no `tabIndex`, no role, no key handler. Locked cards set
`pointerEvents: none`, which also suppresses the tooltip explaining _why_.

**UI-20 [GFI] 4h — Restore focus indicators** — deps: UI-18. `focus:outline-none`
with no replacement on the **first interactive element on the page**.

**UI-21 [MED] 5h — Fix contrast failures** — deps: UI-18, UI-1. Disabled buttons at
~1.9:1; white-on-white on hover; `text-white` on a white card.

**UI-22 [MED] 6h — Semantic HTML** — deps: UI-18. `res-review-group` has **no
`<h1>`** and starts at `<h3>`. The profile avatar link has **no accessible name**.

**UI-23 [MED] 6h — Responsive audit** — needs a decision
9 breakpoints in 11,700 lines is the entire responsive design. Four of five student
step pages are `h-screen overflow-hidden`, so content that doesn't fit is
**unreachable, not scrollable**.

**UI-24 [HARD] 14h — Make the five student step pages usable at 1280×800** — deps: UI-23
Where students spend the entire class. If the pilot's 30 students can't read the
resumes, the pilot fails regardless of anything else here.

**UI-25 [HARD] 10h — Consolidate three PDF rendering approaches** — deps: UI-10
`react-pdf`, a raw iframe, and a download link. Resumes are the core content and
students get a different experience in three of the steps.

**UI-26 [MED] 8h — Standardize loading, error, and empty states** — deps: UI-10
`interview-stage` alone has five bespoke state screens. `jobdes` has none, so a
student whose PDF fails just sees nothing.

**UI-27 [MED] 8h — Real form validation feedback** — deps: UI-14
`signupform` renders success and failure as identical unstyled text in the same
position, with no `role="alert"`.

**UI-28 [HARD] 16h — Decompose the three oversized student pages** — deps: UI-10
`interview-stage` (1,302), `makeOffer` (1,164), `res-review` (~900). The
"Waiting for Teammates" overlay is copy-pasted verbatim between two of them.

**UI-29 [MED] 7h — Student-facing copy and tone pass** — deps: UI-6
Copy was written by co-ops who are gone and reads that way. The timer shows a raw
`{n} sec` with no mm:ss and no warning state.

**UI-30 [HARD] 8h — axe-core in CI as a regression gate** — deps: INFRA-2, UI-18
Without a gate, eight people writing new UI erode the baseline by week 14 and the
next lead inherits this exact problem.

---

# Sequencing

## Weeks 0–1, lead only, before devs start

`INFRA-1` setup · `INFRA-2` CI · `INFRA-3` seed data · `ONB-5` groomed board ·
`ONB-6` git workflow · `SEC-14` secrets (external clock)

Without INFRA-1 and ONB-5, eight people show up with nothing they can do.

## Weeks 1–4

The ten starter tickets above, plus `ONB-1` for every new person. Then `TCH-1`,
`API-1`, `API-2`, `SEC-3`, `SEC-6`, `UI-9`, `UI-12`.

`UI-1` + `UI-2` + `UI-3` + `UI-12` are ~15 hours total and fix a large share of why
the app looks broken. Land them week 1 so the team _sees_ the UI change.

## Weeks 5–9

`INFRA-4` staging · `INFRA-7`/`INFRA-8` tests · `API-3` schema · `API-4` barrier ·
`API-5` force-advance · `STU-6`/`STU-7` persistence · `STU-16` progress ·
`UI-10` design system · `TCH-11`/`TCH-12` candidate stats

## Weeks 10–14

`INFRA-9` smoke test · `INFRA-14` load test · `INFRA-16` runbook · `TCH-18`/`TCH-19` ·
`UI-24` responsive · `SEC-18` scoping · `ONB-10` self-verifying docs

## Minimum viable pilot, ~200 hours

If you have to cut to the bone:

`API-1` · `API-2` · `API-3` · `API-4` · `API-5` · `API-6` · `API-7` · `API-8` ·
`INFRA-3` · `INFRA-4` · `INFRA-10` · `SEC-3` · `SEC-6` · `TCH-1` · `STU-1` ·
`STU-6` · `STU-7`

Buys you: cannot silently freeze, cannot silently crash, the barrier survives a
restart, **the professor can unstick any group**, student votes actually save, and
the schema stops corrupting completion counts.

## Two things that cannot slip

- **`INFRA-4` staging.** A merge to `main` redeploys the live app with no gate and no rollback.
- **`API-4` the in-memory barrier, by week 9.** The failure most likely to strand a group during the pilot, and it needs real testing time after the fix.

## Needs a written spec before a beginner starts

`SEC-7` · `SEC-8` · `SEC-18` · `API-3` · `API-4` · `API-19` · `STU-16` · `INFRA-10` · `TCH-11`

About nine specs of lead time, roughly a day each. Do **not** hand Socket.IO auth
to someone in their first month.

## Open decisions blocking tickets

1. Employer Panel: finish or cut? (`STU-27`)
2. Supported screen size floor? (`UI-23`)
3. `sendpopups` and `pending-offers`: wire up or delete? (`UI-8`, `TCH-10`)
4. Is the 30-second timer a rule or a nudge? (`STU-11`)
5. Is "hire nobody" a valid outcome? (`STU-26`)

1, 4, and 5 need the CS1210 instructor.
