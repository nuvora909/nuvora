# Nuvora

Online Data Science and AI/ML school: public website, student portal, database and automation.

## Folders

| Folder | What it holds |
|---|---|
| `site/` | The public website (single `index.html`, images, videos, fonts) |
| `portal/` | The student and instructor portal (plain HTML, CSS and JavaScript modules; no build step) |
| `supabase/migrations/` | Database tables, security rules, storage rules and all server-side logic |
| `supabase/seed.sql` | Programs, modules, lessons and the weekly live-class pattern (generated, do not edit by hand) |
| `scripts/` | `catalog.mjs` is the source of truth for programs; `build-seed.mjs` turns it into `seed.sql` |
| `server/` | Local stand-in for Supabase (database, sign-in, API, PDF storage) used for development and tests |
| `tests/` | Automated tests: `db/` (database rules), `server/` (API), `e2e/` (portal in Microsoft Edge) |
| `design/` | Logo concepts |

## How it works

- A new batch of every active program starts on the **first Monday of each month**. Applications close 7 days before.
- Creating a batch copies the program's templates into dated classes (Tuesday live class and Thursday office hours at 19:00 India time, for 12 weeks) and assignment due dates.
- A student sees a batch only while their enrollment in it is **active**. Pausing, withdrawing or transferring changes what they see immediately.
- Zoom links are handed out only from 15 minutes before a class until it ends.
- Watch time counts only the parts of a video actually played. A lesson counts as complete at 90%.
- **Videos are never downloadable.** Lesson and assessment **PDFs are**: they sit in a private, PDF-only storage bucket, and each download uses a link that works for 60 seconds, issued only to students enrolled in that program.
- Assignments use a mastery rubric. *Distinguished* or *Proficient* passes; *Basic* or *Not yet* asks for a resubmission.
- Instructors see only the batches they teach (roster, grading queue, inactive students); admins see everything.

## Run the portal on this computer

```bash
npm install
npm run dev
```

Then open http://127.0.0.1:5173/portal/ (the website is at http://127.0.0.1:5173/). The local server starts with demo data
dated around today. Demo sign-ins are listed in `server/demo-accounts.mjs`; they exist only on this computer.

## Tests

```bash
npm test                # every suite (database, server, browser) three times in a row: required before each commit
npm run test:once       # every suite once
npm run test:db         # database rules only
npm run test:server     # local API only
npm run test:e2e        # portal in Microsoft Edge only
npm run test:sabotage   # breaks each security rule on purpose and checks the tests catch it
```

Browser screenshots from the layout tests are saved in `test-results/screens/`.
