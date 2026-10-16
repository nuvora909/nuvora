// Renders the Nuvora brand kit (profile pictures, covers, wallpapers, transparent logos) to PNG with Microsoft Edge.
// The logo is the website's own: "nuv" + a gradient ring with a dot + "ra" in Outfit 600 (web/lib/icons.mjs wordmark()).
const { createRequire } = require('module');
const path = require('path');
const fs = require('fs');
const req = createRequire(path.join(__dirname, '..', 'package.json'));
const { chromium } = req('@playwright/test');

const OUT = process.argv[2] ?? path.join(__dirname, '..', 'brand');
fs.mkdirSync(OUT, { recursive: true });

const FONTS = '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Outfit:wght@600&family=Plus+Jakarta+Sans:wght@500;700&display=block">';

// Deterministic pseudo-random numbers, so every render is identical.
function rng(seed) { let s = seed >>> 0; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); }

// The ring-and-dot mark as an SVG (viewBox centred on the mark). Optional glow layers under the ring and the dot.
let gid = 0;
function mark({ size, from = '#0064E0', to = '#0082FB', dot = '#0082FB', ringGlow = null, dotGlow = null, solid = null }) {
  const id = `g${++gid}`;
  const stroke = solid ?? `url(#${id})`;
  return `<svg width="${size}" height="${size}" viewBox="0.4 1.1 40 40" style="overflow:visible;display:block">
  <defs>
    <linearGradient id="${id}" x1="0" y1="1" x2="1" y2="0"><stop offset="0" stop-color="${from}"/><stop offset="1" stop-color="${to}"/></linearGradient>
    <filter id="${id}b" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="2.2"/></filter>
    <filter id="${id}d" x="-200%" y="-200%" width="500%" height="500%"><feGaussianBlur stdDeviation="2.6"/></filter>
  </defs>
  ${ringGlow ? `<circle cx="19" cy="23" r="13.5" fill="none" stroke="${ringGlow}" stroke-width="7.5" filter="url(#${id}b)" opacity="0.85"/>` : ''}
  ${dotGlow ? `<circle cx="34" cy="7" r="6.5" fill="${dotGlow}" filter="url(#${id}d)" opacity="0.95"/>` : ''}
  <circle cx="19" cy="23" r="13.5" fill="none" stroke="${stroke}" stroke-width="6.5"/>
  <circle cx="34" cy="7" r="4.5" fill="${dot}"/>
</svg>`;
}

// The wordmark exactly as on the website (.wm in web/assets/css/site.css).
function wordmark({ px, color, from, to, dot, ringGlow = null, dotGlow = null }) {
  const s = Math.round(px * 0.56);
  return `<span style="display:inline-flex;align-items:baseline;font-family:'Outfit',sans-serif;font-weight:600;letter-spacing:-0.02em;line-height:1;white-space:nowrap;font-size:${px}px;color:${color}">nuv<span style="display:inline-block;width:${s}px;height:${s}px;margin:0 ${Math.round(px * 0.03)}px">${mark({ size: s, from, to, dot, ringGlow, dotGlow }).replace('viewBox="0.4 1.1 40 40"', 'viewBox="0 0 40 40"')}</span>ra</span>`;
}

// A field of small data points that gather toward (cx, cy), like the website's intro.
function dots({ w, h, cx, cy, n, seed, inner, outer, colors, squash = 1, maxR = 5 }) {
  const r = rng(seed);
  let out = '';
  for (let i = 0; i < n; i++) {
    const arm = i % 3;
    const t = r();
    const rad = inner + (outer - inner) * Math.pow(t, 0.75);
    const ang = arm * (2 * Math.PI / 3) + t * 5.2 + (r() - 0.5) * 0.9;
    const x = cx + Math.cos(ang) * rad;
    const y = cy + Math.sin(ang) * rad * squash;
    const size = (0.8 + r() * (maxR - 0.8)) * (1 - 0.5 * t);
    const op = (0.25 + r() * 0.75) * (1 - 0.55 * t);
    const c = colors[Math.floor(r() * colors.length)];
    out += `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${size.toFixed(2)}" fill="${c}" opacity="${op.toFixed(2)}"/>`;
  }
  return `<svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" style="position:absolute;left:0;top:0"><defs><filter id="dg"><feGaussianBlur stdDeviation="1.2"/></filter></defs><g>${out}</g></svg>`;
}

function flare({ y, w, thick, opacity = 1 }) {
  return `<div style="position:absolute;left:0;top:${y - thick / 2}px;width:${w}px;height:${thick}px;opacity:${opacity};background:linear-gradient(90deg, rgba(0,130,251,0) 0%, rgba(0,130,251,0.55) 30%, rgba(214,234,255,1) 50%, rgba(0,130,251,0.55) 70%, rgba(0,130,251,0) 100%);box-shadow:0 0 ${thick * 10}px ${thick * 2}px rgba(0,130,251,0.35)"></div>`;
}

const NAVY_BG = (cx = '50%', cy = '45%') => `radial-gradient(ellipse at ${cx} ${cy}, #133679 0%, #0A1A3F 48%, #040A1A 100%)`;

const page = (w, h, bg, body) => `<!doctype html><html><head><meta charset="utf-8">${FONTS}<style>html,body{margin:0;padding:0}body{width:${w}px;height:${h}px;overflow:hidden;position:relative;background:${bg};font-family:'Plus Jakarta Sans',sans-serif}</style></head><body>${body}</body></html>`;

const center = (inner, extra = '') => `<div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;${extra}">${inner}</div>`;

const ASSETS = [
  // ---------- profile pictures (circle-safe: everything inside the middle 80%) ----------
  { file: 'profile-blue-mark-2048.png', w: 2048, h: 2048, html: () => page(2048, 2048,
    'radial-gradient(circle at 30% 24%, #3AA4FF 0%, #0866FF 46%, #004FC4 100%)',
    `<div style="position:absolute;left:224px;top:224px;width:1600px;height:1600px;border-radius:50%;border:6px solid rgba(255,255,255,0.10)"></div>
     <div style="position:absolute;left:-300px;top:-420px;width:1500px;height:1200px;border-radius:50%;background:radial-gradient(closest-side, rgba(255,255,255,0.22), rgba(255,255,255,0))"></div>
     ${center(mark({ size: 1180, solid: '#FFFFFF', dot: '#FFD66B', dotGlow: '#FFD66B', ringGlow: 'rgba(255,255,255,0.55)' }))}`) },
  { file: 'profile-navy-wordmark-2048.png', w: 2048, h: 2048, html: () => page(2048, 2048, NAVY_BG('50%', '46%'),
    `${dots({ w: 2048, h: 2048, cx: 1024, cy: 1024, n: 260, seed: 7, inner: 520, outer: 1150, colors: ['#4C9DFF', '#BFD9FF', '#0082FB', '#FFD66B'], squash: 0.85, maxR: 6 })}
     <div style="position:absolute;left:274px;top:574px;width:1500px;height:900px;border-radius:50%;background:radial-gradient(closest-side, rgba(8,102,255,0.40), rgba(8,102,255,0))"></div>
     ${center(wordmark({ px: 430, color: '#FFFFFF', from: '#4C9DFF', to: '#BFD9FF', dot: '#FFD66B', dotGlow: '#FFD66B' }), 'padding-bottom:40px')}`) },
  { file: 'profile-white-wordmark-2048.png', w: 2048, h: 2048, html: () => page(2048, 2048,
    'radial-gradient(circle at 50% 50%, #FFFFFF 0%, #F3F7FF 60%, #E6EFFF 100%)',
    `${dots({ w: 2048, h: 2048, cx: 1024, cy: 1024, n: 160, seed: 11, inner: 560, outer: 1100, colors: ['#0866FF', '#4C9DFF', '#9CC8FF'], squash: 0.85, maxR: 5 })}
     ${center(wordmark({ px: 430, color: '#0B1733', from: '#0064E0', to: '#0082FB', dot: '#0082FB' }), 'padding-bottom:40px')}`) },
  { file: 'profile-navy-gold-mark-2048.png', w: 2048, h: 2048, html: () => page(2048, 2048, NAVY_BG('50%', '50%'),
    `${dots({ w: 2048, h: 2048, cx: 1024, cy: 1024, n: 300, seed: 21, inner: 640, outer: 1250, colors: ['#4C9DFF', '#BFD9FF', '#0082FB'], squash: 1, maxR: 6 })}
     <div style="position:absolute;left:224px;top:224px;width:1600px;height:1600px;border-radius:50%;background:radial-gradient(closest-side, rgba(8,102,255,0.45), rgba(8,102,255,0))"></div>
     ${center(mark({ size: 1100, from: '#0082FB', to: '#7FBCFF', dot: '#FFD66B', ringGlow: 'rgba(0,130,251,0.9)', dotGlow: '#FFC94A' }))}`) },

  // ---------- covers and stories ----------
  { file: 'facebook-cover-1640x624.png', w: 1640, h: 624, html: () => page(1640, 624,
    'linear-gradient(120deg, #050B1F 0%, #0A1A3F 45%, #0B2C78 100%)',
    `${dots({ w: 1640, h: 624, cx: 1290, cy: 300, n: 220, seed: 5, inner: 190, outer: 760, colors: ['#4C9DFF', '#BFD9FF', '#0082FB', '#FFD66B'], squash: 0.6, maxR: 4 })}
     ${flare({ y: 330, w: 1640, thick: 3, opacity: 0.8 })}
     <div style="position:absolute;left:1000px;top:20px;width:580px;height:580px;border-radius:50%;background:radial-gradient(closest-side, rgba(8,102,255,0.45), rgba(8,102,255,0))"></div>
     <div style="position:absolute;left:1110px;top:130px;opacity:0.9">${mark({ size: 360, from: '#0082FB', to: '#7FBCFF', dot: '#FFD66B', ringGlow: 'rgba(0,130,251,0.9)', dotGlow: '#FFC94A' })}</div>
     <div style="position:absolute;left:470px;top:190px;display:flex;flex-direction:column;gap:22px">
       ${wordmark({ px: 150, color: '#FFFFFF', from: '#4C9DFF', to: '#BFD9FF', dot: '#FFD66B' })}
       <div style="font:600 30px/1.3 'Plus Jakarta Sans',sans-serif;color:#C9D6F2;letter-spacing:0.5px">Online programs in data science and AI</div>
     </div>`) },
  { file: 'story-1080x1920.png', w: 1080, h: 1920, html: () => page(1080, 1920, NAVY_BG('50%', '38%'),
    `${dots({ w: 1080, h: 1920, cx: 540, cy: 760, n: 320, seed: 9, inner: 300, outer: 1150, colors: ['#4C9DFF', '#BFD9FF', '#0082FB', '#FFD66B'], squash: 1.25, maxR: 5 })}
     ${flare({ y: 760, w: 1080, thick: 3, opacity: 0.7 })}
     <div style="position:absolute;left:90px;top:310px;width:900px;height:900px;border-radius:50%;background:radial-gradient(closest-side, rgba(8,102,255,0.5), rgba(8,102,255,0))"></div>
     <div style="position:absolute;left:290px;top:500px">${mark({ size: 500, from: '#0082FB', to: '#7FBCFF', dot: '#FFD66B', ringGlow: 'rgba(0,130,251,0.9)', dotGlow: '#FFC94A' })}</div>
     <div style="position:absolute;left:0;top:1180px;width:1080px;display:flex;flex-direction:column;align-items:center;gap:30px">
       ${wordmark({ px: 190, color: '#FFFFFF', from: '#4C9DFF', to: '#BFD9FF', dot: '#FFD66B' })}
       <div style="font:700 30px/1.4 'Plus Jakarta Sans',sans-serif;color:#9CC8FF;letter-spacing:7px;text-transform:uppercase;text-align:center">Data science · Machine learning<br>Generative AI</div>
     </div>`) },

  // ---------- wallpapers ----------
  { file: 'wallpaper-desktop-dark-3840x2160.png', w: 3840, h: 2160, html: () => page(3840, 2160, NAVY_BG('50%', '44%'),
    `${dots({ w: 3840, h: 2160, cx: 1920, cy: 900, n: 900, seed: 3, inner: 520, outer: 2300, colors: ['#4C9DFF', '#BFD9FF', '#0082FB', '#7FBCFF', '#FFD66B'], squash: 0.55, maxR: 7 })}
     ${flare({ y: 900, w: 3840, thick: 5, opacity: 0.75 })}
     <div style="position:absolute;left:1220px;top:200px;width:1400px;height:1400px;border-radius:50%;background:radial-gradient(closest-side, rgba(8,102,255,0.5), rgba(8,102,255,0))"></div>
     <div style="position:absolute;left:1560px;top:540px">${mark({ size: 720, from: '#0082FB', to: '#7FBCFF', dot: '#FFD66B', ringGlow: 'rgba(0,130,251,0.95)', dotGlow: '#FFC94A' })}</div>
     <div style="position:absolute;left:0;top:1480px;width:3840px;display:flex;flex-direction:column;align-items:center;gap:44px">
       ${wordmark({ px: 230, color: '#FFFFFF', from: '#4C9DFF', to: '#BFD9FF', dot: '#FFD66B' })}
       <div style="font:700 44px/1.3 'Plus Jakarta Sans',sans-serif;color:#9CC8FF;letter-spacing:14px;text-transform:uppercase">Data science · Machine learning · Generative AI</div>
     </div>`) },
  { file: 'wallpaper-desktop-light-3840x2160.png', w: 3840, h: 2160, html: () => page(3840, 2160,
    'radial-gradient(ellipse at 50% 42%, #FFFFFF 0%, #F2F7FF 55%, #DCE8FF 100%)',
    `${dots({ w: 3840, h: 2160, cx: 1920, cy: 900, n: 700, seed: 13, inner: 520, outer: 2300, colors: ['#0866FF', '#4C9DFF', '#9CC8FF', '#F5B82E'], squash: 0.55, maxR: 6 })}
     <div style="position:absolute;left:1220px;top:200px;width:1400px;height:1400px;border-radius:50%;background:radial-gradient(closest-side, rgba(8,102,255,0.16), rgba(8,102,255,0))"></div>
     <div style="position:absolute;left:1560px;top:540px">${mark({ size: 720, from: '#0064E0', to: '#0082FB', dot: '#F5B82E', ringGlow: 'rgba(0,130,251,0.35)', dotGlow: 'rgba(245,184,46,0.8)' })}</div>
     <div style="position:absolute;left:0;top:1480px;width:3840px;display:flex;flex-direction:column;align-items:center;gap:44px">
       ${wordmark({ px: 230, color: '#0B1733', from: '#0064E0', to: '#0082FB', dot: '#0082FB' })}
       <div style="font:700 44px/1.3 'Plus Jakarta Sans',sans-serif;color:#0866FF;letter-spacing:14px;text-transform:uppercase">Data science · Machine learning · Generative AI</div>
     </div>`) },
  { file: 'wallpaper-phone-1440x3200.png', w: 1440, h: 3200, html: () => page(1440, 3200, NAVY_BG('50%', '40%'),
    `${dots({ w: 1440, h: 3200, cx: 720, cy: 1280, n: 520, seed: 17, inner: 380, outer: 1900, colors: ['#4C9DFF', '#BFD9FF', '#0082FB', '#7FBCFF', '#FFD66B'], squash: 1.35, maxR: 6 })}
     ${flare({ y: 1280, w: 1440, thick: 4, opacity: 0.7 })}
     <div style="position:absolute;left:120px;top:680px;width:1200px;height:1200px;border-radius:50%;background:radial-gradient(closest-side, rgba(8,102,255,0.5), rgba(8,102,255,0))"></div>
     <div style="position:absolute;left:390px;top:950px">${mark({ size: 660, from: '#0082FB', to: '#7FBCFF', dot: '#FFD66B', ringGlow: 'rgba(0,130,251,0.95)', dotGlow: '#FFC94A' })}</div>
     <div style="position:absolute;left:0;top:2060px;width:1440px;display:flex;flex-direction:column;align-items:center;gap:36px">
       ${wordmark({ px: 230, color: '#FFFFFF', from: '#4C9DFF', to: '#BFD9FF', dot: '#FFD66B' })}
       <div style="font:700 36px/1.5 'Plus Jakarta Sans',sans-serif;color:#9CC8FF;letter-spacing:9px;text-transform:uppercase;text-align:center">Data science · Machine learning<br>Generative AI</div>
     </div>`) },

  // ---------- transparent logos ----------
  { file: 'logo-wordmark-color-transparent.png', w: 3600, h: 1300, transparent: true, html: () => page(3600, 1300, 'transparent',
    center(wordmark({ px: 1000, color: '#0B1733', from: '#0064E0', to: '#0082FB', dot: '#0082FB' }), 'padding-bottom:60px')) },
  { file: 'logo-wordmark-white-transparent.png', w: 3600, h: 1300, transparent: true, html: () => page(3600, 1300, 'transparent',
    center(wordmark({ px: 1000, color: '#FFFFFF', from: '#4C9DFF', to: '#BFD9FF', dot: '#FFD66B' }), 'padding-bottom:60px')) },
  { file: 'logo-mark-color-transparent.png', w: 2048, h: 2048, transparent: true, html: () => page(2048, 2048, 'transparent',
    center(mark({ size: 1700, from: '#0064E0', to: '#0082FB', dot: '#0082FB' }))) },
  { file: 'logo-mark-white-transparent.png', w: 2048, h: 2048, transparent: true, html: () => page(2048, 2048, 'transparent',
    center(mark({ size: 1700, solid: '#FFFFFF', dot: '#FFD66B' }))) },
];

(async () => {
  const browser = await chromium.launch({ channel: 'msedge' });
  for (const a of ASSETS) {
    const ctx = await browser.newContext({ viewport: { width: a.w, height: a.h }, deviceScaleFactor: 1 });
    const p = await ctx.newPage();
    await p.setContent(a.html(), { waitUntil: 'networkidle' });
    await p.evaluate(() => document.fonts.ready);
    const html = a.html();
    const needs = [html.includes("'Outfit'") && "600 100px Outfit", html.includes("font:700") || html.includes("font:600") ? "700 30px 'Plus Jakarta Sans'" : null].filter(Boolean);
    const ok = await p.evaluate((n) => n.every((f) => document.fonts.check(f)), needs);
    const file = path.join(OUT, a.file);
    await p.screenshot({ path: file, omitBackground: !!a.transparent, type: 'png' });
    console.log(ok ? 'ok  ' : 'FONT', a.file, `${a.w}x${a.h}`, `${Math.round(fs.statSync(file).size / 1024)} KB`);
    await ctx.close();
  }
  await browser.close();
})();
