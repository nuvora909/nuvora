// Program pages: decisions about how they look that other tests do not cover.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { buildForTest, ROOT } from './helpers.mjs';
import { PROGRAMS } from '../../web/data/programs.mjs';

let site;
before(async () => { site = await buildForTest(); });
after(() => site?.cleanup());

test('program pages have no faded book watermark behind the content (the owner removed it on 10 Oct)', async () => {
  for (const p of PROGRAMS) {
    const html = site.pages.find((x) => x.path === p.url)?.html ?? '';
    assert.ok(html, `${p.url} was not built`);
    assert.doesNotMatch(html, /watermark|book-3d/i, `${p.url} still has the watermark`);
  }
  const css = await readFile(join(ROOT, 'web/assets/css/site.css'), 'utf8');
  assert.doesNotMatch(css, /book-watermark|book-3d/, 'site.css still styles the watermark');
});
