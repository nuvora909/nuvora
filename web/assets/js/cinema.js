// The one cinematic touch CSS cannot do alone: a soft spotlight that follows the pointer across the dark "chapter"
// sections (site.css draws it and keeps it off for reduced motion). It only runs for a precise pointer (mouse or
// pen) when the visitor has not asked for reduced motion, writes two custom properties and one class, and never
// hides, moves or changes content. Everything else (reveals, heading wipes, Ken Burns, parallax) is CSS.
const CHAPTERS = 'main :is(.dark, .pagehead, .phero)';
const wanted = matchMedia('(pointer: fine) and (prefers-reduced-motion: no-preference)');

export function spotlights(root = document) {
  for (const el of root.querySelectorAll(CHAPTERS)) {
    let frame = 0, x = 0, y = 0;
    const paint = () => {
      frame = 0;
      el.style.setProperty('--spot-x', `${Math.round(x)}px`);
      el.style.setProperty('--spot-y', `${Math.round(y)}px`);
    };
    el.addEventListener('pointermove', (e) => {
      if (!wanted.matches || e.pointerType === 'touch') return;
      const r = el.getBoundingClientRect();
      x = e.clientX - r.left;
      y = e.clientY - r.top;
      el.classList.add('is-lit');
      frame ||= requestAnimationFrame(paint);   // at most one style write per frame
    }, { passive: true });
    el.addEventListener('pointerleave', () => el.classList.remove('is-lit'));
  }
}

spotlights();
