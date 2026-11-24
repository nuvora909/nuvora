"""Add the theme loader, palette, toggle and sky layer to index.html (idempotent on a fresh original)."""
import sys
from pathlib import Path

path = Path(sys.argv[1])
s = path.read_text(encoding="utf-8")


def swap(old: str, new: str) -> None:
    global s
    if new in s:
        return
    assert s.count(old) == 1, old
    s = s.replace(old, new)


swap('<html lang="en" data-theme="dark">', '<html lang="en" data-theme="light">')
swap('<link rel="icon" href="data:,">',
     '<link rel="icon" href="data:,">\n<script>try{var t=localStorage.getItem("nuvora-theme");if(t!=="light"&&t!=="dark")t=matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light";document.documentElement.dataset.theme=t}catch(e){}</script>')
swap('  <link rel="stylesheet" href="/static/design-tokens.css?v=20261122-1">',
     '  <link rel="stylesheet" href="/static/design-tokens.css?v=20261124-3">\n  <link rel="stylesheet" href="/static/theme-palette.css?v=20261124-2">')
swap('href="/static/account.css?v=20261124-1"', 'href="/static/account.css?v=20261124-2"')
swap('href="/static/experience.css?v=20261122-2"', 'href="/static/experience.css?v=20261124-2"')
swap('<link rel="stylesheet" href="/static/reports.css">', '<link rel="stylesheet" href="/static/reports.css?v=20261124-2">')
swap('  <link rel="stylesheet" href="/static/tarot-visual.css?v=20261122-2">',
     '  <link rel="stylesheet" href="/static/tarot-visual.css?v=20261122-2">\n'
     '  <link rel="stylesheet" href="/static/theme-toggle.css?v=20261124-1">\n'
     '  <link rel="stylesheet" href="/static/theme-sky.css?v=20261124-5">')
swap('    <span class="pill" id="llmPill" style="display:none" hidden><span class="dot"></span>reader…</span>\n  </div>',
     '    <span class="pill" id="llmPill" style="display:none" hidden><span class="dot"></span>reader…</span>\n'
     '    <button data-theme-toggle class="is-small"></button>\n  </div>')
swap('<script src="/static/youpi.js"></script>', '<script src="/static/theme.js?v=20261124-2"></script>\n<script src="/static/youpi.js"></script>')
path.write_text(s, encoding="utf-8")
print("index.html wired for themes")

# The hero starfield picks its colours from the active theme: white sparkles by day, starlight by night.
s = path.read_text(encoding="utf-8")
swap('  const colors = ["#e7ff9a", "#f8ecdc", "#c9b1f1", "#ffab8c"];',
     '  const palettes = {light: ["#ffffff", "#e3f1ff", "#cfe0ff", "#fff3cf"], dark: ["#ffe7a6", "#f3f5ff", "#cfc6ff", "#a8c4ff"]};\n'
     '  const night = () => document.documentElement.dataset.theme === "dark";')
swap('phase:Math.random() * Math.PI * 2, color:colors[Math.floor(Math.random() * colors.length)]',
     'phase:Math.random() * Math.PI * 2, tone:Math.floor(Math.random() * 4)')
swap('glow.addColorStop(0, "rgba(223,255,126,.055)"); glow.addColorStop(1, "rgba(223,255,126,0)");',
     'glow.addColorStop(0, night() ? "rgba(255,214,120,.06)" : "rgba(255,255,255,.12)"); glow.addColorStop(1, "rgba(255,255,255,0)");')
swap('context.strokeStyle = `rgba(207,190,230,${(1 - squared / linkSquared) * .13})`;',
     'context.strokeStyle = night() ? `rgba(207,200,255,${(1 - squared / linkSquared) * .14})` : `rgba(255,255,255,${(1 - squared / linkSquared) * .22})`;')
swap('context.fillStyle = star.color; context.fill();',
     'context.fillStyle = palettes[night() ? "dark" : "light"][star.tone]; context.fill();')
path.write_text(s, encoding="utf-8")
print("starfield follows the theme")

# Signed-out visitors don't see the header, so give them a floating toggle of their own.
s = path.read_text(encoding="utf-8")
swap('<body class="auth-pending"><div id="accountRoot"></div>',
     '<body class="auth-pending"><div id="accountRoot"></div>\n<button data-theme-toggle class="is-small theme-float"></button>')
path.write_text(s, encoding="utf-8")
print("floating toggle added for signed-out visitors")
