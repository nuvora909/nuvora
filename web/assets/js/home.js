// Home page hero: a muted montage of stock clips behind the headline. It only plays on wider screens, never
// with reduced motion, Save-Data or a slow connection, pauses off screen, and can always be paused.
const stage = document.querySelector('[data-video]');
const toggle = document.querySelector('[data-video-toggle]');

function allowed() {
  const c = navigator.connection;
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return false;
  if (c && (c.saveData || /(^|-)2g$/.test(c.effectiveType || ''))) return false;
  return matchMedia('(min-width: 700px)').matches;
}

if (stage && toggle && allowed()) {
  const clips = JSON.parse(stage.dataset.clips);
  const poster = stage.querySelector('img');
  const videos = clips.map((c) => {
    const v = document.createElement('video');
    v.muted = true; v.playsInline = true; v.preload = 'none'; v.setAttribute('aria-hidden', 'true');
    v.disablePictureInPicture = true; v.setAttribute('controlslist', 'nodownload noremoteplayback');
    v.src = c.src;
    stage.append(v);
    return v;
  });
  let i = 0, paused = false, visible = true, timer = null;

  const show = async (n) => {
    const v = videos[n], c = clips[n];
    v.preload = 'auto';
    try {
      v.currentTime = c.from;
      await v.play();
    } catch {
      // Autoplay refused: keep the still photo and hide the control.
      toggle.hidden = true;
      return false;
    }
    videos.forEach((x, k) => { x.classList.toggle('on', k === n); if (k !== n) x.pause(); });
    poster.classList.remove('on');
    clearTimeout(timer);
    timer = setTimeout(next, c.dur * 1000);
    // Warm up the next clip while this one plays.
    videos[(n + 1) % videos.length].preload = 'auto';
    return true;
  };
  const next = () => { if (!paused && visible) { i = (i + 1) % videos.length; show(i); } };
  const setPaused = (p) => {
    paused = p;
    toggle.setAttribute('aria-pressed', String(p));
    toggle.querySelector('span').textContent = p ? 'Play video' : 'Pause video';
    if (p) { clearTimeout(timer); videos[i].pause(); } else show(i);
  };

  toggle.hidden = false;
  toggle.addEventListener('click', () => setPaused(!paused));
  new IntersectionObserver(([e]) => {
    visible = e.isIntersecting;
    if (paused) return;
    if (visible) show(i); else { clearTimeout(timer); videos[i].pause(); }
  }).observe(stage);
  document.addEventListener('visibilitychange', () => { if (document.hidden) { clearTimeout(timer); videos[i].pause(); } else if (!paused && visible) show(i); });
  stage.addEventListener('contextmenu', (e) => e.preventDefault());
}
