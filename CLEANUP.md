# CLEANUP.md

Small work you can finish in a sitting. Bugs too small to plan a sprint around,
and tidying that makes the next bug easier to find. Nothing here blocks anyone,
so take one whenever you have a spare hour.

Anything needing a spec, a design decision, or more than about a day lives in
[TICKETS.md](TICKETS.md) instead.

---

## How to read an entry

Every entry has the same three parts, because a person and a coding agent need
different things:

| Part             | Who it's for | What it gives you                                         |
| ---------------- | ------------ | --------------------------------------------------------- |
| **What & why**   | human        | What breaks, and why it matters in a room of 30 students  |
| **Evidence**     | both         | The exact file, line, and the command that proves it      |
| **For an agent** | LLM          | Files it may touch, traps in this codebase, how to verify |
| **Done when**    | both         | The checks that close it                                  |

If you hand one of these to Claude or Cursor, paste the whole entry. The
**For an agent** block is there because these bugs have all been "fixed" before
by someone who changed the obvious line and broke something else.

**Before any of them:** read [AGENTS.md](AGENTS.md). The rules exist because the
obvious approach is wrong here more often than not.

---

## Index

**Bugs** — real defects, each verified against the current tree

| ID     | What                                                    | Level | Est |
| ------ | ------------------------------------------------------- | ----- | --- |
| `CU-1` | Shortlist leaks between course sections                 | MED   | 3h  |
| `CU-2` | A Keycloak account with no name crashes login           | GFI   | 2h  |
| `CU-3` | Shortlist drift comes back after the next vote          | MED   | 4h  |
| `CU-4` | CSV import picks the wrong email column                 | GFI   | 2h  |
| `CU-5` | Moving a student leaves their old group waiting forever | MED   | 4h  |
| `CU-6` | Two types claim boolean where MySQL sends 0 or 1        | GFI   | 2h  |
| `CU-7` | The teacher's unstick button has no button              | MED   | 5h  |

**Tidying** — no behaviour change

| ID      | What                                           | Level | Est |
| ------- | ---------------------------------------------- | ----- | --- |
| `CU-8`  | Delete tracing logs so real errors are visible | GFI   | 3h  |
| `CU-9`  | Finish the shared types migration              | GFI   | 4h  |
| `CU-10` | Remove 12 endpoints nothing calls              | GFI   | 3h  |
| `CU-11` | Delete the dead `Res2_Status` table            | GFI   | 2h  |
| `CU-12` | Extract one piece from an oversized file       | MED   | 5h  |

---

# Bugs

## CU-1 — Shortlist leaks between course sections

**MED · 3h · `api/src/controller/resume.controller.ts`**

### What & why

`getCheckedResumes` finds the four resumes a group shortlisted, which is what
the interview stage shows them. It filters on `group_id` alone. Group 2 exists
in every CRN, so with two sections running the same activity, group 2 in CRN
101 gets group 2 in CRN 202's shortlist mixed into theirs.

It also returns one duplicate row per group member, because `checked` is stored
on each student's `Resume` row, so a group of four produces four identical rows
per shortlisted resume.

This is the exact failure `AGENTS.md` opens with: a group-scoped query that
forgot `class`.

### Evidence

```
api/src/controller/resume.controller.ts:169
  'SELECT vote, resume_number FROM Resume WHERE group_id = ? AND checked = 1'
```

No `class` in the WHERE, and `class` is not in `req.params` either, so the
route signature needs it too.

### For an agent

- **Touch only** `resume.controller.ts` and `routes/resume.routes.ts`.
- `checked` is **group-level**, settled in migration `003`. Read it as
  `MAX(checked)` grouped by `resume_number`, never off one row. That is what
  removes the duplicates.
- The caller is `frontend/src/app/interview-stage/page.tsx`. Adding `class` to
  the route changes its URL, so update the caller in the same PR or the
  interview stage 404s.
- Scope by `group_id` **and** `class`. Both. Always.

### Done when

- [ ] Query filters on `group_id` and `class`
- [ ] Exactly one row per shortlisted resume, not one per group member
- [ ] The frontend caller passes `class`
- [ ] Two groups with the same `group_id` in different CRNs see different lists

---

## CU-2 — A Keycloak account with no name crashes login

**GFI · 2h · `api/src/config/passport.ts`, `api/src/controller/auth.controller.ts`**

### What & why

Both files do `profile.name.split(' ')` on the Keycloak profile. `name` is not a
guaranteed OIDC claim. If Khoury IT's SSO returns a profile without it, or a
student's account has no display name set, this throws inside the auth callback
and the student sees a generic login failure with nothing in the UI explaining
it. You will be debugging this at the podium.

It also assumes exactly two words. "Maria del Carmen Rodriguez" loses two of
them; a single-word name makes `lastName` undefined, which then writes `NULL`
into `Users.l_name`.

### Evidence

```
api/src/config/passport.ts:56          const parts = profile.name.split(' ');
api/src/controller/auth.controller.ts:109   const parts = prof.name.split(' ');
```

### For an agent

- Two call sites, same bug, fix both in one PR.
- Prefer the `given_name` / `family_name` claims when present; they exist for
  exactly this reason. Fall back to splitting `name`, fall back to the email
  local part, and never throw.
- The `KeycloakProfile` interface in `passport.ts` already types most fields as
  optional. Do not add `any` to get around the null check.
- This is the login path. It cannot be tested from a curl; use the local stack
  and sign in as `student1@northeastern.edu` (password `nuhire`).

### Done when

- [ ] A profile with no `name` logs in successfully
- [ ] A one-word name does not write `NULL` to `l_name`
- [ ] A three-word name keeps everything after the first word as the surname
- [ ] Both call sites share one helper

---

## CU-3 — Shortlist drift comes back after the next vote

**MED · 4h · `api/src/controller/resume.controller.ts`, `frontend/src/app/res-review-group/page.tsx`**

### What & why

Migration `003` realigned `Resume.checked` rows that had drifted, but only once.
The mechanism that caused the drift is untouched, so it starts again immediately.

What happens: a group shortlists resume 3, which sets `checked = 1` on the rows
that exist right then. A teammate who votes on resume 3 _after_ that gets a new
row at the column default of `0`. The group page then builds its checkbox map
with last-row-wins, so that late voter silently un-ticks a resume for the whole
team, mid-activity, with no visible cause.

### Evidence

`checked` is written per-group by the `check` handler in `api/src/config/socket.ts`,
but the vote INSERT in `resume.controller.ts` does not carry the group's current
value forward. Confirm the last-row-wins read:

```bash
grep -n "checked" frontend/src/app/res-review-group/page.tsx
```

### For an agent

- Two halves, and you need both or it recurs: the **writer** must carry the
  group's current `checked` forward on insert, and the **reader** must use
  `MAX(checked)` grouped by `resume_number` rather than whichever row came last.
- `checked` is group-level. This is settled, documented at the column in
  `database-files/Pandployer.sql`. Do not re-litigate it into a per-student flag.
- Do not write a migration. `003` already fixed the existing rows; this is about
  stopping new drift.
- Related: `CU-1` reads the same column. If you do both, do `CU-1` first.

### Done when

- [ ] A vote cast after a shortlist does not clear the tick
- [ ] Readers use `MAX(checked)`, not last-row-wins
- [ ] Two browsers in one group: shortlist a resume, have the second student
      vote on it, confirm the tick survives for both

---

## CU-4 — CSV import picks the wrong email column

**GFI · 2h · `frontend/src/app/components/StudentCSVTab.tsx`**

### What & why

The importer takes the first header _containing_ the word "email". A real Canvas
export has a `Secondary Email` column, and depending on column order it can win.
Every student then gets imported under a personal address that will never match
the one Keycloak authenticates them with, so the whole class lands on the signup
form and nobody can start.

The professor does this once per term under time pressure and gets no warning
that anything went wrong.

### Evidence

```
frontend/src/app/components/StudentCSVTab.tsx:184
  const emailIndex = headers.findIndex((h) => h.includes('email'));
```

### For an agent

- Prefer an exact match on `email` (case-insensitive, trimmed) before falling
  back to a substring match.
- If more than one column could match, do not guess. Show the professor which
  columns were found and make them pick. A wrong silent guess is the bug.
- The parser above this line is a correct RFC-4180 implementation added
  recently. Do not replace it, and do not add a CSV dependency.
- Test against a real Canvas gradebook export if anyone on the team has one.

### Done when

- [ ] An exact `Email` header wins over `Secondary Email`
- [ ] Ambiguous headers prompt instead of guessing
- [ ] A header with no email column shows a clear error, not an empty import

---

## CU-5 — Moving a student leaves their old group waiting forever

**MED · 4h · `api/src/controller/group.controller.ts`**

### What & why

The group barrier counts how many current members have finished a step. When an
advisor moves a student between groups mid-class, only the **new** group is
recounted. The old group is still waiting on somebody who is no longer in it,
and nothing will ever recount them. They sit at "waiting for your team" until
the professor notices.

`deleteStudent` does not recount at all.

### Evidence

`reassignStudent` calls `this.recountBarrier(class_id, new_group_id)` and never
learns which group the student came from. `deleteStudent` has no `recountBarrier`
call. Both in `api/src/controller/group.controller.ts`.

### For an agent

- **Read the student's current `group_id` before the UPDATE.** That is the whole
  fix for `reassignStudent`: you cannot recount a group you did not record.
- `recountBarrier` is fire-and-forget by design. A failure to recount must not
  turn a successful move into a 500. Keep that.
- `deleteStudent` relies on `ON DELETE CASCADE` to remove the rows, which works,
  but the remaining members are never told. Recount after the delete.
- Scope every query by `group_id` **and** `class`.
- This is `TCH-16`'s cheap half. The expensive half (only counting students who
  have actually signed in) stays in `TICKETS.md`.

### Done when

- [ ] `reassignStudent` recounts both the old and the new group
- [ ] `deleteStudent` recounts the group it removed from
- [ ] Four-person group, three finished, remove the fourth: the group releases

---

## CU-6 — Two types claim boolean where MySQL sends 0 or 1

**GFI · 2h · `api/src/models/types.ts`, `frontend/src/types/index.ts`**

### What & why

`Resume.checked` and `SocketEvents['check'].checked` are typed `boolean`.
`mysql2` returns `tinyint(1)` as the number `0` or `1`, and
`res-review-group` emits `1` / `0` over the socket. Nothing is broken today
only because every read happens to use truthiness.

The moment someone writes `checked === true`, which is normal TypeScript and
which the type actively invites, it is dead code and the shortlist silently
stops working. A lie in a type is worse than no type.

### Evidence

```bash
grep -n "checked" api/src/models/types.ts frontend/src/types/index.ts
grep -rn "checked:" frontend/src/app/res-review-group/page.tsx
```

### For an agent

- Introduce an explicit alias, e.g. `type DbBool = 0 | 1`, and use it for
  anything read out of a `tinyint(1)` column. Do not "fix" it by casting.
- Fix the type, then follow the compiler. Anywhere it now errors is a real
  place the old type was lying.
- `frontend/src/types/index.ts` is the canonical module. Put it there and
  re-export rather than declaring it twice.

### Done when

- [ ] `checked` is typed as what the database and socket actually send
- [ ] Both packages typecheck
- [ ] No new `any` or `as` casts introduced to make it compile

---

## CU-7 — The teacher's unstick button has no button

**MED · 5h · `frontend/src/app/components/ManageGroupsTab.tsx`, `frontend/src/app/res-review/page.tsx`**

### What & why

Two recovery paths exist on the server and nothing in the UI uses either.

`POST /groups/force-advance` is the professor's override for a deadlocked group.
Today it can only be reached with curl, which during a class means it does not
exist.

`GET /groups/barrier-status/:classId/:groupId` lets a student's page recover by
asking, instead of depending on having received one socket event at one instant.
Nothing polls it, so a student whose socket dropped at the wrong moment still
needs to refresh and hope.

### Evidence

```bash
grep -rn "force-advance\|barrier-status" frontend/src   # currently empty
```

Both routes are live in `api/src/routes/group.routes.ts`.

### For an agent

- Two separable pieces. **Do them as two PRs**, the advisor button and the
  student poll.
- The advisor button belongs on the group card in `ManageGroupsTab`. It is a
  destructive-ish override: confirm first, and name the group and target step
  in the confirmation.
- For the poll: only poll while the student is actually waiting at the barrier,
  and stop once released. A blanket interval on every page is how you get the
  ">50 calls/min" warning that is already in the logs.
- `res-review` already re-joins its room on socket `'connect'`. The poll is the
  belt to that suspenders, for when the socket is up but the event was missed.
- Do not change the endpoints. They are tested and scoped.

### Done when

- [ ] An advisor can force a stuck group forward from Manage Groups
- [ ] A student who misses the release event recovers without refreshing
- [ ] Polling stops once the group is released

---

# Tidying

No behaviour change in this section. If a change here alters what the app does,
it is a bug fix: stop and open an issue instead.

## CU-8 — Delete tracing logs so real errors are visible

**GFI · 3h · anywhere**

### What & why

317 `console.log` calls bury 258 `console.error` calls. During a live class that
is the difference between spotting a stuck group and scrolling past it.

### For an agent

- **Delete** pure tracing: "entering X", "got data", payload dumps, emoji
  progress spam.
- **Keep** every `console.error` and `console.warn` that reports a real failure.
- Do **not** add a logger import. `pino` modules exist in the tree and are
  deliberately unwired; adopting them is `INFRA-12` and is a separate decision.
- One package per PR, so review stays possible.

### Done when

- [ ] `console.log` count meaningfully down, `console.error` count unchanged
- [ ] Both packages typecheck
- [ ] No behaviour change

---

## CU-9 — Finish the shared types migration

**GFI · 4h · `frontend/src/types/index.ts` and callers**

### What & why

`frontend/src/types/index.ts` is the canonical module and is correct. Twelve
files still declare their own `User`, `Note`, `Group` or `Resume`, and they
disagree with each other.

### For an agent

Safe swaps, mechanical:

`components/progress.tsx`, `dashboard/page.tsx` (keep its extra `job_des` as a
local extension), `jobdes/page.tsx`, `mod-dashboard/page.tsx`,
`waitingGroup/page.tsx`, `grouping/page.tsx`.

These change behaviour. One PR each, and say in the description which spelling
you decided is correct and why:

- `interview-stage/page.tsx`, `makeOffer/page.tsx`, `notes/page.tsx` type
  `User.id` as `string`; `AuthContext` has `number`. Anything comparing it to a
  numeric `student_id` is false today.
- `advisor-dashboard/page.tsx`, `new-pdf/page.tsx` use one `name` field instead
  of `f_name` / `l_name`. Check what the endpoint actually returns first.
- `new-pdf/page.tsx`'s `Resume` is really a `Resume_pdfs` row. Give it its own
  name (`ResumePdf`) rather than merging the two concepts.

### Done when

- [ ] Fewer local declarations, canonical module unchanged or additive
- [ ] Each behaviour-changing swap is its own PR with a stated decision

---

## CU-10 — Remove 12 endpoints nothing calls

**GFI · 3h · `api/src/routes/`, `api/src/controller/`**

### What & why

Twelve mounted endpoints have no caller in either package. They are surface
area a reader has to understand and a reviewer has to check.

### Evidence

`POST /resume/batch-vote` (superseded by per-decision saves),
`GET /resume/checked/:group_id`, `GET /interview/vids`, `POST /interview/vote`,
`GET /users/students`, `POST /users/update-user-class`,
`GET /offers/class/:class_id`, `GET /progress/group/:crn/:group_id`,
`POST /groups/update-group`, `POST /moderator/add-student`,
`DELETE /moderator/del-student`, `GET /resume_pdf/resumes/:fileName`.

### For an agent

- **Do NOT remove** `GET /auth/keycloak/callback` (Keycloak redirects to it, so
  it has no in-repo caller by design), `GET /groups/barrier-status`, or
  `POST /groups/force-advance` (new recovery paths, UI is `CU-7`).
- **Re-verify before deleting.** This list was accurate when written and the
  tree moves. `AGENTS.md` rule 9: check both sides, because the API redirects to
  frontend routes and a frontend-only grep lies.
- Remove the route, then the controller method, then any type only it used.
- One route file per PR.

### Done when

- [ ] Each deletion has a grep in the PR description proving no caller
- [ ] API typechecks and boots
- [ ] The three protected endpoints above are untouched

---

## CU-11 — Delete the dead `Res2_Status` table

**GFI · 2h · `database-files/`, `api/src/`**

### What & why

`Res2_Status (student_id, finished, group_id, class)` is an older per-student
completion flag. Nothing in `api/src` reads or writes it, and it overlaps
`Step_Completion`, which is now the real barrier record. Two tables for one
concept is how the next person records completion in the wrong one.

### Evidence

```bash
grep -rn "Res2_Status" api/src frontend/src   # currently empty
```

### For an agent

- This is a schema change, so it needs a **numbered migration** in
  `database-files/migrations/` **and** an edit to `Pandployer.sql`. Read that
  directory's README first. `AGENTS.md` rule 11.
- Dropping a table is destructive and irreversible. Say so in the migration
  header, and check the live database for rows before assuming it is empty.
- Its two siblings `Interview_Status` and `Offer_Status` **are** in use and have
  their own open ticket (`API-3`). Do not touch them.

### Done when

- [ ] Migration drops it, guarded so a second run is a no-op
- [ ] `Pandployer.sql` no longer defines it
- [ ] Row count checked on the live database and recorded in the PR

---

## CU-12 — Extract one piece from an oversized file

**MED · 5h · one of three files**

### What & why

`ManageGroupsTab` is ~2,050 lines, `interview-stage` ~1,300, `makeOffer` ~1,180.
They are the top merge-conflict files, so two people on the same area means
daily conflicts. Shrinking them one seam at a time is how they get fixed without
a freeze.

### For an agent

- Extract **one** clearly separable piece: a modal, a card, a hook. Not the file.
- **Pure motion.** No behaviour change, no net line change beyond imports.
  `AGENTS.md` is explicit: moving code and changing behaviour in one commit makes
  review impossible.
- Say in the PR which seam you picked and why.
- The full decomposition is `TCH-18` and `UI-28`. Do not attempt those here.

### Done when

- [ ] One component or hook extracted, imported back, nothing else changed
- [ ] Typecheck clean and the page renders identically

---

# What does NOT belong here

These need a spec or a decision. They live in [TICKETS.md](TICKETS.md):

- Anything touching `SOCKET_AUTH_REQUIRED`, the group barrier's design, or
  writing a migration runner
- `/employerPanel` — a stub, but also the unbuilt final step of the simulation.
  Build-or-cut is a product call (`STU-27`)
- The Tailwind theme tokens (`UI-9`) — a design decision the team makes together
- `console.log` → `pino` (`INFRA-12`). `CU-8` above is deletion only
- Anything where you find yourself changing what the app does

---

## Keeping this file honest

The counts above go stale. Re-measure before claiming an entry:

```bash
# source size
find frontend/src api/src -name '*.ts' -o -name '*.tsx' | xargs wc -l | tail -1

# log noise
grep -rho 'console\.[a-z]*' api/src frontend/src | sort | uniq -c | sort -rn

# duplicate type declarations
grep -rn 'interface User' frontend/src
```

When you finish an entry, delete it and add whatever you noticed while you were
in there. A found bug with a file and a line is worth more than a tidy list.
