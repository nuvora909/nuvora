"""Drawn graphics for the PDF reports: kundli charts, timelines, bar charts, tiles, gauges and callouts."""
from __future__ import annotations

from datetime import datetime

from reportlab.lib import colors
from reportlab.lib.units import mm
from reportlab.platypus import Flowable

INK = colors.HexColor("#1d1a33")
MUTED = colors.HexColor("#6b6680")
NAVY = colors.HexColor("#1b2150")
GOLD = colors.HexColor("#c4933f")
GOLD_SOFT = colors.HexColor("#f4e9d2")
SKY = colors.HexColor("#2f6fd6")
SKY_SOFT = colors.HexColor("#e6effc")
ROSE = colors.HexColor("#c2415b")
ROSE_SOFT = colors.HexColor("#fbe8ec")
GREEN = colors.HexColor("#2c8a5f")
GREEN_SOFT = colors.HexColor("#e3f3ea")
LINE = colors.HexColor("#ddd8e8")
PAPER = colors.HexColor("#fbf9f4")

TONES = {"good": (GREEN, GREEN_SOFT), "caution": (ROSE, ROSE_SOFT), "info": (SKY, SKY_SOFT), "gold": (GOLD, GOLD_SOFT),
         "neutral": (NAVY, colors.HexColor("#eeedf5"))}
ABBR = {"SUN": "Su", "MOON": "Mo", "MARS": "Ma", "MERCURY": "Me", "JUPITER": "Ju", "VENUS": "Ve", "SATURN": "Sa",
        "RAHU": "Ra", "KETU": "Ke"}
SIGNS = ["Aries", "Taurus", "Gemini", "Cancer", "Leo", "Virgo", "Libra", "Scorpio", "Sagittarius", "Capricorn",
         "Aquarius", "Pisces"]
FONTS = {"base": "Helvetica", "bold": "Helvetica-Bold", "display": "Times-Bold"}


def set_fonts(base: str, bold: str, display: str) -> None:
    FONTS.update(base=base, bold=bold, display=display)


def _wrap(canv, text, font, size, width):
    words, lines, line = str(text).split(), [], ""
    for word in words:
        trial = (line + " " + word).strip()
        if canv.stringWidth(trial, font, size) <= width:
            line = trial
        else:
            if line:
                lines.append(line)
            line = word
    if line:
        lines.append(line)
    return lines


class KundliChart(Flowable):
    """North Indian (diamond) chart: house 1 at top centre, houses running anticlockwise."""
    CENTRES = {1: (.5, .75), 2: (.25, .89), 3: (.11, .75), 4: (.25, .5), 5: (.11, .25), 6: (.25, .11),
               7: (.5, .25), 8: (.75, .11), 9: (.89, .25), 10: (.75, .5), 11: (.89, .75), 12: (.75, .89)}
    SIGN_POS = {1: (.5, .57), 2: (.25, .8), 3: (.19, .75), 4: (.43, .5), 5: (.19, .25), 6: (.25, .2),
                7: (.5, .43), 8: (.75, .2), 9: (.81, .25), 10: (.57, .5), 11: (.81, .75), 12: (.75, .8)}

    def __init__(self, lagna_sign: int, placements: dict[int, list[str]], title: str, size=72 * mm, retro=()):
        super().__init__()
        self.lagna, self.placements, self.title, self.size, self.retro = lagna_sign, placements, title, size, set(retro)
        self.width, self.height = size, size + 8 * mm

    def draw(self):
        c, s = self.canv, self.size
        k = max(.62, s / (72 * mm))
        c.saveState()
        c.setFillColor(PAPER)
        c.setStrokeColor(GOLD)
        c.setLineWidth(1.2 * k)
        c.roundRect(0, 0, s, s, 3 * mm * k, fill=1, stroke=0)
        c.saveState()
        clip = c.beginPath()
        clip.roundRect(0, 0, s, s, 3 * mm * k)
        c.clipPath(clip, stroke=0, fill=0)
        c.setLineWidth(.7 * k)
        c.line(0, 0, s, s)
        c.line(0, s, s, 0)
        p = c.beginPath()
        p.moveTo(s / 2, s); p.lineTo(0, s / 2); p.lineTo(s / 2, 0); p.lineTo(s, s / 2); p.close()
        c.drawPath(p, stroke=1, fill=0)
        c.restoreState()
        c.setLineWidth(1.2 * k)
        c.roundRect(0, 0, s, s, 3 * mm * k, fill=0, stroke=1)
        for house in range(1, 13):
            sign = (self.lagna + house - 1) % 12
            sx, sy = self.SIGN_POS[house]
            c.setFont(FONTS["base"], 6.5 * k)
            c.setFillColor(MUTED)
            c.drawCentredString(sx * s, sy * s - 2 * k, str(sign + 1))
            names = self.placements.get(house, [])
            if house == 1:
                names = ["Asc"] + names
            labels = [n + ("·R" if n in self.retro else "") for n in names]
            cx, cy = self.CENTRES[house]
            cols = 2 if len(labels) > 3 else 1
            rows = [labels[i:i + cols] for i in range(0, len(labels), cols)]
            fs = (8.4 if len(rows) <= 2 else 7.6) * k
            line_h = fs * 1.12
            top = cy * s + (len(rows) - 1) * line_h / 2
            for r, row in enumerate(rows):
                for j, label in enumerate(row):
                    dx = 0 if len(row) == 1 else (j - .5) * 7.5 * mm * k
                    base = label.split("·")[0]
                    c.setFont(FONTS["bold"], fs)
                    c.setFillColor(GOLD if base == "Asc" else (ROSE if base in ("Sa", "Ra", "Ke", "Ma") else NAVY))
                    c.drawCentredString(cx * s + dx, top - r * line_h - fs * .35, label)
        c.setFont(FONTS["bold"], 8.5 * min(1, k + .1))
        c.setFillColor(NAVY)
        c.drawCentredString(s / 2, s + 3 * mm, self.title)
        c.restoreState()


def chart_from_report(report: dict, key: str = "D1", title: str | None = None, size=72 * mm) -> KundliChart:
    if key == "D1":
        lagna = report["lagna"]["sign"]
        planets = {g: p["house"] for g, p in report["planets"].items()}
        retro = [ABBR[g] for g, p in report["planets"].items() if p["retrograde"] and g not in ("RAHU", "KETU")]
    else:
        v = report["vargas"][key]
        lagna = v["lagna"]["sign"]
        planets = {g: p["house"] for g, p in v["planets"].items()}
        retro = []
    placements: dict[int, list[str]] = {}
    for g, house in planets.items():
        placements.setdefault(house, []).append(ABBR[g])
    name = title or ("Birth chart (D1 · Rashi)" if key == "D1" else f"{key} · {report['vargas'][key]['name']}")
    return KundliChart(lagna, placements, name, size, retro)


class ChartGrid(Flowable):
    """Several charts laid out in rows."""

    def __init__(self, charts, cols=3, gap=6 * mm):
        super().__init__()
        self.charts, self.cols, self.gap = charts, cols, gap

    def wrap(self, aw, ah):
        self.width = aw
        rows = (len(self.charts) + self.cols - 1) // self.cols
        ch = self.charts[0].height if self.charts else 0
        self.height = rows * (ch + self.gap)
        return aw, self.height

    def draw(self):
        if not self.charts:
            return
        cw, ch = self.charts[0].width, self.charts[0].height
        span = self.cols * cw + (self.cols - 1) * self.gap
        x0 = (self.width - span) / 2
        for i, chart in enumerate(self.charts):
            r, col = divmod(i, self.cols)
            chart.drawOn(self.canv, x0 + col * (cw + self.gap), self.height - (r + 1) * (ch + self.gap) + self.gap)


class SideBySide(Flowable):
    """Two flowables drawn next to each other, centred."""

    def __init__(self, left: Flowable, right: Flowable, gap=12 * mm):
        super().__init__()
        self.left, self.right, self.gap = left, right, gap

    def wrap(self, aw, ah):
        lw, lh = self.left.wrap(aw, ah)
        rw, rh = self.right.wrap(aw, ah)
        self.width, self.height = aw, max(lh, rh)
        self._lw, self._rw = lw, rw
        return self.width, self.height

    def draw(self):
        total = self._lw + self._rw + self.gap
        x = (self.width - total) / 2
        self.left.drawOn(self.canv, x, self.height - self.left.height)
        self.right.drawOn(self.canv, x + self._lw + self.gap, self.height - self.right.height)


class Tiles(Flowable):
    """A row of stat tiles: (label, value, note)."""

    def __init__(self, items, height=19 * mm):
        super().__init__()
        self.items, self.height = items, height

    def wrap(self, aw, ah):
        self.width = aw
        return aw, self.height

    def draw(self):
        c, n = self.canv, max(1, len(self.items))
        gap = 3 * mm
        w = (self.width - gap * (n - 1)) / n
        for i, item in enumerate(self.items):
            label, value = item[0], item[1]
            note = item[2] if len(item) > 2 else ""
            x = i * (w + gap)
            c.setFillColor(colors.white)
            c.setStrokeColor(LINE)
            c.roundRect(x, 0, w, self.height, 2.5 * mm, fill=1, stroke=1)
            c.setFillColor(GOLD)
            c.rect(x, self.height - 1.2 * mm, w, 1.2 * mm, fill=1, stroke=0)
            c.setFont(FONTS["base"], 6.6)
            c.setFillColor(MUTED)
            c.drawString(x + 3 * mm, self.height - 6 * mm, label.upper())
            c.setFont(FONTS["display"], 11.5)
            c.setFillColor(NAVY)
            lines = _wrap(c, value, FONTS["display"], 11.5, w - 6 * mm)[:2]
            for j, line in enumerate(lines):
                c.drawString(x + 3 * mm, self.height - 11 * mm - j * 4.4 * mm, line)
            if note and len(lines) < 2:
                c.setFont(FONTS["base"], 6.8)
                c.setFillColor(MUTED)
                c.drawString(x + 3 * mm, 3 * mm, note[:48])


class Rule(Flowable):
    """Short gold rule under a chapter title."""

    def __init__(self, length, thickness=1.6):
        super().__init__()
        self.length, self.thickness = length, thickness
        self.width, self.height = length, 4 * mm

    def draw(self):
        self.canv.setFillColor(GOLD)
        self.canv.rect(0, 1.5 * mm, self.length, self.thickness, fill=1, stroke=0)


class Bars(Flowable):
    """Horizontal bars: items are (label, value, max, tone); optional reference value drawn as a line."""

    def __init__(self, items, reference=None, reference_label="", value_suffix="", bar_h=4.2 * mm, show_max=False):
        super().__init__()
        self.items, self.reference, self.ref_label, self.suffix, self.bar_h = items, reference, reference_label, value_suffix, bar_h
        self.show_max = show_max
        self.height = len(items) * (bar_h + 2.4 * mm) + (6 * mm if reference is not None else 1 * mm)

    def wrap(self, aw, ah):
        self.width = aw
        return aw, self.height

    def draw(self):
        c = self.canv
        label_w, value_w = 34 * mm, 18 * mm
        track = self.width - label_w - value_w
        top = self.height - (5 * mm if self.reference is not None else 0)
        vmax = max((i[2] for i in self.items), default=1) or 1
        for idx, (label, value, maximum, tone) in enumerate(self.items):
            y = top - (idx + 1) * (self.bar_h + 2.4 * mm) + 1.2 * mm
            c.setFont(FONTS["base"], 8)
            c.setFillColor(INK)
            c.drawString(0, y + 1.1 * mm, str(label))
            c.setFillColor(colors.HexColor("#efedf5"))
            c.roundRect(label_w, y, track, self.bar_h, self.bar_h / 2, fill=1, stroke=0)
            edge, _ = TONES.get(tone, TONES["info"])
            c.setFillColor(edge)
            c.roundRect(label_w, y, max(self.bar_h, track * float(value) / (maximum or vmax)), self.bar_h, self.bar_h / 2, fill=1, stroke=0)
            c.setFont(FONTS["bold"], 8)
            c.setFillColor(NAVY)
            c.drawRightString(self.width, y + 1.1 * mm, f"{value:g} / {maximum:g}" if self.show_max else f"{value:g}{self.suffix}")
        if self.reference is not None:
            x = label_w + track * self.reference / vmax
            c.setStrokeColor(GOLD)
            c.setDash(2, 2)
            c.line(x, 0, x, self.height - 4 * mm)
            c.setDash()
            c.setFont(FONTS["base"], 6.8)
            c.setFillColor(GOLD)
            c.drawCentredString(x, self.height - 3 * mm, self.ref_label)


class Timeline(Flowable):
    """Periods on a date axis. Rows are (label, start, end, tone) or (label, start, end, tone, inner_start, inner_end);
    the optional inner span is drawn as a solid gold bar inside the period (a transit trigger)."""

    LABEL_W = 34 * mm

    def __init__(self, rows, start: datetime, end: datetime, now: datetime | None = None, row_h=6.2 * mm, legend=False):
        super().__init__()
        self.rows, self.start, self.end, self.now, self.row_h, self.legend = rows, start, end, now, row_h, legend
        self.top_pad = 5 * mm
        self.height = len(rows) * (row_h + 1.8 * mm) + 9 * mm + self.top_pad + (5 * mm if legend else 0)

    def wrap(self, aw, ah):
        self.width = aw
        return aw, self.height

    def _x(self, when):
        span = (self.end - self.start).total_seconds() or 1
        frac = min(1, max(0, (when - self.start).total_seconds() / span))
        return self.LABEL_W + frac * (self.width - self.LABEL_W - 1 * mm)

    def draw(self):
        c = self.canv
        base = 5 * mm if self.legend else 0
        axis_y = base + 5 * mm
        c.setStrokeColor(LINE)
        c.setLineWidth(.6)
        c.line(self.LABEL_W, axis_y, self.width, axis_y)
        span_years = max(1, self.end.year - self.start.year)
        step = next(st for st in (1, 2, 5, 10, 20, 25, 50) if span_years / st <= 10)
        years = [y for y in range(self.start.year + 1, self.end.year + 1) if y % step == 0]
        c.setFont(FONTS["base"], 6.6)
        c.setFillColor(MUTED)
        for y in years:
            x = self._x(self.start.replace(year=y, month=1, day=1))
            c.setStrokeColor(colors.HexColor("#eeebf3"))
            c.line(x, axis_y, x, self.height - self.top_pad)
            c.setStrokeColor(LINE)
            c.line(x, axis_y - 1 * mm, x, axis_y)
            c.drawCentredString(x, axis_y - 4 * mm, str(y))
        top = self.height - self.top_pad
        for i, row in enumerate(self.rows):
            label, s, e, tone = row[:4]
            segments = s if isinstance(s, list) else [(s, e)]
            s, e = segments[0][0], segments[-1][1]
            inner = row[4:6] if len(row) >= 6 and row[4] else None
            y = top - (i + 1) * (self.row_h + 1.8 * mm) + 1.8 * mm
            c.setFont(FONTS["bold"] if "now" in str(label) else FONTS["base"], 7.6)
            c.setFillColor(INK)
            c.drawString(0, y + self.row_h / 2 - 2.6, str(label)[:24])
            edge, soft = TONES.get(tone, TONES["info"])
            c.setFillColor(soft)
            c.setStrokeColor(edge)
            c.setLineWidth(.7)
            for seg_s, seg_e in segments:
                a, b = self._x(seg_s), self._x(seg_e)
                c.roundRect(a, y, max(1.5 * mm, b - a), self.row_h, 1.6 * mm, fill=1, stroke=1)
            x0, x1 = self._x(segments[0][0]), self._x(segments[0][1])
            e = segments[0][1]
            if inner:
                i0, i1 = self._x(max(inner[0], s)), self._x(min(inner[1], e))
                c.setFillColor(GOLD)
                c.roundRect(i0, y + 1.1 * mm, max(1.4 * mm, i1 - i0), self.row_h - 2.2 * mm, 1 * mm, fill=1, stroke=0)
            text = f"{s:%b %Y} – {e:%b %Y}"
            if x1 - x0 > c.stringWidth(text, FONTS["bold"], 6.6) + 4 * mm and not inner:
                c.setFillColor(edge)
                c.setFont(FONTS["bold"], 6.6)
                c.drawString(x0 + 2 * mm, y + self.row_h / 2 - 2.3, text)
        if self.now and self.start <= self.now <= self.end:
            x = self._x(self.now)
            c.setStrokeColor(ROSE)
            c.setLineWidth(1)
            c.line(x, axis_y, x, self.height - self.top_pad + 1 * mm)
            c.setFillColor(ROSE)
            c.setFont(FONTS["bold"], 6.6)
            c.drawCentredString(max(x, self.LABEL_W + 6 * mm), self.height - 3 * mm, "TODAY")
        if self.legend:
            c.setFont(FONTS["base"], 6.8)
            items = [(GREEN_SOFT, GREEN, "dasha period linked to this area"), (SKY_SOFT, SKY, "supporting period"),
                     (GOLD, GOLD, "Jupiter–Saturn double transit")]
            x = self.LABEL_W
            for fill, edge, text in items:
                c.setFillColor(fill)
                c.setStrokeColor(edge)
                c.roundRect(x, .6 * mm, 5 * mm, 2.6 * mm, .8 * mm, fill=1, stroke=1)
                c.setFillColor(MUTED)
                c.drawString(x + 6.5 * mm, 1.1 * mm, text)
                x += 9 * mm + c.stringWidth(text, FONTS["base"], 6.8)


class Gauge(Flowable):
    """Score out of a maximum as a wide pill, with band labels underneath."""

    def __init__(self, score, maximum, bands, label):
        super().__init__()
        self.score, self.maximum, self.bands, self.label = score, maximum, bands, label
        self.height = 24 * mm

    def wrap(self, aw, ah):
        self.width = aw
        return aw, self.height

    def draw(self):
        c, w = self.canv, self.width
        c.setFont(FONTS["display"], 26)
        c.setFillColor(NAVY)
        c.drawString(0, self.height - 10 * mm, f"{self.score:g}")
        c.setFont(FONTS["base"], 10)
        c.setFillColor(MUTED)
        c.drawString(c.stringWidth(f"{self.score:g}", FONTS["display"], 26) + 2 * mm, self.height - 10 * mm, f"/ {self.maximum:g}  ·  {self.label}")
        y, h = 7 * mm, 4.5 * mm
        prev = 0
        for upto, tone, name in self.bands:
            edge, soft = TONES[tone]
            x0, x1 = w * prev / self.maximum, w * upto / self.maximum
            c.setFillColor(soft)
            c.rect(x0, y, x1 - x0, h, fill=1, stroke=0)
            c.setFont(FONTS["base"], 6.6)
            c.setFillColor(edge)
            c.drawCentredString((x0 + x1) / 2, y - 4 * mm, name)
            prev = upto
        x = w * min(self.score, self.maximum) / self.maximum
        c.setFillColor(NAVY)
        c.circle(x, y + h / 2, 3.2 * mm, fill=1, stroke=0)
        c.setFillColor(colors.white)
        c.circle(x, y + h / 2, 1.4 * mm, fill=1, stroke=0)
