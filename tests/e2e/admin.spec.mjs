// The admin area: who can reach it, the student database, the tuition access rule end to end (stop, start,
// the automatic 30-day stop, payments), batches, instructors, PDF uploads, seat requests and the CSV export.
// Dates are moved in the database through the test SQL endpoint; the browser clock is never faked, because
// access is decided by the database's now().
import { test, expect } from './fixtures.mjs';
import { reset, sql, one, loginAs, switchTo, watchErrors, ACCOUNTS } from './helpers.mjs';

let demo;
test.beforeEach(async ({ request }) => { demo = await reset(request); });

/** Calls a database function with the signed-in user's own token, as the portal does. Returns [status, body]. */
const api = (page, fn, args = {}) => page.evaluate(async ([f, a]) => {
  const s = JSON.parse(localStorage.getItem('nuvora.session') ?? sessionStorage.getItem('nuvora.session'));
  const r = await fetch(`/rest/v1/rpc/${f}`, { method: 'POST', body: JSON.stringify(a),
    headers: { apikey: window.NUVORA_CONFIG.anonKey, Authorization: `Bearer ${s.access_token}`, 'Content-Type': 'application/json' } });
  return [r.status, await r.json().catch(() => null)];
}, [fn, args]);

/** Asks the storage server for a signed PDF link as the signed-in user; 200 means the PDF can be downloaded. */
const pdfStatus = (page, path) => page.evaluate(async (p) => {
  const s = JSON.parse(localStorage.getItem('nuvora.session') ?? sessionStorage.getItem('nuvora.session'));
  const r = await fetch(`/storage/v1/object/sign/course-files/${p}`, { method: 'POST', body: '{"expiresIn":60}',
    headers: { apikey: window.NUVORA_CONFIG.anonKey, Authorization: `Bearer ${s.access_token}`, 'Content-Type': 'application/json' } });
  return r.status;
}, path);

const toastText = (page) => page.locator('#toast');
const studentRows = (page) => page.locator('table[data-students] tbody tr');
const enrollmentCard = (page, code) => page.locator('section.enrollment').filter({ hasText: code });

test('only admins see and reach the admin area', async ({ page, request }) => {
  const errors = watchErrors(page);
  await loginAs(page, 'admin');
  const nav = page.getByRole('navigation', { name: 'Portal' });
  for (const name of ['Overview', 'Students', 'Batches', 'Staff', 'Seat requests', 'Materials']) await expect(nav.getByRole('link', { name })).toBeVisible();
  await expect(page.getByRole('heading', { level: 1, name: 'Overview' })).toBeVisible();
  const kenji = await one(request, `select count(*)::int from enrollments where student_id = $1 and status = 'active'`, [demo.id.lapsed]);
  expect(kenji).toBe(1);
  await expect(page.getByRole('region', { name: 'Access stopped' })).toContainText(ACCOUNTS.lapsed.name);
  await expect(page.getByRole('region', { name: 'In the grace period' })).toContainText(ACCOUNTS.grace.name);
  expect(errors).toEqual([]);

  for (const who of ['student', 'instructor']) {
    await switchTo(page, who);
    await expect(page.getByRole('navigation', { name: 'Portal' }).getByRole('link', { name: 'Seat requests' })).toHaveCount(0);
    for (const hash of ['#/admin', '#/admin/students', `#/admin/student/${demo.id.student}`, '#/admin/materials']) {
      await page.goto(`/portal/${hash}`);
      await expect(page).toHaveURL(who === 'student' ? /#\/home$/ : /#\/teach$/);
    }
    // The database refuses too, whatever the browser does.
    const [status, body] = await api(page, 'admin_students');
    expect(status).toBe(403);
    expect(body.message).toBe('Admins only');
  }
});

test('the student database searches, filters, sorts and pages', async ({ page, request }) => {
  const errors = watchErrors(page);
  await loginAs(page, 'admin');
  await page.getByRole('navigation', { name: 'Portal' }).getByRole('link', { name: 'Students' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Students' })).toBeVisible();
  const total = await one(request, `select count(*)::int from profiles where role = 'student'`);
  await expect(studentRows(page)).toHaveCount(total);         // one row each: every demo student is in at most one program

  await page.getByLabel('Search name or email').fill('maya');
  await page.getByLabel('Search name or email').press('Enter');
  await expect(page).toHaveURL(/#\/admin\/students\?q=maya$/);
  await expect(studentRows(page)).toHaveCount(1);
  const maya = studentRows(page).first();
  await expect(maya).toContainText(ACCOUNTS.student.name);
  await expect(maya).toContainText('B.S. Artificial Intelligence & Machine Learning');
  await expect(maya).toContainText('Paid');
  await expect(maya.locator('td[data-label="Last active"]')).not.toBeEmpty();

  await page.getByRole('link', { name: 'Clear filters' }).click();
  await page.getByLabel('Access', { exact: true }).selectOption('stopped');
  await expect(studentRows(page)).toHaveCount(2);
  await expect(page.locator('table[data-students]')).toContainText(ACCOUNTS.lapsed.name);
  await expect(page.locator('table[data-students]')).toContainText(ACCOUNTS.stopped.name);
  await expect(studentRows(page).filter({ hasText: ACCOUNTS.lapsed.name })).toContainText('Stopped · unpaid');
  await expect(studentRows(page).filter({ hasText: ACCOUNTS.stopped.name })).toContainText('Stopped by admin');

  await page.getByLabel('Access', { exact: true }).selectOption('grace');
  await expect(studentRows(page).filter({ hasText: ACCOUNTS.grace.name })).toContainText(/Grace period · 10 days left/);

  await page.getByRole('link', { name: 'Clear filters' }).click();
  await page.getByLabel('Payment').selectOption('unpaid');
  await page.getByLabel('Program').selectOption('ms-ds');
  const unpaidMs = await one(request, `select count(distinct e.student_id)::int from enrollments e where e.program_id = 'ms-ds' and e.status = 'active'
                                       and not exists (select 1 from payments p where p.enrollment_id = e.id and p.voided_at is null)`);
  await expect(studentRows(page)).toHaveCount(unpaidMs);
  await expect(page.locator('table[data-students]')).not.toContainText(ACCOUNTS.otherProgram.name);    // Omar paid

  await page.getByRole('link', { name: 'Clear filters' }).click();
  await page.getByLabel('Sort by').selectOption('email');
  await page.getByLabel('Order').selectOption('1');
  await expect(page).toHaveURL(/sort=email&desc=1/);
  const emails = await studentRows(page).locator('td[data-label="Student"] .small').allTextContents();
  expect(emails).toEqual([...emails].sort().reverse());

  // Paging: 55 more students make two pages of 50.
  await sql(request, `insert into auth.users (id, email) select gen_random_uuid(), 'bulk' || lpad(g::text, 2, '0') || '@example.com' from generate_series(1, 55) g`);
  await page.goto('/portal/#/admin/students?q=bulk');
  await expect(page.getByRole('heading', { name: 'Showing 1–50 of 55' })).toBeVisible();
  await page.getByRole('link', { name: 'Next' }).click();
  await expect(page.getByRole('heading', { name: 'Showing 51–55 of 55' })).toBeVisible();
  await expect(studentRows(page)).toHaveCount(5);
  expect(errors).toEqual([]);
});

test('Stop access closes lessons, PDFs and join links at once; Start access opens them again', async ({ page, request }) => {
  const code = await one(request, `select code from batches where id = $1`, [demo.batch.current]);
  const lesson = await one(request, `select l.id from lessons l join modules m on m.id = l.module_id where m.program_id = 'bs-aiml' and m.term_no = 2 order by l.position limit 1`);
  const pdf = await one(request, `select mt.file_path from materials mt where mt.lesson_id = $1 order by position limit 1`, [lesson]);
  const next = (await sql(request, `select id, join_url from sessions where batch_id = $1 and starts_at > now() order by starts_at limit 1`, [demo.batch.current]))[0];
  await sql(request, `update sessions set starts_at = now() + interval '10 minutes', ends_at = now() + interval '70 minutes' where id = $1`, [next.id]);

  await loginAs(page, 'admin');
  await page.goto(`/portal/#/admin/student/${demo.id.student}`);
  await expect(page.getByRole('heading', { level: 1, name: ACCOUNTS.student.name })).toBeVisible();
  const card = enrollmentCard(page, code);
  await expect(card.locator('.pill').filter({ hasText: 'Paid' })).toBeVisible();
  await card.getByRole('button', { name: 'Stop access' }).click();
  const dlg = page.getByRole('dialog');
  await dlg.getByRole('button', { name: 'Stop access now' }).click();
  await expect(dlg.getByRole('alert')).toContainText('Write a short reason');           // a reason is required
  await dlg.getByLabel('Reason (private, for admins)').fill('Private: card dispute under review');
  await dlg.getByRole('button', { name: 'Stop access now' }).click();
  await expect(toastText(page)).toContainText('Access stopped');
  await expect(card.locator('.pill').filter({ hasText: 'Stopped by admin' })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Access history' })).toContainText('Stopped by an admin');
  expect(await one(request, `select count(*)::int from admin_audit where action = 'access.set'`)).toBeGreaterThanOrEqual(1);

  await switchTo(page, 'student');
  await expect(page.getByRole('heading', { level: 1, name: 'Your portal access is paused' })).toBeVisible();
  await expect(page.locator('main')).toContainText('Nuvora paused your access to this term');
  await expect(page.locator('main')).toContainText('to be published before the first batch');
  await expect(page.locator('main')).not.toContainText('card dispute');                  // the admin's reason stays private
  await page.goto(`/portal/#/lesson/${lesson}`);
  await expect(page.getByRole('heading', { level: 1, name: 'Your portal access is paused' })).toBeVisible();
  await page.goto('/portal/#/live');
  await expect(page.getByRole('heading', { level: 1, name: 'Your portal access is paused' })).toBeVisible();
  await expect(page.locator('a:has-text("Join class")')).toHaveCount(0);
  expect(await pdfStatus(page, pdf)).toBe(400);
  expect((await api(page, 'my_sessions', { p_batch: demo.batch.current }))[0]).toBe(404);
  expect((await api(page, 'my_lesson', { p_lesson: lesson }))[0]).toBe(404);

  await switchTo(page, 'admin');
  await page.goto(`/portal/#/admin/student/${demo.id.student}`);
  await enrollmentCard(page, code).getByRole('button', { name: 'Start access' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Start access now' }).click();
  await expect(toastText(page)).toContainText('Access started until you change it');
  await expect(enrollmentCard(page, code).locator('.pill').filter({ hasText: 'Started by admin' })).toBeVisible();

  await switchTo(page, 'student');
  await page.goto('/portal/#/live');
  await expect(page.locator(`[data-session="${next.id}"] a:has-text("Join class")`)).toHaveAttribute('href', next.join_url);
  await page.goto(`/portal/#/lesson/${lesson}`);
  await expect(page.getByRole('button', { name: 'Download PDF' }).first()).toBeVisible();
  expect(await pdfStatus(page, pdf)).toBe(200);

  // Return to automatic: Maya's term is paid, so access stays open.
  await switchTo(page, 'admin');
  await page.goto(`/portal/#/admin/student/${demo.id.student}`);
  await enrollmentCard(page, code).getByRole('button', { name: 'Return to automatic' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Return to automatic' }).click();
  await expect(toastText(page)).toContainText('Back to automatic: Paid');
});

test('an unpaid term stops by itself 30 days in, and recording a payment opens it again', async ({ page, request }) => {
  // Ines joined the earlier M.S. batch 20 days ago and hasn't paid: 10 days left. Move her enrollment 31 days back.
  const enrollment = await one(request, `select id from enrollments where student_id = $1 and status = 'active'`, [demo.id.grace]);
  await loginAs(page, 'grace');
  await expect(page.locator('.accessbar')).toHaveCount(0);                               // 10 days left: no banner yet
  await sql(request, `update enrollments set enrolled_at = now() - interval '24 days' where id = $1`, [enrollment]);
  await page.reload();
  await expect(page.locator('.accessbar.warn')).toContainText(/pauses in (5|6) days, on/);  // the last 7 days: a banner with the date

  await sql(request, `update enrollments set enrolled_at = now() - interval '31 days' where id = $1`, [enrollment]);
  await page.reload();
  await expect(page.getByRole('heading', { level: 1, name: 'Your portal access is paused' })).toBeVisible();
  await expect(page.locator('main')).toContainText('Tuition for term 1 hasn’t been recorded');
  // The hourly job records the stop and tells the student and every admin, once.
  await sql(request, `select apply_access_rules()`);
  await sql(request, `select apply_access_rules()`);
  expect(await one(request, `select count(*)::int from notifications where user_id = $1 and kind = 'access_stopped'`, [demo.id.grace])).toBe(1);
  expect(await one(request, `select count(*)::int from notifications where user_id = $1 and kind = 'access_stopped' and title like '%Ines%'`, [demo.id.admin])).toBe(1);

  await switchTo(page, 'admin');
  await page.goto('/portal/#/admin/students?access=stopped_unpaid');
  await expect(studentRows(page).filter({ hasText: ACCOUNTS.grace.name })).toContainText('Stopped · unpaid');
  await studentRows(page).filter({ hasText: ACCOUNTS.grace.name }).getByRole('link', { name: ACCOUNTS.grace.name }).click();
  await page.getByRole('button', { name: 'Record payment' }).click();
  const dlg = page.getByRole('dialog');
  await dlg.getByLabel('Amount (USD)').fill('1950');
  await dlg.getByLabel('Method').selectOption('bank_transfer');
  await dlg.getByLabel('Reference').fill('HDFC-TEST-0001');
  await dlg.getByRole('button', { name: 'Record payment' }).click();
  await expect(toastText(page)).toContainText('Payment of $1,950.00 recorded. Access: Paid');
  await expect(page.locator('section.enrollment').getByRole('cell', { name: 'HDFC-TEST-0001' })).toBeVisible();

  // A second payment with the same reference is refused with a clear message.
  await page.getByRole('button', { name: 'Record payment' }).click();
  await dlg.getByLabel('Reference').fill('hdfc-test-0001');
  await dlg.getByRole('button', { name: 'Record payment' }).click();
  await expect(dlg.getByRole('alert')).toContainText('already recorded');
  await dlg.getByRole('button', { name: 'Cancel' }).click();

  await switchTo(page, 'grace');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(/^Good (morning|afternoon|evening), Ines/);

  // Voiding the only payment closes access again (the 30 days are over).
  await switchTo(page, 'admin');
  await page.goto(`/portal/#/admin/student/${demo.id.grace}`);
  await page.getByRole('button', { name: 'Void' }).click();
  await page.getByRole('dialog').getByLabel('Reason').fill('Recorded against the wrong student');
  await page.getByRole('dialog').getByRole('button', { name: 'Void payment' }).click();
  await expect(toastText(page)).toContainText('Payment voided. Access: Stopped · unpaid');
  await expect(page.locator('section.enrollment .pill.bad').filter({ hasText: 'Voided' })).toBeVisible();
});

test('create a batch, set its link and capacity, and assign an instructor', async ({ page, request }) => {
  const errors = watchErrors(page);
  await loginAs(page, 'admin');
  await page.getByRole('navigation', { name: 'Portal' }).getByRole('link', { name: 'Batches' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Batches' })).toBeVisible();
  // A Monday about five months ahead, which no demo batch uses.
  const monday = await one(request, `select (date_trunc('week', now() + interval '150 days'))::date::text`);
  const form = page.locator('form[data-create]');
  await form.getByLabel('Program').selectOption('c-py');
  await form.getByLabel('Starts on (a Monday)').fill(await one(request, `select ($1::date + 1)::text`, [monday]));
  await form.getByRole('button', { name: 'Create batch' }).click();
  await expect(form.getByRole('alert')).toContainText('Choose a Monday');
  await form.getByLabel('Starts on (a Monday)').fill(monday);
  await form.getByRole('button', { name: 'Create batch' }).click();
  await expect(toastText(page)).toContainText('is ready');
  const made = (await sql(request, `select id, code, capacity from batches where program_id = 'c-py' and starts_on = $1::date and term_no = 1`, [monday]))[0];
  expect(made).toBeTruthy();
  const card = page.locator(`[data-batch="${made.id}"]`);
  await expect(card).toContainText(made.code);
  await expect(card).toContainText('Nobody is assigned yet');

  // The assign form stays folded away until asked for, so each card shows the batch's facts first.
  await expect(card.locator('form[data-assign]')).toBeHidden();
  await card.getByText('Assign an instructor').click();
  await card.getByLabel('Assign').selectOption({ label: `${ACCOUNTS.instructor2.name} (instructor)` });
  await card.getByRole('button', { name: 'Assign', exact: true }).click();
  await expect(toastText(page)).toContainText(`${ACCOUNTS.instructor2.name} now teaches ${made.code}`);
  await expect(page.locator(`[data-batch="${made.id}"] ul.people`)).toContainText(ACCOUNTS.instructor2.name);
  expect(await one(request, `select role from batch_staff where batch_id = $1 and user_id = $2`, [made.id, await one(request, `select id from profiles where email = $1`, [ACCOUNTS.instructor2.email])])).toBe('instructor');

  const again = page.locator(`[data-batch="${made.id}"]`);
  await again.getByText('Edit capacity, status or live-class link').click();
  await again.getByLabel('Capacity').fill('25');
  await again.getByLabel('Live-class link for every upcoming class').fill('not a link');
  await again.getByRole('button', { name: 'Save changes' }).click();
  await expect(again.getByRole('alert')).toContainText('must start with https://');
  await again.getByLabel('Live-class link for every upcoming class').fill('https://zoom.us/j/5550001111');
  await again.getByRole('button', { name: 'Save changes' }).click();
  await expect(toastText(page)).toContainText(`${made.code} saved: 25 seats`);
  expect(await one(request, `select capacity from batches where id = $1`, [made.id])).toBe(25);
  const links = await sql(request, `select distinct join_url from sessions where batch_id = $1 and status not in ('ended','cancelled')`, [made.id]);
  expect(links.map((r) => r.join_url)).toEqual(['https://zoom.us/j/5550001111']);

  // Unassigning asks first.
  await page.locator(`[data-batch="${made.id}"]`).getByRole('button', { name: 'Unassign' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Unassign' }).click();
  await expect(toastText(page)).toContainText('no longer teaches');
  expect(await one(request, `select count(*)::int from batch_staff where batch_id = $1`, [made.id])).toBe(0);
  expect(errors).toEqual([]);
});

test('staff roles are set by email', async ({ page, request }) => {
  await loginAs(page, 'admin');
  await page.goto('/portal/#/admin/staff');
  await page.getByLabel('Email address').fill('nobody@example.com');
  await page.getByRole('button', { name: 'Set role' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Make instructor' }).click();
  await expect(page.getByRole('dialog').getByRole('alert')).toContainText('No account with email');
  await page.getByRole('dialog').getByRole('button', { name: 'Cancel' }).click();
  await page.getByLabel('Email address').fill(ACCOUNTS.newcomer.email);
  await page.getByRole('button', { name: 'Set role' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Make instructor' }).click();
  await expect(toastText(page)).toContainText(`${ACCOUNTS.newcomer.name} is now an instructor.`);
  expect(await one(request, `select role from profiles where email = $1`, [ACCOUNTS.newcomer.email])).toBe('instructor');
  await expect(page.getByRole('region', { name: /Instructors and admins/ })).toContainText(ACCOUNTS.newcomer.name);
});

test('upload a PDF to a lesson; a file that is not a PDF is refused with a clear message', async ({ page, request }) => {
  const errors = watchErrors(page);
  const lesson = (await sql(request, `select l.id, l.code, l.title from lessons l join modules m on m.id = l.module_id
                                      where m.program_id = 'bs-aiml' and m.term_no = 2 order by l.position limit 1`))[0];
  await loginAs(page, 'admin');
  await page.getByRole('navigation', { name: 'Portal' }).getByRole('link', { name: 'Materials' }).click();
  await page.getByLabel('Program', { exact: true }).selectOption('bs-aiml');
  await page.getByLabel('Term', { exact: true }).selectOption('2');
  const form = page.locator('form[data-upload]');
  await form.getByLabel('Attach to').selectOption(`lesson:${lesson.id}`);
  await form.getByLabel('Title students see').fill('Practice problems');

  // Not a PDF by its type: caught in the browser.
  await form.getByLabel('PDF file').setInputFiles({ name: 'notes.txt', mimeType: 'text/plain', buffer: Buffer.from('hello') });
  await form.getByRole('button', { name: 'Upload and attach' }).click();
  await expect(form.getByRole('alert')).toHaveText('“notes.txt” isn’t a PDF. Only PDF files can be uploaded.');
  // Named and typed as a PDF but it isn't one: refused by the server, with the same plain message.
  await form.getByLabel('PDF file').setInputFiles({ name: 'fake.pdf', mimeType: 'application/pdf', buffer: Buffer.from('MZ not a pdf') });
  await form.getByRole('button', { name: 'Upload and attach' }).click();
  await expect(form.getByRole('alert')).toHaveText('That file isn’t a PDF. Only PDF files can be uploaded.');
  expect(await one(request, `select count(*)::int from storage.objects where name like '%fake%'`)).toBe(0);
  errors.length = 0;                                 // the browser logs that deliberate 415 refusal; nothing else may fail

  const pdf = Buffer.from('%PDF-1.4\n1 0 obj << /Type /Catalog >> endobj\ntrailer << /Root 1 0 R >>\n%%EOF\n');
  await form.getByLabel('PDF file').setInputFiles({ name: 'Practice Problems.pdf', mimeType: 'application/pdf', buffer: pdf });
  await form.getByRole('button', { name: 'Upload and attach' }).click();
  await expect(toastText(page)).toContainText('“Practice problems” uploaded');
  const row = (await sql(request, `select id, file_path from materials where lesson_id = $1 and title = 'Practice problems'`, [lesson.id]))[0];
  expect(row.file_path).toMatch(new RegExp(`^bs-aiml/lessons/${lesson.code.toLowerCase()}/practice-problems-\\d{14}\\.pdf$`));
  const attached = page.getByRole('region', { name: /Attached PDFs/ });
  await expect(attached).toContainText('Practice problems');

  // Maya (term 2) sees it on the lesson and can download it.
  await switchTo(page, 'student');
  await page.goto(`/portal/#/lesson/${lesson.id}`);
  const mats = page.getByRole('region', { name: 'Lesson materials' });
  await expect(mats).toContainText('Practice problems');
  const [download] = await Promise.all([page.waitForEvent('download'), mats.locator('div, li').filter({ hasText: 'Practice problems' }).last().getByRole('button', { name: 'Download PDF' }).click()]);
  const { readFile } = await import('node:fs/promises');
  expect((await readFile(await download.path())).equals(pdf)).toBe(true);

  // Removing it detaches and deletes the file.
  await switchTo(page, 'admin');
  await page.goto('/portal/#/admin/materials?program=bs-aiml&term=2');
  await page.getByRole('row', { name: /Practice problems/ }).getByRole('button', { name: 'Remove' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Remove PDF' }).click();
  await expect(toastText(page)).toContainText('removed and deleted');
  expect(await one(request, `select count(*)::int from materials where id = $1`, [row.id])).toBe(0);
  expect(await one(request, `select count(*)::int from storage.objects where name = $1`, [row.file_path])).toBe(0);
  expect(errors).toEqual([]);
});

test('seat requests: change the status and notes, and convert one to an enrollment', async ({ page, request }) => {
  await loginAs(page, 'admin');
  await page.getByRole('navigation', { name: 'Portal' }).getByRole('link', { name: 'Seat requests' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Seat requests' })).toBeVisible();
  const rohan = page.locator('section.request').filter({ hasText: 'Rohan Verma' });
  await rohan.getByLabel('Status').selectOption('contacted');
  await rohan.getByLabel('Notes (admins only)').fill('Emailed the program guide.');
  await rohan.getByRole('button', { name: 'Save' }).click();
  await expect(toastText(page)).toContainText('Request from Rohan Verma saved as contacted');
  const saved = (await sql(request, `select status, notes, handled_by from seat_requests where email = 'rohan.verma@example.com'`))[0];
  expect(saved).toEqual({ status: 'contacted', notes: 'Emailed the program guide.', handled_by: demo.id.admin });

  await page.getByLabel('Status', { exact: true }).first().selectOption('new');
  await expect(page).toHaveURL(/#\/admin\/requests\?status=new$/);
  const nia = page.locator('section.request').filter({ hasText: ACCOUNTS.newcomer.name });
  await nia.getByRole('button', { name: 'Convert to enrollment' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Enroll' }).click();
  await expect(toastText(page)).toContainText(`${ACCOUNTS.newcomer.name} is enrolled`);
  expect(await one(request, `select count(*)::int from enrollments where student_id = (select id from profiles where email = $1) and program_id = 'c-py'`, [ACCOUNTS.newcomer.email])).toBe(1);
  expect(await one(request, `select status from seat_requests where email = $1`, [ACCOUNTS.newcomer.email])).toBe('converted');
});

test('the CSV export holds every row of the current filter and neutralises spreadsheet formulas', async ({ page, request }) => {
  const { readFile } = await import('node:fs/promises');
  await sql(request, `update profiles set full_name = '=HYPERLINK("http://evil.example","Click")' where id = $1`, [demo.id.lapsed]);
  await loginAs(page, 'admin');
  await page.goto('/portal/#/admin/students?access=stopped');
  await expect(studentRows(page)).toHaveCount(2);
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: /Export CSV \(2\)/ }).click()]);
  expect(download.suggestedFilename()).toMatch(/^nuvora-students-\d{4}-\d{2}-\d{2}\.csv$/);
  const text = (await readFile(await download.path(), 'utf8')).replace(/^﻿/, '');
  const lines = text.trimEnd().split('\r\n');
  expect(lines[0]).toBe('Name,Email,Program,Batch,Term,Enrollment,Payment,Paid (USD),Tuition per term (USD),Access,Days left,Access pauses at,Last active,Signed up');
  expect(lines).toHaveLength(3);
  const kenji = lines.find((l) => l.includes(ACCOUNTS.lapsed.email));
  expect(kenji.startsWith(`"'=HYPERLINK(""http://evil.example"",""Click"")"`)).toBe(true);   // shown as text, never run
  expect(kenji).toContain('Stopped · unpaid');
  const lucas = lines.find((l) => l.includes(ACCOUNTS.stopped.email));
  expect(lucas.startsWith(`${ACCOUNTS.stopped.name},`)).toBe(true);
  expect(lucas).toContain('Stopped by admin');
  await expect(toastText(page)).toContainText('Exported 2 rows');
});

test('keyboard users keep their place through searches, exports, tiles and dialogs', async ({ page, request }) => {
  const errors = watchErrors(page);
  // Ines joined 25 days ago, unpaid: her access pauses in 5 days. Everyone else open has longer, or has paid.
  await sql(request, `update enrollments set enrolled_at = now() - interval '25 days' where student_id = $1 and status = 'active'`, [demo.id.grace]);
  await loginAs(page, 'admin');
  // The toast's live region is in the page before any message, so screen readers announce the first one too.
  await expect(page.locator('#toast[role="status"]')).toHaveCount(1);
  await expect(toastText(page)).toBeEmpty();

  // "Pausing within 7 days" opens exactly the students it counts, not everyone whose access is open.
  const counted = await one(request, `select count(*)::int from enrollments e cross join lateral access_of(e.id, now()) x
                                       where e.status = 'active' and x.open and x.ends_at <= now() + interval '7 days'`);
  expect(counted).toBe(1);
  const tile = page.locator('a.tile', { hasText: 'Pausing within 7 days' });
  await expect(tile.locator('b')).toHaveText('1');
  await tile.press('Enter');
  await expect(page).toHaveURL(/access=ending_soon/);
  await expect(page.getByRole('heading', { level: 2, name: 'Showing 1–1 of 1' })).toBeVisible();
  await expect(studentRows(page)).toHaveCount(1);
  await expect(studentRows(page).first()).toContainText(ACCOUNTS.grace.name);

  // A search lands on the results heading, which says how many matched.
  await page.goto('/portal/#/admin/students');
  await page.getByLabel('Search name or email').fill('maya');
  await page.getByLabel('Search name or email').press('Enter');
  await expect(page.getByRole('heading', { level: 2, name: 'Showing 1–1 of 1' })).toBeFocused();

  // Exporting keeps focus on the button.
  const exportCsv = page.getByRole('button', { name: /Export CSV/ });
  const download = page.waitForEvent('download');
  await exportCsv.press('Enter');
  await download;
  await expect(toastText(page)).toContainText('Exported 1 row to a CSV file');
  await expect(exportCsv).toBeFocused();

  // A dialog error marks the field and links it to the message; after the action, focus stays on the student's term.
  await page.goto(`/portal/#/admin/student/${demo.id.student}`);
  const code = await one(request, `select code from batches where id = $1`, [demo.batch.current]);
  await enrollmentCard(page, code).getByRole('button', { name: 'Stop access' }).press('Enter');
  const dlg = page.getByRole('dialog');
  const reason = dlg.getByLabel('Reason (private, for admins)');
  await expect(reason).toBeFocused();
  await dlg.getByRole('button', { name: 'Stop access now' }).press('Enter');
  await expect(reason).toHaveAttribute('aria-invalid', 'true');
  await expect(reason).toBeFocused();
  const errId = await dlg.getByRole('alert').getAttribute('id');
  expect(errId).toBeTruthy();
  expect((await reason.getAttribute('aria-describedby')).split(' ')).toContain(errId);
  await reason.fill('Keyboard check');
  await dlg.getByRole('button', { name: 'Stop access now' }).press('Enter');
  await expect(toastText(page)).toContainText('Access stopped');
  await expect(enrollmentCard(page, code).getByRole('heading', { level: 2 })).toBeFocused();
  expect(errors).toEqual([]);
});

test('admin pages fit a phone: tables become stacked cards and nothing runs off the edge', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 700 });
  const errors = watchErrors(page);
  await loginAs(page, 'admin');
  for (const hash of ['#/admin', '#/admin/students', `#/admin/student/${demo.id.otherProgram}`, '#/admin/batches', '#/admin/staff', '#/admin/requests', '#/admin/materials']) {
    await page.goto(`/portal/${hash}`);
    await expect(page.locator('main h1')).toBeVisible();
    await expect(page.locator('main .spinner, main [aria-busy="true"]')).toHaveCount(0);
    const out = await page.evaluate(() => {
      const vw = document.documentElement.clientWidth;
      // Visually hidden table headers (kept for screen readers) are clipped to 1px, so they don't count.
      return [...document.querySelectorAll('main *')].filter((el) => !el.closest('table.cards thead, .sr') && el.getClientRects().length && el.getBoundingClientRect().right > vw + 1)
        .map((el) => `${el.tagName.toLowerCase()}.${String(el.className?.baseVal ?? el.className).split(' ')[0]}`).slice(0, 5);
    });
    expect(out, `${hash}: nothing runs off the right edge`).toEqual([]);
    const head = page.locator('main table.cards thead').first();
    if (await head.count()) expect((await head.boundingBox()).height, `${hash}: table headers give way to labels on each card`).toBeLessThanOrEqual(1);
  }
  expect(errors).toEqual([]);
});
