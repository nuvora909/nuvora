// How it works and Tuition: highlight the section in view in the "On this page" navigation. Without JavaScript
// the navigation is a plain list of in-page links.
const nav = document.querySelector('[data-jumpnav]');
if (nav && 'IntersectionObserver' in window) {
  const links = [...nav.querySelectorAll('a[href^="#"]')];
  const sections = links.map((a) => document.getElementById(a.getAttribute('href').slice(1))).filter(Boolean);
  const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  const visible = new Map();
  let current = null;
  const io = new IntersectionObserver((entries) => {
    for (const e of entries) visible.set(e.target.id, e.isIntersecting);
    const now = sections.find((s) => visible.get(s.id)) ?? null;
    if (now === current) return;
    current = now;
    for (const a of links) {
      const on = Boolean(now) && a.getAttribute('href') === `#${now.id}`;
      a.classList.toggle('on', on);
      if (on) {
        a.setAttribute('aria-current', 'true');
        // Keep the current link in view when the navigation scrolls sideways on narrow screens.
        const left = a.getBoundingClientRect().left - nav.getBoundingClientRect().left + nav.scrollLeft - 16;
        nav.scrollTo({ left: Math.max(0, left), behavior: reduce ? 'auto' : 'smooth' });
      } else {
        a.removeAttribute('aria-current');
      }
    }
  }, { rootMargin: '-30% 0px -60% 0px' });
  sections.forEach((s) => io.observe(s));
}
