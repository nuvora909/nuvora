# Nuvora admin guide

This guide covers the admin area of the Nuvora portal: what it does, where to find it, and how to do the
everyday jobs, step by step. You don't need to write code to follow it.

The admin area is open only to accounts with the **admin** role. Students and instructors never see it, and
they can't open it by typing the address either. The database checks the role again on every request, so
changing the browser can't get anyone in.

## Where it is

- **On this computer (local test version):** start it with `npm run dev`, or ask Claude Code to start it, then
  open **http://127.0.0.1:5173/portal/**. It runs only on your machine, the data is demo data, and everything
  resets when it restarts. A yellow stripe at the top says so.
- **Later, on the live site:** the same portal at **/portal/** on Nuvora's web address (for example
  `https://<your domain>/portal/`).

After you sign in as an admin, the portal opens on the **Overview** page. The menu on the left (on a phone, the
row of links at the top) has two groups:

- **Admin:** Overview, Students, Batches, Staff, Seat requests, Materials.
- **Teaching:** the instructor pages (Teaching, Grading). Admins can see every batch there.

## Signing in

### On this computer, with the demo admin

The demo accounts are listed in `server/demo-accounts.mjs` in the project folder. Use the one marked **admin**
(Nuvora Admin). The shared demo password is in the same file. These accounts exist only in the local test
version: they are never created on the live site.

On the sign-in page, **Keep me signed in on this device** starts unticked. Leave it unticked on a shared
computer, so you're signed out when the tab closes.

### On the live site, with your own account (hosted Supabase)

1. Open the live portal's **/portal/** page and create an account with your own email (**Create an account**).
   Confirm the email if Supabase asks you to.
2. Open your project in the Supabase dashboard (https://supabase.com/dashboard), then **SQL Editor** in the
   left menu, then **New query**.
3. Paste this one line, put your own email between the quotes, and press **Run**:

   ```sql
   update public.profiles set role = 'admin' where email = 'you@example.com';
   ```

   It should say "1 row affected". If it says 0, the email doesn't match the account exactly.
4. Sign out of the portal and sign in again. You now land on the admin Overview.

You only need the SQL Editor once. After that, make other people admins or instructors from the **Staff** page
(below).

## The 30-day tuition rule

Tuition is paid one term (12 weeks) at a time. This is what students are told, word for word:

> Tuition is paid one term at a time. If a term isn't paid, your portal access continues for 30 days from the
> start of that term (or from when you enrolled, if later), then pauses until payment is recorded. Nuvora can
> also pause or restore access manually, and you'll get reminders 7 days and 1 day before a pause.

What that means for you:

- **Automatic (the normal setting).** A student can use the portal (lessons, PDFs, live-class links,
  assignments, recordings) while the term is paid, or for 30 days after the term started (or after they
  enrolled, if that's later). The database works this out with its own clock every time someone opens a page,
  so a pause happens on time even if nobody is signed in.
- **When 30 days pass without a payment, access pauses by itself.** The student then sees a calm page that
  explains what happened, since when and what to do, instead of errors. The student is notified, and so is
  every admin. Students also get reminders 7 days and 1 day before, and a banner in the portal during the last
  7 days.
- **Recording a payment opens access again at once.** One recorded payment marks the term as paid.
- **You can override the rule at any time** for one student and term: Stop access, Start access, or Return to
  automatic (see below). Every admin action is written to an audit log, with who did it and when.

The access states you'll see on the pages:

| state | meaning |
|---|---|
| Paid | the term is paid; access is open |
| Grace period · N days left | not paid yet, still inside the 30 days |
| Stopped · unpaid | the 30 days are over without a payment |
| Stopped by admin | an admin stopped access |
| Started by admin | an admin opened access, whatever the payment (until an end date, or until changed) |
| Closed | the enrollment is reserved, paused or withdrawn, so nothing opens |

## Daily tasks

### See what needs attention (Overview)

Open **Overview**. The tiles count students by access state (paid, in grace, pausing within 7 days, stopped).
Click a tile to open the student list already filtered to it (for example, **Pausing within 7 days** lists
exactly the students whose access pauses in the next 7 days, soonest first). Below are two lists: **In the grace period**
(soonest pause first) and **Access stopped** (most recent first). Click a name to open that student.

### Find a student (the student database)

1. Open **Students**. There is one row per student and program, with their program and batch, enrollment
   status, payment, access (with days left) and when they were last active.
2. Type part of a name or email in **Search name or email** and press **Search** (or Enter).
3. Narrow it down with **Program**, **Enrollment**, **Payment** and **Access**; the list updates as soon as you
   pick. **Sort by** and **Order** change the order. **Clear filters** shows everyone again.
4. 50 students show per page; use **Next** and **Previous** at the bottom.
5. Click a student's name to open their page.

### Stop a student's access

1. Open the student (Students, then their name).
2. In the box for the right program and term, press **Stop access**.
3. Write a short reason. Only admins see it; the student is told only that Nuvora paused their access.
4. Press **Stop access now**. Lessons, PDFs, live-class links, assignments and recordings close immediately.

### Start a student's access (for example, to give more time to pay)

1. Open the student and press **Start access** in the right box.
2. Optional: pick an **End date**. Access stays open until the end of that day; after it, the 30-day rule
   applies again. Leave it empty to keep access open until you change it.
3. Optional: add a private note (for example "Payment promised by bank transfer").
4. Press **Start access now**.

### Return to automatic

Press **Return to automatic** on the student's page to hand the decision back to the payment rule. If the term
is unpaid and its 30 days are over, access stops at once, and the message tells you the result.

### Record a payment

Payments are recorded by hand for now (bank transfer, cash, waiver or other). Card payments will be recorded
automatically once Razorpay is connected (Phase 4).

1. Open the student and press **Record payment** in the right box.
2. Check the **Amount (USD)** (it starts at the term's price), choose the **Method**, and type the bank or
   receipt **Reference** (each reference can be used once).
3. Set **Paid on** to the day the money arrived, add a note if useful, and press **Record payment**.
4. The payment appears under **Payments for this term**, and access opens straight away if it was stopped for
   non-payment.

**A mistake?** Press **Void** next to the payment and write why. Voided payments are never deleted: they stay
in the list, crossed out, with your reason. If it was the term's only payment and the 30 days are over, access
stops again.

The student's page also shows the **Access history** (every stop, restore and override, by whom and when) and
**Admin actions** (the audit log for that person).

### Create a batch

You do not need to create batches for the usual start dates: the database does it by itself. Every program
always has a batch ready for each of its next eight start dates (the first Monday of each month), and a
student's next-term batch is ready as soon as they are in the term before. Each batch comes with its classes,
project due dates and Jitsi links. Batches then move from scheduled to active to completed on their own dates.

When a student finishes a term (every lesson done and every project passed, or you mark the term completed),
their seat in the next term is reserved at once, and on that term's start date it opens by itself: you do not
need to activate it. The 30 days to pay for the new term count from its start date. To stop a seat opening (for
example, the student is taking a break), set it to **Paused** or **Withdrawn** before the start date.

What still needs you: enrolling new students and recording payments, assigning instructors to batches, and
handling seat requests. To add a batch for any other Monday or term:

1. Open **Batches**.
2. Under **Create a batch**, choose the **Program**, the **Term** (1 for new students) and the start date
   (**Starts on**, which must be a Monday).
3. Press **Create batch**. The new batch appears in the list below.

To change a batch, open **Edit capacity, status or live-class link** on its card: change the number of seats,
the status, or paste the Jitsi (or other) link for its live classes, then **Save changes**. The link is used for
every upcoming class of that batch. Students see it only from 15 minutes before each class until it ends.

### Assign an instructor

1. Make sure the person has an account and the instructor role (see **Staff** below).
2. Open **Batches** and find the batch.
3. Press **Assign an instructor** on its card, choose the person and their role (instructor, mentor or coach),
   then press **Assign**.
4. To remove someone, press **Unassign** next to their name and confirm.

### Change someone's role (Staff)

1. Ask the person to create an account first, with their own email.
2. Open **Staff**, type their email, choose **Instructor**, **Admin** or **Student**, press **Set role** and
   confirm.

Making someone a student removes them from every batch they teach. The last admin can't be removed.

### Upload a PDF

Only PDFs can be uploaded (up to 50 MB). Videos are never uploaded here and students can never download them.

1. Open **Materials** and choose the **Program** (and a **Term**, to shorten the list).
2. Under **Upload a PDF**, choose what to **Attach to**: a lesson, or a project.
3. Type the **Title students see** (for example "Lecture notes · Week 1").
4. Choose the file and press **Upload and attach**. Students of that term can download it at once.

If the file isn't a PDF, it's refused with a message saying so, and nothing is saved. To take a PDF away, press
**Remove** next to it and confirm: students stop seeing it and the file is deleted.

Every term's lessons and projects are in the **Attach to** list, even before the term has a batch, so you can
attach PDFs ahead of time.

### Handle seat requests

Requests from the website's "Request a seat" form arrive in **Seat requests**, newest first (every admin also
gets a notification for each new one).

1. Use **Status** at the top to show only new requests, for example.
2. On a request, change its **Status** (New, Contacted, Converted, Closed), add **Notes** for other admins, and
   press **Save**.
3. When the person is ready to join, press **Convert to enrollment**, check the start date (a Monday) and press
   **Enroll**. They need an account with the same email first; if they don't have one, the request says so.

### Export to a spreadsheet (CSV)

1. Open **Students** and set the filters you want (or none, for everyone).
2. Press **Export CSV**. A file named `nuvora-students-<date>.csv` downloads with every row of the current
   filter, not only the page you see.
3. Open it in Excel, Google Sheets or Numbers. Text that looks like a spreadsheet formula (for example a name
   starting with `=`) is saved as plain text, so a file can never run anything when opened.

## What lives elsewhere

| what | where |
|---|---|
| Website text, pages and sections | Ask Claude Code in this app to change them. |
| Lesson videos | VdoCipher, connected in Phase 3. |
| Card payments | Razorpay, connected in Phase 4. Until then, record payments by hand (above). |
| Raw database tables | The Supabase dashboard's **Table Editor**, after go-live. Prefer the admin area: it checks every change and writes the audit log; the Table Editor does neither. |
| Scheduled jobs (batches made ahead, statuses, the access check, class reminders) | They run by themselves every 10 minutes on hosted Supabase once it is live (see "Going live" below). The Overview shows when they last ran. |
| Website dates | The website rebuilds itself every day just after midnight New York time (GitHub Actions, `.github/workflows/daily-site.yml`), and every page also refreshes its dates in the visitor's browser. |

## Going live: the one-time date steps

Everything date-related runs by itself once these are done (Phase 5):

1. **Supabase:** after the migrations are pushed, open the SQL Editor and run
   `select jobname, schedule from cron.job;`. You should see `nuvora-clock` and `nuvora-clock-history`. If
   the list is empty or the table does not exist, enable **pg_cron** under Database > Extensions, then run
   `select public.schedule_clock();` once and check again.
2. **Cloudflare Pages:** in the Pages project, Settings > Builds > **Add deploy hook** (branch `main`), and copy
   its URL. In GitHub, nuvora909/nuvora > Settings > Secrets and variables > Actions > **New repository
   secret**, named `CLOUDFLARE_PAGES_DEPLOY_HOOK`, with that URL as its value. Keep the URL private: anyone who
   has it can start a build. Then run **Daily site rebuild** once by hand from the Actions tab to check it.
3. **Plan:** on the Supabase Free plan a project with no visitors for 7 days is paused, and a paused database
   runs no jobs. Use a paid plan from go-live, or keep the project active.

