// /careers/: filter the role explorer by career track and by program. Without JavaScript every role card is shown
// and the filter bar stays hidden. The chosen filters are kept in the address (?track=…&program=…) so a filtered
// view can be bookmarked or shared; nothing is stored and nothing leaves the browser.
const root = document.querySelector('[data-cr-explorer]');

if (root) {
  const $$ = (s) => [...root.querySelectorAll(s)];
  const bar = root.querySelector('[data-cr-filters]');
  const status = root.querySelector('[data-cr-status]');
  const empty = root.querySelector('[data-cr-empty]');
  const reset = root.querySelector('[data-cr-reset]');
  const cards = $$('[data-cr-role]');
  const groups = {
    track: { buttons: $$('[data-cr-track]'), key: 'crTrack', of: (card) => card.dataset.tracks },
    program: { buttons: $$('[data-cr-program]'), key: 'crProgram', of: (card) => card.dataset.programs },
  };

  const params = new URLSearchParams(location.search);
  const state = {};
  for (const [name, g] of Object.entries(groups)) {
    const wanted = params.get(name);
    state[name] = g.buttons.some((b) => b.dataset[g.key] === wanted) ? wanted : 'all';
  }

  const labelOf = (name) => groups[name].buttons.find((b) => b.dataset[groups[name].key] === state[name])?.textContent.trim();

  function remember() {
    try {
      const url = new URL(location.href);
      for (const name of Object.keys(groups)) {
        if (state[name] === 'all') url.searchParams.delete(name); else url.searchParams.set(name, state[name]);
      }
      history.replaceState(history.state, '', url);
    } catch { /* the address cannot be changed here; the filter still works */ }
  }

  function apply() {
    for (const [name, g] of Object.entries(groups)) {
      for (const b of g.buttons) b.setAttribute('aria-pressed', String(b.dataset[g.key] === state[name]));
    }
    let shown = 0;
    for (const card of cards) {
      const ok = Object.entries(groups).every(([name, g]) => state[name] === 'all' || (g.of(card) || '').split('|').includes(state[name]));
      card.hidden = !ok;
      if (ok) shown += 1;
    }
    empty.hidden = shown > 0;
    const active = Object.keys(groups).filter((name) => state[name] !== 'all').map((name) => `${name === 'track' ? 'Track' : 'Program'}: ${labelOf(name)}`);
    status.textContent = active.length
      ? `Showing ${shown} of ${cards.length} roles · ${active.join(' · ')}`
      : `Showing all ${cards.length} roles`;
  }

  for (const [name, g] of Object.entries(groups)) {
    for (const b of g.buttons) {
      b.addEventListener('click', () => {
        state[name] = b.dataset[g.key];
        apply();
        remember();
      });
    }
  }

  reset?.addEventListener('click', () => {
    for (const name of Object.keys(groups)) state[name] = 'all';
    apply();
    remember();
    groups.track.buttons[0]?.focus();
  });

  bar.hidden = false;
  apply();
}
