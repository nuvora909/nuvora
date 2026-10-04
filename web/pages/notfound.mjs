// The branded 404 page (served by the dev server and hosts for any unknown path). It is never indexed.
import { html, accent } from '../lib/html.mjs';
import { icon } from '../lib/icons.mjs';
import { page, pageHead } from '../lib/layout.mjs';
import { PROGRAMS } from '../data/programs.mjs';

const body = () => html`
${pageHead({ eyebrow: 'Error 404', title: accent('We couldn’t find *that page*'), lede: 'The link may be old or mistyped. These pages can help you find what you were looking for.' })}
<section class="sec"><div class="wrap stack" style="gap:24px">
  <div class="row"><a class="btn primary" href="/">${icon('arrow')} Home</a><a class="btn ghost" href="/programs/">All programs</a><a class="btn ghost" href="/find-your-program/">Find my program</a><a class="btn ghost" href="/portal/">Student login</a></div>
  <div class="roles">${PROGRAMS.map((p) => html`<a class="role" href="${p.url}"><b>${p.name}</b><span>${p.duration}</span></a>`)}</div>
</div></section>`;

export default function notFound() {
  return [{ path: '/404', noindex: true, html: page({ path: '/404', status: 404, title: 'Page not found', description: `The page you asked for is not on the Nuvora website. Browse all ${PROGRAMS.length} programs, answer four questions in Find my program, or log in to the student portal.`, body: body() }) }];
}
