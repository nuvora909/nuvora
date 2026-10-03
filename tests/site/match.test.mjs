// "Find my program": the rule-based match must be sensible and honest for every possible set of answers.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { QUESTIONS, BACHELOR_Q, recommend, scoreProgram, MAX_PARTS, label, isComplete } from '../../web/assets/js/match.mjs';
import { PROGRAMS } from '../../web/data/programs.mjs';

const P = (id) => PROGRAMS.find((p) => p.id === id);
const opts = (id) => QUESTIONS.find((q) => q.id === id).options.map(([v]) => v);
const MASTERS = PROGRAMS.filter((p) => p.needsBachelor).map((p) => p.id);

// Every combination of the four questions (6 x 5 x 3 x 3), each without a degree answer, with "yes" and with "no".
const ALL = [];
for (const role of opts('role')) for (const goal of opts('goal')) for (const hours of opts('hours')) for (const coding of opts('coding')) {
  for (const bachelor of [undefined, 'yes', 'no']) ALL.push({ role, goal, hours, coding, ...(bachelor && { bachelor }) });
}
const run = (a) => ({ a, r: recommend(a, PROGRAMS) });
const RESULTS = ALL.map(run);
const name = (a) => `${a.role}/${a.goal}/${a.hours}/${a.coding}/${a.bachelor ?? '-'}`;

test('the questions cover the published answer set', () => {
  assert.deepEqual(QUESTIONS.map((q) => q.options.length), [6, 5, 3, 3]);
  assert.equal(ALL.length, 6 * 5 * 3 * 3 * 3);
  assert.deepEqual(BACHELOR_Q.options.map(([v]) => v), ['yes', 'no']);
  assert.equal(label('hours', '10+'), '10+ hours');
  assert.equal(label('nope', 'x'), '');
  assert.ok(isComplete({ role: 'tech', goal: 'ai', hours: '10+', coding: 'regular' }));
  assert.ok(!isComplete({ role: 'tech', goal: 'ai', hours: '10+' }));
});

// A program that expects code does not fit someone who has never coded, whatever its score.
const fits = (id, a) => !(P(id).requiresCoding && a.coding === 'none');

test('every combination gets a match from the catalog, ranked from best to worst', () => {
  for (const { a, r } of RESULTS) {
    assert.ok(r.match && P(r.match.id), `${name(a)}: a real program`);
    assert.equal(r.ranked[0], r.match, `${name(a)}: the match is the top of the ranking`);
    assert.deepEqual(r.alternatives, r.ranked.slice(1, 3), `${name(a)}: alternatives are the next two`);
    for (let i = 1; i < r.ranked.length; i++) {
      const [x, y] = [r.ranked[i - 1], r.ranked[i]];
      if (fits(x.id, a) === fits(y.id, a)) assert.ok(x.score >= y.score, `${name(a)}: ${x.id} before ${y.id} is sorted by score`);
    }
    assert.equal(new Set(r.ranked.map((x) => x.id)).size, r.ranked.length, `${name(a)}: no program twice`);
  }
});

test('nobody without a bachelor’s degree is ever offered a master’s-level program', () => {
  for (const { a, r } of RESULTS.filter(({ a }) => a.bachelor === 'no')) {
    const offered = r.ranked.map((x) => x.id);
    assert.deepEqual(offered.filter((id) => MASTERS.includes(id)), [], `${name(a)}: no master’s-level program anywhere in the ranking`);
    assert.equal(offered.length, PROGRAMS.length - MASTERS.length, `${name(a)}: every other program is still ranked`);
  }
});

test('the degree question is asked only when a master’s-level program is the best fit and we do not know yet', () => {
  let asked = 0;
  for (const { a, r } of RESULTS) {
    const topNeedsDegree = P(r.match.id).needsBachelor;
    const shouldAsk = topNeedsDegree && !a.bachelor;
    assert.equal(r.needs, shouldAsk ? 'bachelor' : null, `${name(a)}: needs`);
    if (shouldAsk) asked += 1;
  }
  assert.ok(asked > 0, 'some combinations do lead to the degree question');
});

test('every match and alternative explains itself with at least one reason', () => {
  for (const { a, r } of RESULTS) {
    for (const x of [r.match, ...r.alternatives]) {
      assert.ok(x.reasons.length >= 1, `${name(a)}: ${x.id} has a reason`);
      assert.ok(x.reasons.every((s) => typeof s === 'string' && s.length > 10), `${name(a)}: ${x.id} reasons are sentences`);
    }
  }
});

test('the goal "get a degree" always carries the not-an-accredited-degree caution', () => {
  for (const { a, r } of RESULTS.filter(({ a }) => a.goal === 'degree')) {
    for (const x of r.ranked) {
      assert.ok(x.cautions.some((c) => /not an accredited degree/.test(c)), `${name(a)}: ${x.id} warns about the credential`);
    }
  }
  for (const { a, r } of RESULTS.filter(({ a }) => a.goal !== 'degree')) {
    assert.ok(!r.match.cautions.some((c) => /accredited/.test(c)), `${name(a)}: no credential caution for other goals`);
  }
});

test('no reason or caution promises a job, a salary or an outcome', () => {
  const bad = /guarantee|salary|salaries|hired|placement|\d+\s*%|median|graduates? (earn|get)/i;
  for (const { a, r } of RESULTS) {
    for (const x of r.ranked) for (const s of [...x.reasons, ...x.cautions]) assert.doesNotMatch(s, bad, `${name(a)}: ${x.id}: ${s}`);
  }
});

test('each of the seven programs is the best match for someone', () => {
  const tops = new Set(RESULTS.map(({ r }) => r.match.id));
  assert.deepEqual([...tops].sort(), PROGRAMS.map((p) => p.id).sort());
});

test('specific profiles get the program a counsellor would suggest', () => {
  const top = (a) => recommend(a, PROGRAMS).match.id;
  for (const bachelor of [undefined, 'yes', 'no']) {
    assert.equal(top({ role: 'tech', goal: 'ai', hours: '10+', coding: 'regular', bachelor }), 'c-genai', `tech + AI skills (${bachelor})`);
    assert.ok(['bs-ds', 'c-py'].includes(top({ role: 'nontech', goal: 'switch', hours: '5-10', coding: 'none', bachelor })), `non-tech career changer (${bachelor})`);
  }
  for (const bachelor of [undefined, 'yes']) {
    assert.ok(['c-mlops', 'ms-aml'].includes(top({ role: 'tech', goal: 'stronger', hours: '10+', coding: 'regular', bachelor })), `tech + technically stronger (${bachelor})`);
  }
  assert.equal(top({ role: 'tech', goal: 'stronger', hours: '10+', coding: 'regular', bachelor: 'no' }), 'c-mlops');
});

test('someone who has never coded is never pointed first at a program that expects code', () => {
  const wrong = RESULTS.filter(({ a, r }) => a.coding === 'none' && (['c-genai', 'c-mlops', ...MASTERS].includes(r.match.id) || P(r.match.id).requiresCoding))
    .map(({ a, r }) => `${name(a)} -> ${r.match.id} (${r.match.score})`);
  assert.deepEqual(wrong, [], 'the match teaches Python from the start');
  for (const { a, r } of RESULTS.filter(({ a }) => a.coding === 'none')) {
    for (const x of r.ranked.filter((y) => P(y.id).requiresCoding)) {
      assert.ok(x.cautions.some((c) => /Python/.test(c)), `${name(a)}: ${x.id} says it needs Python first`);
    }
  }
});

test('scores stay within 0-100 and are exactly the sum of the explained parts', () => {
  assert.equal(MAX_PARTS.goal + MAX_PARTS.role + MAX_PARTS.prereq + MAX_PARTS.time, 100);
  for (const { a } of RESULTS) {
    for (const p of PROGRAMS) {
      const s = scoreProgram(p, a);
      if (s === null) { assert.ok(p.needsBachelor && a.bachelor === 'no', `${name(a)}: only master’s programs drop out`); continue; }
      assert.ok(Number.isInteger(s.score) && s.score >= 0 && s.score <= 100, `${name(a)}: ${p.id} score ${s.score}`);
      assert.equal(s.score, s.parts.goal + s.parts.role + s.parts.prereq + s.parts.time, `${name(a)}: ${p.id} score is the sum of its parts`);
      for (const k of Object.keys(MAX_PARTS)) assert.ok(s.parts[k] >= 0 && s.parts[k] <= MAX_PARTS[k], `${name(a)}: ${p.id} ${k} = ${s.parts[k]}`);
    }
  }
});

test('the same answers always give the same result', () => {
  for (const { a, r } of RESULTS.filter((_, i) => i % 7 === 0)) assert.deepEqual(recommend({ ...a }, PROGRAMS), r);
});
