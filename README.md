# NUHire

![NUHire](/project-screenshots/nuhire_vector.png)

A hiring simulation used as a live, instructor-led activity in Khoury CS1210
(Intro to Co-op). Students play the employer: read a job description, review
resumes, watch recorded interviews, and extend one offer. A professor runs the
class in real time.

It replaces a pen-and-paper activity called "employer for a day." The learning
outcome is understanding what a hiring manager actually looks for in a resume.

## How it works

**Students**, in groups of 3 to 5, move through six steps:

1. **Job Description** — read the role the group is hiring for
2. **Resume Review** — review 10 resumes individually, on a timer
3. **Group Resume Review** — agree on 4 candidates to interview
4. **Interview Stage** — watch recorded interviews and rate answers
5. **Make an Offer** — pick one candidate and send the offer to the professor
6. **Employer Panel** — not yet built

**The professor** imports a class roster, assigns students to groups, assigns
each group a job, starts the activity, sends curveball events during the
interview stage (a candidate no-showing, for example), and accepts or rejects
each group's final offer.

Groups move through steps together. Several steps wait for every member to
finish before anyone continues.

## Stack

|          |                                                               |
| -------- | ------------------------------------------------------------- |
| Frontend | Next.js 15 (App Router), React 19, Tailwind, Socket.IO client |
| API      | Express, TypeScript, Socket.IO, Passport                      |
| Database | MySQL                                                         |
| Auth     | Keycloak (OIDC), moving to Khoury IT SSO                      |
| Deploy   | Coolify on a Khoury self-hosted runner                        |

Real-time behaviour runs over Socket.IO. Groups occupy a room named
`group_<group_id>_class_<crn>`, which carries shared checkboxes, professor
popups, step transitions, and offer approvals.

## Running it locally

See **[.local/README.md](.local/README.md)** for the full runbook, including
seeded test accounts.

```bash
docker compose -f .local/compose.yaml up -d   # MySQL + Keycloak
npm run dev:api
npm run dev:frontend
```

Then open http://localhost:3000.

MySQL and Keycloak run in Docker. The API and frontend run on the host, because
Keycloak has to be reachable at the same URL from both the browser and the API.

## Contributing

Read **[CLAUDE.md](CLAUDE.md)** first. It covers the architecture, the conventions,
and a set of rules that exist because the obvious approach is wrong in several
places here. It is written for AI coding agents but applies to everyone.

**[TICKETS.md](TICKETS.md)** is the backlog, with file references.

## Repo layout

```
api/                 Express API
frontend/            Next.js app
database-files/      MySQL schema
keycloak/            realm export
.local/              local dev stack and runbook
docs/archive/        historical docs, do not follow
```

## History

Built by Khoury co-ops starting spring 2025, then extended through late 2025.
Deployment moved to Khoury infrastructure in spring 2026. Everyone who wrote the
original code has since left.

Docs in `docs/archive/` describe an older Render and Railway deployment with
Google OAuth. None of that is current. Treat them as history.
