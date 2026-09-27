## What

<!-- One or two sentences. What does this change do? -->

## Why

<!-- The problem it solves. Link the Linear ticket if there is one. -->

Linear:

## How to test

<!-- Steps a reviewer can follow locally. Which account, which page, what to click. -->

## Screenshots

<!-- UI changes only. Before and after. Delete this section otherwise. -->

## Checklist

- [ ] `npm run typecheck` and `npm run build` pass
- [ ] I walked the affected flow locally
- [ ] Group or socket changes tested with two sessions in the same group
- [ ] No new `console.log`, no new `any`
- [ ] Any new env var is in `.env.example`
- [ ] Schema change has a migration in `database-files/migrations/`
- [ ] `npm run format` run
- [ ] I did not move code and change behaviour in the same commit
- [ ] I updated [SELF-WORK.md](../SELF-WORK.md) if this wasn't a ticket

**Touches auth, sockets, schema, or deploy?** yes / no

<!-- If yes, tag Aarav for review. These break in ways that don't show up until a full class is using the app. -->
