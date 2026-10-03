// The page shell shared by every public page: document head (SEO, social, schema), skip link, status strip,
// header with the programs menu and phone menu, footer, and the AI advisor entry points.
import { html, raw, jsonBlock } from './html.mjs';
import { icon, wordmark } from './icons.mjs';
import { SITE, NAV, PHOTOS } from '../data/site.mjs';
import { PROGRAMS, LEVELS, nextStarts, fmtDay, isoDay } from '../data/programs.mjs';
import { organization, website } from './schema.mjs';

const CSP = [
  "default-src 'self'", "script-src 'self'", "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' https://fonts.gstatic.com", "img-src 'self' data:", "media-src 'self'",
  "connect-src 'self' https://*.supabase.co", "object-src 'none'", "base-uri 'self'", "form-action 'self'",
].join('; ');

// A date that the browser refreshes on load, so pages built days ago still show the right batch.
// kind: start | applyBy; n: which upcoming start (0 = next).
export const liveDate = (kind, n = 0, today) => {
  const s = nextStarts(n + 1, today)[n];
  const d = kind === 'applyBy' ? s.applyBy : s.start;
  return html`<time datetime="${isoDay(d)}" data-date="${kind}" data-n="${n}">${fmtDay(d)}</time>`;
};

function header(path) {
  const current = (href) => (path === href || (href !== '/' && path.startsWith(href)) ? 'page' : null);
  const byLevel = LEVELS.map(([lvl, title]) => html`
    <div><h3>${title}</h3>${PROGRAMS.filter((p) => p.level === lvl).map((p) => html`
      <a class="mp" href="${p.url}"><b>${p.name}</b><span>${p.duration} · ${p.weeklyHours} hrs/week</span></a>`)}</div>`);
  return html`
<header class="top">
  <div class="bar">
    <a class="logo" href="/" aria-label="Nuvora home">${wordmark()}</a>
    <nav class="main" aria-label="Main">
      <details class="megad" data-mega>
        <summary>Programs ${icon('down')}</summary>
        <div class="mega">
          ${byLevel}
          <div class="mside">
            <h3>Explore</h3>
            <a href="/programs/">All programs and comparison</a>
            <a href="/find-your-program/">Find my program</a>
            <a href="/careers/">Career paths and skills</a>
            <a href="/learn/">Topics</a>
            <a href="/learn/sample-lesson/">Try a sample lesson</a>
          </div>
        </div>
      </details>
      ${NAV.slice(1).map(([href, label], i) => html`<a href="${href}" class="${i > 2 ? 'opt' : ''}" ${current(href) ? raw('aria-current="page"') : ''}>${label}</a>`)}
    </nav>
    <div class="hbtns">
      <a class="login" href="/portal/">Student login</a>
      <a class="btn gold sm" href="/find-your-program/" data-cta="header-find">Find my program</a>
      <details class="mnav" data-mnav>
        <summary aria-label="Menu">${icon('menu')}</summary>
        <nav class="msheet" aria-label="Menu">
          ${NAV.map(([href, label]) => html`<a href="${href}" ${current(href) ? raw('aria-current="page"') : ''}>${label} ${icon('chev')}</a>`)}
          <a href="/find-your-program/">Find my program ${icon('chev')}</a>
          <a href="/learn/">Topics ${icon('chev')}</a>
          <a href="/about/">About Nuvora ${icon('chev')}</a>
          <hr>
          ${PROGRAMS.map((p) => html`<a href="${p.url}"><span>${p.name}<br><span class="sub">${p.duration}</span></span>${icon('chev')}</a>`)}
          <hr>
          <a class="btn ghost block" href="/portal/">Student login</a>
        </nav>
      </details>
    </div>
  </div>
</header>`;
}

function footer() {
  return html`
<footer class="sitefoot on-dark">
  <div class="wrap">
    <div class="fgrid">
      <div class="fbrand">
        <a class="logo" href="/" aria-label="Nuvora home">${wordmark({ light: true })}</a>
        <p>Online data science and AI programs taught in 12-week terms, with live classes every week and projects graded by instructors.</p>
      </div>
      <div><h2>Programs</h2><ul>${PROGRAMS.map((p) => html`<li><a href="${p.url}">${p.short}</a></li>`)}</ul></div>
      <div><h2>Explore</h2><ul>
        <li><a href="/find-your-program/">Find my program</a></li><li><a href="/careers/">Career paths</a></li>
        <li><a href="/learn/">Topics</a></li><li><a href="/how-it-works/">How it works</a></li><li><a href="/learn/sample-lesson/">Sample lesson</a></li></ul></div>
      <div><h2>Join</h2><ul>
        <li><a href="/admissions/">Admissions and start dates</a></li><li><a href="/tuition/">Tuition</a></li>
        <li><a href="/admissions/#request">Request a seat</a></li><li><a href="/portal/">Student login</a></li></ul></div>
      <div><h2>About</h2><ul>
        <li><a href="/about/">About Nuvora</a></li><li><a href="/contact/">Contact</a></li><li><a href="/legal/privacy/">Privacy</a></li>
        <li><a href="/legal/terms/">Terms</a></li><li><a href="/legal/credits/">Media credits</a></li></ul></div>
    </div>
    <div class="fbottom">
      <span>© <span data-year>${new Date().getFullYear()}</span> Nuvora</span>
      <p>Pre-launch: Nuvora has no graduates, reviews or job outcomes yet. Programs lead to a Nuvora certificate of completion, not an accredited degree. Photos and video show stock models, not Nuvora students.</p>
    </div>
  </div>
</footer>`;
}

const advisor = () => html`
<button class="advisor-pill" type="button" data-advisor-open hidden aria-haspopup="dialog">${icon('spark')}<span data-advisor-label>AI Advisor</span><span class="more" data-advisor-more>· Ask Nuvora AI</span></button>
<button class="askbar-m" type="button" data-advisor-open hidden aria-haspopup="dialog">${icon('spark')}<span data-advisor-mlabel>Ask AI</span></button>`;

/**
 * @param o.path         URL path, e.g. "/programs/"
 * @param o.title        unique page title (the site name is appended)
 * @param o.description  meta description, from true facts
 * @param o.body         main content (html)
 * @param o.schema       extra JSON-LD objects
 * @param o.scripts      extra module scripts (paths)
 * @param o.styles       extra stylesheets (paths), after site.css
 * @param o.image        social image path
 * @param o.status       404 pages skip canonical
 */
export function page({ path, title, description, body, schema = [], scripts = [], styles = [], image = PHOTOS.group.src, bodyClass = '', status = 200, today }) {
  const full = path === '/' ? `${title}` : `${title} | Nuvora`;
  const canonical = SITE.origin + path;
  const ld = [organization(), ...(path === '/' ? [website()] : []), ...schema];
  const next = nextStarts(1, today)[0];
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta http-equiv="Content-Security-Policy" content="${CSP}">
<title>${raw(html`${full}`)}</title>
<meta name="description" content="${raw(html`${description}`)}">
${status === 200 ? raw(`<link rel="canonical" href="${canonical}">`) : ''}
<meta name="robots" content="${SITE.indexable && status === 200 ? 'index, follow' : 'noindex, nofollow'}">
<meta name="theme-color" content="#0A1A3F">
<meta name="referrer" content="strict-origin-when-cross-origin">
<meta property="og:type" content="website">
<meta property="og:site_name" content="Nuvora">
<meta property="og:title" content="${raw(html`${title}`)}">
<meta property="og:description" content="${raw(html`${description}`)}">
<meta property="og:url" content="${canonical}">
<meta property="og:image" content="${SITE.origin}${image}">
<meta name="twitter:card" content="summary_large_image">
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:ital,wght@0,400;0,500;0,600;0,700;1,500&amp;family=Source+Serif+4:ital,opsz,wght@1,8..60,500&amp;family=Outfit:wght@600&amp;display=swap">
<link rel="preload" href="/fonts/ClashGrotesk-Medium.woff2" as="font" type="font/woff2" crossorigin>
<link rel="stylesheet" href="/css/site.css">
${styles.map((s) => `<link rel="stylesheet" href="${s}">`).join('')}
<script type="module" src="/js/site.js"></script>
${scripts.map((s) => `<script type="module" src="${s}"></script>`).join('\n')}
${ld.map((o) => `<script type="application/ld+json">${jsonBlock(o)}</script>`).join('\n')}
</head>
<body class="${bodyClass}">
<a class="skip" href="#main">Skip to content</a>
<div class="topstrip" data-strip><div class="wrap"><span><b>${SITE.status}</b> · Next start ${liveDate('start', 0, today)} · Seat requests close ${liveDate('applyBy', 0, today)}</span><a href="/admissions/">How joining works →</a></div></div>
${header(path)}
<main id="main" tabindex="-1">
${body}
</main>
${footer()}
${advisor()}
<div data-advisor-root></div>
</body>
</html>
`.replace(/\n{3,}/g, '\n\n');
}

// Standard header for inner pages.
export const pageHead = ({ eyebrow, title, lede, crumbs = [], extra = '' }) => html`
<section class="pagehead on-dark">
  <div class="wrap">
    ${crumbs.length ? breadcrumbs(crumbs) : ''}
    ${eyebrow && html`<span class="eyebrow">${eyebrow}</span>`}
    <h1>${title}</h1>
    ${lede && html`<p class="lede">${lede}</p>`}
    ${extra}
  </div>
</section>`;

export const breadcrumbs = (items) => html`
<nav class="crumbs" aria-label="Breadcrumb"><ol>${items.map(([href, label], i) => html`<li>${i === items.length - 1 ? html`<span aria-current="page">${label}</span>` : html`<a href="${href}">${label}</a>`}</li>`)}</ol></nav>`;
