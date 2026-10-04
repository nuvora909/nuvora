// The logo intro (see intro.css, which plays it on its own): a click, tap, key press or scroll skips it, the
// overlay is removed from the page when it has finished, and the end is announced to the rest of the site.
//
// For other scripts that should wait for the intro: once the intro has ended, been
// skipped, or was never shown (a later page of the visit, reduced motion, a hidden tab), <html> gets the attribute
// data-intro-done and document receives one "nuvora:intro-done" event with detail { shown, skipped }.
// A module that may run after the event checks the attribute first:
//   if (document.documentElement.hasAttribute('data-intro-done')) start();
//   else document.addEventListener('nuvora:intro-done', start, { once: true });
const root = document.documentElement;
const el = document.querySelector('[data-intro]');
const SKIP_ON = ['pointerdown', 'keydown', 'wheel'];
let ended = false;
let skipped = false;

function end(shown) {
  if (ended) return;
  ended = true;
  for (const type of SKIP_ON) removeEventListener(type, skip, true);
  el?.remove();
  root.setAttribute('data-intro-done', '');
  document.dispatchEvent(new CustomEvent('nuvora:intro-done', { detail: { shown, skipped } }));
}

// A quick fade from wherever the intro is (intro.css .is-skipped), so skipping never flashes.
function skip() {
  if (skipped || ended) return;
  skipped = true;
  el.style.setProperty('--intro-from', getComputedStyle(el).opacity);
  el.classList.add('is-skipped');
}

if (!el || getComputedStyle(el).display === 'none' || document.hidden) end(false);
else {
  // Only the overlay's own fade (or the skip fade) ends the intro. Animations of its ::before/::after layers also
  // report the overlay as their target, so the animation name and pseudoElement are checked too.
  el.addEventListener('animationend', (e) => {
    if (e.target === el && !e.pseudoElement && (e.animationName === 'intro-out' || e.animationName === 'intro-skip')) end(true);
  });
  for (const type of SKIP_ON) addEventListener(type, skip, { capture: true, passive: true });
  // A safety net only, for an animationend that never arrives: the CSS hides the overlay 1.5 s after its first frame
  // on its own (a slow first paint can delay that frame), so it ends here once its animation is no longer running.
  const settle = () => (el.getAnimations().some((a) => a.playState === 'running') ? setTimeout(settle, 1000) : end(true));
  setTimeout(settle, 3000);
}
