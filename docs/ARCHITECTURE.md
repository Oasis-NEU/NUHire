# Architecture

For teaching the codebase. Read [WHAT_IS_NUHIRE.md](WHAT_IS_NUHIRE.md) first so
the product makes sense, then this.

Line numbers were accurate as of the tooling commit. File and symbol names are
what to trust.

---

## The shape of it

```
            Browser (student or professor laptop)
                 │                        │
        HTTP (ask/answer)          WebSocket (push)
                 │                        │
                 ▼                        ▼
      Next.js frontend :3000      Express API :5001
              │                           │
              └──────── HTTP ─────────────┤
                                          ▼
                                     MySQL :3306
                                   (21 tables)

      Keycloak :8080  ── login, redirects back to the API
```

Four processes. Locally, MySQL and Keycloak run in Docker while the API and
frontend run on your machine.

### Why two servers

The frontend draws screens. The API owns the data and the rules. **Only the API
touches the database.** If the browser could write directly, a student could edit
their own votes from devtools.

### Why both HTTP and WebSocket

HTTP is ask-and-answer. The browser asks, the server replies, done. The server
can never start the conversation.

That breaks down for a live classroom. When the professor sends a curveball, HTTP
has no way to push it. WebSocket keeps one connection open so either side can
send at any time.

So: **HTTP for "give me this," WebSocket for "tell me when something happens."**

---

## The one idea that explains everything: `(group_id, class)`

`class` is the CRN, the course section number. `group_id` is the team within it.
Together they identify one group of students.

Nearly every table and query is keyed on that pair. Socket.IO rooms are named
`group_<group_id>_class_<class>`.

**If you scope by `group_id` alone, you hit group 3 in every section at once.**
This is the single most common mistake in this codebase. Always carry both.

---

## The database

21 tables. Three kinds.

**Who people are**

- `Users` — email, `affiliation` (student / admin / none), `group_id`, `class`
- `Moderator` — maps an advisor email to a CRN. **This table is what makes
  someone a teacher.** Being in it is the only qualification.
- `GroupsInfo` — has this group been started

**The content students look at**

- `job_descriptions`, `Resume_pdfs`, `Candidates`, `Interview_vids`
- `Candidates.resume_id` links a person to their resume

**What students did**

- `Resume` — individual resume votes and the group's shortlist flag
- `InterviewPage` — interview ratings, four scores per candidate
- `InterviewPopup` — how the professor's curveballs shifted the scores
- `Offers` — the final offer and whether it was accepted
- `Notes`, `Progress`

### Two traps in the schema

**`candidate_id` is not `Candidates.id`.** Throughout the app it actually holds a
`Resume_pdfs.id`. Looking up `Candidates` by `id` silently returns the wrong
person. Join on `resume_id`.

**`Resume` has no unique key.** So the `ON DUPLICATE KEY UPDATE` in `submitVote`
never fires, and every vote change inserts a new row instead of updating. A
student who changes their mind ten times looks like ten reviewed resumes.

---

## The API

```
api/src/
  server.ts          boot: connect db, configure passport, start
  app.ts             middleware, session, route mounting
  config/
    database.ts      mysql pool, boot-time seeding
    passport.ts      keycloak strategy
    socket.ts        ALL real-time behaviour
  routes/            path -> controller, plus auth middleware per route
  controller/        request handling and raw SQL
  middleware/        requireAuth, requireAdmin, requireStudent
  models/types.ts    shared types, including socket payloads
```

**Request flow:** `routes/ -> controller/ -> raw SQL`. No service layer, no ORM.
SQL strings live inside controllers.

Reading an endpoint: start in `routes/`, which tells you the path, the middleware,
and the controller method. Then read that method.

### Auth middleware, and what's missing

`requireAuth`, `requireAdmin`, `requireStudent` all exist in
`middleware/auth.middleware.ts`. `requireAuth` is used widely. **`requireAdmin`
and `requireStudent` are applied to essentially nothing.**

So any logged-in student can call teacher endpoints. And `requireAuth` only
proves you're logged in, never that the group in the URL is _yours_.

---

## Login

1. Student clicks the landing page button → `GET /auth/keycloak` on the API
2. API redirects to Keycloak; they log in there
3. Keycloak redirects back to `/auth/keycloak/callback`
4. `auth.controller.ts` looks them up in `Users` and redirects based on their
   `affiliation`, whether their group has started, and whether they've seen the intro

**Step 4 matters for navigation.** The API redirects to frontend routes like
`/waitingGroup`, `/about`, `/signupform`. Those pages have no inbound links from
the frontend, so they look dead to a grep and are not.

There is also a **second, unrelated login**: the "Admin" button, a plaintext
password compared against env vars. It gates the page that writes `Moderator`.
Scheduled for removal.

---

## The real-time layer

`api/src/config/socket.ts`. The most interesting and weakest file in the repo.

Students join room `group_<g>_class_<c>`. Through it flow shared checkboxes,
professor popups, step transitions, and offer approvals.

### Three things to understand

**1. The group barrier.** Several steps wait for every group member to finish
before anyone advances. This is the core of the group mechanic.

**2. That barrier lives in process memory.** Not the database. A plain
JavaScript object. If the API restarts mid-class, it's gone and **the group is
stuck forever with no way out**. It also means the API can never run more than
one replica, because half the group would land on a different process that
doesn't know about the other half.

**3. There is no teacher override.** The `moveGroup` event is only ever emitted by
students. No professor UI sends it. When a group deadlocks, her only fix is
editing the database.

### Also true of sockets here

- No authentication at all. Any client can emit any event.
- Several handlers use `io.emit`, which broadcasts to every connected client in
  every class, instead of emitting to a room.

---

## The frontend

```
frontend/src/app/
  page.tsx            landing
  about/ instructions/   first-time intro
  dashboard/          student hub, defines the step list
  jobdes/ res-review/ res-review-group/ interview-stage/ makeOffer/
  employerPanel/      stub
  waitingGroup/       "waiting for your teacher"
  advisor-dashboard/  professor hub
  grouping/           renders ManageGroupsTab + StudentCSVTab
  new-pdf/ adminFacts/
  components/         shared UI and React contexts
```

Next.js App Router: a folder under `app/` becomes a URL.

### Contexts worth knowing

- `AuthContext` — current user, used everywhere
- `socketContext` — the shared Socket.IO connection
- `useProgress` — the step gate

### How gating works, and why it's weak

`components/useProgress.tsx` reads `localStorage.progress` and redirects if you
shouldn't be on a page. **Client-side only**, so devtools defeats it. And when it
blocks you it redirects to `/${progress}`, producing `/res_1`, which isn't a
route, so the guard itself 404s.

### The professor's cockpit

`components/ManageGroupsTab.tsx`, over 2,000 lines with ~40 `useState` hooks and
six modals in one component. Roster import, group assignment, job assignment,
starting groups, popups, offer approval. Everything the professor does in class.

This is the file everyone will need to touch, which is why splitting it matters.

---

## Three names for the same thing

There are three vocabularies for "what step is a student on," and they do not map
to each other:

| System               | Values                                                                     |
| -------------------- | -------------------------------------------------------------------------- |
| `Users.current_page` | `dashboard, resumepage, resumepage2, jobdes, interviewpage, makeofferpage` |
| `Progress.step`      | `none, job_description, res_1, res_2, interview, offer, employer`          |
| Route paths          | `/jobdes, /res-review, /res-review-group, /interview-stage, /makeOffer`    |

This is the root cause of most "why is this student on the wrong page" bugs.
Collapsing them into one is a planned ticket, and until it lands, expect
translation bugs at every boundary.

---

## Tracing a real feature

**"A student checks a resume box and their teammates see it."**

1. `res-review-group/page.tsx` renders the checkbox
2. On click it emits `check` with the room id, resume number, and new state
3. `socket.ts` `check` handler parses `group_<g>_class_<c>` out of the room name
4. It runs `UPDATE Resume SET checked = ?` scoped to group, class, resume
5. It emits `checkboxUpdated` back to the room
6. Every client in the room, including the sender, updates

That's the pattern for most live behaviour: **emit → persist → broadcast to the
room**. Worth reading in full, it's the clearest example in the file.

---

## Where to start reading

In order:

1. `frontend/src/app/dashboard/page.tsx` — the step list, the shape of the journey
2. `api/src/routes/` — the whole API surface in a few small files
3. `api/src/config/socket.ts` — how live behaviour works
4. `database-files/Pandployer.sql` — the data model
5. `frontend/src/app/res-review/page.tsx` — a full student step end to end

Then read [AGENTS.md](../AGENTS.md) for the rules, and pick a good first issue
from [TICKETS.md](../TICKETS.md).
