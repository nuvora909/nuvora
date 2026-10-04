// Guardrails for recognising progress in the portal (see the block at the top of the home page code in
// portal/js/pages/student.js): no score currencies, no public comparison of students.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';

const files = readdirSync('portal/js', { recursive: true }).filter((f) => /\.m?js$/.test(f)).map((f) => `portal/js/${f}`.replace(/\\/g, '/'));

test('portal code has no leaderboards, XP, points or ranks', () => {
  assert.ok(files.includes('portal/js/pages/student.js'), 'the portal code was found');
  const hits = files.flatMap((f) => readFileSync(f, 'utf8').split('\n')
    .map((line, i) => [f, i + 1, line]).filter(([, , line]) => /leaderboard|\bXP\b|points|\brank/i.test(line)))
    .map(([f, n, line]) => `${f}:${n}: ${line.trim()}`);
  assert.deepEqual(hits, []);
});

test('the guardrails are written down next to the code that shows progress', () => {
  const home = readFileSync('portal/js/pages/student.js', 'utf8');
  for (const rule of ['verified learning', 'No loss-aversion wording', 'switched off', 'never shown by colour alone', 'Never invent outcomes']) {
    assert.ok(home.includes(rule), `student.js states: ${rule}`);
  }
});

// A signed PDF link is only checked when it is made, and hosted Supabase puts no limit on its life, so the
// portal itself must always ask for a short one (docs/admin-api.md, "PDF materials").
test('every signed PDF link the portal asks for lives 60 seconds at most', () => {
  const asks = files.flatMap((f) => [...readFileSync(f, 'utf8').matchAll(/expiresIn:\s*([^,}\s]+)/g)].map((m) => [f, m[1]]));
  assert.ok(asks.length >= 1, 'the portal asks for signed links');
  for (const [f, v] of asks) assert.ok(/^\d+$/.test(v) && Number(v) <= 60, `${f}: expiresIn ${v}`);
});
