// The page shell shared by every public page: document head (SEO, social, schema), skip link, status strip,
// header with the programs menu and phone menu, footer, and the advisor entry points.
import { html, raw, jsonBlock } from './html.mjs';
import { icon, wordmark } from './icons.mjs';
import { SITE, NAV, PHOTOS, OWNER } from '../data/site.mjs';
import { PROGRAMS, TOPICS, LEVELS, nextStarts, fmtDay, isoDay } from '../data/programs.mjs';
import { ROLES } from '../data/careers.mjs';
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

// ---------------------------------------------------------------- footer
// Headed link columns, then a bottom bar with the year, the credential line and round icons for the social accounts
// the owner has configured. The column headings are plain headings; on phones showcase.js turns each into a button
// that opens and closes its list (without the script every list stays open).
const topicUrl = (t) => `/learn/${t.toLowerCase().replace(/\s+/g, '-')}/`;
export const FOOTER_COLUMNS = [
  ['Programs', [...PROGRAMS.map((p) => [p.url, p.short]), ['/programs/#compare', 'Compare programs']]],
  ['Topics', [...TOPICS.map((t) => [topicUrl(t), t]), ['/learn/sample-lesson/', 'Sample lesson'], ['/learn/', 'All topics']]],
  ['Careers', [...Object.entries(ROLES).map(([id, r]) => [`/careers/${id}/`, r.title]), ['/careers/', 'All career paths']]],
  ['Resources', [['/find-your-program/', 'Find my program'], ['/how-it-works/', 'How it works'], ['/tuition/', 'Tuition'], ['/admissions/', 'Admissions'], ['/#faq', 'FAQ']]],
  ['Nuvora', [['/about/', 'About'], ['/contact/', 'Contact'], ['/portal/', 'Student login'], ['/admissions/#request', 'Request a seat']]],
  ['Legal', [['/legal/privacy/', 'Privacy'], ['/legal/terms/', 'Terms'], ['/legal/credits/', 'Media credits'], ['/legal/accessibility/', 'Accessibility']]],
];

// Simple line glyphs (24×24, stroke), drawn for this site, for the round social buttons.
const SOCIAL = {
  linkedin: ['LinkedIn', 'M7 10.5V17 M7 7.2v.1 M11 17v-6.5 M11 13.2a2.6 2.6 0 0 1 5.2 0V17'],
  youtube: ['YouTube', 'M4 9.2C4 7.4 5.2 6.4 7 6.3c3.3-.2 6.7-.2 10 0 1.8.1 3 1.1 3 2.9v5.6c0 1.8-1.2 2.8-3 2.9-3.3.2-6.7.2-10 0-1.8-.1-3-1.1-3-2.9z M10.4 9.6l4.6 2.4-4.6 2.4z'],
  instagram: ['Instagram', 'M8 4h8a4 4 0 0 1 4 4v8a4 4 0 0 1-4 4H8a4 4 0 0 1-4-4V8a4 4 0 0 1 4-4z M12 8.6a3.4 3.4 0 1 0 0 6.8 3.4 3.4 0 0 0 0-6.8z M16.6 7.3v.1'],
  x: ['X', 'M5.5 5h3.6l9.4 14h-3.6z M18.4 5l-5.3 6 M5.7 19l5.4-6'],
  facebook: ['Facebook', 'M14.5 20v-7h2.4l.4-3h-2.8V8.4c0-.9.3-1.4 1.5-1.4h1.4V4.3c-.3 0-1.1-.1-2.1-.1-2.2 0-3.6 1.3-3.6 3.8V10H9.3v3h2.4v7'],
};

/** The configured social accounts, in display order: [key, name, url]. Only full https:// URLs count. */
export const socialLinks = (social = OWNER.social ?? {}) => Object.keys(SOCIAL)
  .filter((k) => typeof social[k] === 'string' && /^https:\/\/[^\s"<>]+$/.test(social[k]))
  .map((k) => [k, SOCIAL[k][0], social[k]]);

export function footer({ social = OWNER.social } = {}) {
  const links = socialLinks(social ?? {});
  return html`
<footer class="sitefoot">
  <div class="wrap">
    <div class="sitefoot-top">
      <a class="logo" href="/" aria-label="Nuvora home">${wordmark({ light: true })}</a>
      <p>Online data science and AI programs taught in 12-week terms, with live classes every week and projects graded by instructors.</p>
      <p class="sitefoot-pre">Pre-launch: Nuvora has no graduates, reviews or job outcomes yet. Photos and video on this site show stock models, not Nuvora students.</p>
    </div>
    <nav class="sitefoot-cols" aria-label="Footer">${FOOTER_COLUMNS.map(([title, items], i) => html`
      <div class="sitefoot-col" data-foot-col>
        <h2>${title}</h2>
        <ul id="foot-col-${i + 1}">${items.map(([href, label]) => html`<li><a href="${href}">${label}</a></li>`)}</ul>
      </div>`)}
    </nav>
    <div class="sitefoot-bar">
      <p class="sitefoot-legal"><span>© <span data-year>${new Date().getFullYear()}</span> Nuvora</span><span>Nuvora certificate of completion · not an accredited degree</span></p>
      ${links.length ? html`<ul class="sitefoot-social">${links.map(([k, name, url]) => html`
        <li><a href="${url}" rel="noopener noreferrer me" aria-label="Nuvora on ${name}"><svg class="ic" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="${SOCIAL[k][1]}"/></svg></a></li>`)}</ul>` : ''}
    </div>
  </div>
</footer>`;
}

// The advisor answers from the published catalog unless an AI model is connected, so its labels start honest;
// site.js switches to the AI labels only when a model is present.
const advisor = () => html`
<button class="advisor-pill" type="button" data-advisor-open hidden aria-haspopup="dialog">${icon('spark')}<span data-advisor-label>Ask Nuvora</span><span class="more" data-advisor-more>· catalog answers</span></button>
<button class="askbar-m" type="button" data-advisor-open hidden aria-haspopup="dialog">${icon('spark')}<span data-advisor-mlabel>Ask Nuvora</span></button>`;

// The logo intro: a white overlay that plays the wordmark once per visit (web/assets/css/intro.css). Decorative and
// aria-hidden, with nothing focusable. It is display:none until intro.css shows it, so without that stylesheet, with
// reduced motion or on a later page of the visit (js/intro-gate.js) it never appears. js/intro.js skips it on a
// click or key, removes it, and fires "nuvora:intro-done" on document for scripts that should wait for it.
const introLetters = (text, from) => [...text].map((c, i) => `<span class="intro-l" style="--i:${from + i}">${c}</span>`).join('');
// Data points that gather toward the mark: [x offset, y offset, delay ms], spread around the frame.
const INTRO_DOTS = [[-42, -30, 0], [38, -34, 60], [-48, 8, 120], [46, 12, 40], [-30, 34, 160], [28, 36, 100], [-12, -40, 200],
  [14, -42, 140], [-50, -12, 240], [50, -6, 180], [-20, 42, 260], [22, -24, 300]];
const introDots = INTRO_DOTS.map(([x, y, d]) => `<i style="--x:${x}vw;--y:${y}vh;--d:${d}"></i>`).join('');
export const intro = () => raw(`<div class="intro" data-intro aria-hidden="true" style="display:none">`
  + `<span class="intro-bar top"></span><span class="intro-bar bottom"></span><span class="intro-dots">${introDots}</span><span class="intro-flare"></span>`
  + `<div class="intro-stage"><div class="intro-mark"><span class="wm">${introLetters('nuv', 0)}`
  + '<svg class="intro-o" style="--i:3" viewBox="0 0 40 40" focusable="false"><defs><linearGradient id="intro-g" x1="0" y1="1" x2="1" y2="0"><stop offset="0" stop-color="#0064E0"/><stop offset="1" stop-color="#0082FB"/></linearGradient></defs>'
  + '<circle class="intro-ring" cx="19" cy="23" r="13.5" pathLength="1" transform="rotate(-47 19 23)" fill="none" stroke="url(#intro-g)" stroke-width="6.5"/><circle class="intro-dot" cx="34" cy="7" r="4.5" fill="#0082FB"/></svg>'
  + `${introLetters('ra', 4)}</span></div>`
  + '<p class="intro-tag">Build the skills your next career demands</p></div></div>');

/**
 * @param o.path         URL path, e.g. "/programs/"
 * @param o.title        unique page title (the site name is appended)
 * @param o.description  meta description, from true facts
 * @param o.body         main content (html)
 * @param o.schema       extra JSON-LD objects
 * @param o.scripts      extra module scripts (paths)
 * @param o.styles       extra stylesheets (paths), after site.css and showcase.css
 * @param o.image        social image path
 * @param o.status       404 pages skip canonical
 * @param o.noindex      keep the page out of search results (it keeps its canonical link; the build leaves it out of
 *                       the sitemap when the page object also says noindex). Robots: "noindex, nofollow" on every page
 *                       while SITE.indexable is false (pre-launch); after that, "noindex, follow" for these pages.
 */
export function page({ path, title, description, body, schema = [], scripts = [], styles = [], image = PHOTOS.group.src, bodyClass = '', status = 200, noindex = false, today }) {
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
<meta name="robots" content="${!SITE.indexable || status !== 200 ? 'noindex, nofollow' : noindex ? 'noindex, follow' : 'index, follow'}">
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
<script src="/js/intro-gate.js"></script>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:ital,wght@0,400;0,500;0,600;0,700;1,500&amp;family=Source+Serif+4:ital,opsz,wght@1,8..60,500&amp;family=Outfit:wght@600&amp;display=swap">
<link rel="preload" href="/fonts/ClashGrotesk-Medium.woff2" as="font" type="font/woff2" crossorigin>
<link rel="stylesheet" href="/css/site.css">
<link rel="stylesheet" href="/css/showcase.css">
<link rel="stylesheet" href="/css/intro.css">
${styles.map((s) => `<link rel="stylesheet" href="${s}">`).join('')}
<script type="module" src="/js/intro.js"></script>
<script type="module" src="/js/site.js"></script>
<script type="module" src="/js/showcase.js"></script>
${scripts.map((s) => `<script type="module" src="${s}"></script>`).join('\n')}
${ld.map((o) => `<script type="application/ld+json">${jsonBlock(o)}</script>`).join('\n')}
</head>
<body class="${bodyClass}">
${intro()}
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
