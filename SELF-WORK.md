# Self-directed work

For when you want to build something that isn't on the board.

You do not need permission to start. You do need to write it down here first.

---

## Why this file exists

Eight people and their AI assistants are working in one repo. Most of the pain
that causes is not hard problems, it is two people quietly editing the same file
for three days and finding out at merge time.

This file is the cheap fix. Before you start something that isn't already a
ticket, add an entry. Three things come out of that:

1. **Other people see it.** Nobody else starts the same thing, and anyone whose
   work touches yours can find you before it's a conflict.
2. **AI agents see it.** Claude, Copilot, Cursor and friends read the repo.
   `AGENTS.md` points them here, so an agent working on someone else's ticket
   knows your files are in flight and can leave them alone or flag the overlap.
3. **Aarav sees it** and turns it into a real ticket in Linear, so your work
   counts and shows up in planning.

**The "files I expect to touch" line is the load-bearing part.** Everything else
is context. If you fill in nothing else, fill in that.

---

## How to use it

1. Copy the template below into **In progress**
2. Fill it in. Two minutes, not twenty
3. Open a PR with just this change, or push it on your branch — either is fine
4. Ping Aarav in the channel so he can write the formal ticket
5. Start building. Do not wait for the ticket
6. When it merges, move your entry to **Done** with the PR link

**Nothing here is a commitment.** Abandoning an idea is fine. Move the entry to
**Done** and write "dropped" and one line on why. That is genuinely useful, it
stops the next person walking into the same wall.

### Before you claim something

- Check [TICKETS.md](TICKETS.md) — it might already be there with a spec
- Check the entries below — someone may be in the same files
- Check [CLEANUP.md](CLEANUP.md) if it's small

### Two rules

**Overlapping files is not a veto.** If someone is already in a file you need,
talk to them. Usually you sequence it or split the file. Just don't discover it
at merge time.

**If it touches auth, sockets, the database schema, or deploy, talk to Aarav
before you start, not after.** Those four break in ways that aren't obvious
until 30 people are using the app at once.

---

## Template

```markdown
### <short title>

- **Who:** your name
- **What:** one or two sentences. What are you building and why
- **Why it matters:** who is better off, and how. Tie it to the class if you can
- **Files I expect to touch:** paths, best guess is fine
- **Touches auth / sockets / schema / deploy?** yes or no. If yes, say which
- **Rough size:** hours or days
- **Status:** planning | building | in review
- **Branch:** your-branch-name
- **Linear ticket:** (Aarav fills in)
```

---

## Example

> Delete this once there are real entries. It is here to show the shape.

### Show which teammates are online in your group

- **Who:** Jane Doe
- **What:** A small presence strip on the student step pages showing which
  group members are connected right now.
- **Why it matters:** Groups get stuck at the barrier waiting on someone who
  went to the bathroom, and nobody can tell whether they're gone or just slow.
  Right now the only person who can see that is the professor.
- **Files I expect to touch:** `frontend/src/app/components/` (new component),
  `frontend/src/app/res-review/page.tsx`, `api/src/config/socket.ts`
- **Touches auth / sockets / schema / deploy?** Yes, sockets. The API already
  tracks online students in memory, so I want to check with Aarav whether to
  reuse that or read from `Step_Completion`.
- **Rough size:** ~6 hours
- **Status:** planning
- **Branch:** `jd/group-presence`
- **Linear ticket:** —

---

## In progress

_Nothing yet. Add yours above the Done section._

---

## Done

_Move entries here when they merge or get dropped. Keep the PR link._
