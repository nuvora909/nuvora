// Program pages: highlight the current section in the jump navigation and show a slim "Request a seat" bar once
// the hero has scrolled away.
const nav = document.querySelector('[data-jumpnav]');
if (nav) {
  const links = [...nav.querySelectorAll('a')];
  const sections = links.map((a) => document.querySelector(a.getAttribute('href'))).filter(Boolean);
  const seen = new Map();
  const io = new IntersectionObserver((entries) => {
    for (const e of entries) seen.set(e.target.id, e.isIntersecting);
    const current = sections.find((s) => seen.get(s.id));
    for (const a of links) {
      const on = current && a.getAttribute('href') === `#${current.id}`;
      a.classList.toggle('on', Boolean(on));
      if (on) a.setAttribute('aria-current', 'true'); else a.removeAttribute('aria-current');
      if (on) nav.scrollTo({ left: a.offsetLeft - 16, behavior: 'smooth' });
    }
  }, { rootMargin: '-30% 0px -60% 0px' });
  sections.forEach((s) => io.observe(s));
}

const hero = document.querySelector('[data-hero]');
const bar = document.querySelector('[data-sticky-cta]');
if (hero && bar) {
  new IntersectionObserver(([e]) => {
    const show = !e.isIntersecting && e.boundingClientRect.top < 0;
    bar.classList.toggle('show', show);
    document.body.classList.toggle('has-sticky', show);
  }).observe(hero);
}
