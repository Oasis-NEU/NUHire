# CLEANUP.md

Small, self-contained work for when you have a spare hour and don't want to
start something with a spec attached. Nothing here is urgent. Nothing here
blocks anyone. Take one, do it properly, open a PR.

Read [AGENTS.md](AGENTS.md) first, especially **rule 9**: a page or endpoint
with no inbound link from the frontend may still be reachable, because the API
redirects to frontend routes after login. Check both sides before deleting
anything:

```bash
grep -rn "theThing" frontend/src    # frontend links
grep -rn "theThing" api/src         # server-side redirects
```

Server-side redirects only ever target `/about`, `/advisor-dashboard`,
`/dashboard`, `/signupform`, `/waitingGroup`. Anything else has no server entry
point.

**Ground rules for everything on this page**

- Deletion only. If removing something changes what the app does, it is not a
  cleanup ticket, it is a bug fix. Stop and open an issue instead.
- Never delete a `catch`, an error path, or a guard because it "looks unused".
- `npx tsc --noEmit` in both packages before you push. A green typecheck is the
  whole safety net right now; there are no tests yet.
- One concern per PR. A PR that deletes dead code **and** changes behaviour is
  unreviewable.

---

## Why this file exists

A lot of this codebase was written fast, some of it by AI, and it shows: the
same spinner is copy-pasted sixteen times, `interface User` is declared in a
dozen files that disagree with each other, and there are hundreds of
`console.log` calls that bury real errors during a live class.

None of that is dangerous on its own. All of it makes the next bug take longer
to find. Chipping at it is genuinely useful and it is a good way to read the
codebase without having to hold a whole feature in your head.

---

## Measured baseline

Re-measure before you claim one of these; the numbers move.

```bash
# total source lines
find frontend/src api/src -name '*.ts' -o -name '*.tsx' | xargs wc -l | tail -1

# log noise
grep -rho 'console\.[a-z]*' api/src frontend/src | sort | uniq -c | sort -rn

# escape hatches
grep -rho ': any\|as any' api/src frontend/src | sort | uniq -c

# duplicate type declarations
grep -rn 'interface User' frontend/src
```

As of the last sweep: ~18,900 source lines, 317 `console.log`, 258
`console.error`, ~103 `: any`, 20 `as any`, 13 `interface User` declarations.

---

## The list

### C-1 [GFI] 2h — Delete a page's worth of unused imports

Pick one directory, remove every import nothing uses. `tsc` will not catch
these; `noUnusedLocals` is off. Repeat per directory so PRs stay small.

- [ ] One directory per PR
- [ ] `npx tsc --noEmit` clean in that package

### C-2 [GFI] 3h — Kill tracing `console.log`, keep real errors

There are 317 `console.log` calls and they hide the 258 `console.error` calls
that matter. During a live class this is the difference between spotting a
stuck group and scrolling past it.

- [ ] Delete pure tracing: "entering X", "got data", payload dumps, emoji progress spam
- [ ] **Keep** `console.error` / `console.warn` that report a real failure
- [ ] Do not add a logger import — `INFRA-12` owns that decision
- [ ] One package per PR

### C-3 [GFI] 4h — Finish the canonical types migration

`frontend/src/types/index.ts` exists and is correct. Twelve files still declare
their own `User`, `Note`, `Group`, `Resume` and they disagree.

Straight swaps, safe:

- `components/progress.tsx`, `dashboard/page.tsx` (keep its extra `job_des` as
  a local extension), `jobdes/page.tsx`, `mod-dashboard/page.tsx`,
  `waitingGroup/page.tsx`, `grouping/page.tsx`

Ones that change behaviour — do these deliberately, one PR each, and say in
the description which spelling you decided is right:

- `interview-stage/page.tsx`, `makeOffer/page.tsx`, `notes/page.tsx` declare
  `User.id` as `string` where `AuthContext` has `number`. Anything comparing it
  to a numeric `student_id` is false today.
- `res-review-group/page.tsx` types `Resume.checked` as `boolean`, but mysql2
  returns `tinyint(1)` as `0 | 1`. Only truthiness is saving it; `=== true`
  would be dead code.
- `advisor-dashboard/page.tsx` and `new-pdf/page.tsx` use a single `name`
  instead of `f_name` / `l_name`. Check what the endpoint actually returns.
- `new-pdf/page.tsx`'s `Resume` is really a `Resume_pdfs` row. Give it its own
  name (`ResumePdf`) rather than merging it.

### C-4 [GFI] 3h — Remove endpoints nothing calls

Verified to have no caller in either package:

`POST /resume/batch-vote` (superseded), `GET /resume/checked/:group_id`,
`GET /interview/vids`, `POST /interview/vote`, `GET /users/students`,
`POST /users/update-user-class`, `GET /offers/class/:class_id`,
`GET /progress/group/:crn/:group_id`, `POST /groups/update-group`,
`POST /moderator/add-student`, `DELETE /moderator/del-student`,
`GET /resume_pdf/resumes/:fileName` (redundant with the `/uploads` route).

**Do not touch** `GET /auth/keycloak/callback` (Keycloak redirects to it), or
`GET /groups/barrier-status` and `POST /groups/force-advance` (new recovery and
override paths, UI is a separate ticket).

- [ ] Remove the route, then the controller method, then any now-dead type
- [ ] Re-run the check, don't trust this list: `python3` a grep over both packages
- [ ] One route file per PR

### C-5 [GFI] 3h — Replace the sixteenth copy of the spinner

The same loading block is pasted sixteen times and one copy has already drifted
to a different colour. This is `UI-12` and it is the cheapest possible start on
the design system.

- [ ] One `<Spinner>` / `<PageLoader>` in `components/`
- [ ] Replace every copy
- [ ] No visual change (screenshot before and after in the PR)

### C-6 [MED] 4h — Narrow the `: any` count, honestly

103 `: any` and 20 `as any`. Do not chase the number. Pick ones where the real
type is obvious from the query or the endpoint, and leave the rest.

- [ ] Never widen a type to make an error go away
- [ ] If narrowing reveals a bug, stop and open an issue; that is a real find
- [ ] Ten per PR, maximum

### C-7 [GFI] 2h — Delete commented-out code

Explanatory comments stay. Commented-out _code_ goes; git remembers it.

### C-8 [GFI] 2h — Remove the debug-only effects

e.g. `ManageGroupsTab` has a `useEffect` whose entire body is a
`console.log('acceptedoffers updated', ...)`. Behaviour-neutral to delete.

### C-9 [MED] 5h — Split one oversized file

`interview-stage` (~1,300 lines), `makeOffer` (~1,180), `ManageGroupsTab`
(~2,050). Extract **one** clearly separable piece: a modal, a card, a hook.

- [ ] Pure motion. No behaviour change, no net line change beyond imports
- [ ] Say in the PR which piece and why that seam
- [ ] Do not attempt a whole file in one PR — `TCH-18` and `UI-28` cover that

### C-10 [GFI] 1h — Re-measure and update this file

The baseline above goes stale. Re-run the commands, update the numbers, delete
anything now done, add what you noticed while working.

---

## What is NOT cleanup

Put these in `TICKETS.md` instead, they need a spec or a decision:

- Anything touching the socket auth flag, the group barrier, or migrations
- Deleting `/employerPanel` (it is a stub, but it is also the unbuilt final
  step of the simulation — that is `STU-27`, a product decision)
- Rewriting the Tailwind theme tokens (`UI-9` — a design decision the team
  should make together, not a cleanup)
- The `console.log` → `pino` migration (`INFRA-12`; C-2 above is only deletion)
