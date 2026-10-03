// Monthly batch creation: dates, live-class times, assignment due dates, idempotency and permissions.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { freshDb, rejects } from './helpers.mjs';

test('first_monday picks the first Monday of the month', async () => {
  const h = await freshDb();
  const cases = [['2026-10-15', '2026-10-05'], ['2026-11-01', '2026-11-02'], ['2026-12-01', '2026-12-07'],
                 ['2027-02-10', '2027-02-01'], ['2027-03-31', '2027-03-01']];
  for (const [input, expected] of cases) {
    assert.equal(await h.one(h.sql, 'select first_monday($1::date)::text', [input]), expected, input);
  }
});

test('next_start_date closes applications 7 days before each start', async () => {
  const h = await freshDb();
  assert.equal(await h.one(h.sql, `select next_start_date('2026-09-27')::text`), '2026-10-05');
  assert.equal(await h.one(h.sql, `select next_start_date('2026-09-28')::text`), '2026-10-05');
  assert.equal(await h.one(h.sql, `select next_start_date('2026-09-29')::text`), '2026-11-02');
  assert.equal(await h.one(h.sql, `select next_start_date('2026-12-28')::text`), '2027-01-04');
  assert.equal(await h.one(h.sql, `select next_start_date('2026-12-29')::text`), '2027-02-01', 'January closed on Dec 28');
});

test('monthly job creates one batch per program with its full schedule, and is safe to re-run', async () => {
  const h = await freshDb();
  assert.equal(await h.one(h.service, `select create_monthly_batches('2026-11-01')`), 7);
  assert.equal(await h.one(h.service, `select create_monthly_batches('2026-11-01')`), 0, 'second run creates nothing');
  assert.equal(await h.one(h.sql, `select count(*)::int from batches`), 7);
  assert.equal(await h.one(h.sql, `select count(*)::int from batches where term_no <> 1`), 0, 'new students start in term 1');

  const b = (await h.sql(`select * from batches where code = 'BSAIML-T1-2026-11'`)).rows[0];
  assert.ok(b, 'batch code follows PROGRAM-Tn-YYYY-MM');
  assert.equal(await h.one(h.sql, `select starts_on::text from batches where id = $1`, [b.id]), '2026-11-02');
  assert.equal(await h.one(h.sql, `select ends_on::text from batches where id = $1`, [b.id]), '2027-01-24');
  assert.equal(await h.one(h.sql, `select count(*)::int from sessions where batch_id = $1`, [b.id]), 24);
  assert.equal(await h.one(h.sql, `select count(*)::int from batch_assignments where batch_id = $1`, [b.id]), 3);

  // Tuesday 19:00 India time = 13:30 UTC; office hours Thursday 19:00 IST.
  const first = (await h.sql(`select title, to_char(starts_at at time zone 'UTC','YYYY-MM-DD HH24:MI') s,
                                     to_char(ends_at at time zone 'UTC','HH24:MI') e
                              from sessions where batch_id = $1 order by starts_at limit 2`, [b.id])).rows;
  assert.equal(first[0].s, '2026-11-03 13:30');
  assert.equal(first[0].e, '14:30');
  assert.match(first[0].title, /^Live class · Week 1/);
  assert.equal(first[1].s, '2026-11-05 13:30');
  assert.match(first[1].title, /^Office hours · Week 1/);

  const last = await h.one(h.sql, `select to_char(max(starts_at) at time zone 'Asia/Kolkata','YYYY-MM-DD') from sessions where batch_id = $1`, [b.id]);
  assert.equal(last, '2027-01-21', 'week 12 Thursday');

  // Project 1 is due 18 days after the start at 23:59 India time.
  const due = await h.one(h.sql, `select to_char(due_at at time zone 'UTC','YYYY-MM-DD HH24:MI') from batch_assignments
                                  where batch_id = $1 order by due_at limit 1`, [b.id]);
  assert.equal(due, '2026-11-20 18:29');
});

test('batches must start on a Monday and belong to an active program', async () => {
  const h = await freshDb();
  await rejects(h.service(`select create_batch('bs-ds', '2026-11-03')`), 'start on a Monday');
  await rejects(h.service(`select create_batch('no-such-program', '2026-11-02')`), 'Unknown or inactive program');
  await h.sql(`update programs set active = false where id = 'c-py'`);
  assert.equal(await h.one(h.service, `select create_monthly_batches('2026-12-01')`), 6, 'inactive programs are skipped');
  assert.equal(await h.one(h.anon, `select count(*)::int from programs`), 6, 'hidden from the public catalog');
  const admin = await h.user('admin@test.io', 'admin');
  assert.equal(await h.one(h.as(admin), `select count(*)::int from programs`), 7, 'still visible to admins');
});

test('only admins can create batches; internal jobs are closed to users', async () => {
  const h = await freshDb();
  const student = await h.user('student@test.io');
  const admin = await h.user('admin@test.io', 'admin');
  await rejects(h.as(student)(`select create_batch('bs-ds', '2026-11-02')`), '42501');
  await rejects(h.as(student)(`select create_monthly_batches('2026-11-01')`), '42501');
  await rejects(h.as(student)(`select admin_create_batch('bs-ds', '2026-11-02')`), 'Admins only');
  await rejects(h.anon(`select admin_create_batch('bs-ds', '2026-11-02')`), '42501');
  const id = await h.one(h.as(admin), `select admin_create_batch('bs-ds', '2026-11-02')`);
  assert.ok(id);
  assert.equal(await h.one(h.as(admin), `select admin_create_batch('bs-ds', '2026-11-02')`), id, 'same batch returned');
});

test('batch statuses move scheduled -> active -> completed with the calendar', async () => {
  const h = await freshDb();
  await h.service(`select create_monthly_batches('2026-11-01')`);
  await h.service(`select update_batch_statuses('2026-11-01')`);
  assert.equal(await h.one(h.sql, `select count(*)::int from batches where status = 'scheduled'`), 7);
  await h.service(`select update_batch_statuses('2026-11-02')`);
  assert.equal(await h.one(h.sql, `select count(*)::int from batches where status = 'active'`), 7);
  await h.service(`select update_batch_statuses('2027-01-25')`);
  assert.equal(await h.one(h.sql, `select count(*)::int from batches where status = 'completed'`), 7);
});
