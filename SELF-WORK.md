# Self-directed work

For work that isn't on the board yet. You don't need permission to start, but
write it down here first.

## Why

We share one repo, and most merge pain is two people quietly editing the same
file for days. An entry here means teammates and AI agents can see your files
are in flight, and Aarav can turn it into a Linear ticket so it counts.

**The "files" line is the load-bearing part.** If you fill in nothing else, fill
in that.

## How

1. Copy the template into **In progress**, fill it in, push it
2. Ping Aarav so he can write the ticket
3. Start building, don't wait
4. Move it to **Done** with the PR link when it merges

Check [TICKETS.md](TICKETS.md) first, it might already exist. Dropping an idea
is fine, move it to Done and say why in a line.

**If it touches auth, sockets, schema, or deploy, talk to Aarav before you
start.** Those break in ways you won't see until a full class is on it.

## Template

```markdown
### <title>

- **Who:**
- **What:** one or two sentences
- **Why it matters:**
- **Files:** best guess is fine
- **Touches auth / sockets / schema / deploy?**
- **Size:** hours or days
- **Status:** planning | building | in review
- **Branch:**
- **Linear:** (Aarav fills in)
```

## In progress

### An API restart no longer strands the resume review

- **Who:** Audrey
- **What:** `res-review` re-sends its completion on every reconnect and unlocks Next only on the barrier (event or poll); `res-review-group` ignores a `moveGroup` for its own page. Part 1 of OAS-231.
- **Why it matters:** a 5s API crash stranded 4 to 21 of 29 students in load tests
- **Files:** `frontend/src/app/res-review/page.tsx`, `frontend/src/app/res-review-group/page.tsx`, `frontend/src/types/index.ts`, `.local/tests/load-tests/student.mjs`, docs
- **Touches auth / sockets / schema / deploy?** sockets: re-emits the existing `userCompletedResReview`
- **Size:** hours
- **Status:** in review
- **Branch:** see [#106](https://github.com/Oasis-NEU/NUHire/pull/106)
- **Linear:** OAS-236

### Interviews and make offer survive a restart, and the teacher can unstick make offer

- **Who:** Audrey
- **What:** `/interview-stage` re-joins its room on every reconnect; make offer re-sends the student's own confirmation on reconnect, follows `moveGroup`, and opens its "everyone confirmed" gate when the teacher releases it. `/live-class` gets an "Unstick → Employer" button and a "Let them make an offer" button at make offer. Part 2 of OAS-231, stacked on #106.
- **Why it matters:** a group with one absent or disconnected member had no way past make offer, and a reconnect during interviews missed `moveGroup`
- **Files:** `frontend/src/app/interview-stage/page.tsx`, `frontend/src/app/makeOffer/page.tsx`, `frontend/src/app/live-class/page.tsx`, `frontend/src/app/res-review/page.tsx`, `frontend/src/app/components/useBarrierReleased.ts` (new), `api/src/controller/group.controller.ts`, `api/src/routes/group.routes.ts`, `api/src/config/steps.ts`, `.local/tests/load-tests/*`, docs
- **Touches auth / sockets / schema / deploy?** sockets: one new server event, `offerGateReleased`, sent to the group room. No schema change: it writes `Step_Completion` rows for `offer`, which the enum already allows
- **Size:** days
- **Status:** in review
- **Branch:** see [#119](https://github.com/Oasis-NEU/NUHire/pull/119), stacked on #106
- **Linear:** OAS-237

## Done

_Move entries here when they merge or get dropped._

### Absent students no longer block their group

- **Who:** Audrey
- **What:** gates count only students who showed up since their group started (`Users.present_at`), so a student on the roster who never logs in no longer holds the group. Part 1 of the late/absent pair; late students rejoining is part 2.
- **Why it matters:** one absent student kept a whole group at "3 of 4" for the rest of the class
- **Files:** `api/src/config/socket.ts`, `api/src/controller/group.controller.ts`, `api/src/controller/interview.controller.ts`, `frontend/src/app/live-class/page.tsx`, `frontend/src/types/index.ts`, `database-files/migrations/006-users-present-at.sql`, `database-files/Pandployer.sql`, `.local/tests/seed/scenarios.mjs`, docs
- **Touches auth / sockets / schema / deploy?** sockets and schema; talked to Aarav
- **Size:** days
- **Status:** merged 2026-10-13
- **Branch:** [#41](https://github.com/Oasis-NEU/NUHire/pull/41)
- **Linear:** TCH-16 (first checkbox)

### Late students can rejoin their group

- **Who:** Audrey
- **What:** a student who arrives after their group finished the solo resume review is offered the group's current step on the dashboard and skips the review. Part 2 of the late/absent pair; builds on #41.
- **Why it matters:** a student 15 minutes late did 10 timed reviews alone while the group waited
- **Files:** `api/src/config/steps.ts`, `api/src/controller/catchUp.controller.ts`, `api/src/routes/group.routes.ts`, `api/src/config/socket.ts`, `frontend/src/app/components/useCatchUp.tsx`, `frontend/src/app/dashboard/page.tsx`, `frontend/src/lib/api.ts`, docs
- **Touches auth / sockets / schema / deploy?** sockets: one emit of the existing `studentAddedToGroup` event
- **Size:** days
- **Status:** merged 2026-10-13
- **Branch:** [#42](https://github.com/Oasis-NEU/NUHire/pull/42)
- **Linear:** STU-21
