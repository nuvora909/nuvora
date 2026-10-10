// Markup shared by the program guide and the brochure: the dark "storm" sky (glows, a grid floor and two lightning
// streaks, all decorative and drawn in CSS/SVG), section kickers, the gold-italic program name and the 12-week strip.
// Styles: web/assets/css/guide.css.
import { html, raw, accent } from './html.mjs';
import { nameParts, weekStrip, LIVE } from './guide-data.mjs';

// A forked lightning streak (viewBox 120 x 420). Its flicker is opacity only, and it stands still with reduced motion.
const BOLT = 'M78 0 L60 62 L74 66 L46 140 L62 146 L34 226 L52 232 L22 318 L40 322 L14 420 M60 62 L38 96 L44 118 M46 140 L80 178 L74 204 M34 226 L10 262';
export const bolt = (cls) => raw(`<svg class="storm-bolt ${cls}" viewBox="0 0 120 420" aria-hidden="true" focusable="false"><path class="storm-bolt-glow" d="${BOLT}"/><path class="storm-bolt-core" d="${BOLT}"/></svg>`);

/** The decorative sky behind the top of a storm stage. */
export const stormSky = () => html`
<div class="storm-sky" aria-hidden="true">
  <span class="storm-glow g1"></span><span class="storm-glow g2"></span><span class="storm-glow g3"></span>
  <span class="storm-stars"></span>
  ${bolt('b1')}${bolt('b2')}
  <span class="storm-floor"></span>
</div>`;

/** An uppercase, letter-spaced kicker with a short gold rule. */
export const kicker = (text) => html`<p class="st-kicker">${text}</p>`;

/** The program name with its last word in the gold serif italic. */
export function goldName(p) {
  const [lead, last] = nameParts(p.name);
  return html`${lead}<span class="serif">${last}</span>`;
}

/** A section head: kicker, heading (with *accent*), optional lede. */
export const head = ({ id, k, title, lede, level = 2 }) => html`
<div class="st-head">
  ${kicker(k)}
  ${raw(`<h${level} id="${id}">`)}${accent(title)}${raw(`</h${level}>`)}
  ${lede && html`<p class="st-lede">${lede}</p>`}
</div>`;

/**
 * The 12 weeks of a term as a strip: the live class and office hours every week, and the weeks a graded project is
 * due. The dots are decoration; each week's text says the same for screen readers.
 */
export const weekStripHtml = (p, { headingLevel = 3, title = 'A term, week by week' } = {}) => html`
<div class="st-weeks">
  <div class="st-weeks-head">${raw(`<h${headingLevel}>`)}${title}${raw(`</h${headingLevel}>`)}<p>Every term is a 12-week batch that starts on the first Monday of a month.</p></div>
  <ol class="st-strip">${weekStrip(p).map(({ week, project }) => html`
    <li class="${project ? 'due' : ''}"><span class="wk"><span aria-hidden="true">Wk</span><span class="sr-only">Week</span> <b>${week}</b></span><span class="dots" aria-hidden="true"><i class="c"></i><i class="o"></i></span><span class="sr-only">: live class and office hours${project ? `, project ${project} due` : ''}</span>${project ? html`<span class="pj" aria-hidden="true">Project ${project}</span>` : ''}</li>`)}
  </ol>
  <ul class="st-legend">
    <li><i class="c" aria-hidden="true"></i>Live class · ${LIVE.classLine}</li>
    <li><i class="o" aria-hidden="true"></i>Office hours · ${LIVE.officeLine}</li>
    <li><i class="p" aria-hidden="true"></i>Graded project due</li>
  </ul>
</div>`;
