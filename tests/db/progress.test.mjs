// Watch-time tracking: only really-watched slices count, heartbeats are capped, completion at 90%.
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { freshDb, rejects } from './helpers.mjs';

let h, a, b, lesson, dur, otherLesson;

before(async () => {
  h = await freshDb();
  a = await h.user('asha@test.io');
  b = await h.user('ben@test.io');
  await h.service(`select enroll_student($1, 'bs-aiml', '2026-10-05')`, [a]);
  await h.service(`select enroll_student($1, 'bs-aiml', '2026-10-05')`, [b]);
  const row = (await h.sql(`select l.id, l.duration_seconds from lessons l join modules m on m.id = l.module_id
                           where m.program_id = 'bs-aiml' and l.code = 'ML-210'`)).rows[0];
  lesson = row.id; dur = row.duration_seconds;
  otherLesson = await h.one(h.sql, `select l.id from lessons l join modules m on m.id = l.module_id where m.program_id = 'ms-ds' limit 1`);
});

const beat = (user, from, to, pos) => h.one(h.as(user), `select record_progress($1, $2, $3, $4)`, [lesson, from, to, pos ?? to]);

test('a heartbeat marks only the seconds played', async () => {
  const r = await beat(a, 0, 20);
  assert.equal(r.watched_seconds, 20);
  assert.equal(r.completed, false);
});

test('skipping ahead does not count the skipped part', async () => {
  const r = await beat(a, 600, 620);
  assert.equal(r.watched_seconds, 40, 'only 0-20 and 600-620');
  assert.equal(r.last_position, 620);
});

test('re-watching the same part is not counted twice', async () => {
  const r = await beat(a, 0, 20);
  assert.equal(r.watched_seconds, 40);
});

test('a single update cannot claim more than 30 seconds, or a backwards range', async () => {
  await rejects(beat(a, 100, 400), 'at most 30 seconds');
  await rejects(beat(a, 50, 40), 'Invalid range');
});

test('the lesson completes at 90% of real watch time, not before', async () => {
  const target = Math.ceil(dur * 0.9);
  let last;
  for (let s = 0; s < dur; s += 30) {
    last = await beat(a, s, Math.min(s + 30, dur));
    const expectDone = last.watched_seconds >= target;
    assert.equal(last.completed, expectDone, `at ${last.watched_seconds}s of ${dur}s`);
    if (expectDone) break;
  }
  assert.equal(last.completed, true);
});

test('progress is private to each student', async () => {
  assert.equal(await h.one(h.as(b), `select count(*)::int from lesson_progress`), 0);
  assert.equal(await h.one(h.as(a), `select count(*)::int from lesson_progress`), 1);
});

test('students cannot record progress for lessons outside their program', async () => {
  await rejects(h.as(a)(`select record_progress($1, 0, 10)`, [otherLesson]), 'Not enrolled');
  await rejects(h.anon(`select record_progress($1, 0, 10)`, [lesson]), '42501');
});

test('the dashboard reflects completed lessons and "continue watching"', async () => {
  const dash = await h.one(h.as(a), `select my_dashboard()`);
  assert.equal(dash.batches[0].lessons_completed, 1);
  assert.equal(dash.batches[0].lessons_total, 16);
  assert.deepEqual(dash.continue_watching, [], 'finished lessons leave the list');

  await h.as(b)(`select record_progress($1, 0, 30, 30)`, [lesson]);
  const dashB = await h.one(h.as(b), `select my_dashboard()`);
  assert.equal(dashB.continue_watching.length, 1);
  assert.equal(dashB.continue_watching[0].last_position, 30);
});

test('reading completion is only for reading lessons', async () => {
  await rejects(h.as(a)(`select mark_reading_done($1)`, [lesson]), 'Only reading lessons');
});
