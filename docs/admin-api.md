# Admin API

Everything the portal's admin area can call: the database functions (RPCs), the storage routes for PDF
uploads, and the rules behind them. Defined in `supabase/migrations/20261003000008_admin_access.sql`, tested
in `tests/db/tuition.test.mjs`, `tests/db/admin.test.mjs` and `tests/server/admin.test.mjs`.

## How to call

Every function is called the Supabase way, as the signed-in admin:

```
POST {supabaseUrl}/rest/v1/rpc/<function>
apikey: <anon key>
Authorization: Bearer <admin's access token>
Content-Type: application/json

{ "p_name": value, ... }        named arguments; leave out any argument that has a default
```

In the portal: `rpc('<function>', { p_name: value })` from `portal/js/api.js`.

- **Who may call:** every `admin_*` function starts with `require_admin()`. Students and instructors get
  `42501 Admins only` (HTTP 403); signed-out visitors get HTTP 401. Nothing here trusts the browser: roles,
  ids and times are checked in the database, and access is always decided with the database clock `now()`.
- **Errors** come back as `{ "code", "message", "details", "hint" }`. The `message` is written to be shown to
  the admin as is. Codes and HTTP statuses:

  | code | HTTP | meaning |
  |---|---|---|
  | `42501` | 403 | not an admin (or not allowed) |
  | `P0002` | 404 | the thing asked for does not exist |
  | `22023` | 400 | a value is not acceptable (the message says which and why) |
  | `22001` | 400 | text too long |
  | `23505` | 409 | already exists (duplicate payment reference, file already attached, ...) |
  | `23P01` | 409 | batch is full (from enrollment) |

- **Audit:** every admin function that changes something writes one entry to the audit log (who, action,
  target, details, when). Read-only functions write nothing. See `admin_audit_log`.
- Times are ISO 8601 strings with time zone (`2026-10-03T09:00:00+00:00`), dates are `YYYY-MM-DD`, money is a
  JSON number in US dollars (`1950.00`).

## The access rule for unpaid tuition

Tuition is paid per 12-week term. Each enrollment is one term (one batch), so a payment is recorded against
an enrollment.

1. **Automatic (default).** Portal access (lessons, PDFs, live-class join links, projects, recordings) is open
   while the term is **paid**, or while **fewer than 30 days** have passed since the term started, or since
   the enrollment was created if that is later (late joiners also get 30 days). The term starts at 00:00 on the
   batch's start date in the batch's time zone (India time).
2. At exactly 30 days without a payment, access **stops automatically**. This is computed by the database on
   every request with `now()`, so it happens on time even if no job runs. The hourly job `apply_access_rules()`
   also records the stop in the access history and notifies the student and every admin, and sends the student
   reminders 7 days and 1 day before the stop. Nothing is sent twice.
3. **A term counts as paid** as soon as one payment that is not voided is recorded for it, whatever the
   amount. Recording a payment restores access immediately; voiding the last payment removes it again (if the
   30 days are over). The term's list price (`tuition_usd`) and the total recorded (`paid_usd`) are shown so a
   balance is visible.
4. **Manual override** per enrollment, at any time: `off` ("Stop access", reason required, immediate), `on`
   ("Start access", optional end date; overrides the payment rule, e.g. to extend a deadline), `auto` ("Return
   to automatic"). When a manual start's end date passes, the payment rule applies again straight away and the
   hourly job switches the enrollment back to `auto`.
5. **Enrollment status still comes first.** Paused, withdrawn and reserved enrollments open nothing, whatever
   the payments or the manual setting. Completed terms stay open for review only while their own access is
   open **and** the program's current (active) term is open: when a student's current term is stopped, the
   earlier terms of that program pause too.

Public wording (website and student portal): "Tuition is paid one term at a time. If a term isn't paid, your
portal access continues for 30 days from the start of that term (or from when you enrolled, if later), then
pauses until payment is recorded. Nuvora can also pause or restore access manually, and you'll get reminders 7
days and 1 day before a pause."

### Access object

Returned wherever an enrollment's access is shown to admins (`admin_students`, `admin_student`,
`admin_set_access`, `admin_record_payment`, `admin_void_payment`):

```json
{
  "enrollment_id": "uuid",
  "state": "grace",
  "open": true,
  "mode": "auto",
  "until": null,
  "reason": null,
  "set_by": null,
  "set_at": null,
  "paid": false,
  "paid_usd": 0,
  "tuition_usd": 2450.00,
  "grace_started_at": "2026-09-14T18:30:00+00:00",
  "grace_ends_at": "2026-10-14T18:30:00+00:00",
  "ends_at": "2026-10-14T18:30:00+00:00",
  "days_left": 10
}
```

| field | meaning |
|---|---|
| `state` | `paid`, `grace` (unpaid, inside the 30 days), `stopped_unpaid` (30 days over), `stopped_manual` (mode `off`), `started_manual` (mode `on`, before its end date), `closed` (status is reserved, paused or withdrawn) |
| `open` | whether this enrollment's own rule is open (`paid`, `grace` or `started_manual`). For a completed term the program's current term must be open too (rule 5). |
| `mode`, `until`, `reason`, `set_by`, `set_at` | the manual setting; `set_by` is the admin's name (or email); `until` only with mode `on` |
| `paid`, `paid_usd`, `tuition_usd` | at least one payment not voided; their total; the program's price per term |
| `grace_started_at`, `grace_ends_at` | start of the 30 days (term start or enrollment, whichever is later) and its end |
| `ends_at` | when access will stop if nothing changes: the end of the 30 days, or for an unpaid manual start the later of its end date and the 30 days; `null` when nothing is due to stop (paid, open-ended manual start, already stopped or closed) |
| `days_left` | whole days until `ends_at`, rounded up; `null` when `ends_at` is `null` |

### Payment object

```json
{
  "id": "uuid",
  "enrollment_id": "uuid",
  "amount_usd": 1950.00,
  "method": "bank_transfer",
  "reference": "HDFC-829301",
  "note": "First term",
  "paid_on": "2026-09-10",
  "source": "admin",
  "recorded_by": "Nuvora Admin",
  "recorded_at": "2026-09-10T10:12:00+00:00",
  "voided": false,
  "voided_at": null,
  "voided_by": null,
  "void_reason": null
}
```

`method` is one of `bank_transfer`, `cash`, `waiver`, `other`. `source` is `admin` today (`razorpay` in
Phase 4). Payments are never deleted: a mistake is voided with a reason, and stays visible.

## Dashboard

### `admin_overview()`

Counts for the admin home, and the two lists that need attention.

```json
{
  "students": 9,
  "enrolled": 8,
  "active_enrollments": 8,
  "paid": 3,
  "in_grace": 2,
  "ending_soon": 0,
  "stopped_unpaid": 1,
  "stopped_manual": 1,
  "started_manual": 1,
  "reserved": 0,
  "paused": 0,
  "new_seat_requests": 2,
  "batches_running": 4,
  "grace": [
    { "enrollment_id": "uuid", "student_id": "uuid", "name": "Ines Duarte", "email": "ines.student@nuvora.test",
      "program_id": "ms-ds", "program": "M.S. Data Science & Analytics", "batch_id": "uuid", "batch_code": "MSDS-T1-2026-08",
      "term": 1, "state": "grace", "days_left": 10, "ends_at": "...", "since": null }
  ],
  "stopped": [
    { "...same fields...": "", "state": "stopped_unpaid", "days_left": null, "ends_at": null, "since": "2026-09-21T19:00:00+00:00" }
  ]
}
```

- `students`: accounts with the student role. `enrolled`: students with at least one active enrollment.
- `active_enrollments` is split by access state: `paid` + `in_grace` + `stopped_unpaid` + `stopped_manual` +
  `started_manual`. `ending_soon`: active enrollments whose access ends within 7 days.
- `reserved`, `paused`: enrollments with that status. `new_seat_requests`: seat requests with status `new`.
  `batches_running`: batches that are scheduled or active.
- `grace`: active enrollments in `grace`, soonest end first (at most 50). `stopped`: active enrollments whose
  access is stopped (`stopped_unpaid` or `stopped_manual`), most recent first (at most 50); `since` is when the
  stop was recorded in the access history (`null` until the hourly job or an admin action records it).

## Students database

### `admin_students(p_search, p_program, p_batch, p_status, p_payment, p_access, p_sort, p_desc, p_limit, p_offset)`

All arguments are optional.

| argument | type | default | meaning |
|---|---|---|---|
| `p_search` | text | null | part of the name or email (case-insensitive, at most 100 characters) |
| `p_program` | text | null | program id, e.g. `bs-aiml` |
| `p_batch` | uuid | null | only enrollments in this batch (one row per student of the batch, any status) |
| `p_status` | text | null | enrollment status: `active`, `reserved`, `paused`, `completed`, `withdrawn`, or `none` (signed up, never enrolled) |
| `p_payment` | text | null | `paid` or `unpaid` |
| `p_access` | text | null | a `state` (`paid`, `grace`, `stopped_unpaid`, `stopped_manual`, `started_manual`, `closed`), or `open` (any open state), `stopped` (either stopped state) or `ending_soon` (active, open, and pausing within 7 days: the same students the overview's `ending_soon` counts) |
| `p_sort` | text | `name` | `name`, `email`, `last_active`, `enrolled_at`, `days_left`, `program`, `batch`, `signed_up` |
| `p_desc` | boolean | false | sort descending (empty values always last) |
| `p_limit` | int | 50 | 1 to 200 |
| `p_offset` | int | 0 | rows to skip |

One row per student **and program**: the student's current enrollment in that program (active first, then
reserved, paused, completed, withdrawn; the latest term within each). A student in two programs has two rows;
a student who never enrolled has one row with the enrollment fields `null`. With `p_batch`, the row is the
student's enrollment in that batch. Rows include every account with the student role and anyone else who holds
an enrollment.

```json
{
  "total": 37,
  "limit": 50,
  "offset": 0,
  "rows": [
    {
      "student_id": "uuid", "name": "Maya Patel", "email": "maya.student@nuvora.test", "role": "student",
      "signed_up_at": "...", "last_active_at": "... or null",
      "enrollment_id": "uuid", "enrollment_status": "active", "enrolled_at": "...",
      "program_id": "bs-aiml", "program": "B.S. Artificial Intelligence & Machine Learning",
      "batch_id": "uuid", "batch_code": "BSAIML-T2-2026-09", "term": 2, "terms": 12, "term_title": "Mathematics for ML",
      "starts_on": "2026-09-07", "ends_on": "2026-11-29",
      "payment": "paid",
      "access": { "...access object..." }
    }
  ]
}
```

`payment` is `paid`, `unpaid`, or `null` without an enrollment; `access` is `null` without an enrollment.
Errors: `22023` for an unknown filter or sort value, a limit outside 1-200, a negative offset or a search
longer than 100 characters.

### `admin_student(p_student uuid)`

Everything about one student. `P0002 Unknown student` if there is no such account.

```json
{
  "profile": { "id": "uuid", "name": "Maya Patel", "email": "...", "role": "student",
               "signed_up_at": "...", "last_active_at": "...", "goal_role": "ml-engineer" },
  "enrollments": [
    { "id": "uuid", "program_id": "bs-aiml", "program": "B.S. ...", "status": "active", "source": "progression",
      "enrolled_at": "...", "updated_at": "...",
      "batch": { "id": "uuid", "code": "BSAIML-T2-2026-09", "term": 2, "term_title": "Mathematics for ML",
                 "starts_on": "2026-09-07", "ends_on": "2026-11-29", "status": "active" },
      "access": { "...access object..." },
      "payments": [ { "...payment object..." } ] }
  ],
  "access_history": [
    { "id": "uuid", "enrollment_id": "uuid", "batch_code": "...", "kind": "stopped", "state": "stopped_unpaid",
      "reason": null, "until": null, "actor": null, "created_at": "..." }
  ],
  "audit": [ { "...audit entry (see admin_audit_log)..." } ],
  "seat_requests": [ { "...seat request object (see admin_seat_requests)..." } ]
}
```

- `enrollments`: newest term first. `payments` inside each: newest first, voided ones included.
- `access_history`: newest first (at most 200). `kind`: `stopped` or `restored` (the effective access changed;
  `state` is the new state), `mode_off`, `mode_on`, `mode_auto` (an admin changed the manual setting, or the
  job ended a manual start; `reason` and `until` as given). `actor` is the admin's name, or `null` for the
  hourly job.
- `audit`: entries about this person, newest first (at most 200).
- `seat_requests`: requests made from the website with the same email.

## Access and payments

### `admin_set_access(p_enrollment uuid, p_mode text, p_reason text default null, p_until timestamptz default null)`

| `p_mode` | effect |
|---|---|
| `off` | Stop access now. `p_reason` required (1-500 characters). `p_until` must be left out. |
| `on` | Start access now, overriding the payment rule. `p_until` optional: a future time (at most 366 days ahead) when the manual start ends; `null` means until changed. `p_reason` optional. |
| `auto` | Return to the automatic rule. `p_reason` optional (kept in the history and audit log). |

Returns the access object. Takes effect immediately; the change is written to the access history and the audit
log, and if the student's access actually opens or closes, the student is notified once (`access_stopped` or
`access_restored`). Errors: `P0002 Unknown enrollment`; `22023` for an unknown mode, a missing reason for
`off`, an end date in the past, too far ahead or given with `off`/`auto`; `22001` for a reason over 500
characters.

### `admin_record_payment(p_enrollment uuid, p_amount_usd numeric, p_method text, p_reference text default null, p_note text default null, p_paid_on date default null)`

Records a payment for the enrollment's term. `p_amount_usd`: more than 0 and at most 100000 (a `waiver` may be
0), at most 2 decimals. `p_reference`: the bank or receipt reference, 1-100 characters, unique among payments
that are not voided (case-insensitive). `p_note`: up to 1000 characters. `p_paid_on`: the day the money
arrived, default today in India time, not in the future.

```json
{ "payment": { "...payment object..." }, "access": { "...access object..." } }
```

Access opens immediately if the term was stopped for non-payment (the student gets `access_restored`).
Errors: `P0002 Unknown enrollment`; `22023` for the amount, method or date; `23505 A payment with reference X
is already recorded`; `22001` for a long note or reference.

### `admin_void_payment(p_payment uuid, p_reason text)`

Voids a payment (it stays in the ledger, marked voided). `p_reason` required, 1-500 characters. Returns the
same `{ payment, access }` shape. If that was the term's only payment and the 30 days are over, access stops
immediately (the student gets `access_stopped`). Errors: `P0002 Unknown payment`; `22023 This payment is
already voided` or a missing reason.

## Batches

### `admin_batches(p_status text default null, p_program text default null)`

`p_status`: `null` = scheduled and active batches; `all`; or one of `scheduled`, `active`, `completed`,
`cancelled`. Newest start first.

```json
[
  { "id": "uuid", "code": "BSAIML-T2-2026-09", "program_id": "bs-aiml", "program": "B.S. ...", "term": 2,
    "term_title": "Mathematics for ML", "starts_on": "2026-09-07", "ends_on": "2026-11-29", "status": "active",
    "timezone": "Asia/Kolkata", "capacity": 60,
    "enrolled": { "active": 2, "reserved": 0, "paused": 0, "completed": 0, "withdrawn": 0 },
    "seats_taken": 2, "seats_left": 58,
    "instructors": [ { "id": "uuid", "name": "Elena Ruiz", "email": "...", "role": "instructor" } ],
    "sessions": { "total": 24, "upcoming": 13, "upcoming_with_link": 13 },
    "next_session": { "id": "uuid", "title": "Live class · Week 5 · ...", "starts_at": "...", "join_url": "https://Jitsi.us/j/..." } }
]
```

`seats_taken` counts active and reserved enrollments (both hold a seat). `join_url` is shown to admins only.

### `admin_update_batch(p_batch uuid, p_capacity int default null, p_status text default null, p_join_url text default null)`

Changes only what is given (`null` keeps the current value). Returns the batch object above.

- `p_capacity`: 1 to 500, and not below `seats_taken`.
- `p_status`: `scheduled`, `active`, `completed` or `cancelled`. The daily job still moves scheduled batches to
  active and active ones to completed by date; it never touches a cancelled batch.
- `p_join_url`: the live-class link (e.g. a recurring Jitsi meeting) for **every upcoming class and office hour**
  of the batch (not ended or cancelled). Must start with `https://`, at most 500 characters, no spaces. An empty
  string removes the links. Students still get a link only from 15 minutes before each class until it ends.

Errors: `P0002 Unknown batch`; `22023` with the reason.

Creating a batch: `admin_create_batch(p_program text, p_starts_on date, p_term int default 1)` returns the new
batch id (an existing batch for that program, term and Monday is returned unchanged). The start must be a
Monday. Enrolling a student by email: `admin_enroll(p_email text, p_program text, p_starts_on date default null)`
(term 1 of the batch starting on that date; default: the next start still open). Moving a student:
`admin_transfer(p_enrollment uuid, p_new_batch uuid)` (same program and term). Changing an enrollment's status:
`admin_set_enrollment_status(p_enrollment uuid, p_status text)` (`active`, `reserved`, `paused`, `completed`,
`withdrawn`). These four existed before; they now also write the audit log.

## Staff

### `admin_staff()`

Instructors and admins, admins first, then by name.

```json
[ { "id": "uuid", "name": "Elena Ruiz", "email": "elena.instructor@nuvora.test", "role": "instructor",
    "batches": [ { "id": "uuid", "code": "BSAIML-T2-2026-09", "role": "instructor", "status": "active" } ] } ]
```

### `admin_set_role_by_email(p_email text, p_role text)`

`p_role`: `student`, `instructor` or `admin`. Returns `{ "id", "email", "name", "role" }`. The person must have
signed up first. Making someone a student also removes them from every batch they were assigned to. Errors:
`P0002 No account with email X`; `22023 Invalid role`; `22023 At least one admin must remain` (the last admin
cannot be demoted). `admin_set_role(p_user uuid, p_role text)` does the same by id (returns nothing).

### `admin_assign_staff(p_batch uuid, p_user uuid, p_role text default 'instructor')`

Assigns a person to teach a batch (`instructor`, `mentor` or `coach`; assigning again changes the role).
The person must have the instructor or admin role. Returns nothing. Errors: `P0002 Unknown batch` or `Unknown
user`; `22023 Make this person an instructor first` or an invalid role.

### `admin_unassign_staff(p_batch uuid, p_user uuid)`

Removes the assignment. Returns nothing. `P0002 This person does not teach that batch`.

## Seat requests

### `admin_seat_requests(p_status text default null)`

Newest first, at most 500, optionally one status (`new`, `contacted`, `converted`, `closed`):

```json
[ { "id": "uuid", "reference": "NV-7KQ2MX", "program": "ms-ds", "program_name": "M.S. ...",
    "start_date": "2026-11-02", "apply_by": "2026-10-26", "full_name": "...", "email": "...", "phone": "... or null",
    "country": "India", "details": { "role": "..." }, "source": "/programs/...", "consent_version": "privacy-2026-10",
    "consented_at": "...", "status": "new", "notes": null, "handled_by": "admin name or null",
    "account_id": "uuid of the account with this email, or null",
    "created_at": "...", "updated_at": "..." } ]
```

The reference is for admins only: the website never shows it.

### `admin_update_seat_request(p_id uuid, p_status text, p_notes text default null)`

Sets the status and (if given) the notes, up to 2000 characters; `null` keeps the notes. Returns the request.

### `admin_convert_seat_request(p_id uuid, p_starts_on date default null)`

Enrolls the person who made the request: their account (same email) joins term 1 of the program, in the batch
starting on `p_starts_on` (default: the requested start). The request becomes `converted`. Returns
`{ "enrollment_id": "uuid", "request": { ...seat request... } }`. Errors: `P0002 Unknown seat request`;
`P0002 No account with email X yet. Ask them to sign up first.`; `22023 This request is already converted`;
and the enrollment errors (`23P01` batch full, `22023` batch closed or not a Monday, `23505` already actively
enrolled in that program).

### What the website gets: `request_seat(...)` (changed)

Unchanged arguments and checks, but every accepted request, new or a repeat, returns exactly

```json
{ "ok": true }
```

No reference, no sign of an earlier request. A repeat (same email, program and start within 30 days) stores
nothing. A sixth request from the same email within 24 hours also returns `{ "ok": true }` and is not stored
(an error there would reveal earlier requests); admins already have the earlier ones. Validation errors still
come back as `22023` with a message the website can show.

## PDF materials

Files live in the private `course-files` storage bucket: PDF only (`application/pdf`), at most 50 MB
(52428800 bytes). Only admins can upload or delete; students download through short-lived signed links only
for terms they can open. Videos are never stored here and never downloadable.

**Path rule:** `<program id>/<folders and name>.pdf`, letters, digits, `/ _ . -` only, lowercase `.pdf`, no
`..`, at most 300 characters, and the first folder must be a program id. Suggested:
`bs-aiml/lessons/prg-101/notes-week1.pdf`, `bs-aiml/assignments/<template id>/brief.pdf`. A file name cannot be
reused while the file exists; upload under a new name instead of replacing.

Steps to add a PDF:

1. Upload the file (admin's token):
   ```
   POST {supabaseUrl}/storage/v1/object/course-files/<path>
   apikey: <anon key>
   Authorization: Bearer <admin's access token>
   Content-Type: application/pdf
   <the file's bytes>
   ```
   Send the file's raw bytes as the body (with `fetch`: `body: file`, where `file` is the `File` from the file
   input), not a multipart form. With supabase-js, pass the bytes rather than the `File` (supabase-js turns a
   `File` into a multipart form, which the local server does not accept):
   `storage.from('course-files').upload(path, await file.arrayBuffer(), { contentType: 'application/pdf' })`.
   Check the type and size in the browser first (`file.type === 'application/pdf'`, `file.size <= 52428800`)
   for a quick message; the server checks again.
   Success: HTTP 200 `{ "Key": "course-files/<path>", "Id": "uuid" }`. Refusals:
   `415 { "statusCode": "415", "error": "invalid_mime_type", "message": "mime type text/plain is not supported" }`,
   `413 { "statusCode": "413", "error": "Payload too large", "message": "The object exceeded the maximum allowed size" }`,
   `409 { "statusCode": "409", "error": "Duplicate", "message": "The resource already exists" }`,
   `403 { "statusCode": "403", "error": "Unauthorized", "message": "new row violates row-level security policy" }`
   (not an admin, or the path breaks the path rule), `401` without the API key, `404` for an unknown bucket.
   The local server also refuses a file that does not start with `%PDF-`
   (`415 { "statusCode": "415", "error": "invalid_pdf", "message": "The file is not a PDF" }`); hosted Supabase
   checks the type and size only.
2. Attach it with `admin_add_material` below. Until then it is listed under `unattached_files`.

To remove: `admin_remove_material`, then delete the file:
```
DELETE {supabaseUrl}/storage/v1/object/course-files
{ "prefixes": ["<path>"] }
```
(supabase-js `storage.from('course-files').remove([path])`). Returns HTTP 200 with the deleted objects
(`[{ "id": "uuid", "name": "<path>", "bucket_id": "course-files", "metadata": { "mimetype": "application/pdf", "size": 182000 }, ... }]`).
Files that are still attached to a material, do not exist, or that the caller may not delete are skipped
silently, so check that your path is in the list (an empty list means nothing was deleted).

Downloading (admins can download any course file, attached or not, to check it): the same signed links as
students, `POST {supabaseUrl}/storage/v1/object/sign/course-files/<path>` with `{ "expiresIn": 60 }` returns
`{ "signedURL": "/object/sign/course-files/<path>?token=..." }`; open `{supabaseUrl}/storage/v1<signedURL>`.

**Always ask for a short link (60 seconds).** The access rule is checked when the link is made, not when it is
opened: a link made while access is open keeps working until it expires, even after the access stops, and it
needs no sign-in, so it can be passed on. Hosted Supabase Storage puts no maximum on `expiresIn`, so the portal
must keep asking for 60 seconds (tests/server/guardrails.test.mjs checks this). The local server never signs for
more than an hour, and tests/server/admin.test.mjs checks that after a stop no new link is given and the old one
runs out. Before go-live (Phase 5), consider serving course PDFs through an Edge Function that runs
`can_read_material` again on every download and streams the file.

### `admin_materials(p_program text)`

```json
{
  "materials": [
    { "id": "uuid", "program_id": "bs-aiml", "title": "Lecture notes", "file_path": "bs-aiml/lessons/prg-101/notes.pdf",
      "size_bytes": 182000, "position": 1, "created_at": "...",
      "lesson": { "id": "uuid", "code": "PRG-101", "title": "...", "term": 1 },
      "assignment": null }
  ],
  "unattached_files": [ { "name": "bs-aiml/lessons/prg-101/draft.pdf", "size_bytes": 50213, "created_at": "..." } ]
}
```

`materials` in term, lesson/project and position order; `assignment` is `{ "id", "title", "term" }` for a
project brief (an assignment template). `P0002 Unknown program`.

### `admin_program_outline(p_program text)`

Every term of the program with its lessons and projects, whether or not the term has a batch yet, so PDFs can
be attached ahead of time. The Materials page builds its "Attach to" list from it.

```json
{
  "terms": [
    { "term": 1, "title": "Foundations",
      "lessons": [ { "id": "uuid", "code": "PRG-101", "title": "..." } ],
      "projects": [ { "id": "uuid", "title": "..." } ] }
  ]
}
```

Terms in order; lessons in course order; projects by due day, then title. `P0002 Unknown program`.

### `admin_add_material(p_file_path text, p_title text, p_lesson uuid default null, p_assignment_template uuid default null, p_position int default null)`

Attaches an uploaded PDF to exactly one lesson or one assignment template (project) of the file's program.
`p_title`: 1-120 characters. `p_position`: display order (default: after the existing files). Returns the
material object above. Errors: `22023 Attach the PDF to one lesson or one project` (none or both given);
`P0002 Unknown lesson` / `Unknown project`; `22023 The file must be a PDF in the <program>/ folder` (path rule,
or the lesson belongs to another program); `22023 Upload the file first` (no such file in storage); `22023 Only
PDF files up to 50 MB can be attached`; `23505 This file is already attached`.

### `admin_remove_material(p_material uuid)`

Detaches the PDF (students stop seeing it at once). Returns `{ "id": "uuid", "file_path": "..." }` so the file
can then be deleted from storage. `P0002 Unknown material`.

## Audit log

### `admin_audit_log(p_limit int default 100, p_before timestamptz default null, p_person uuid default null)`

Newest first. `p_limit` 1-500. `p_before`: only entries older than this (for paging: pass the last entry's
`created_at`). `p_person`: only entries about that person.

```json
[ { "id": "uuid", "created_at": "...", "actor_id": "uuid", "actor": "Nuvora Admin", "actor_email": "admin@nuvora.test",
    "action": "payment.record", "target_type": "payment", "target_id": "uuid",
    "person_id": "uuid", "person": "Maya Patel",
    "details": { "enrollment_id": "uuid", "amount_usd": 1950, "method": "bank_transfer", "reference": "..." } } ]
```

Actions: `access.set`, `payment.record`, `payment.void`, `batch.create`, `batch.update`, `enrollment.create`,
`enrollment.transfer`, `enrollment.status`, `staff.assign`, `staff.unassign`, `user.role`,
`seat_request.update`, `seat_request.convert`, `material.add`, `material.remove`. The log cannot be changed or
deleted through the API.

## What students see (for the student portal)

`my_dashboard()` has a new key `access`, one item per **active** enrollment of the caller (including ones whose
access is stopped, which are left out of `batches`):

```json
"access": [ { "enrollment_id": "uuid", "batch_id": "uuid", "code": "BSAIML-T2-2026-09", "program_id": "bs-aiml",
              "program": "B.S. ...", "term": 2, "state": "grace", "open": true, "paid": false,
              "ends_at": "...", "days_left": 10 } ]
```

Same `state` values as the access object; no admin reason or names. When a batch is in `access` with
`open: false`, the portal should explain the pause (state `stopped_unpaid`: "paused until your payment is
recorded"; `stopped_manual`: "paused by Nuvora") instead of the "not enrolled" page. Every student page
(`my_course`, `my_lesson`, `my_sessions`, `my_assignments`, `my_home`), progress tracking, submissions and PDF
links refuse a stopped enrollment exactly as they refuse a paused one ("Batch not found", "Lesson not found",
"Not enrolled ..."; `submit_assignment` says "Your portal access to this program is paused").

Notifications the student can receive: `access_reminder_7d`, `access_reminder_1d`, `access_stopped`,
`access_restored`. Admins receive `access_stopped` for each stop for non-payment (title "Access stopped:
<name>"; also when voiding a payment causes it), not for a manual stop, besides `seat_request`. The student's
`access_stopped` message never includes the admin's reason.

## The hourly job

`apply_access_rules()` (service role and scheduler only, no arguments) returns

```json
{ "starts_ended": 0, "stopped": 1, "restored": 0, "reminders_7d": 2, "reminders_1d": 0 }
```

1. Manual starts whose end date has passed go back to `auto` (history: `mode_auto`, "Manual start ended").
2. Every active enrollment whose access opened or closed since it was last recorded gets one `stopped` or
   `restored` entry and its notifications.
3. Reminders: 7 days before `ends_at` (`access_reminder_7d`) and 1 day before (`access_reminder_1d`, sent
   instead of the 7-day one when less than a day is left). One of each per end date; a new end date (for
   example a manual start) gets its own reminders.

Running it again changes nothing and sends nothing. Like `update_batch_statuses` (daily) and
`queue_session_reminders` (hourly), it is not scheduled from this repository yet. On hosted Supabase, enable
the `pg_cron` extension and schedule the jobs, for example:

```sql
select cron.schedule('nuvora-access-rules',   '5 * * * *',  $$select public.apply_access_rules()$$);
select cron.schedule('nuvora-class-reminders', '0 * * * *',  $$select public.queue_session_reminders(24)$$);
select cron.schedule('nuvora-batch-statuses', '30 18 * * *', $$select public.update_batch_statuses((now() at time zone 'Asia/Kolkata')::date)$$);
select cron.schedule('nuvora-monthly-batches', '0 19 1 * *', $$select public.create_monthly_batches()$$);
```

The local dev server does not run jobs; it runs `apply_access_rules()` once when it loads the demo data.

## Local demo data (`npm run dev`)

Sign-ins are in `server/demo-accounts.mjs`.

| account | situation |
|---|---|
| Maya (`student`), Leo (`classmate`) | B.S. AI & ML term 2; term 1 and term 2 paid |
| Sara (`nextBatch`) | starts term 1 next month; unpaid, in grace (her 30 days start when the term starts) |
| Omar (`otherProgram`) | M.S. Data Science term 1 (current batch); paid (one earlier payment voided: wrong amount) |
| Lucas (`stopped`) | Omar's batch, stopped manually by an admin (reason recorded) |
| Ines (`grace`) | the earlier M.S. batch (started six to ten weeks ago), joined 20 days ago, unpaid: in grace, 10 days left |
| Kenji (`lapsed`) | the earlier M.S. batch, unpaid for more than 30 days: stopped automatically (the job ran when the demo loaded) |
| Amara (`extended`) | the earlier M.S. batch, unpaid past 30 days, but started manually until 14 days from today |
| Nia (`newcomer`) | signed up, not enrolled; has a seat request (`new`) an admin can convert |

Seat requests: Nia's and one other `new`, one `contacted` (with notes), one `closed`. Payments use placeholder
references (`DEMO-BT-...`). Admins: `admin` (Nuvora Admin). Instructors: Elena teaches Maya's batches; Kofi the
other three (including the earlier M.S. batch).

