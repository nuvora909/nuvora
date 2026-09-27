# Nuvora

Online Data Science and AI/ML school: public website, student portal, database and automation.

## Folders

| Folder | What it holds |
|---|---|
| `site/` | The public website and portal prototype (single `index.html`, images, videos, fonts) |
| `design/` | Logo concepts |
| `supabase/migrations/` | Database tables, security rules and automation functions |
| `supabase/seed.sql` | Programs, modules, lessons and the weekly live-class pattern (generated, do not edit by hand) |
| `scripts/` | `catalog.mjs` is the source of truth for programs; `build-seed.mjs` turns it into `seed.sql` |
| `tests/` | Automated tests |

## How batches work

- A new batch of every active program starts on the **first Monday of each month**. Applications close 7 days before.
- Creating a batch copies the program's templates into real dated classes (Tuesday live class and Thursday office hours at 19:00 India time, for 12 weeks) and assignment due dates.
- A student can see a batch only while they have an **active** enrollment in it. Pausing, withdrawing or transferring changes what they see immediately.
- Watch time counts only the parts of a video actually played. A lesson counts as complete at 90%.
- Assignments use a mastery rubric. *Distinguished* or *Proficient* passes; *Basic* or *Not yet* asks for a resubmission.

## Commands

```bash
npm install             # once
npm run seed            # after editing scripts/catalog.mjs
npm test                # database tests, one run
npm run test:db:3x      # database tests, three runs in a row (required before every commit)
npm run test:sabotage   # breaks each security rule on purpose and checks the tests catch it
```
