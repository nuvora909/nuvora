// The local server runs the school clock like pg_cron does in production: at start, then on a timer, never
// overlapping itself and never on a database that is being replaced. Off unless asked for.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { startServer } from '../../server/dev-server.mjs';
import { runAs } from '../../server/localdb.mjs';

const service = (s, sql) => runAs(s.state.db, 'service_role', { role: 'service_role' }, sql);
const termOneBatches = async (s) => (await service(s, `select count(*)::int n from batches where term_no = 1`)).rows[0].n;
const waitFor = async (ok, what) => {
  for (const end = Date.now() + 20_000; Date.now() < end;) { if (ok()) return; await new Promise((r) => setTimeout(r, 20)); }
  throw new Error(`timed out waiting for ${what}`);
};

test('off by default: a server started by a test changes nothing on its own', async () => {
  const s = await startServer({ port: 0, quiet: true, build: false });
  try {
    assert.equal(s.state.clock.runs, 0);
    assert.equal((await service(s, `select count(*)::int n from clock_state`)).rows[0].n, 0);
  } finally { await s.close(); }
});

test('on: runs at start against the demo data, makes batches ahead, and the next run changes nothing', async () => {
  const s = await startServer({ port: 0, quiet: true, build: false, clock: 60 * 60 * 1000 });
  try {
    assert.equal(s.state.clock.runs, 1);
    assert.equal(s.state.clock.error, null);
    assert.deepEqual(s.state.clock.last.errors, []);
    assert.ok(s.state.clock.last.batches_created > 0);
    const programs = (await service(s, `select count(*)::int n from programs where active`)).rows[0].n;
    const ahead = (await service(s, `select count(*)::int n from batches where term_no = 1 and starts_on >= next_start_date()`)).rows[0].n;
    assert.ok(ahead >= programs * 8, 'every program has its next 8 starts');
    const before = await termOneBatches(s);
    await s.tick();
    assert.deepEqual([s.state.clock.runs, s.state.clock.last.batches_created, s.state.clock.last.errors], [2, 0, []]);
    assert.equal(await termOneBatches(s), before);
  } finally { await s.close(); }
});

test('on a short timer, through a database reset, with no errors and a clean close', async () => {
  const s = await startServer({ port: 0, quiet: true, build: false, clock: 25 });
  try {
    await waitFor(() => s.state.clock.runs >= 3, 'three runs');
    await Promise.all([s.reset(), s.tick(), s.tick()]);
    const after = s.state.clock.runs;
    await waitFor(() => s.state.clock.runs >= after + 2, 'runs after the reset');
    assert.equal(s.state.clock.error, null);
    assert.ok((await termOneBatches(s)) > 0, 'the new database is clocked too');
  } finally { await s.close(); }
  assert.equal(s.state.db.closed, true);
});
