"""One-off migration: move the main app's hardcoded colours onto day/night theme variables.

Every colour literal in experience.css, account.css, reports.css and the inline <style> of
index.html is classified by colour family (paper, deep ink, lime, coral, ...) and by the role it
plays where it is used (text, surface, line, shadow, highlight). Two values are derived for each:
a Daydream day value (open sky: white, sky blue, dream purple, navy ink) and a night-sky value
(midnight navy, moonlight text, starlight gold, periwinkle). The literal is replaced by a
var(--p-...) reference and the values are written to theme-palette.css.

Run from anywhere: python theme_convert.py <static_dir>
Originals are kept in design-reference/pre-theme-backup/.
"""
from __future__ import annotations

import colorsys
import re
import sys
from pathlib import Path

STATIC = Path(sys.argv[1] if len(sys.argv) > 1 else r"D:\nuvora\jyotish\server\static")
SOURCES = ["experience.css", "account.css", "reports.css", "index.html"]

HEX = r"#(?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{3,4})\b"
RGB = r"rgba?\(\s*\d+\s*,\s*\d+\s*,\s*\d+\s*(?:,\s*[\d.]+%?\s*)?\)"
COLOR = re.compile(f"{HEX}|{RGB}")
URL = re.compile(r"url\([^)]*\)")
DECL = re.compile(r"(?P<pre>[{;]\s*)(?P<prop>--[\w-]+|[a-zA-Z-]+)\s*:\s*(?P<val>[^;{}]+?)(?=\s*[;}])")

TEXT_PROPS = {"color", "-webkit-text-fill-color", "caret-color", "text-decoration-color", "accent-color", "column-rule-color"}
SKIP_PROPS = {"content", "mask", "mask-image", "-webkit-mask", "-webkit-mask-image", "font", "font-family", "grid-template-areas"}
CUSTOM_ROLES = {
    "--bg": "surface", "--bg2": "surface", "--card": "surface", "--card-solid": "surface", "--sunk": "surface",
    "--line": "line", "--line2": "line", "--shadow": "shadow",
}


# ---------------------------------------------------------------- colour maths
def parse(text: str) -> tuple[int, int, int, float]:
    text = text.strip()
    if text.startswith("#"):
        h = text[1:]
        if len(h) in (3, 4):
            h = "".join(c * 2 for c in h)
        r, g, b = (int(h[i:i + 2], 16) for i in (0, 2, 4))
        a = int(h[6:8], 16) / 255 if len(h) == 8 else 1.0
        return r, g, b, a
    nums = re.findall(r"[\d.]+%?", text)
    r, g, b = (int(float(n)) for n in nums[:3])
    a = 1.0
    if len(nums) > 3:
        a = float(nums[3].rstrip("%")) / (100 if nums[3].endswith("%") else 1)
    return r, g, b, a


def hsl(r: int, g: int, b: int) -> tuple[float, float, float]:
    h, l, s = colorsys.rgb_to_hls(r / 255, g / 255, b / 255)
    return h * 360, s, l


def fmt(h: float, s: float, l: float, a: float) -> str:
    s, l, a = max(0.0, min(1.0, s)), max(0.0, min(1.0, l)), max(0.0, min(1.0, a))
    r, g, b = (round(c * 255) for c in colorsys.hls_to_rgb((h % 360) / 360, l, s))
    if a >= 0.999:
        return f"#{r:02x}{g:02x}{b:02x}"
    return f"rgba({r},{g},{b},{round(a, 3):g})"


def family(h: float, s: float, l: float) -> str:
    if l >= 0.88:
        return "paper"
    if l <= 0.2 or (l <= 0.3 and s < 0.75):
        return "deep"
    if s < 0.18:
        return "grey"
    if 55 <= h < 105:
        return "lime"
    if (h < 25 or h >= 345) and s > 0.75 and l > 0.55:
        return "coral"
    if 12 <= h < 55:
        return "gold"                                          # browns, ambers, oranges
    if h < 12 or h >= 345:
        return "red"
    if 105 <= h < 175:
        return "green"
    if 175 <= h < 205:
        return "cyan"
    if 205 <= h < 245:
        return "blue"
    if 245 <= h < 300:
        return "violet"
    return "pink"


def violet_tint(h: float, s: float) -> bool:
    return 240 <= h <= 310 and s > 0.15


# ---------------------------------------------------------------- Daydream (day)
def day(fam: str, role: str, h: float, s: float, l: float, a: float) -> str:
    if fam == "paper":
        if role == "text":
            return fmt(214, 0.5 * s, max(l, 0.97), a)
        return fmt(250 if violet_tint(h, s) else 212, s, l, a)
    if fam == "deep":
        if role == "text":
            return fmt(222, 0.45, min(max(l * 0.8, 0.07), 0.28), a)
        if role == "surface":
            return fmt(214, 0.82, 0.42 + l * 0.5, a)
        if role == "line":
            return fmt(222, 0.45, 0.2, a)
        return fmt(220, 0.55, 0.25, a)                      # shadows
    if fam == "grey":
        return fmt(220, 0.14 if role == "text" else 0.2, l, a)
    if fam == "lime":
        if role == "text":
            return fmt(200, 1.0, 0.88, a)
        if role == "surface":
            return fmt(200, 0.95, 0.84, a)
        if role == "line":
            return fmt(200, 0.95, 0.75, a)
        return fmt(205, 1.0, 0.72, a)
    if fam == "gold":
        if l > 0.6:                                          # warm light → sunlight
            return fmt(44, 0.95, 0.8 if role == "text" else 0.86, a)
        if role in ("shadow", "highlight"):
            return fmt(40, 0.9, 0.6, a)
        return fmt(218, 0.75, min(max(l, 0.38), 0.5), a)       # brown/orange text → blue
    if fam == "coral":
        if role == "surface":
            return fmt(213, 0.95, l - 0.08, a)
        if role == "text":
            return fmt(213, 0.85, 0.5, a)
        return fmt(213, 0.9, 0.58, a)
    if fam == "violet":
        return fmt(255, max(s, 0.7), l, a)
    if fam == "blue":
        return fmt(214, s, l, a)
    if fam == "cyan":
        return fmt(196, s, l, a)
    return fmt(h, s, l, a)                                   # red, green, pink


# ---------------------------------------------------------------- Night sky
def night(fam: str, role: str, h: float, s: float, l: float, a: float) -> str:
    if fam == "paper":
        if role == "text":
            return fmt(228, 0.6, 0.94, a)
        if role == "highlight":
            return fmt(228, 0.5, 0.85, a * 0.1)
        if role == "line":
            return fmt(228, 0.5, 0.8, a * 0.22) if a >= 0.5 else fmt(228, 0.3, 0.95, a * 0.6)
        if role == "shadow":
            return fmt(228, 0.5, 0.8, a * 0.2)
        if a < 0.35:                                         # glass on a dark panel
            return fmt(230, 0.3, 0.95, a * 0.7)
        return fmt(250 if violet_tint(h, s) else 228, 0.42, 0.105 + (l - 0.88) * 0.4, a)
    if fam == "deep":
        if role == "text":
            return fmt(228, 0.55, 0.93 - l * 0.25, a)
        if role == "surface":
            return fmt(232, 0.5, 0.1 + l * 0.3, a)
        if role == "line":
            return fmt(228, 0.5, 0.82, a * 0.9)
        return fmt(232, 0.6, 0.02, min(0.95, a * 1.5))
    if fam == "grey":
        if role == "text":
            return fmt(228, 0.2, l if l > 0.6 else 1.12 - l, a)
        if role == "line":
            return fmt(228, 0.3, 0.75, a * 0.35)
        return fmt(228, 0.22, 0.32 if l > 0.6 else 1.0 - l * 0.8, a)
    if fam == "lime":                                        # → starlight gold
        if role == "text":
            return fmt(44, 1.0, 0.78, a)
        if role == "surface":
            return fmt(42, 0.95, 0.7, a)
        if role == "line":
            return fmt(42, 0.9, 0.68, a)
        return fmt(40, 1.0, 0.62, a)
    if fam == "gold":
        if role in ("shadow", "highlight"):
            return fmt(40, 0.95, 0.6, a)
        return fmt(41, 0.85, min(0.84, max(l + 0.2, 0.66)), a)
    if fam == "coral":                                       # → periwinkle
        if role == "surface":
            return fmt(232, 0.95, l - 0.1, a)
        if role == "text":
            return fmt(230, 1.0, 0.8, a)
        return fmt(232, 0.95, 0.62, a)
    if fam == "violet":
        if role == "surface" and l < 0.5:
            return fmt(258, s * 0.8, l + 0.05, a)
        return fmt(258, max(s, 0.75), min(0.86, l + 0.14), a)
    if fam == "blue":
        return fmt(224, s, min(0.86, l + 0.14), a)
    if fam == "cyan":
        return fmt(190, s, min(0.82, l + 0.1), a)
    if fam in ("red", "green", "pink"):
        if role == "surface" and a > 0.5 and l > 0.6:
            return fmt(h, s * 0.6, 0.24, a)
        return fmt(h, s, min(0.82, l + 0.16), a)
    return fmt(h, s, l, a)


# ---------------------------------------------------------------- rewriting
palette: dict[tuple[str, str], str] = {}
counters: dict[str, int] = {}
stats = {"replaced": 0}


def var_for(literal: str, role: str) -> str:
    r, g, b, a = parse(literal)
    h, s, l = hsl(r, g, b)
    fam = family(h, s, l)
    if role == "fill":
        role = "text" if l < 0.5 else "surface"
    if role == "glow":
        role = "highlight" if fam == "paper" else "shadow"
    pair = (day(fam, role, h, s, l, a), night(fam, role, h, s, l, a))
    if pair not in palette:
        key = f"{fam}-{role[0]}"
        counters[key] = counters.get(key, 0) + 1
        palette[pair] = f"--p-{key}{counters[key]}"
    stats["replaced"] += 1
    return f"var({palette[pair]})"


def split_top(value: str) -> list[tuple[int, int]]:
    """Spans of comma-separated segments, ignoring commas inside parentheses."""
    spans, depth, start = [], 0, 0
    for i, ch in enumerate(value):
        if ch == "(":
            depth += 1
        elif ch == ")":
            depth -= 1
        elif ch == "," and depth == 0:
            spans.append((start, i))
            start = i + 1
    spans.append((start, len(value)))
    return spans


def role_for(prop: str) -> str | None:
    p = prop.lower()
    if p in SKIP_PROPS:
        return None
    if p in CUSTOM_ROLES:
        return CUSTOM_ROLES[p]
    if p.startswith("--"):
        return "surface" if p.endswith("-soft") else "text"
    if p in TEXT_PROPS:
        return "text"
    if p == "fill":
        return "fill"
    if p.startswith(("border", "outline", "column-rule")) or p == "stroke":
        return "line"
    if p in ("box-shadow", "text-shadow", "filter", "backdrop-filter"):
        return "shadow"
    if p.startswith("background"):
        return "surface"
    return "text"


def rewrite_value(prop: str, value: str) -> str:
    role = role_for(prop)
    if role is None or not COLOR.search(value):
        return value
    protected = [m.span() for m in URL.finditer(value)]

    def in_url(pos: int) -> bool:
        return any(a <= pos < b for a, b in protected)

    if role == "shadow":
        out, last = [], 0
        for a, b in split_top(value):
            segment = value[a:b]
            inset = "inset" in segment

            def sub(m, inset=inset, offset=a):
                if in_url(offset + m.start()):
                    return m.group(0)
                r, g, bb, _ = parse(m.group(0))
                light = hsl(r, g, bb)[2] >= 0.88
                return var_for(m.group(0), "highlight" if light and (inset or prop.lower() == "box-shadow") else "shadow")

            out.append(value[last:a] + COLOR.sub(sub, segment))
            last = b
        out.append(value[last:])
        return "".join(out)

    return COLOR.sub(lambda m: m.group(0) if in_url(m.start()) else var_for(m.group(0), role), value)


def print_spans(css: str) -> list[tuple[int, int]]:
    spans = []
    for m in re.finditer(r"@media\s+print", css):
        i = css.index("{", m.end())
        depth = 0
        for j in range(i, len(css)):
            if css[j] == "{":
                depth += 1
            elif css[j] == "}":
                depth -= 1
                if depth == 0:
                    spans.append((m.start(), j + 1))
                    break
    return spans


PRIMITIVES: dict[str, str] = {}


def resolve_primitives(css: str) -> str:
    """var(--color-gold-50) and friends never change with the theme, so treat them as literals."""
    if not PRIMITIVES:
        tokens = (STATIC / "design-tokens.css").read_text(encoding="utf-8")
        PRIMITIVES.update(re.findall(r"(--color-[a-z]+-\d+):\s*(#[0-9a-fA-F]{3,8})", tokens))
    return re.sub(r"var\((--color-[a-z]+-\d+)\)", lambda m: PRIMITIVES.get(m.group(1), m.group(0)), css)


def convert_css(css: str) -> str:
    css = resolve_primitives(css)
    skip = print_spans(css)

    def repl(m):
        if any(a <= m.start() < b for a, b in skip):
            return m.group(0)
        new = rewrite_value(m.group("prop"), m.group("val"))
        return m.group("pre") + m.group("prop") + ":" + new

    return DECL.sub(repl, css)


def main() -> None:
    for name in SOURCES:
        path = STATIC / name
        text = path.read_text(encoding="utf-8")
        before = stats["replaced"]
        if name.endswith(".html"):
            m = re.search(r"<style>(.*?)</style>", text, re.S)
            text = text[:m.start(1)] + convert_css(m.group(1)) + text[m.end(1):]
        else:
            text = convert_css(text)
        path.write_text(text, encoding="utf-8")
        print(f"{name}: {stats['replaced'] - before} colours moved to variables")

    day_lines = "\n".join(f"  {v}: {d};" for (d, n), v in palette.items())
    night_lines = "\n".join(f"  {v}: {n};" for (d, n), v in palette.items())
    (STATIC / "theme-palette.css").write_text(
        "/* GENERATED by design-reference/theme_convert.py — the main app's colour palette.\n"
        "   Day = Daydream (open sky). Night = midnight sky. Edit values here, or hand-tune in theme-sky.css. */\n"
        f':root,\n[data-theme="light"] {{\n  color-scheme: light;\n{day_lines}\n}}\n\n'
        f'[data-theme="dark"] {{\n  color-scheme: dark;\n{night_lines}\n}}\n',
        encoding="utf-8")
    print(f"{len(palette)} palette variables written to theme-palette.css")


if __name__ == "__main__":
    main()
