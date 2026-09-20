# Onboarding

Clone to a running app. Should take under 20 minutes. If a step fails, say so in
the team channel rather than working around it silently, since the whole point is
that this doc stays true.

## Prerequisites

- **Node 22** (`.nvmrc` pins it, run `nvm use`)
- **Docker Desktop**, running
- **git**

## 1. Clone and install

```bash
git clone git@github.com:Khoury-Co-op/NUHire.git
cd NUHire
npm run install:all
```

## 2. Environment files

```bash
cp api/.env.example api/.env
cp frontend/.env.example frontend/.env.local
```

The defaults work as-is for local development. Read the comments in both files.

## 3. Start MySQL and Keycloak

```bash
npm run dev:services
```

First run pulls images and imports the Keycloak realm, so give it a minute.
Check both are healthy:

```bash
docker compose -f .local/compose.yaml ps
```

## 4. Start the API

```bash
npm run dev:api
```

Wait for `NUHire Backend started successfully`. Verify:

```bash
curl http://localhost:5001/health
# {"status":"ok","port":"5001"}
```

**Do not use `npm run dev` inside `api/`.** The `ts-node` dev script is broken
(see Troubleshooting). Use the command above, which builds then runs. That means
API changes need a rebuild. The frontend hot-reloads normally.

## 5. Start the frontend

In a second terminal:

```bash
npm run dev:frontend
```

Open http://localhost:3000.

## 6. Log in

Password is `nuhire` for all accounts.

| Email                       | Role             |
| --------------------------- | ---------------- |
| `advisor@northeastern.edu`  | professor        |
| `student1@northeastern.edu` | student, group 1 |
| `student2@northeastern.edu` | student, group 2 |
| `student3@northeastern.edu` | student, group 2 |

Students sit on a waiting screen until a professor starts their group and
assigns it a job. To see the student flow, log in as the advisor first, go to
**Manage Groups**, pick CRN 1, assign a job, and start the group.

One browser can only hold one login, since Keycloak SSO is shared across tabs.
Use a private window for the second role.

## What to read next

1. **[CLAUDE.md](CLAUDE.md)** — architecture, conventions, and the rules. Read
   this before writing code.
2. **[TICKETS.md](TICKETS.md)** — the backlog. Good first issues are labelled.
3. **[.local/README.md](.local/README.md)** — resetting the database, seeded data.

Docs in `docs/archive/` are historical and describe infrastructure that no longer
exists. Ignore them.

## Troubleshooting

**`npm run dev` in `api/` throws TS2769 on `auth.routes.ts`**
Known. The lockfile pins `@types/express@5` against `express@4`. `tsc` itself is
fine, so `npm run dev:api` (build then start) works. There is a ticket to fix it.

**Login redirects to a 404 or `undefined/instructions`**
`NEXT_PUBLIC_FRONT_URL` is missing from `frontend/.env.local`. Next only reads
env files at server start, so restart the frontend after adding it.

**Logged in but every request says unauthorized**
`COOKIE_SECURE=false` is missing from `api/.env`. Browsers drop `Secure` cookies
over plain http, so the session cookie never persists.

**Keycloak container won't start**
Usually a stale volume. `docker compose -f .local/compose.yaml down -v` then
start again. This wipes the local database too, which is fine, it reseeds.

**Port already in use**

```bash
lsof -ti tcp:3000 | xargs kill -9
lsof -ti tcp:5001 | xargs kill -9
```

**Reset everything**

```bash
docker compose -f .local/compose.yaml down -v
npm run dev:services
```
