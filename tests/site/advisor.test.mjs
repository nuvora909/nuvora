// The website advisor in catalog mode: rule-based answers built from the published catalog. They must state the
// facts a visitor asked for and never invent outcomes, and the rendered HTML must be safe.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { buildForTest, unnegatedAccredited, unnegatedGuarantee } from './helpers.mjs';
import { catalogAnswer, catalogText, renderAnswer, aiAvailable, AI_RULES } from '../../web/assets/js/advisor-engine.mjs';
import { nextStarts, fmtDay, fromIso } from '../../web/assets/js/dates.mjs';
import { PROGRAMS, TUITION, money } from '../../web/data/programs.mjs';
import { ROLES } from '../../web/data/careers.mjs';

let site, C;
// The advisor runs in the browser on the catalog module the build generates, so test that exact module. Pages
// are built leniently here: this file is about the catalog, and build.test.mjs checks the pages strictly.
before(async () => { site = await buildForTest({ strict: false }); C = await site.catalog(); });
after(() => site?.cleanup());

const TODAY = fromIso('2026-10-02');
const [NEXT, AFTER] = nextStarts(2, TODAY);
const P = (id) => PROGRAMS.find((p) => p.id === id);

// Claims the advisor must never make.
function claims(text) {
  const out = [];
  if (/median|fastest/i.test(text)) out.push('median/fastest');
  // The only percentage Nuvora publishes is the lesson rule ("a lesson completes at 90% watched").
  if (/\d+(\.\d+)?\s*%(?!\s*(watched|of (it|a|the) lesson))/.test(text)) out.push('a percentage');
  if (/(job|placement) guarantee|guaranteed (job|placement|salary|interview)/i.test(text)) out.push('a job guarantee');
  if (/\b(graduates|alumni) (earn|got|get|work at)|hired by|placed at|average salary|salary of/i.test(text)) out.push('an outcome claim');
  if (/most popular|thousands of|trusted by|testimonial|rated \d/i.test(text)) out.push('a popularity claim');
  if (/@|\+\d[\d\s-]{6,}|https?:\/\//.test(text)) out.push('contact details or an external link');
  out.push(...unnegatedAccredited(text).map((s) => `accreditation not denied: ${s}`));
  out.push(...unnegatedGuarantee(text).map((s) => `guarantee not denied: ${s}`));
  return out;
}

const QUESTIONS = [
  ['How much does it cost?', [money(TUITION.perTerm.Certificate), money(TUITION.perTerm.Master), money(TUITION.applicationFee), 'one term at a time']],
  ['How much is the GenAI certificate?', [P('c-genai').name, money(P('c-genai').tuition.perTerm)]],
  ['What is the tuition for the M.S. Applied Machine Learning?', [P('ms-aml').name, money(P('ms-aml').tuition.perTerm), money(P('ms-aml').tuition.total)]],
  ['When is the next start?', [fmtDay(NEXT.start), fmtDay(NEXT.applyBy), 'first Monday']],
  ['What is the deadline to apply?', [fmtDay(NEXT.start), fmtDay(NEXT.applyBy)]],
  ['Is it an accredited degree?', ['not an accredited degree', 'certificate of completion']],
  ['Will my credits transfer to a university?', ['not an accredited degree', 'may not transfer']],
  ['Can I download the videos?', ['can’t be downloaded', 'PDF']],
  ['Can I watch lessons offline?', ['can’t be downloaded']],
  ['Do you have a job guarantee?', ['pre-launch', 'don’t guarantee jobs']],
  ['What salary will I get after graduating?', ['no graduates', 'don’t guarantee']],
  ['What is the median salary of your graduates?', ['no graduates']],
  ['What percentage of students get placed?', ['no graduates']],
  ['What is the class schedule?', ['Tuesday', 'Thursday', '19:00', 'IST', 'recorded']],
  ['What are the prerequisites?', ['No coding experience', 'bachelor’s degree']],
  ['What do I need for the MLOps certificate?', [P('c-mlops').name, ...P('c-mlops').required]],
  ['What is your refund policy?', ['will be published before the first batch']],
  ['Do you offer loans or scholarships?', ['Loans and scholarships aren’t offered yet']],
  ['How are projects graded?', ['Distinguished', 'Proficient', 'Basic', 'Not yet', 'resubmit']],
  ['Tell me about the B.S. Data Science', [P('bs-ds').name, P('bs-ds').url]],
  ['What does a Data Analyst do?', [ROLES['data-analyst'].title, '/careers/data-analyst/']],
  ['How do I become an ML Engineer?', [ROLES['ml-engineer'].title, '/careers/ml-engineer/']],
  ['Which program should I choose?', ['/find-your-program/']],
  ['Can I talk to a human?', ['will be published before the first batch']],
  ['How many hours per week?', [P('c-py').short, P('c-py').weeklyHours]],
  ['hello', ['published catalog']],
  ['qwzx plorb vint?', ['/find-your-program/']],
  ['<script>alert(1)</script>', ['/find-your-program/']],
];

test('catalog answers state the facts that were asked for', () => {
  const missing = [];
  for (const [q, want] of QUESTIONS) {
    const a = catalogAnswer(q, C, TODAY);
    assert.equal(typeof a, 'string');
    for (const w of want) if (!a.includes(w)) missing.push(`"${q}" does not mention "${w}":\n    ${a.replace(/\n/g, ' ')}`);
  }
  assert.deepEqual(missing, []);
});

test('catalog answers never invent outcomes, guarantees, contact details or accreditation', () => {
  const bad = [];
  const extra = ['Are you accredited?', 'Is Nuvora a recognised university?', 'Do graduates get jobs at Google?', 'What is your success rate?',
    'Do you have reviews or ratings?', 'Do you have employer partners?', 'What is your phone number?', 'What is your email?',
    'Can I get an EMI?', 'Is there a weekend batch?', 'How fast can I finish?', 'Can I test out of a course?'];
  for (const q of [...QUESTIONS.map(([x]) => x), ...extra]) {
    const a = catalogAnswer(q, C, TODAY);
    for (const c of claims(a)) bad.push(`"${q}": ${c}\n    ${a.replace(/\n/g, ' ')}`);
  }
  assert.deepEqual(bad, []);
});

test('date answers follow the batch calendar on the day they are asked', () => {
  for (const iso of ['2026-10-26', '2026-10-27', '2026-12-31', '2027-01-01', '2027-02-22']) {
    const day = fromIso(iso);
    const [n] = nextStarts(1, day);
    const a = catalogAnswer('When does the next batch start?', C, day);
    assert.ok(a.includes(fmtDay(n.start)) && a.includes(fmtDay(n.applyBy)), `${iso}: ${a}`);
  }
});

test('answers only link to pages on this site', () => {
  for (const [q] of QUESTIONS) {
    const html = renderAnswer(catalogAnswer(q, C, TODAY));
    for (const [, href] of html.matchAll(/href="([^"]*)"/g)) {
      assert.match(href, /^\/(?!\/)/, `"${q}" links to ${href}`);
    }
  }
});

test('renderAnswer escapes HTML and never outputs external or script links', () => {
  const hostile = [
    '<script>alert(1)</script>',
    '<img src=x onerror=alert(1)>',
    '**<b onclick="x()">bold</b>**',
    '[click](javascript:alert(1))',
    '[click](JaVaScRiPt:alert(1))',
    '[click](https://evil.example/)',
    '[click](//evil.example/path)',
    '[click](/\\evil.example)',
    '[click](data:text/html;base64,PHNjcmlwdD4=)',
    '[x](/ok" onmouseover="alert(1))',
    '[x](/ok"onmouseover=alert)',
    '- [a](/fine/) and <iframe src="//evil.example"></iframe>',
  ];
  for (const md of hostile) {
    const html = renderAnswer(md);
    const tags = [...html.matchAll(/<\/?([a-z0-9]+)([^>]*)>/gi)];
    for (const [tag, name, attrs] of tags) {
      assert.ok(['p', 'br', 'ul', 'li', 'b', 'a'].includes(name.toLowerCase()), `${md}: unexpected <${name}> in ${html}`);
      if (name.toLowerCase() === 'a' && !tag.startsWith('</')) {
        assert.match(attrs, /^ href="[^"]*"$/, `${md}: a link has only an href: ${tag}`);
        const href = /href="([^"]*)"/.exec(attrs)[1];
        assert.match(href, /^\/(?![/\\])/, `${md}: link stays on this site: ${href}`);
      } else {
        assert.equal(attrs.trim(), '', `${md}: no attributes on <${name}>: ${tag}`);
      }
    }
  }
  assert.equal(renderAnswer('a & b < c'), '<p>a &amp; b &lt; c</p>');
  assert.equal(renderAnswer('**Bold** [Tuition](/tuition/#refunds)'), '<p><b>Bold</b> <a href="/tuition/#refunds">Tuition</a></p>');
  assert.equal(renderAnswer('Intro\n- one\n- two\n\nNext'), '<p>Intro</p><ul><li>one</li><li>two</li></ul><p>Next</p>');
  // Lines keep their order: a sentence after a list stays after it.
  assert.equal(renderAnswer('Intro:\n- one\n- two\nAfter.'), '<p>Intro:</p><ul><li>one</li><li>two</li></ul><p>After.</p>');
});

test('the catalog facts given to an AI model are true and complete', () => {
  const text = catalogText(C, TODAY);
  for (const want of ['Tuesday', 'Thursday', '19:00', 'IST', 'no graduates', 'Not an accredited degree', 'never downloadable', fmtDay(NEXT.start), fmtDay(AFTER.start),
    'Refund policy to be published before the first batch', 'No loans or scholarships yet']) {
    assert.ok(text.includes(want), `catalogText mentions "${want}"`);
  }
  for (const p of PROGRAMS) {
    assert.ok(text.includes(p.name) && text.includes(p.url), `catalogText describes ${p.name}`);
    assert.ok(text.includes(money(p.tuition.perTerm)), `catalogText has the ${p.name} tuition with its currency`);
  }
  assert.doesNotMatch(text, /median|fastest/i);
  assert.deepEqual(claims(text.replace(/https?:\/\/\S+/g, '')).filter((c) => !/contact details/.test(c)), []);
  assert.match(AI_RULES, /not an accredited degree/);
  assert.match(AI_RULES, /Never promise jobs/);
});

test('without a connected AI model the advisor runs in catalog mode', () => {
  assert.equal(aiAvailable(), false);
});
