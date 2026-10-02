// Lesson player and watch-time tracking.
//
// DemoPlayer is a stand-in used until the protected video service is connected (Phase 3). It plays a visual
// placeholder and contains no media file at all, so there is nothing to download. The protected player will
// sit behind the same small interface: play(), pause(), seek(), currentTime, duration, paused, and the
// events 'play', 'pause', 'timeupdate', 'seeked' (detail {from, to}) and 'ended'.
//
// WatchTracker turns playback into the "watched span" updates the database expects: only seconds actually
// played are reported, in chunks of at most 30 seconds, so skipping ahead never counts as watching.
import { html, icon, fmtClock } from './ui.js';

const RATES = [1, 1.25, 1.5, 2];

export class DemoPlayer extends EventTarget {
  constructor(host, { duration, title, eyebrow = '', start = 0, watermark = '' }) {
    super();
    this.duration = Math.max(1, Math.floor(duration));
    this.currentTime = Math.min(Math.max(0, start), this.duration);
    this.paused = true;
    this.playbackRate = 1;
    this.el = document.createElement('div');
    this.el.className = 'player';
    this.el.tabIndex = 0;
    this.el.setAttribute('role', 'region');
    this.el.setAttribute('aria-label', `Video player: ${title}`);
    this.el.innerHTML = String(html`
      <div class="stage" aria-hidden="true">
        <div class="caption"><small>${eyebrow}</small><b>${title}</b></div>
        <div class="wave">${Array.from({ length: 28 }, (_, i) => html`<i style="animation-delay:${(i * 0.09).toFixed(2)}s"></i>`)}</div>
        <span class="wmark">${watermark}</span>
      </div>
      <span class="shield">${icon('shield')} Protected stream<span class="long"> · downloads disabled</span></span>
      <button class="bigplay" type="button" aria-label="Play">${icon('play')}</button>
      <div class="controls">
        <button type="button" data-act="toggle" aria-label="Play">${icon('play')}</button>
        <span class="time" data-time>0:00 / ${fmtClock(this.duration)}</span>
        <input type="range" min="0" max="${this.duration}" step="1" value="0" aria-label="Seek">
        <select aria-label="Playback speed">${RATES.map((r) => html`<option value="${r}">${r}×</option>`)}</select>
      </div>`);
    host.replaceChildren(this.el);

    this.btn = this.el.querySelector('[data-act="toggle"]');
    this.range = this.el.querySelector('input[type=range]');
    this.timeEl = this.el.querySelector('[data-time]');
    this.wm = this.el.querySelector('.wmark');
    this.el.querySelector('.bigplay').addEventListener('click', () => this.play());
    this.btn.addEventListener('click', () => (this.paused ? this.play() : this.pause()));
    this.range.addEventListener('input', () => { this.timeEl.textContent = `${fmtClock(this.range.value)} / ${fmtClock(this.duration)}`; });
    this.range.addEventListener('change', () => this.seek(Number(this.range.value)));
    this.el.querySelector('select').addEventListener('change', (e) => { this.playbackRate = Number(e.target.value) || 1; });
    this.el.addEventListener('contextmenu', (e) => e.preventDefault());
    this.el.addEventListener('keydown', (e) => {
      if (e.target !== this.el) return;
      if (e.key === ' ' || e.key === 'k') { e.preventDefault(); this.paused ? this.play() : this.pause(); }
      if (e.key === 'ArrowRight') { e.preventDefault(); this.seek(this.currentTime + 10); }
      if (e.key === 'ArrowLeft') { e.preventDefault(); this.seek(this.currentTime - 10); }
    });

    this.last = performance.now();
    this.timer = setInterval(() => this.#tick(), 250);
    this.wmTimer = setInterval(() => this.#moveWatermark(), 8000);
    this.#moveWatermark();
    this.#render();
  }

  play() {
    if (!this.paused) return;
    if (this.currentTime >= this.duration) this.currentTime = 0;
    this.paused = false;
    this.last = performance.now();
    this.#render();
    this.dispatchEvent(new Event('play'));
  }

  pause() {
    if (this.paused) return;
    this.#tick();
    this.paused = true;
    this.#render();
    this.dispatchEvent(new Event('pause'));
  }

  seek(t) {
    const from = this.currentTime;
    const to = Math.min(Math.max(0, Math.floor(t)), this.duration);
    if (to === Math.floor(from)) return;
    this.currentTime = to;
    this.last = performance.now();
    this.#render();
    this.dispatchEvent(new CustomEvent('seeked', { detail: { from, to } }));
  }

  destroy() {
    clearInterval(this.timer);
    clearInterval(this.wmTimer);
    this.paused = true;
  }

  #tick() {
    const now = performance.now();
    const dt = (now - this.last) / 1000;
    this.last = now;
    if (this.paused) return;
    this.currentTime = Math.min(this.duration, this.currentTime + dt * this.playbackRate);
    this.#render();
    this.dispatchEvent(new Event('timeupdate'));
    if (this.currentTime >= this.duration) {
      this.paused = true;
      this.#render();
      this.dispatchEvent(new Event('ended'));
    }
  }

  // A faint moving watermark with the viewer's email discourages screen recording. It is placed from its
  // measured size so it always stays fully inside the frame (a clipped mark would be easy to crop out).
  #moveWatermark() {
    if (!this.wm) return;
    const w = this.el.clientWidth, h = this.el.clientHeight;
    const free = (total, size, margin) => Math.max(0, total - size - margin * 2);
    this.wm.style.left = `${8 + Math.random() * free(w, this.wm.offsetWidth, 8)}px`;
    this.wm.style.top = `${44 + Math.random() * free(h - 44 - 48, this.wm.offsetHeight, 0)}px`;
  }

  #render() {
    this.el.classList.toggle('playing', !this.paused);
    this.btn.innerHTML = String(icon(this.paused ? 'play' : 'pause'));
    this.btn.setAttribute('aria-label', this.paused ? 'Play' : 'Pause');
    if (document.activeElement !== this.range) this.range.value = String(Math.floor(this.currentTime));
    this.timeEl.textContent = `${fmtClock(this.currentTime)} / ${fmtClock(this.duration)}`;
  }
}

export class WatchTracker extends EventTarget {
  /**
   * @param player   a DemoPlayer (or the protected player later)
   * @param send     async (from, to, position) => server result; called in order, one at a time
   * @param sendOnUnload (from, to, position) => void; used when the page is closing
   */
  constructor(player, { send, sendOnUnload, flushSeconds = 10, maxSpan = 25 }) {
    super();
    this.player = player;
    this.send = send;
    this.sendOnUnload = sendOnUnload;
    this.maxSpan = maxSpan;
    this.spanStart = null;
    this.last = player.currentTime;
    this.queue = Promise.resolve();

    this.handlers = {
      play: () => { this.spanStart = player.currentTime; this.last = player.currentTime; },
      timeupdate: () => {
        if (player.paused || this.spanStart === null) return;
        this.last = player.currentTime;
        if (this.last - this.spanStart >= this.maxSpan) this.flush();
      },
      seeked: (e) => {
        if (this.spanStart !== null) { this.last = e.detail.from; this.flush(); }
        this.spanStart = player.paused ? null : e.detail.to;
        this.last = e.detail.to;
      },
      pause: () => { this.last = player.currentTime; this.flush(); this.spanStart = null; },
      ended: () => { this.last = player.currentTime; this.flush(); this.spanStart = null; },
    };
    for (const [ev, fn] of Object.entries(this.handlers)) player.addEventListener(ev, fn);
    this.interval = setInterval(() => this.flush(), flushSeconds * 1000);
    this.onHide = () => { if (document.visibilityState === 'hidden') this.#flushNow(); };
    this.onPagehide = () => this.#flushNow();
    document.addEventListener('visibilitychange', this.onHide);
    window.addEventListener('pagehide', this.onPagehide);
  }

  // The span watched since the last report, split into chunks the server accepts (at most 30 s each).
  #take() {
    if (this.spanStart === null) return [];
    const from = Math.floor(this.spanStart);
    const to = Math.floor(this.last);
    if (to - from < 1) return [];
    this.spanStart = this.last;
    const chunks = [];
    for (let f = from; f < to; f += 30) chunks.push([f, Math.min(f + 30, to)]);
    return chunks;
  }

  flush() {
    const chunks = this.#take();
    if (!chunks.length) return this.queue;
    const position = Math.floor(this.player.currentTime);
    this.queue = this.queue.then(async () => {
      for (const [f, t] of chunks) {
        const result = await this.send(f, t, position);
        this.dispatchEvent(new CustomEvent('progress', { detail: result }));
      }
    }).catch((error) => this.dispatchEvent(new CustomEvent('error', { detail: error })));
    return this.queue;
  }

  #flushNow() {
    if (!this.player.paused) this.last = this.player.currentTime;
    const position = Math.floor(this.player.currentTime);
    for (const [f, t] of this.#take()) this.sendOnUnload?.(f, t, position);
  }

  destroy() {
    if (!this.player.paused) this.last = this.player.currentTime;
    this.flush();
    clearInterval(this.interval);
    for (const [ev, fn] of Object.entries(this.handlers)) this.player.removeEventListener(ev, fn);
    document.removeEventListener('visibilitychange', this.onHide);
    window.removeEventListener('pagehide', this.onPagehide);
  }
}
