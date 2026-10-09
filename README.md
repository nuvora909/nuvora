# Nuvora

Online Data Science and AI/ML school: public website, student portal, database and automation.

## Folders

| Folder | What it holds |
|---|---|
| `web/` | The public website: pages (`pages/`), layout and components (`lib/`), facts and certifications (`data/`), CSS and browser scripts (`assets/`), images, videos and fonts (`static/`). `scripts/build-site.mjs` builds it into static pages |
| `portal/` | The student and instructor portal (plain HTML, CSS and JavaScript modules; no build step) |
| `supabase/migrations/` | Database tables, security rules, storage rules and all server-side logic |
| `supabase/seed.sql` | Programs, modules, lessons and the weekly live-class pattern (generated, do not edit by hand) |
| `scripts/` | `catalog.mjs` is the source of truth for programs; `build-seed.mjs` turns it into `seed.sql`; `build-site.mjs` builds the website |
| `server/` | Local stand-in for Supabase (database, sign-in, API, PDF storage) used for development and tests |
| `tests/` | Automated tests: `db/` (database rules), `server/` (API), `site/` (website build and content), `e2e/` (website and portal in Microsoft Edge) |
| `docs/` | `admin-guide.md` (how the owner runs Nuvora day to day), `admin-api.md` (every admin database function) |
| `design/` | Logo concepts |

## How it works

- A new batch of every active program starts on the **first Monday of each month**. Applications close 7 days before.
- Creating a batch copies the program's templates into dated classes (Tuesday live class and Thursday office hours at 19:00 US Eastern Time, for 12 weeks) and assignment due dates.
- A student sees a batch only while their enrollment in it is **active** and the access rule below lets them in. Pausing, withdrawing, transferring or stopping access changes what they see immediately.
- Jitsi links are handed out only from 15 minutes before a class until it ends, judged by the server's clock.
- Watch time counts only the parts of a video actually played. A lesson counts as complete at 90%.
- **Videos are never downloadable.** Lesson and assessment **PDFs are**: they sit in a private, PDF-only storage bucket, and each download uses a link that works for 60 seconds, issued only to students enrolled in that program and term.
- Assignments use a mastery rubric. *Distinguished* or *Proficient* passes; *Basic* or *Not yet* asks for a resubmission.
- Instructors see only the batches they teach (roster, grading queue, inactive students); admins see everything.

### Programs are sequences of 12-week terms

- Bachelor's programs have 12 terms, Master's 4, certificates 1 (`TERMS` in `scripts/catalog.mjs`). Each term has four lessons, three graded projects (due on days 18, 46 and 81) and a skill badge.
- Every batch is one term of one program. Its code names the term: `BSAIML-T2-2026-11`. New students start in term 1; the monthly job creates the term-1 batches.
- A student sees and tracks the lessons and PDFs of a term only while they hold an **active or completed** enrollment in that term. Completed terms stay open for review; later terms stay closed.
- A term is **completed** when its batch has ended and the student has completed every lesson of the term and passed every project of the batch, or when an admin marks the enrollment completed. Students who finish late are picked up on a later day.
- The daily job (`update_batch_statuses`) then **reserves a seat** in the next term's batch (created if needed, on the first first-Monday after the batch ended, never in the past) and notifies the student: "Term 2: … starts …. Your seat is reserved." A reserved seat opens nothing until it is made active (by an admin today, by the term payment later). Running the job again never reserves twice. Completing the final term completes the program.

### Tuition, payments and the 30-day rule

- Tuition is paid one term at a time. Admins record payments in the portal for now (bank transfer, cash, waiver or other); Razorpay will record them automatically in Phase 4. Payments are voided, never deleted.
- **Automatic rule:** access is open while the current term is paid, or for 30 days from the start of an unpaid term (or from enrolment, if later). After that it **stops automatically**: the database decides with its own clock on every request, never the browser's.
- **Manual control:** an admin can **stop** access at any time (with a reason), **start** it (optionally until a date, overriding the payment rule) or **return it to automatic**. Recording a payment restores access at once.
- The hourly job `apply_access_rules()` writes each stop and restore to the access history and sends reminders 7 days and 1 day before a stop. It never sends the same notice twice.
- Every admin action is written to an audit log. Function by function, the details are in `docs/admin-api.md`.

### The admin area

Admins see an **Admin** section in the portal: an overview, the student database (search, filters, CSV export), each student's record with access and payment controls, batches, staff roles, seat requests and PDF uploads. Students and instructors can neither see nor call any of it. How to use it, step by step: `docs/admin-guide.md`.

### Seat requests from the website

- The website's "Request a seat" form calls `request_seat` with the public key (`POST /rest/v1/rpc/request_seat`). It answers `{"ok": true}` for every accepted request, new or repeated, so nobody can find out whether an email address asked before. Nuvora replies by email.
- Every field is checked in the database (program, start date, name, email, country, phone, consent and its wording version, finder answers, source). A refusal comes back as HTTP 400 with a message the website can show.
- The same email, program and start within 30 days stores nothing new. Each email can make at most 5 new requests in 24 hours; extra ones are quietly not stored.
- Requests are stored in `seat_requests`, which no visitor, student or instructor can read. Every admin gets a portal notification for each new request; admins list, update and convert requests into enrolments in the admin area.

### The student home: learning path, goals, streaks and achievements

- One call, `my_home`, gives the home page everything: the whole-program and current-term progress rings, the term-by-term path, the next best action (in a fixed order: work to revise or past due, a live class within 24 hours, the lesson in progress, the next lesson, work due within a week, a gap for the student's goal, or "all caught up"), today's targets, the streak, achievements, term skill badges and the skills for the student's career goal.
- Goals come from the website's career roles (`web/data/careers.mjs`). Each skill points to the lesson that teaches it: *mastered* when that lesson is complete and its project passed; otherwise *needs work*, *in progress*, *not started*, or *not in your program* (with the programs that teach it). Students choose a goal in Profile; until then the first role suggested for their program is used.
- Learning days are recorded only from verified events: newly watched parts of a video, completed lessons, submitted projects and attended classes (in US Eastern Time). A streak allows single rest days but never two missed days in a row, and can be switched off in Profile (then it is not even sent to the browser).
- Achievements and badges are derived from stored results only (first lesson, first project passed, distinguished work, revised to mastery, a full week of classes, 7- and 30-day streaks, each term, the program). Each one earned sends exactly one notification. There are no points, leaderboards or rankings; the rules are written at the top of the home page code and the learning-path migration.

## Run the website and portal on this computer

```bash
npm install
npm run dev
```

Then open http://127.0.0.1:5173/portal/ (the website is at http://127.0.0.1:5173/). The local server starts with demo data
dated around today. Demo sign-ins are listed in `server/demo-accounts.mjs`; they exist only on this computer.

## Tests

```bash
npm test                # every suite (database, server, website, browser) three times in a row: required before each commit
npm run test:once       # every suite once
npm run test:db         # database rules only
npm run test:server     # local API only
npm run test:site       # website build and content only
npm run test:e2e        # website and portal in Microsoft Edge only
npm run test:sabotage   # breaks each security rule on purpose and checks the tests catch it
```

Browser screenshots from the layout tests are saved in `test-results/screens/`. The browser tests start their own
server on port 5199; set `NUVORA_E2E_PORT` to use another port (for example when a second copy of the tests is running).
`node tests/sabotage.mjs terms` runs only the sabotage cases checked by one test file (here `tests/db/terms.test.mjs`).
