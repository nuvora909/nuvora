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
let swallowClickTimer;

function end(shown) {
  if (ended) return;
  ended = true;
  for (const type of SKIP_ON) removeEventListener(type, skip, true);
  el?.remove();
  root.setAttribute('data-intro-done', '');
  document.dispatchEvent(new CustomEvent('nuvora:intro-done', { detail: { shown, skipped } }));
}

// A key or pointer press completes the skip in that input event; no animation frame or CSS event can delay the page.
function swallowClick(event) {
  clearTimeout(swallowClickTimer);
  removeEventListener('click', swallowClick, true);
  event.preventDefault();
  event.stopImmediatePropagation();
}

function skip(event) {
  if (skipped || ended) return;
  skipped = true;
  if (event.type === 'pointerdown') {
    // The overlay is removed now, but this same press must not activate what was underneath it.
    event.stopImmediatePropagation();
    if (event.button === 0) {
      addEventListener('click', swallowClick, { capture: true, once: true });
      swallowClickTimer = setTimeout(() => removeEventListener('click', swallowClick, true), 1000);
    }
  }
  end(true);
}

if (!el || getComputedStyle(el).display === 'none' || document.hidden) end(false);
else {
  // Only the overlay's own fade ends the intro. Animations of its ::before/::after layers also report the overlay
  // as their target, so the animation name and pseudoElement are checked too.
  el.addEventListener('animationend', (e) => {
    if (e.target === el && !e.pseudoElement && e.animationName === 'intro-out') end(true);
  });
  for (const type of SKIP_ON) addEventListener(type, skip, { capture: true, passive: type !== 'pointerdown' });
  // A safety net only, for an animationend that never arrives: the CSS hides the overlay 1.5 s after its first frame
  // on its own (a slow first paint can delay that frame), so it ends here once its animation is no longer running.
  const settle = () => (el.getAnimations().some((a) => a.playState === 'running') ? setTimeout(settle, 1000) : end(true));
  setTimeout(settle, 3000);
}
