/* Nuvora theme: a remembered dark/light choice and the pixel sun/moon toggle.
   Any <button data-theme-toggle> on the page becomes a toggle. Pages also run
   a one-line inline snippet in <head> so the saved theme applies before paint. */
(() => {
  "use strict";
  const KEY = "nuvora-theme";
  const root = document.documentElement;

  // 9x9 pixel art. "X" = lit pixel, "o" = dim pixel (stars), "." = off.
  const MOON = [
    "..XXX..o.",
    ".XXX.....",
    "XXX.....o",
    "XXX......",
    "XXX......",
    "XXXX.....",
    ".XXXXX...",
    "..XXXXXX.",
    "....XXX..",
  ].join("");
  const SUN = [
    "....X....",
    ".X.....X.",
    "...XXX...",
    "..XXXXX..",
    "X.XXXXX.X",
    "..XXXXX..",
    "...XXX...",
    ".X.....X.",
    "....X....",
  ].join("");

  const readSaved = () => {
    try { return localStorage.getItem(KEY); } catch { return null; }
  };
  const save = value => {
    try { localStorage.setItem(KEY, value); } catch { /* private mode: keep it for this page only */ }
  };
  const current = () => (root.dataset.theme === "light" ? "light" : "dark");

  const saved = readSaved();
  if (saved === "light" || saved === "dark") root.dataset.theme = saved;

  const reduceMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  function paintPixels(grid, theme, animate) {
    const art = theme === "light" ? SUN : MOON;
    grid.querySelectorAll("i").forEach((cell, index) => {
      const ch = art[index];
      const lit = ch !== ".";
      if (animate) {
        cell.style.setProperty("--dx", `${(Math.random() * 14 - 7).toFixed(1)}px`);
        cell.style.setProperty("--dy", `${(Math.random() * 14 - 7).toFixed(1)}px`);
        cell.style.setProperty("--d", `${Math.round(Math.random() * 220)}ms`);
      } else {
        cell.style.setProperty("--d", "0ms");
      }
      cell.classList.toggle("on", lit);
      cell.classList.toggle("dim", ch === "o");
    });
  }

  function build(button) {
    if (button.dataset.ttReady) return;
    button.dataset.ttReady = "1";
    button.classList.add("theme-toggle");
    button.type = "button";
    button.setAttribute("role", "switch");
    button.innerHTML = '<span class="tt-knob" aria-hidden="true"><span class="tt-px">' + "<i></i>".repeat(81) + "</span></span>";
    paintPixels(button.querySelector(".tt-px"), current(), false);
    sync(button);
    button.addEventListener("click", () => set(current() === "light" ? "dark" : "light"));
  }

  function sync(button) {
    const dark = current() === "dark";
    button.setAttribute("aria-checked", String(dark));
    button.setAttribute("aria-label", "Dark mode");
    button.title = dark ? "Switch to day theme" : "Switch to night theme";
  }

  function set(theme, persist = true) {
    if (theme !== "light" && theme !== "dark") return;
    if (persist) save(theme);
    if (theme === current()) return;
    const apply = () => {
      root.dataset.theme = theme;
      document.querySelectorAll("[data-theme-toggle]").forEach(button => {
        sync(button);
        const grid = button.querySelector(".tt-px");
        if (grid) paintPixels(grid, theme, !reduceMotion());
      });
    };
    if (document.startViewTransition && !reduceMotion()) document.startViewTransition(apply);
    else apply();
    window.dispatchEvent(new CustomEvent("nuvora:themechange", { detail: { theme } }));
  }

  function init() {
    document.querySelectorAll("[data-theme-toggle]").forEach(build);
  }

  // Until the visitor picks a theme, follow the operating system's setting.
  const systemDark = window.matchMedia ? window.matchMedia("(prefers-color-scheme: dark)") : null;
  if (systemDark && systemDark.addEventListener) {
    systemDark.addEventListener("change", event => {
      const choice = readSaved();
      if (choice !== "light" && choice !== "dark") set(event.matches ? "dark" : "light", false);
    });
  }

  window.NuvoraTheme = { get: current, set, toggle: () => set(current() === "light" ? "dark" : "light"), mount: init };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
