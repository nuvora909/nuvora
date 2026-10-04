// Line icons (24×24, stroke) and the Nuvora wordmark. All decorative: aria-hidden.
import { raw } from './html.mjs';

const PATHS = {
  arrow: 'M5 12h14 M13 6l6 6-6 6',
  chev: 'M9 6l6 6-6 6',
  down: 'M6 9l6 6 6-6',
  check: 'M5 12l5 5L20 7',
  x: 'M6 6l12 12 M18 6L6 18',
  menu: 'M4 7h16 M4 12h16 M4 17h16',
  clock: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z M12 7v5l3 2',
  cal: 'M4 5h16v15H4z M4 10h16 M8 3v4 M16 3v4',
  pace: 'M4 18a8 8 0 1 1 16 0 M12 18l4-6',
  cert: 'M12 3a6 6 0 1 0 0 12 6 6 0 0 0 0-12z M8.5 14L7 21l5-3 5 3-1.5-7',
  folder: 'M3 6h6l2 2h10v11H3z',
  card: 'M3 6h18v12H3z M3 10h18 M7 15h4',
  brief: 'M3 8h18v11H3z M8 8V5h8v3 M3 13h18',
  chart: 'M3 20h18 M5 16l4-5 4 3 6-8',
  cap: 'M2 9l10-5 10 5-10 5z M6 11v5c3 2 9 2 12 0v-5',
  video: 'M3 6h12v12H3z M15 10l6-3v10l-6-3',
  live: 'M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6z M6.3 6.3a8 8 0 0 0 0 11.4 M17.7 6.3a8 8 0 0 1 0 11.4',
  doc: 'M6 3h9l4 4v14H6z M9 12h7 M9 16h7',
  users: 'M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z M2 21v-1a6 6 0 0 1 12 0v1 M16 3.5a4 4 0 0 1 0 7.5 M22 21v-1a6 6 0 0 0-4-5.6',
  target: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z M12 7a5 5 0 1 0 0 10 5 5 0 0 0 0-10z M12 11v2',
  route: 'M6 19a2 2 0 1 0 0-4 2 2 0 0 0 0 4z M18 9a2 2 0 1 0 0-4 2 2 0 0 0 0 4z M6 15V9a4 4 0 0 1 4-4h6 M18 9v6a4 4 0 0 1-4 4H8',
  pulse: 'M3 12h4l2-5 4 10 2-5h6',
  gap: 'M4 20V10 M10 20V4 M16 20v-6 M22 20H2',
  spark: 'M12 3l1.8 4.7L18.5 9.5l-4.7 1.8L12 16l-1.8-4.7L5.5 9.5l4.7-1.8z M19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8z',
  shield: 'M12 3l8 3v6c0 4.5-3.4 8.3-8 9-4.6-.7-8-4.5-8-9V6z M9 12l2 2 4-4',
  lock: 'M6 11h12v10H6z M8 11V7a4 4 0 0 1 8 0v4',
  mail: 'M3 6h18v12H3z M3 7l9 6 9-6',
  globe: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z M3 12h18 M12 3c3 3 3 15 0 18 M12 3c-3 3-3 15 0 18',
  info: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z M12 11v6 M12 7.5v.5',
  pause: 'M8 5v14 M16 5v14',
  play: 'M7 5l12 7-12 7z',
  search: 'M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14z M21 21l-5-5',
  book: 'M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2z M4 19V5 M8 7h7',
  ladder: 'M7 3v18 M17 3v18 M7 7h10 M7 12h10 M7 17h10',
  layers: 'M12 3l9 5-9 5-9-5z M3 13l9 5 9-5',
  rocket: 'M5 15c-1 1-2 4-2 6 2 0 5-1 6-2 M9 15l-3-3 C8 6 13 3 21 3c0 8-3 13-9 15z M15 9a1 1 0 1 0 0-2 1 1 0 0 0 0 2z',
  chat: 'M4 5h16v11H9l-5 4z',
  coin: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z M15 9h-4a1.5 1.5 0 0 0 0 3h2a1.5 1.5 0 0 1 0 3H9 M12 7v2 M12 15v2',
};

export const icon = (name, cls = 'ic') => raw(`<svg class="${cls}" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="${PATHS[name]}"/></svg>`);

// The "nuv◯ra" wordmark: the o is a ring with a small orbiting dot. The ring carries the Meta logo gradient
// (#0064E0 to #0082FB, bottom left to top right); on dark backgrounds a lighter pair of the same blues.
let ringId = 0;
export function wordmark({ light = false } = {}) {
  const id = `wmg${++ringId}`;
  const [from, to, dot] = light ? ['#4C9DFF', '#BFD9FF', '#FFFFFF'] : ['#0064E0', '#0082FB', '#0082FB'];
  const ring = `<defs><linearGradient id="${id}" x1="0" y1="1" x2="1" y2="0"><stop offset="0" stop-color="${from}"/><stop offset="1" stop-color="${to}"/></linearGradient></defs><circle cx="19" cy="23" r="13.5" fill="none" stroke="url(#${id})" stroke-width="6.5"/><circle cx="34" cy="7" r="4.5" fill="${dot}"/>`;
  return raw(`<span class="wm">nuv<svg viewBox="0 0 40 40" aria-hidden="true" focusable="false">${ring}</svg>ra</span>`);
}

export const FAVICON = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#0082FB"/><stop offset="1" stop-color="#0064E0"/></linearGradient></defs><rect x="4" y="4" width="92" height="92" rx="26" fill="url(#g)"/><circle cx="47" cy="55" r="22" fill="none" stroke="#FFFFFF" stroke-width="10"/><circle cx="71" cy="29" r="8" fill="#FFD66B"/></svg>`;
