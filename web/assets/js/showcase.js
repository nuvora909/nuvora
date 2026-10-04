// The program catalog (topic tabs and "Show N more") and the footer accordions. Every page works without this
// module: all cards show, the tabs and the button stay hidden, and every footer column stays open.
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

// ---------- program catalog ----------
function catalog(root) {
  const limit = Number(root.dataset.limit) || 0;
  const list = root.querySelector('.ccat-cards');
  const tabsBox = root.querySelector('[data-catalog-tabs]');
  const tabs = $$('[data-topic]', tabsBox);
  const more = root.querySelector('[data-catalog-more]');
  const status = root.querySelector('[data-catalog-status]');
  let topic = 'all';
  let expanded = false;

  // Cards are read in their current order each time: site.js moves a visitor's saved match to the front.
  const matching = () => $$('[data-card]', list).filter((c) => topic === 'all' || c.dataset.topics.split('|').includes(topic));
  function apply() {
    const all = $$('[data-card]', list);
    const shown = matching();
    const n = expanded || !limit ? shown.length : Math.min(limit, shown.length);
    for (const c of all) c.hidden = shown.indexOf(c) < 0 || shown.indexOf(c) >= n;
    const rest = shown.length - n;
    more.hidden = rest <= 0;
    more.querySelector('[data-more-n]').textContent = String(rest);
    return shown;
  }

  tabsBox.hidden = false;
  tabs.forEach((b) => b.addEventListener('click', () => {
    if (b.getAttribute('aria-pressed') === 'true') return;
    tabs.forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
    topic = b.dataset.topic;
    expanded = false;
    const shown = apply();
    const label = topic === 'all' ? 'all programs' : topic;
    status.textContent = `${shown.length} ${shown.length === 1 ? 'program' : 'programs'} in ${label}.`;
  }));

  more.addEventListener('click', () => {
    const before = new Set($$('[data-card]:not([hidden])', list));
    expanded = true;
    apply();
    const first = $$('[data-card]:not([hidden])', list).find((c) => !before.has(c));
    // Focus moves to the first newly shown card, so keyboard and screen-reader users continue from there.
    first?.querySelector('a')?.focus();
  });

  apply();
  new MutationObserver(apply).observe(list, { childList: true });
}

// ---------- footer accordions ----------
// Phones: each column heading holds a button (aria-expanded, aria-controls) that opens and closes its list, and the
// lists start closed. Wider screens: the headings are plain text again and every list is shown.
const CHEVRON = '<svg class="ic" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M6 9l6 6 6-6"/></svg>';
function footerColumns() {
  const cols = $$('[data-foot-col]').map((col) => {
    const heading = col.querySelector('h2');
    const list = col.querySelector('ul');
    const title = heading.textContent;
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'sitefoot-tog';
    button.setAttribute('aria-controls', list.id);
    button.innerHTML = CHEVRON;
    button.prepend(title);
    const set = (open) => { button.setAttribute('aria-expanded', String(open)); list.hidden = !open; };
    button.addEventListener('click', () => set(button.getAttribute('aria-expanded') !== 'true'));
    return { heading, list, title, button, set };
  });
  if (!cols.length) return;
  const phone = window.matchMedia('(max-width:640px)');
  const sync = () => {
    for (const c of cols) {
      if (phone.matches) { c.heading.replaceChildren(c.button); c.set(false); }
      else { c.heading.replaceChildren(c.title); c.list.hidden = false; }
    }
  };
  phone.addEventListener('change', sync);
  sync();
}

for (const root of $$('[data-catalog]')) catalog(root);
footerColumns();
