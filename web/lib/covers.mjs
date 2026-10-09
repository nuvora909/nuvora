// Original cover artwork for each program, drawn as SVG at build time and written to /covers/<slug>.svg by
// scripts/build-site.mjs. Meta-blue led, with navy depth and small cyan, violet and gold accents, a motif for the
// subject and a big short label. No people, no photos and no third-party logos.
//
// Covers are shown with <img>, so they cannot use the page's web fonts: the label uses system sans fonts and is
// fitted to a measured width with textLength, so it looks the same size on every platform.
import { esc } from './html.mjs';

// The brand palette, as plain colours (an SVG file cannot read the site's CSS custom properties).
const C = {
  navy: '#061230', navy2: '#0A1A3F', blue: '#0866FF', blue2: '#0082FB', blue3: '#0064E0', blue4: '#0047B3',
  sky: '#8EC5FF', ice: '#BFD9FF', cyan: '#22D3EE', violet: '#6D5DF6', gold: '#F5B82E', gold2: '#FFD66B', white: '#FFFFFF',
};
const W = 640, H = 360;
const BOOK_W = 480, BOOK_H = 640;
const FONT = "'Segoe UI','Helvetica Neue',Helvetica,Arial,sans-serif";

// Approximate advance widths of bold capitals (em), to size the label pill before the browser lays it out.
const ADV = { A: .68, B: .64, C: .63, D: .72, E: .55, F: .52, G: .71, H: .74, I: .3, J: .4, K: .64, L: .51, M: .9, N: .76, O: .76, P: .61,
  Q: .76, R: .64, S: .57, T: .58, U: .72, V: .66, W: .98, X: .64, Y: .61, Z: .58, ' ': .27, '&': .74 };
const textWidth = (s, size) => [...s].reduce((w, ch) => w + (ADV[ch] ?? .62), 0) * size;

// Deterministic pseudo-random numbers, so every build draws the same picture.
function rng(seed) {
  let s = seed >>> 0;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
}
const r1 = (n) => Math.round(n * 10) / 10;

// A four-point sparkle centred on (x, y).
const sparkle = (x, y, s, fill, op = 1) => `<path d="M${x} ${y - s}Q${x} ${y} ${x + s} ${y}Q${x} ${y} ${x} ${y + s}Q${x} ${y} ${x - s} ${y}Q${x} ${y} ${x} ${y - s}Z" fill="${fill}" fill-opacity="${op}"/>`;
const glass = (x, y, w, h, rx = 18, op = 0.07) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${rx}" fill="${C.white}" fill-opacity="${op}" stroke="${C.white}" stroke-opacity=".18"/>`;

// ---------------------------------------------------------------- motifs (all drawn in the right-hand area)

// Data science: a scatter plot with a fitted regression line, its confidence band and a dashed second model.
function scatter() {
  const rand = rng(7);
  const x0 = 340, x1 = 584, y0 = 210, y1 = 100;
  const lineY = (x) => y0 + ((y1 - y0) * (x - x0)) / (x1 - x0);
  const pts = Array.from({ length: 34 }, (_, i) => {
    const x = 350 + (i / 33) * 228 + (rand() - 0.5) * 14;
    const noise = (rand() + rand() + rand() - 1.5) * 52;
    return [r1(x), r1(Math.max(70, Math.min(226, lineY(x) + noise)))];
  });
  const resid = pts.filter((_, i) => i % 5 === 2).map(([x, y]) => `<path d="M${x} ${y}V${r1(lineY(x))}" stroke="${C.cyan}" stroke-opacity=".7" stroke-width="1.5" stroke-dasharray="3 3"/>`).join('');
  const dots = pts.map(([x, y], i) => `<circle cx="${x}" cy="${y}" r="${i % 4 === 0 ? 6 : 4.6}" fill="${i % 6 === 1 ? C.cyan : C.white}" fill-opacity="${i % 4 === 0 ? 1 : 0.86}"/>`).join('');
  return `${glass(312, 40, 300, 218, 20)}
<path d="M340 66V230H592" fill="none" stroke="${C.ice}" stroke-opacity=".55" stroke-width="1.6"/>
${[110, 150, 190].map((y) => `<path d="M340 ${y}H592" stroke="${C.white}" stroke-opacity=".07"/>`).join('')}
<path d="M${x0} ${y0 - 22}L${x1} ${y1 - 18}L${x1} ${y1 + 18}L${x0} ${y0 + 22}Z" fill="url(#band)"/>
<path d="M340 222C410 204 452 134 588 104" fill="none" stroke="${C.white}" stroke-opacity=".5" stroke-width="2.4" stroke-dasharray="7 7"/>
${resid}${dots}
<path d="M${x0} ${y0}L${x1} ${y1}" stroke="${C.gold}" stroke-width="5" stroke-linecap="round" filter="url(#soft)"/>
<path d="M${x0} ${y0}L${x1} ${y1}" stroke="${C.gold2}" stroke-width="2" stroke-linecap="round"/>
<circle cx="${x1}" cy="${y1}" r="7" fill="${C.gold}" stroke="${C.white}" stroke-width="2"/>`;
}

// AI and machine learning: a small neural network with two highlighted paths.
function network() {
  const layers = [[336, 3], [424, 4], [512, 4], [596, 2]].map(([x, n]) => Array.from({ length: n }, (_, i) => [x, 142 + (i - (n - 1) / 2) * 48]));
  const gold = [[0, 1], [1, 1], [2, 2], [3, 0]];
  const cyan = [[0, 0], [1, 0], [2, 1], [3, 1]];
  const edge = (a, b, stroke, w, op) => `<path d="M${a[0]} ${a[1]}L${b[0]} ${b[1]}" stroke="${stroke}" stroke-width="${w}" stroke-opacity="${op}" stroke-linecap="round"/>`;
  const all = layers.slice(0, -1).flatMap((L, l) => L.flatMap((a) => layers[l + 1].map((b) => edge(a, b, C.sky, 1.3, 0.24)))).join('');
  const path = (p, stroke) => p.slice(0, -1).map(([l, i], k) => edge(layers[l][i], layers[p[k + 1][0]][p[k + 1][1]], stroke, 3.2, 1)).join('');
  const on = (l, i) => gold.some(([a, b]) => a === l && b === i) || cyan.some(([a, b]) => a === l && b === i);
  const nodes = layers.flatMap((L, l) => L.map(([x, y], i) => {
    if (l === 3 && i === 0) return `<circle cx="${x}" cy="${y}" r="15" fill="${C.gold}" stroke="${C.gold2}" stroke-width="3" filter="url(#soft)"/><circle cx="${x}" cy="${y}" r="5" fill="${C.white}"/>`;
    return on(l, i)
      ? `<circle cx="${x}" cy="${y}" r="13" fill="${C.blue}" stroke="${C.white}" stroke-width="2.6"/>`
      : `<circle cx="${x}" cy="${y}" r="12" fill="${C.navy2}" stroke="${C.sky}" stroke-width="2.4"/>`;
  })).join('');
  const inputs = layers[0].map(([x, y]) => `<path d="M${x - 46} ${y}H${x - 22}" stroke="${C.ice}" stroke-opacity=".6" stroke-width="2.4" stroke-linecap="round" stroke-dasharray="2 6"/>`).join('');
  return `${all}${inputs}<g filter="url(#soft)">${path(gold, C.gold)}${path(cyan, C.cyan)}</g>${nodes}
${sparkle(612, 54, 9, C.white, 0.9)}${sparkle(300, 60, 6, C.cyan, 0.9)}`;
}

// Applied machine learning: contour lines of a loss surface and a gradient-descent path to the minimum.
function contours() {
  const cx = 470, cy = 152;
  const rings = Array.from({ length: 8 }, (_, k) => {
    const n = k + 1;
    const op = r1(0.95 - k * 0.1);
    const stroke = k < 2 ? C.cyan : k < 5 ? C.sky : C.ice;
    return `<ellipse cx="${cx}" cy="${cy}" rx="${n * 22}" ry="${n * 13}" fill="none" stroke="${stroke}" stroke-opacity="${op}" stroke-width="${k < 2 ? 2 : 1.5}"/>`;
  }).join('');
  const steps = [[606, 58], [566, 120], [528, 96], [503, 140], [484, 130], [474, 150], [470, 152]];
  const d = steps.map(([x, y], i) => `${i ? 'L' : 'M'}${x} ${y}`).join('');
  const dots = steps.slice(0, -1).map(([x, y], i) => `<circle cx="${x}" cy="${y}" r="${i ? 5 : 7}" fill="${C.white}" stroke="${C.gold}" stroke-width="2.4"/>`).join('');
  return `<circle cx="${cx}" cy="${cy}" r="70" fill="url(#pit)"/>
<g transform="rotate(-18 ${cx} ${cy})">${rings}</g>
<path d="${d}" fill="none" stroke="${C.gold}" stroke-width="5" stroke-linejoin="round" stroke-linecap="round" filter="url(#soft)"/>
<path d="${d}" fill="none" stroke="${C.gold2}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>
${dots}<circle cx="${cx}" cy="${cy}" r="9" fill="${C.gold}" stroke="${C.white}" stroke-width="3"/>
${sparkle(cx + 22, cy - 24, 8, C.white, 0.95)}`;
}

// Analytics: a dashboard card with KPI tiles, a donut, bars and a trend line. Shapes only, no numbers.
function dashboard() {
  const bars = [40, 60, 50, 76, 66, 98, 84];
  const base = 252;
  const barEls = bars.map((h, i) => {
    const x = 326 + i * 38;
    return `<rect x="${x}" y="${base - h}" width="24" height="${h}" rx="6" fill="${i === 5 ? 'url(#goldbar)' : 'url(#bar)'}"/>`;
  }).join('');
  const line = bars.map((h, i) => [326 + i * 38 + 12, base - h - 20]);
  const seg = (len, off, color) => `<circle cx="562" cy="88" r="24" fill="none" stroke="${color}" stroke-width="10" stroke-dasharray="${r1(len)} 151" stroke-dashoffset="${r1(-off)}" transform="rotate(-90 562 88)"/>`;
  const c = 2 * Math.PI * 24;
  return `${glass(304, 34, 312, 238, 20, 0.08)}
<rect x="324" y="52" width="96" height="9" rx="4.5" fill="${C.white}" fill-opacity=".75"/><rect x="324" y="67" width="62" height="7" rx="3.5" fill="${C.white}" fill-opacity=".32"/>
<rect x="324" y="86" width="88" height="36" rx="10" fill="${C.white}" fill-opacity=".09"/><rect x="336" y="96" width="40" height="6" rx="3" fill="${C.ice}" fill-opacity=".8"/><path d="M336 113l10-5 8 3 12-8" fill="none" stroke="${C.cyan}" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/>
<rect x="422" y="86" width="88" height="36" rx="10" fill="${C.white}" fill-opacity=".09"/><rect x="434" y="96" width="34" height="6" rx="3" fill="${C.ice}" fill-opacity=".8"/><rect x="434" y="108" width="54" height="6" rx="3" fill="${C.gold}" fill-opacity=".9"/>
<circle cx="562" cy="88" r="24" fill="none" stroke="${C.white}" stroke-opacity=".14" stroke-width="10"/>
${seg(c * 0.46, 0, C.blue2)}${seg(c * 0.24, c * 0.46, C.cyan)}${seg(c * 0.14, c * 0.7, C.gold)}
<path d="M318 ${base}H604" stroke="${C.ice}" stroke-opacity=".45" stroke-width="1.4"/>
${barEls}
<path d="${line.map(([x, y], i) => `${i ? 'L' : 'M'}${x} ${y}`).join('')}" fill="none" stroke="${C.cyan}" stroke-width="3" stroke-linejoin="round" stroke-linecap="round"/>
${line.map(([x, y], i) => `<circle cx="${x}" cy="${y}" r="${i === 5 ? 5.5 : 3.6}" fill="${i === 5 ? C.gold : C.white}"/>`).join('')}`;
}

// Python: a code editor with syntax-coloured lines, and a dataframe table in front of it.
function codeGrid() {
  const kw = C.sky, name = C.white, str = C.gold, fn = C.cyan, dim = C.white;
  const lines = [
    [[0, 46, kw], [52, 58, name, 0.85], [116, 22, kw], [144, 24, name, 0.85]],
    [[0, 46, kw], [52, 50, name, 0.85], [108, 22, kw], [136, 22, name, 0.85]],
    [],
    [[0, 22, name, 0.85], [28, 10, dim, 0.5], [44, 64, fn], [114, 66, str]],
    [[0, 22, name, 0.85], [28, 10, dim, 0.5], [44, 80, fn], [130, 36, str]],
    [[18, 52, fn], [76, 44, name, 0.7]],
    [[0, 128, dim, 0.28]],
  ];
  const code = lines.map((toks, i) => toks.map(([x, w, color, op = 1]) => `<rect x="${340 + x}" y="${74 + i * 17}" width="${w}" height="7" rx="3.5" fill="${color}" fill-opacity="${op}"/>`).join('')
    + `<rect x="314" y="${74 + i * 17}" width="12" height="7" rx="3.5" fill="${C.white}" fill-opacity=".16"/>`).join('');
  const gx = 392, gy = 158, cw = [36, 64, 64, 64], rh = 30;
  const colX = cw.reduce((a, w) => [...a, a[a.length - 1] + w], [gx]);
  const gw = colX[colX.length - 1] - gx;
  const rows = Array.from({ length: 4 }, (_, r) => {
    const y = gy + 30 + r * rh;
    const stripe = r % 2 ? `<rect x="${gx}" y="${y}" width="${gw}" height="${rh}" fill="${C.white}" fill-opacity=".05"/>` : '';
    const cells = cw.map((w, c) => {
      const len = c === 0 ? 12 : [30, 42, 24, 36, 46, 28][(r * 3 + c) % 6];
      const hot = r === 2 && c === 2;
      return `<rect x="${colX[c] + 10}" y="${y + 12}" width="${len}" height="7" rx="3.5" fill="${hot ? C.gold : c === 0 ? C.sky : C.white}" fill-opacity="${hot ? 1 : c === 0 ? 0.7 : 0.62}"/>`;
    }).join('');
    return stripe + cells;
  }).join('');
  const head = cw.slice(1).map((w, c) => `<rect x="${colX[c + 1] + 10}" y="${gy + 12}" width="${[34, 40, 28][c]}" height="7" rx="3.5" fill="${C.white}"/>`).join('');
  const vlines = colX.slice(1, -1).map((x) => `<path d="M${x} ${gy + 30}V${gy + 30 + 4 * rh}" stroke="${C.white}" stroke-opacity=".08"/>`).join('');
  return `<rect x="300" y="34" width="268" height="176" rx="16" fill="${C.navy}" fill-opacity=".82" stroke="${C.white}" stroke-opacity=".18"/>
<circle cx="318" cy="52" r="4.5" fill="${C.gold}"/><circle cx="333" cy="52" r="4.5" fill="${C.cyan}"/><circle cx="348" cy="52" r="4.5" fill="${C.white}" fill-opacity=".45"/>
${code}<rect x="${340 + 132}" y="${74 + 5 * 17 - 2}" width="2.5" height="11" fill="${C.cyan}"/>
<g filter="url(#lift)"><rect x="${gx}" y="${gy}" width="${gw}" height="${30 + 4 * rh}" rx="12" fill="${C.navy2}" stroke="${C.white}" stroke-opacity=".2"/></g>
<path d="M${gx + 12} ${gy}H${gx + gw - 12}A12 12 0 0 1 ${gx + gw} ${gy + 12}V${gy + 30}H${gx}V${gy + 12}A12 12 0 0 1 ${gx + 12} ${gy}Z" fill="${C.blue}"/>
${head}${rows}${vlines}`;
}

// Generative AI: a prompt and an answer as chat bubbles, a row of tokens and sparkles.
function chat() {
  const toks = [40, 56, 34, 60, 44];
  let x = 330;
  const tokEls = toks.map((w, i) => {
    const color = i === 1 ? C.gold : i === 3 ? C.cyan : C.sky;
    const el = `<rect x="${x}" y="226" width="${w}" height="26" rx="9" fill="${color}" fill-opacity="${i === 1 || i === 3 ? 0.22 : 0.1}" stroke="${color}" stroke-opacity=".75" stroke-width="1.5"/><rect x="${x + 10}" y="236" width="${w - 20}" height="6" rx="3" fill="${C.white}" fill-opacity=".8"/>`;
    x += w + 8;
    return el;
  }).join('');
  return `<rect x="318" y="42" width="196" height="56" rx="18" fill="${C.white}" fill-opacity=".1" stroke="${C.white}" stroke-opacity=".24"/>
<path d="M336 98l-8 14 22-14z" fill="${C.white}" fill-opacity=".1"/>
<rect x="338" y="60" width="128" height="8" rx="4" fill="${C.white}" fill-opacity=".8"/><rect x="338" y="75" width="84" height="8" rx="4" fill="${C.white}" fill-opacity=".42"/>
<rect x="318" y="148" width="54" height="30" rx="15" fill="${C.white}" fill-opacity=".1" stroke="${C.white}" stroke-opacity=".2"/>
<circle cx="333" cy="163" r="3.6" fill="${C.white}"/><circle cx="345" cy="163" r="3.6" fill="${C.white}" fill-opacity=".7"/><circle cx="357" cy="163" r="3.6" fill="${C.white}" fill-opacity=".4"/>
<g filter="url(#lift)"><rect x="382" y="112" width="226" height="94" rx="20" fill="url(#bubble)" stroke="${C.white}" stroke-opacity=".3"/></g>
<path d="M588 206l14 14-2-16z" fill="${C.blue}"/>
${sparkle(404, 134, 8, C.gold)}
<rect x="420" y="130" width="150" height="8" rx="4" fill="${C.white}" fill-opacity=".95"/><rect x="402" y="152" width="184" height="8" rx="4" fill="${C.white}" fill-opacity=".75"/><rect x="402" y="172" width="118" height="8" rx="4" fill="${C.white}" fill-opacity=".55"/>
${tokEls}
<g filter="url(#soft)">${sparkle(586, 60, 22, C.gold)}</g>${sparkle(586, 60, 10, C.gold2)}${sparkle(614, 100, 8, C.white, 0.9)}${sparkle(552, 34, 6, C.cyan)}`;
}

// MLOps: a pipeline DAG from data to deployment, with monitoring feeding back into training.
function dag() {
  const w = 58, h = 44;
  const N = { data: [306, 54], feat: [382, 54], train: [458, 54], evalu: [534, 54], deploy: [534, 158], monitor: [458, 158] };
  const node = (k, fill, stroke) => { const [x, y] = N[k]; return `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="13" fill="${fill}" stroke="${stroke}" stroke-width="2"/>`; };
  const mid = (k) => [N[k][0] + w / 2, N[k][1] + h / 2];
  const glyph = {
    data: ([x, y]) => `<ellipse cx="${x}" cy="${y - 7}" rx="10" ry="4" fill="none" stroke="${C.ice}" stroke-width="2"/><path d="M${x - 10} ${y - 7}v13c0 2.2 4.5 4 10 4s10-1.8 10-4v-13M${x - 10} ${y - 1}c0 2.2 4.5 4 10 4s10-1.8 10-4" fill="none" stroke="${C.ice}" stroke-width="2"/>`,
    feat: ([x, y]) => `<path d="M${x - 9} ${y + 9}v-8M${x} ${y + 9}v-18M${x + 9} ${y + 9}v-12" stroke="${C.cyan}" stroke-width="3.4" stroke-linecap="round"/>`,
    train: ([x, y]) => `<path d="M${x + 9} ${y - 3}a9.5 9.5 0 1 0 1 7" fill="none" stroke="${C.white}" stroke-width="2.6" stroke-linecap="round"/><path d="M${x + 11} ${y - 10}v7h-7" fill="none" stroke="${C.white}" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/>`,
    evalu: ([x, y]) => `<circle cx="${x}" cy="${y}" r="10" fill="none" stroke="${C.ice}" stroke-width="2.2"/><path d="M${x - 5} ${y}l3.5 3.5 6.5-7" fill="none" stroke="${C.gold}" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/>`,
    deploy: ([x, y]) => `<path d="M${x} ${y + 8}v-16M${x - 7} ${y - 2}l7-7 7 7M${x - 11} ${y + 11}h22" fill="none" stroke="${C.ice}" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/>`,
    monitor: ([x, y]) => `<path d="M${x - 13} ${y + 1}h6l3-8 5 15 4-10 2 3h6" fill="none" stroke="${C.gold}" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/>`,
  };
  const arrow = (d, stroke = C.sky, dash = '') => `<path d="${d}" fill="none" stroke="${stroke}" stroke-width="2.4" ${dash} marker-end="url(#${stroke === C.gold ? 'ahg' : 'ah'})"/>`;
  return `<path d="M268 76h26M276 64h18M276 88h18" stroke="${C.ice}" stroke-opacity=".5" stroke-width="2" stroke-linecap="round" stroke-dasharray="2 5"/>
${arrow(`M${306 + w} 76H${382 - 4}`)}${arrow(`M${382 + w} 76H${458 - 4}`)}${arrow(`M${458 + w} 76H${534 - 4}`)}
${arrow(`M563 ${54 + h}V${158 - 4}`)}${arrow(`M534 180H${458 + w + 4}`)}
${arrow(`M487 158C487 130 487 128 487 ${54 + h + 4}`, C.gold, 'stroke-dasharray="5 5"')}
${node('data', C.navy2, C.sky)}${node('feat', C.navy2, C.sky)}
<g filter="url(#soft)">${node('train', C.blue, C.white)}</g>${node('train', C.blue, C.white)}
${node('evalu', C.navy2, C.sky)}${node('deploy', C.navy2, C.sky)}${node('monitor', C.navy2, C.gold)}
${Object.keys(glyph).map((k) => glyph[k](mid(k))).join('')}
${glass(430, 226, 176, 50, 14, 0.08)}
<path d="M444 258l14-6 12 4 14-14 12 8 14-10 14 12 14-6 14 6 22-8" fill="none" stroke="${C.cyan}" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/>
<path d="M444 266H594" stroke="${C.white}" stroke-opacity=".12"/>`;
}

// ---------------------------------------------------------------- per-program art direction
// label: lines of the big label (the last line sits on a blue pill). bg: [start, middle, end] of the background.
export const COVERS = {
  'bs-ds': { label: ['DATA', 'SCIENCE'], motif: scatter, bg: [C.navy, C.blue4, C.blue2], glow: C.cyan,
    desc: 'a scatter plot with a fitted regression line and its confidence band' },
  'bs-aiml': { label: ['AI & ML'], motif: network, bg: ['#050B22', '#0A2C86', C.blue], glow: C.violet,
    desc: 'a neural network of connected nodes with two highlighted paths' },
  'ms-aml': { label: ['APPLIED', 'ML'], motif: contours, bg: [C.navy, C.blue3, C.blue2], glow: C.cyan,
    desc: 'contour lines of a loss surface with a gradient-descent path stepping down to the minimum' },
  'ms-ds': { label: ['DATA', 'ANALYTICS'], motif: dashboard, bg: [C.navy2, C.blue4, C.blue], glow: C.violet,
    desc: 'an analytics dashboard with bars, a trend line and a donut chart' },
  'c-py': { label: ['PYTHON'], motif: codeGrid, bg: [C.navy, '#0A3A99', C.blue2], glow: C.cyan,
    desc: 'a Python code editor with a dataframe table in front of it' },
  'c-genai': { label: ['GENERATIVE', 'AI'], motif: chat, bg: ['#07102E', C.blue4, C.blue], glow: C.violet,
    desc: 'a prompt and an answer as chat bubbles, a row of tokens and sparkles' },
  'c-mlops': { label: ['MLOPS'], motif: dag, bg: [C.navy, C.blue3, C.blue2], glow: C.cyan,
    desc: 'a machine learning pipeline from data to deployment, with monitoring feeding back into training' },
};

// Served from the site build, not web/static: the dev server maps /img/ straight to web/static/img.
export const coverUrl = (p) => `/covers/${p.slug}.svg`;

// How label words read in alt text: acronyms keep their capitals, other words are title case.
const SPOKEN = { AI: 'AI', ML: 'ML', MLOPS: 'MLOps', '&': 'and' };

/** Alt text for a program's cover. */
export function coverAlt(p) {
  const c = COVERS[p.id];
  const words = c.label.join(' ').split(' ').map((w) => SPOKEN[w] ?? w[0] + w.slice(1).toLowerCase()).join(' ');
  return `Cover illustration: ${c.desc}, with the label “${words}”`;
}

// The big label: plain lines above, the last line on a blue pill (fitted with textLength).
function label(lines) {
  const left = 36;
  const big = lines.length === 1 ? 50 : 44;
  const small = 40;
  const last = lines[lines.length - 1];
  const lastW = Math.round(textWidth(last, big));
  const pillY = 330 - (big * 0.72 + 26);
  const pillH = 330 - pillY;
  const out = [`<rect x="${left - 4}" y="${r1(pillY)}" width="${lastW + 32}" height="${r1(pillH)}" rx="14" fill="url(#pill)"/>`,
    `<text x="${left + 12}" y="${r1(330 - 13)}" font-family="${FONT}" font-size="${big}" font-weight="700" fill="${C.white}" textLength="${lastW}" lengthAdjust="spacingAndGlyphs">${esc(last)}</text>`];
  lines.slice(0, -1).reverse().forEach((line, i) => {
    const y = pillY - 12 - i * (small + 6);
    out.push(`<text x="${left}" y="${r1(y)}" font-family="${FONT}" font-size="${small}" font-weight="700" fill="${C.white}" textLength="${Math.round(textWidth(line, small))}" lengthAdjust="spacingAndGlyphs">${esc(line)}</text>`);
  });
  // The gold dash sits the same distance above the label's top edge (the pill, or the cap height of the first
  // plain line) whether the label has one line or more.
  const top = lines.length === 1 ? pillY : pillY - 12 - (lines.length - 2) * (small + 6) - small * 0.72;
  out.push(`<rect x="${left}" y="${r1(top - 30)}" width="40" height="5" rx="2.5" fill="${C.gold}"/>`);
  return out.join('');
}

// A portrait brochure cover reuses each program's original vector motif. The card then
// adds book depth with CSS, so the artwork remains sharp at any display size.
function brochureLabel(lines) {
  const left = 34, big = 38, small = 26, baseline = 606;
  const last = lines[lines.length - 1];
  const lastW = Math.round(textWidth(last, big));
  const pillY = baseline - (big * 0.72 + 22);
  const pillH = baseline - pillY;
  const out = [`<rect x="${left - 4}" y="${r1(pillY)}" width="${lastW + 32}" height="${r1(pillH)}" rx="13" fill="url(#pill)"/>`,
    `<text x="${left + 12}" y="${r1(baseline - 13)}" font-family="${FONT}" font-size="${big}" font-weight="700" fill="${C.white}" textLength="${lastW}" lengthAdjust="spacingAndGlyphs">${esc(last)}</text>`];
  lines.slice(0, -1).reverse().forEach((line, i) => {
    const y = pillY - 10 - i * (small + 5);
    out.push(`<text x="${left}" y="${r1(y)}" font-family="${FONT}" font-size="${small}" font-weight="700" fill="${C.white}" textLength="${Math.round(textWidth(line, small))}" lengthAdjust="spacingAndGlyphs">${esc(line)}</text>`);
  });
  const top = lines.length === 1 ? pillY : pillY - 10 - (lines.length - 2) * (small + 5) - small * 0.72;
  out.push(`<rect x="${left}" y="${r1(top - 19)}" width="38" height="5" rx="2.5" fill="${C.gold}"/>`);
  return out.join('');
}

/** The complete SVG document for a program's cover. */
export function coverSvg(p) {
  const c = COVERS[p.id];
  if (!c) throw new Error(`No cover art for program ${p.id}`);
  const [b0, b1, b2] = c.bg;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-labelledby="t">
<title id="t">${esc(coverAlt(p))}</title>
<defs>
<linearGradient id="bg" x1="0" y1="1" x2="1" y2="0"><stop offset="0" stop-color="${b0}"/><stop offset=".55" stop-color="${b1}"/><stop offset="1" stop-color="${b2}"/></linearGradient>
<radialGradient id="g1" cx=".82" cy=".08" r=".62"><stop offset="0" stop-color="${C.blue2}" stop-opacity=".75"/><stop offset="1" stop-color="${C.blue2}" stop-opacity="0"/></radialGradient>
<radialGradient id="g2" cx=".98" cy=".98" r=".5"><stop offset="0" stop-color="${c.glow}" stop-opacity=".42"/><stop offset="1" stop-color="${c.glow}" stop-opacity="0"/></radialGradient>
<radialGradient id="g3" cx="0" cy="1" r=".75"><stop offset="0" stop-color="${C.navy}" stop-opacity=".85"/><stop offset="1" stop-color="${C.navy}" stop-opacity="0"/></radialGradient>
<radialGradient id="pit" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="${C.gold}" stop-opacity=".45"/><stop offset="1" stop-color="${C.gold}" stop-opacity="0"/></radialGradient>
<linearGradient id="band" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="${C.cyan}" stop-opacity=".12"/><stop offset="1" stop-color="${C.blue2}" stop-opacity=".4"/></linearGradient>
<linearGradient id="bar" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${C.sky}"/><stop offset="1" stop-color="${C.blue}"/></linearGradient>
<linearGradient id="goldbar" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${C.gold2}"/><stop offset="1" stop-color="${C.gold}"/></linearGradient>
<linearGradient id="bubble" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${C.blue2}"/><stop offset="1" stop-color="${C.blue3}"/></linearGradient>
<linearGradient id="pill" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${C.blue2}"/><stop offset="1" stop-color="${C.blue3}"/></linearGradient>
<pattern id="grid" width="32" height="32" patternUnits="userSpaceOnUse"><path d="M32 0H0V32" fill="none" stroke="${C.white}" stroke-opacity=".055"/></pattern>
<filter id="soft" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="5" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
<filter id="lift" x="-20%" y="-20%" width="140%" height="160%"><feDropShadow dx="0" dy="12" stdDeviation="12" flood-color="${C.navy}" flood-opacity=".6"/></filter>
<marker id="ah" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0L10 5L0 10z" fill="${C.sky}"/></marker>
<marker id="ahg" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0L10 5L0 10z" fill="${C.gold}"/></marker>
</defs>
<rect width="${W}" height="${H}" fill="url(#bg)"/>
<rect width="${W}" height="${H}" fill="url(#g1)"/>
<rect width="${W}" height="${H}" fill="url(#g2)"/>
<rect width="${W}" height="${H}" fill="url(#grid)"/>
<circle cx="640" cy="0" r="210" fill="none" stroke="${C.white}" stroke-opacity=".06" stroke-width="40"/>
${c.motif()}
<rect width="${W}" height="${H}" fill="url(#g3)"/>
${label(c.label)}
</svg>
`;
}

/** High-resolution portrait SVG artwork for the 3D program-card brochure. */
export function brochureCoverSvg(p) {
  const c = COVERS[p.id];
  if (!c) throw new Error(`No cover art for program ${p.id}`);
  const [b0, b1, b2] = c.bg;
  const original = coverSvg(p);
  const defs = /<defs>[\s\S]*?<\/defs>/.exec(original)?.[0];
  if (!defs) throw new Error(`Could not build brochure artwork for program ${p.id}`);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${BOOK_W} ${BOOK_H}" width="${BOOK_W}" height="${BOOK_H}" role="img" aria-labelledby="t">
<title id="t">${esc(brochureCoverAlt(p))}</title>
${defs}
<rect width="${BOOK_W}" height="${BOOK_H}" fill="url(#bg)"/>
<rect width="${BOOK_W}" height="${BOOK_H}" fill="url(#g1)"/>
<rect width="${BOOK_W}" height="${BOOK_H}" fill="url(#g2)"/>
<rect width="${BOOK_W}" height="${BOOK_H}" fill="url(#grid)"/>
<circle cx="480" cy="42" r="190" fill="none" stroke="${C.white}" stroke-opacity=".07" stroke-width="38"/>
<path d="M30 88H450" stroke="${C.white}" stroke-opacity=".2"/>
<text x="34" y="48" font-family="${FONT}" font-size="16" font-weight="700" letter-spacing="2.5" fill="${C.white}">NUVORA</text>
<text x="34" y="70" font-family="${FONT}" font-size="9" font-weight="700" letter-spacing="2.2" fill="${C.ice}">PROGRAM GUIDE</text>
<g transform="translate(0 185) scale(.76)">${c.motif()}</g>
<rect width="${BOOK_W}" height="${BOOK_H}" fill="url(#g3)"/>
${brochureLabel(c.label)}
</svg>
`;
}

export const brochureCoverUrl = (p) => `/covers/${p.slug}-brochure.svg`;

export function brochureCoverAlt(p) {
  const c = COVERS[p.id];
  if (!c) throw new Error(`No cover art for program ${p.id}`);
  return `Brochure artwork for ${p.name}: ${c.desc}.`;
}

export const coverGlow = (p) => COVERS[p.id]?.glow ?? C.blue;
