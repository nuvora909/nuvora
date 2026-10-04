// Logo intro gate (see intro.css): a classic script in <head>, run before the first paint. The intro plays once per
// browser session; later pages, and visitors who ask for reduced motion, get html.intro-off so it never shows.
(function (h, k) {
  var seen = 0;
  try { seen = sessionStorage.getItem(k); } catch (e) { /* storage unavailable: the intro just plays */ }
  if (seen || matchMedia('(prefers-reduced-motion: reduce)').matches) h.classList.add('intro-off');
  else try { sessionStorage.setItem(k, '1'); } catch (e) { /* as above */ }
})(document.documentElement, 'nuvora.intro');
