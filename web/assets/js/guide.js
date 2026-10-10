// The program guide and the brochure. On the guide, the program picker (a sideways scroller on phones) starts
// scrolled to the current program. The brochure viewer (/programs/<slug>/brochure/): Without this module every brochure page shows, stacked; with it
// the pages become a page-by-page viewer:
//   - Previous / Next buttons and a "Page 3 of 11" counter; a polite live region names the page after each turn
//   - under the page, "Back to page 2" and "Turn to page 4", so a reader at the end of a long page need not scroll up
//   - after a turn the window shows the new page from its top (below the sticky bar), not partway down
//   - "Show all pages" keeps the reader on the page they were reading
//   - arrow keys (left and right), Page Up / Page Down, Home and End while the viewer has focus
//   - a swipe or a drag sideways with any pointer (vertical scrolling is left to the browser)
//   - the address keeps #page-N in step, and #page-N in a link opens that page
//   - "Show all pages" returns to the stacked view; "Print this brochure" prints one page per A4 sheet (guide.css)
// A turn animates with transforms and opacity only (guide.css), and not at all with reduced motion.
const TURN_MS = 520;
const SWIPE_PX = 48;
const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const pageFromHash = (hash) => { const m = /^#page-(\d+)$/.exec(hash); return m ? Number(m[1]) - 1 : null; };

export function initBrochure(root = document.querySelector('[data-gb-root]')) {
  if (!root || root.dataset.gbReady) return null;
  root.dataset.gbReady = '1';
  const $ = (s) => root.querySelector(s);
  const viewer = $('[data-gb-viewer]');
  const book = $('[data-gb-book]');
  const pages = [...book.querySelectorAll('.gb-page')];
  const [prev, next, all, count, live, controls, print, end, endPrev, endNext] = ['[data-gb-prev]', '[data-gb-next]', '[data-gb-all]', '[data-gb-count]',
    '[data-gb-live]', '[data-gb-controls]', '[data-gb-print]', '[data-gb-end]', '[data-gb-end-prev]', '[data-gb-end-next]'].map($);
  const total = pages.length;
  let current = 0;
  let stacked = false;
  let timer = 0;

  if (print) {
    print.hidden = false;
    print.addEventListener('click', () => window.print());
  }
  if (!total) return null;
  controls.hidden = false;
  viewer.tabIndex = 0;
  viewer.setAttribute('role', 'region');
  viewer.setAttribute('aria-roledescription', 'brochure viewer');
  viewer.setAttribute('aria-label', `Brochure, ${total} pages. Use the arrow keys to turn the pages.`);
  root.classList.add('gb-viewing');

  const title = (i) => pages[i].dataset.gbTitle || '';
  function finishTurn() {
    clearTimeout(timer);
    for (const p of pages) p.classList.remove('is-leaving', 'is-entering', 'to-next', 'to-prev');
  }
  function update({ announce = true, hash = true } = {}) {
    count.textContent = stacked ? `All ${total} pages` : `Page ${current + 1} of ${total}`;
    prev.setAttribute('aria-disabled', String(stacked || current === 0));
    next.setAttribute('aria-disabled', String(stacked || current === total - 1));
    if (!stacked && hash && location.hash !== `#page-${current + 1}`) {
      history.replaceState(history.state, '', `${location.pathname}${location.search}#page-${current + 1}`);
    }
    if (announce) live.textContent = stacked ? `Showing all ${total} pages` : `Page ${current + 1} of ${total}: ${title(current)}`;
    // The pager under the page: back and on, by page number (hidden where there is no page to turn to).
    if (end) {
      end.hidden = stacked;
      endPrev.hidden = current === 0;
      endNext.hidden = current === total - 1;
      endPrev.querySelector('[data-n]').textContent = String(current);
      endNext.querySelector('[data-n]').textContent = String(current + 2);
    }
  }

  /**
   * After a turn, the new page starts at its top: if the reader had scrolled down the old page, the window scrolls
   * back so the top of the page shows below the sticky bar (or, where the bar does not stick, the bar itself shows).
   */
  function revealTop() {
    const sticky = getComputedStyle(controls).position === 'sticky';
    const header = document.querySelector('header.top');
    const limit = sticky ? controls.getBoundingClientRect().bottom + 12 : Math.max(0, header?.getBoundingClientRect().bottom ?? 0) + 12;
    const top = (sticky ? book : controls).getBoundingClientRect().top;
    if (top < limit) window.scrollBy({ top: top - limit, behavior: reducedMotion() ? 'instant' : 'smooth' });
  }

  /** Shows page i (0-based). The turn animates unless motion is reduced or the page is shown without one. */
  function show(i, { animate = true, announce = true, hash = true } = {}) {
    const to = Math.min(total - 1, Math.max(0, i));
    finishTurn();
    const from = current;
    current = to;
    pages.forEach((p, k) => p.classList.toggle('is-current', k === to));
    if (animate && from !== to && !stacked && !reducedMotion()) {
      const dir = to > from ? 'to-next' : 'to-prev';
      pages[from].classList.add('is-leaving', dir);
      pages[to].classList.add('is-entering', dir);
      timer = setTimeout(finishTurn, TURN_MS + 60);
    }
    update({ announce, hash });
  }
  const go = (i) => { if (!stacked && i >= 0 && i < total && i !== current) { show(i); revealTop(); } };

  function setStacked(on) {
    stacked = on;
    finishTurn();
    root.classList.toggle('gb-viewing', !on);
    all.setAttribute('aria-pressed', String(on));
    update({ hash: false });
    // Either way the reader stays on the page they were reading: in the stacked view it is scrolled into view.
    (on ? pages[current] : viewer).scrollIntoView({ block: 'start' });
  }

  prev.addEventListener('click', () => go(current - 1));
  next.addEventListener('click', () => go(current + 1));
  endPrev?.addEventListener('click', () => go(current - 1));
  endNext?.addEventListener('click', () => go(current + 1));
  all.addEventListener('click', () => setStacked(!stacked));

  viewer.addEventListener('keydown', (e) => {
    if (stacked || e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return;
    const step = { ArrowRight: 1, ArrowLeft: -1, PageDown: 1, PageUp: -1 }[e.key];
    const to = step ? current + step : e.key === 'Home' ? 0 : e.key === 'End' ? total - 1 : null;
    if (to == null) return;
    e.preventDefault();
    go(to);
  });

  // Swipe or drag sideways: a pointer that travels SWIPE_PX or more, mostly horizontally, turns the page. The click
  // that ends a drag is swallowed, so a drag that starts on a link does not follow it.
  let start = null;
  let swallowClick = false;
  book.addEventListener('pointerdown', (e) => {
    if (stacked || !e.isPrimary || e.button !== 0) return;
    start = { x: e.clientX, y: e.clientY, id: e.pointerId };
  });
  // Images and links would otherwise start the browser's own drag-and-drop, which cancels the pointer.
  book.addEventListener('dragstart', (e) => { if (!stacked) e.preventDefault(); });
  // The release is heard on the window, so a drag that ends beside the page still turns it.
  window.addEventListener('pointerup', (e) => {
    if (!start || e.pointerId !== start.id) return;
    const dx = e.clientX - start.x;
    const dy = e.clientY - start.y;
    start = null;
    if (Math.abs(dx) < SWIPE_PX || Math.abs(dx) < Math.abs(dy) * 1.2) return;
    swallowClick = true;
    setTimeout(() => { swallowClick = false; }, 0);
    go(current + (dx < 0 ? 1 : -1));
  });
  window.addEventListener('pointercancel', () => { start = null; });
  book.addEventListener('click', (e) => { if (swallowClick) { e.preventDefault(); e.stopPropagation(); } }, true);

  window.addEventListener('hashchange', () => {
    const i = pageFromHash(location.hash);
    if (i == null || i < 0 || i >= total) return;
    if (stacked) setStacked(false);
    if (i !== current) { show(i); revealTop(); }
  });

  const first = pageFromHash(location.hash);
  if (first != null && first >= 0 && first < total) {
    show(first, { animate: false, announce: false });
    requestAnimationFrame(() => viewer.scrollIntoView({ block: 'start' }));
  } else {
    show(0, { animate: false, announce: false, hash: false });
  }
  return { show: (i) => show(i), page: () => current + 1, total, stacked: () => stacked };
}

/** Scrolls a sideways program picker so the current program's link is in view (it never scrolls the page). */
export function revealCurrentGuide(list = document.querySelector('.gd-picker [data-hscroll]')) {
  const current = list?.querySelector('[aria-current="page"]');
  if (!current || list.scrollWidth <= list.clientWidth) return;
  const offset = current.getBoundingClientRect().left - list.getBoundingClientRect().left;
  list.scrollLeft += offset - parseFloat(getComputedStyle(list).paddingLeft || '0');
}

initBrochure();
revealCurrentGuide();
