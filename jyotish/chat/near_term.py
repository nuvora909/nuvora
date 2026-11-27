"""Near-term outlook for questions about a coming period ("the coming months", "next 3 months", "this year").

A natal promise alone does not answer "how will my next months be?". This module reads the period itself the
way an astrologer does: which slow and fast planets transit the topic's houses (from the ascendant and from the
Moon), which sub-sub-periods run and whether their lords are tied to the topic, and which individual days carry
tarabala, chandrabala, a suitable weekday and a clean tithi for an event such as a meeting."""
from __future__ import annotations

import re
from dataclasses import dataclass, field
from datetime import datetime, timedelta

import numpy as np

from vedic.constants import NAKSHATRAS, SIGNS

NAK_SPAN = 360 / 27
TRANSITS = ("JUPITER", "SATURN", "RAHU", "VENUS", "MERCURY", "MARS", "SUN")
BENEFIC = {"JUPITER", "VENUS", "MERCURY"}
UPACHAYA = {3, 6, 10, 11}
GOCHARA_GOOD = {"SUN": {3, 6, 10, 11}, "MARS": {3, 6, 11}, "MERCURY": {2, 4, 6, 8, 10, 11},
                "VENUS": {1, 2, 3, 4, 5, 8, 9, 11, 12}, "JUPITER": {2, 5, 7, 9, 11}, "SATURN": {3, 6, 11},
                "RAHU": {3, 6, 11}}
HOUSE_WORD = {1: "self", 2: "income and savings", 3: "effort and initiative", 4: "home and property",
              5: "investments and intelligence", 6: "work and competition", 7: "partners and deals",
              8: "shared money and sudden change", 9: "fortune", 10: "career and status", 11: "gains and networks",
              12: "expenses"}
WEEKDAYS = {"money": {2, 3, 4}, "career": {0, 2, 3, 6}, "marriage": {0, 2, 3, 4}, "property": {0, 3, 4},
            "education": {2, 3}, "foreign": {0, 2, 3, 4}}
EVENT_WORDS = {
    "meeting": r"\b(meeting|deal|negotiat\w*|pitch|client|investor|contract|interview|presentation|sign)\w*",
    "investment": r"\b(invest\w*|stock|shares|crypto|trading|property purchase|buy (a )?(house|flat|land))",
    "job": r"\b(job|offer|promotion|hike|raise|appraisal)\b",
}
GOOD_TARA = {2: "Sampat (wealth)", 4: "Kshema (well-being)", 6: "Sadhaka (achievement)", 8: "Mitra (friend)",
             9: "Parama Mitra (best friend)"}
CHANDRABALA_GOOD = {1, 3, 6, 7, 10, 11}
RIKTA = {4, 9, 14}  # tithi numbers within a paksha
DAY_NAMES = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]


def _ord(n: int) -> str:
    return f"{n}{'th' if 10 <= n % 100 <= 20 else {1: 'st', 2: 'nd', 3: 'rd'}.get(n % 10, 'th')}"


def horizon_months(question: str) -> int | None:
    q = question.lower()
    m = re.search(r"\b(next|coming|upcoming)\s+(\d{1,2}|one|two|three|four|six|twelve)\s+months?\b", q)
    if m:
        words = {"one": 1, "two": 2, "three": 3, "four": 4, "six": 6, "twelve": 12}
        n = m.group(2)
        return max(1, min(12, int(n) if n.isdigit() else words[n]))
    if re.search(r"\b(this|current)\s+month\b|\bnext\s+month\b|\bnext\s+(few\s+)?weeks?\b", q):
        return 2
    if re.search(r"\b(coming|next|upcoming|few)\s+months\b|\bmonths ahead\b|\bnear future\b|\bsoon\b|\bshortly\b", q):
        return 6
    if re.search(r"\b(this|coming|next)\s+year\b|\b20\d\d\b|\bnext 12 months\b", q):
        return 12
    return None


def event_of(question: str) -> str | None:
    q = question.lower()
    return next((name for name, pattern in EVENT_WORDS.items() if re.search(pattern, q)), None)


@dataclass
class Month:
    start: datetime
    score: float
    label: str
    reasons: list[str]
    period: str


@dataclass
class NearTerm:
    months: list[Month]
    days: list[tuple[datetime, str]]
    event: str | None
    horizon: int
    best: list[Month] = field(default_factory=list)
    hardest: Month | None = None
    steady: list = field(default_factory=list)


def _sign(eph, planet, when):
    return int(float(eph.sidereal_longitude_series([when], planet)[0]) // 30)


def analyse(chart, topic, question: str, now: datetime) -> NearTerm | None:
    months_n = horizon_months(question)
    if months_n is None:
        return None
    c = chart
    topic_houses = set(topic.houses)
    lagna, moon = c.lagna_sign, c.sign["MOON"]
    lord_houses = {g: [h for h, lord in c.house_lord.items() if lord == g] for g in set(c.house_lord.values())}
    months = []
    first = now.replace(day=1, hour=12, minute=0, second=0, microsecond=0)
    for i in range(months_n):
        m0 = (first + timedelta(days=32 * i)).replace(day=1)
        mid = m0 + timedelta(days=14)
        score, reasons = 0.0, []
        for g in TRANSITS:
            s = _sign(c.eph, g, mid)
            hl, hm = (s - lagna) % 12 + 1, (s - moon) % 12 + 1
            hits = sorted({h for h in (hl, hm) if h in topic_houses})
            weight = 2.0 if g in ("JUPITER", "SATURN", "RAHU") else 1.0
            if hits:
                good = g in BENEFIC or any(h in UPACHAYA for h in hits)
                if g == "SUN" and not good:
                    continue  # the Sun passing a wealth house is neutral, not a strain
                score += weight if good else -weight
                where = " and ".join(_ord(h) for h in hits)
                reasons.append((good, g, f"transiting {g.title()} in {SIGNS[s]} crosses your {where} house ({HOUSE_WORD[hits[0]]})"
                                + (" — supportive" if good else " — adds pressure")))
            elif g in topic.karakas or g == "JUPITER":
                good = hm in GOCHARA_GOOD.get(g, set())
                score += (1.0 if g == "JUPITER" else .5) * (1 if good else -1)
                if good and g in ("JUPITER", "VENUS", "MERCURY"):
                    reasons.append((True, g, f"{g.title()} transiting {_ord(hm)} from your Moon favours {HOUSE_WORD[hm]}"))
        periods = c.dasha.between(m0, m0 + timedelta(days=28), depth=3)
        linked = []
        for p in periods:
            lord = p.lords[-1]
            if set(lord_houses.get(lord, [])) & topic_houses or c.house[lord] in topic_houses:
                linked.append(lord)
        if linked:
            score += 1.5
            reasons.append((True, "DASHA", f"the running {'/'.join(dict.fromkeys(l.title() for l in linked))} "
                                           f"sub-period is tied to these houses"))
        label = "strong" if score >= 3 else "favourable" if score >= 1 else "mixed" if score > -1.5 else "demanding"
        period = " → ".join(dict.fromkeys("–".join(x.title() for x in p.lords[1:]) for p in periods))
        months.append(Month(m0, score, label, reasons, period))
    # Slow transits that hold for the whole horizon are stated once, not repeated every month.
    texts = [{r[2] for r in m.reasons} for m in months]
    constant = set.intersection(*texts) if len(texts) > 1 else set()
    steady = []
    for m in months:
        steady += [r for r in m.reasons if r[2] in constant and r not in steady]
        m.reasons = [r for r in m.reasons if r[2] not in constant]
    days = good_days(chart, topic, now, min(now + timedelta(days=31 * months_n), now + timedelta(days=120)), months)
    ranked = sorted(months, key=lambda m: -m.score)
    best = [m for m in ranked if m.score >= 1][:3] or ranked[:1]
    hardest = min(months, key=lambda m: m.score)
    out = NearTerm(months, days, event_of(question), months_n, sorted(best, key=lambda m: m.start),
                   hardest if hardest.score < 0 else None)
    out.steady = steady
    return out


def good_days(chart, topic, start: datetime, end: datetime, months: list[Month], limit: int = 6):
    """Days with tarabala and chandrabala, a suitable weekday and a non-rikta, non-Amavasya tithi."""
    c = chart
    tz = c.time.local.tzinfo
    first = start.astimezone(tz).replace(hour=10, minute=0, second=0, microsecond=0) + timedelta(days=1)
    times = [first + timedelta(days=i) for i in range(max(1, (end - first).days))]
    if not times:
        return []
    moon_l = np.asarray(c.eph.sidereal_longitude_series(times, "MOON"))
    sun_l = np.asarray(c.eph.sidereal_longitude_series(times, "SUN"))
    birth_nak = int(c.lon["MOON"] // NAK_SPAN)
    natal_moon = c.sign["MOON"]
    weekdays = WEEKDAYS.get(topic.key, {0, 2, 3, 4})
    month_score = {(m.start.year, m.start.month): m.score for m in months}
    picks = []
    for t, ml, sl in zip(times, moon_l, sun_l):
        if t.weekday() not in weekdays:
            continue
        nak = int(ml // NAK_SPAN)
        tara = (nak - birth_nak) % 27 % 9 + 1
        house = (int(ml // 30) - natal_moon) % 12 + 1
        tithi = int(((ml - sl) % 360) // 12)  # 0..29
        in_paksha = tithi % 15 + 1
        if tara not in GOOD_TARA or house not in CHANDRABALA_GOOD or in_paksha in RIKTA or tithi == 29:
            continue
        ms = month_score.get((t.year, t.month), 0)
        why = f"{GOOD_TARA[tara]} tara, Moon {_ord(house)} from your Moon in {NAKSHATRAS[nak]}"
        picks.append((ms + (1 if tara in (6, 9) else 0), t, why))
    picks.sort(key=lambda x: (-x[0], x[1]))
    chosen, per_month = [], {}
    for _, t, why in picks:
        key = (t.year, t.month)
        if per_month.get(key, 0) >= 2:
            continue
        per_month[key] = per_month.get(key, 0) + 1
        chosen.append((t, why))
        if len(chosen) >= limit:
            break
    return sorted(chosen)


def _fmt_month(m: Month) -> str:
    return f"{m.start:%B %Y}"


def _day(t) -> str:
    return f"{t:%A} {t.day} {t:%B %Y}"


def _why(m: Month, good: bool) -> str | None:
    return next((r[2] for r in m.reasons if r[0] == good), None)


def _list(m: Month) -> str:
    return "; ".join(r[2] for r in m.reasons)


EVENT_PHRASE = {"meeting": "money meetings, negotiations and pitches", "investment": "financial commitments",
                "job": "job conversations and negotiations", None: "important steps"}


def notes(nt: NearTerm, topic) -> str:
    """Working notes for the AI reader."""
    lines = ["## Near-term outlook — the question asks about a coming period, so LEAD with this, month by month",
             f"- Horizon: the next {nt.horizon} months. Natal promise is background only; answer the time question first."]
    if nt.steady:
        lines.append("- Throughout the period: " + "; ".join(r[2] for r in nt.steady))
    for m in nt.months:
        lines.append(f"- {_fmt_month(m)}: {m.label} (sub-periods {m.period or '—'}). "
                     + (_list(m) or "no change in the transits that matter for this topic"))
    if nt.best:
        lines.append("- Best stretch: " + ", ".join(_fmt_month(m) for m in nt.best))
    if nt.hardest:
        lines.append(f"- Most demanding: {_fmt_month(nt.hardest)}")
    if nt.days:
        lines.append(f"- Good days for {EVENT_PHRASE.get(nt.event, EVENT_PHRASE[None])} (tarabala + chandrabala + weekday + tithi): "
                     + "; ".join(f"{_day(t)} ({why})" for t, why in nt.days))
    lines.append("Answer the user's actual question directly (e.g. whether a money meeting is likely to succeed and "
                 "when), give the best months and specific days, then the natal background in one or two sentences.")
    return "\n".join(lines)


def offline_sections(nt: NearTerm, topic, lean_text: str) -> tuple[str, list[str]]:
    """(opening paragraph, extra markdown sections) for the offline reader."""
    noun = {"money": "finances", "career": "career", "marriage": "relationships", "property": "property plans",
            "education": "studies", "health": "health", "foreign": "plans abroad", "children": "family plans",
            "spiritual": "inner life"}.get(topic.key, "prospects")
    best = ", ".join(_fmt_month(m) for m in nt.best)
    opening = f"Over the next {nt.horizon} months your {noun} look strongest in **{best}**"
    why_best = next((_why(m, True) for m in nt.best if _why(m, True)), None) or \
        next((r[2] for r in nt.steady if r[0]), None)
    if why_best:
        opening += f", when {why_best}"
    opening += "."
    if nt.hardest:
        why_hard = _why(nt.hardest, False) or next((r[2] for r in nt.steady if not r[0]), None)
        opening += f" Go more carefully in **{_fmt_month(nt.hardest)}**" + (f": {why_hard}." if why_hard else ".")
    if nt.event == "meeting":
        opening += (" A money meeting can go well, and your odds are best in the strong months on the days listed "
                    "below; outside them, prepare thoroughly and negotiate rather than expect a windfall.")
    opening += f" In the background, your birth chart is {lean_text} for {noun}."
    rows = [f"- **{_fmt_month(m)} — {m.label}.** " + ((_list(m) + ".") if m.reasons else
            "No change in the transits that matter here; a steady month.") + (f" Sub-periods: {m.period}." if m.period else "")
            for m in nt.months]
    steady = ("**Throughout the period:** " + "; ".join(r[2] for r in nt.steady) + ".\n\n") if nt.steady else ""
    sections = ["### Month by month\n\n" + steady + "\n".join(rows)]
    if nt.days:
        what = EVENT_PHRASE.get(nt.event, EVENT_PHRASE[None])
        sections.append(f"### Good days for {what}\n\n" + "\n".join(
            f"- **{_day(t)}** — {why}" for t, why in nt.days)
            + "\n\nThese days combine a favourable tara from your birth star, the Moon in a supportive house from "
              "your natal Moon, a suitable weekday and a clean lunar day. Morning hours are traditionally preferred.")
    return opening, sections
