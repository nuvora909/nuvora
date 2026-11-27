"""Chart-linked content for the PDF reports.

Each product reads like an astrologer's written report on its own subject: a verdict, the reasons for it,
what tempers it, when it is likely to move and what to do about it. Conclusions come from the same judgment
layer the chat astrologer uses (chat/judgment.py), so the PDF and the chat never disagree.
Sections follow the schema documented in report_pdf.py.
"""
from __future__ import annotations

import calendar
import re
from datetime import datetime, timedelta, timezone

from reportlab.lib.units import mm

from chat.judgment import LEAN_WORDS, HEALTH_LEAN, LORD_OUTLET, judge, _sign_intervals
from chat.topics import TOPICS
from vedic.constants import EXALTATION, OWN_SIGNS, SIGN_LORD, SIGNS
from vedic.matching import match_charts
from vedic.panchang import nakshatra_info, tithi_info
from vedic.yogas import guru_chandala, kaal_sarp, kemadruma, manglik

from . import report_knowledge as K
from . import report_visuals as V
from .report_products import PRODUCTS

HOUSE_MEANING = {
    1: "self, body and life direction", 2: "family, speech and savings", 3: "effort, courage, skills and siblings",
    4: "home, mother, property and inner peace", 5: "intelligence, children, creativity and advice",
    6: "work routines, health, debts and competition", 7: "partnership, marriage and clients",
    8: "transformation, shared money, research and the hidden", 9: "fortune, teachers, faith and higher learning",
    10: "career, status and visible work", 11: "gains, networks and ambitions",
    12: "expenses, foreign lands, rest and release",
}
HOUSE_SHORT = {1: "Self", 2: "Wealth", 3: "Effort", 4: "Home", 5: "Children", 6: "Health", 7: "Partner",
               8: "Change", 9: "Fortune", 10: "Career", 11: "Gains", 12: "Release"}
LIFE_TOPICS = [
    ("career", "Career and status", "What the 10th house, its lord and the career divisional chart say about your work."),
    ("marriage", "Marriage and relationships", "The 7th house, Venus and the navamsha read together for partnership."),
    ("money", "Wealth and finances", "How the 2nd and 11th houses describe earning, saving and gains."),
    ("health", "Health and vitality", "The ascendant, 6th and 8th houses as a picture of resilience — a lens, not a diagnosis."),
    ("property", "Home, property and vehicles", "The 4th house and its lord for home, land and inner security."),
    ("education", "Education and learning", "The 4th, 5th and 9th houses for study, intellect and higher learning."),
    ("children", "Children and creativity", "The 5th house and Jupiter for children, creativity and legacy."),
]
YEAR_ACTION = {
    "career": "A good stretch to push for the role, client or project you want.",
    "marriage": "Introductions, family conversations and commitments move more easily.",
    "money": "Negotiate income, clear debts and build savings.",
    "health": "Set the routines that will carry you through busier periods.",
    "property": "Research, paperwork and planning for home or property move forward.",
    "education": "Applications, courses and exams are well placed.",
    "children": "Family planning and time with children are favoured.",
}
LEAN_TONE = {"strong": ("good", "Strongly supported"), "supportive": ("good", "Supported"),
             "mixed": ("gold", "Mixed"), "demanding": ("caution", "Demanding")}
STRIP = re.compile(r"<fact[^>]*>(.*?)</fact>", re.S)


# ---------------------------------------------------------------- small helpers

def section(title, paragraphs=None, bullets=None, table=None, blocks=None, chapter=False, kicker=None,
            brk=True, sample=False):
    out = {"title": title, "paragraphs": paragraphs or [], "bullets": bullets or [], "table": table,
           "blocks": blocks or [], "chapter": chapter, "kicker": kicker, "break": brk}
    if sample:
        out["sample"] = True
    return out


def chapter(title, blocks, kicker=None, brk=True, sample=False):
    return section(title, blocks=blocks, chapter=True, kicker=kicker, brk=brk, sample=sample)


def P(text): return {"t": "p", "text": text}
def LEAD(text): return {"t": "lead", "text": text}
def NOTE(text): return {"t": "note", "text": text}
def H(text): return {"t": "h", "text": text}
def BUL(items): return {"t": "bullets", "items": [i for i in items if i]}
def FLOW(obj, after=4): return {"t": "flow", "obj": obj, "after": after}
def FACTS(items, cols=3): return {"t": "facts", "items": items, "cols": cols}
def CALL(title, text, tone="info", badge=None): return {"t": "callout", "title": title, "text": text, "tone": tone, "badge": badge}
def TABLE(headers, rows, widths=None, font_size=8, highlight=None):
    return {"t": "table", "headers": headers, "rows": rows, "widths": widths, "font_size": font_size,
            "highlight": highlight or []}


def clean(text) -> str:
    """Strip fact tags and spell out engine shorthand ("H10" becomes "the 10th house")."""
    text = STRIP.sub(r"\1", str(text or "")).strip()
    return re.sub(r"\bH(\d{1,2})\b", lambda m: f"the {ordinal(m.group(1))} house", text)


def cap(text) -> str:
    text = clean(text)
    return text[:1].upper() + text[1:] if text else text


def sentence(text) -> str:
    text = cap(text)
    return text if not text or text[-1] in ".!?" else text + "."


def ordinal(n) -> str:
    n = int(n)
    return f"{n}{'th' if 10 <= n % 100 <= 20 else {1: 'st', 2: 'nd', 3: 'rd'}.get(n % 10, 'th')}"


def pname(g) -> str:
    return g.title()


def _dt(value) -> datetime:
    if isinstance(value, datetime):
        return value if value.tzinfo else value.replace(tzinfo=timezone.utc)
    text = str(value)
    if len(text) == 10:
        return datetime.fromisoformat(text).replace(tzinfo=timezone.utc)
    return datetime.fromisoformat(text.replace("Z", "+00:00"))


def _date(value) -> str:
    return str(value or "")[:10]


def _my(value) -> str:
    return f"{_dt(value):%b %Y}"


def _dmy(value) -> str:
    return f"{_dt(value):%d %b %Y}".lstrip("0")


def _join(items) -> str:
    items = [i for i in items if i]
    return items[0] if len(items) == 1 else ", ".join(items[:-1]) + " and " + items[-1] if items else ""


def plabel(period) -> str:
    """'Saturn–Mercury' for a dasha Period object or dict."""
    lords = getattr(period, "lords", None) or (period.get("lords") if isinstance(period, dict) else None) or []
    return "–".join(pname(g) for g in lords)


def wtext(window) -> str:
    """A judgment window's explanation without its period prefix or the repeated closing line."""
    text = clean(window.text).split(": ", 1)[-1]
    text = text.replace(" This is the most concrete window of the set.", "")
    lords = getattr(window.dasha, "lords", None)
    if lords:
        text = re.sub(r"^the period lord", pname(lords[-1]), text)
    return re.sub(r"\bH(\d{1,2})\b", lambda m: f"the {ordinal(m.group(1))} house", text)


def _add_years(value: datetime, years: int) -> datetime:
    year = value.year + years
    day = min(value.day, calendar.monthrange(year, value.month)[1])
    return value.replace(year=year, day=day)


class Ctx:
    """Everything the builders need about one chart, with judgments cached per topic."""

    def __init__(self, c, report, now=None):
        self.c, self.r = c, report
        self.now = now or datetime.now(timezone.utc)
        self._judgments = {}
        self.tz = c.time.local.tzinfo

    def j(self, topic):
        if topic not in self._judgments:
            self._judgments[topic] = judge(self.c, self.r, TOPICS[topic], self.now)
        return self._judgments[topic]

    @property
    def name(self):
        return self.r["birth"].get("name") or "Your chart"

    def planet(self, g):
        return self.r["planets"][g]

    def strength(self, g):
        return (self.r.get("planet_strength") or {}).get(g, {})

    def lord_houses(self, g):
        return [h for h, lord in self.c.house_lord.items() if lord == g]

    def lord_phrase(self, g):
        """'rules your 11th and 12th houses and sits in the 10th' — a planet's job in this chart."""
        houses = self.lord_houses(g)
        sits = self.planet(g)["house"]
        rules = f"rules your {_join([ordinal(h) for h in houses])} house{'s' if len(houses) > 1 else ''} " \
                f"({_join([HOUSE_MEANING[h].split(',')[0] for h in houses])}) and " if houses else ""
        return f"{rules}sits in the {ordinal(sits)} house ({HOUSE_MEANING[sits]})"

    def sign_at(self, planet, when):
        return int(self.c.eph.sidereal_longitude_series([when], planet)[0] // 30)

    def from_moon(self, sign):
        return (sign - self.c.sign["MOON"]) % 12 + 1

    def from_lagna(self, sign):
        return (sign - self.c.lagna_sign) % 12 + 1

    def running(self):
        rn = self.r["dasha"]["running_now"]
        maha = rn[0] if rn else None
        antar = rn[1] if len(rn) > 1 else None
        return maha, antar


# ---------------------------------------------------------------- cover and shared chapters

def _birth_line(report):
    birth = report["birth"]
    try:
        local = datetime.fromisoformat(str(birth["local"]).replace("Z", "+00:00"))
        when = f"{local:%d %B %Y}, {local:%I:%M %p}".lstrip("0").replace(" 0", " ")
    except ValueError:
        when = str(birth["local"]).replace("T", " ")
    lat, lon = birth["lat"], birth["lon"]
    coords = f"{abs(lat):.2f}°{'N' if lat >= 0 else 'S'}, {abs(lon):.2f}°{'E' if lon >= 0 else 'W'}"
    return f"Born {when} · {birth.get('place') or 'Place not supplied'} · {coords}"


def _tiles(ctx):
    lagna, moon, sun = ctx.r["lagna"], ctx.planet("MOON"), ctx.planet("SUN")
    maha, antar = ctx.running()
    period = (antar or maha or {}).get("label", "—").replace("-", " – ")
    until = f"until {_my((antar or maha)['end'])}" if (antar or maha) else ""
    return [("Ascendant", lagna["sign_name"], f"{lagna['dms']} · lord {pname(lagna['lord'])}"),
            ("Moon sign", moon["sign_name"], f"{moon['nakshatra']} · pada {moon['pada']}"),
            ("Sun sign", sun["sign_name"], f"{ordinal(sun['house'])} house"),
            ("Running dasha", period, until)]


def _cover(ctx, summary_title, summary, after_contents=None, name=None, meta=None, tiles=None, chart=True):
    return {"title": "Cover", "cover": {
        "name": name or ctx.name, "meta": meta or _birth_line(ctx.r), "tiles": tiles or _tiles(ctx),
        "chart": V.chart_from_report(ctx.r, "D1", size=70 * mm) if chart else None,
        "summary_title": summary_title, "summary": summary, "after_contents": after_contents or []}}


def _how_to_read(kind):
    text = {
        "life": "Each life-area chapter opens with a verdict, then gives the chart reasons for it, what tempers it, "
                "the periods when it is most likely to move, and practical advice. The year-by-year chapter turns "
                "this into a calendar. Dates come from your dasha periods and the slow transits of Jupiter and Saturn.",
        "sade_sati": "Sade Sati is Saturn's seven-and-a-half-year passage through the sign before, of and after your "
                     "natal Moon. This report dates every phase, explains how strongly it should be felt in your "
                     "chart, and what each phase asks of you.",
        "dosha": "Each dosha is checked by an explicit rule, shown in the report. Where a dosha is present we explain "
                 "what it means in practice, which classical cancellations apply, and proportionate remedies.",
        "marriage": "The verdict comes from the 7th house, its lord, Venus and the navamsha (D9) read together. "
                    "Timing combines dasha periods with Jupiter–Saturn double transits — the classical trigger for "
                    "events.",
        "gemstone": "A gemstone strengthens a planet; it does not fix a weak one by itself. This report chooses "
                    "stones from the planets that are safe to strengthen for your ascendant and flags those to avoid.",
        "rudraksha": "Rudraksha beads are traditionally linked to planets and deities. The suggestions here follow "
                     "your ascendant lord and the planet whose period you are running now.",
        "match": "Ashtakoota matching compares the two Moon signs and nakshatras across eight factors worth 36 points. "
                 "We explain each factor, the doshas of both charts and what the couple should discuss.",
        "core": "This is your reference kundli: the charts, planetary positions, houses, divisional charts, dasha "
                "periods and current transits, each with a short explanation of what it shows.",
    }.get(kind, "")
    return [CALL("How to read this report", [text, "Astrology describes tendencies and timing, not fixed fate. "
                 "Use it alongside real-world judgement and professional advice where it matters."], "neutral")]


def _chart_chapter(ctx, extra=None, title="Your birth chart", d9=True):
    r = ctx.r
    charts = V.SideBySide(V.chart_from_report(r, "D1", size=76 * mm),
                          V.chart_from_report(r, "D9", size=76 * mm)) if d9 else V.chart_from_report(r, "D1", size=86 * mm)
    blocks = [FLOW(charts, 2),
              NOTE("North Indian style: the top centre diamond is the 1st house (your ascendant) and houses run "
                   "anticlockwise. Small numbers are the signs (1 Aries … 12 Pisces). Saturn, Mars, Rahu and Ketu are "
                   "shown in red as natural malefics; ·R marks a retrograde planet. "
                   + ("The navamsha (D9) refines the birth chart and is read for marriage and inner strength." if d9 else "")),
              H("Where each planet sits and what it means")]
    rows = []
    for g, p in r["planets"].items():
        notes = [p["dignity"]["status"]]
        if p["retrograde"] and g not in ("RAHU", "KETU"):
            notes.append("retrograde")
        if (p.get("combustion") or {}).get("combust"):
            notes.append("combust")
        if p.get("vargottama"):
            notes.append("vargottama")
        rows.append(f"**{pname(g)} in {p['sign_name']}, {ordinal(p['house'])} house** ({', '.join(notes)}) — "
                    f"{K.PLANET_NATURE[g]}, expressed through {HOUSE_MEANING[p['house']]}.")
    blocks.append(BUL(rows))
    return chapter(title, blocks + (extra or []), "The calculated sky at the moment of birth, and how to read it.")


def _identity_chapter(ctx):
    r, c = ctx.r, ctx.c
    lagna, moon, sun = r["lagna"], ctx.planet("MOON"), ctx.planet("SUN")
    lord = lagna["lord"]
    lp = ctx.planet(lord)
    ak = next((g for g, p in r["planets"].items() if p.get("chara_karaka") == "Atmakaraka"), None)
    birth_lord = r["dasha"]["mahadashas"][0]["lords"][0] if r["dasha"]["mahadashas"] else None
    blocks = [
        LEAD(f"You were born with **{lagna['sign_name']} rising**, the **Moon in {moon['sign_name']}** and the Moon in "
             f"**{moon['nakshatra']} nakshatra**. These three form the core of a Vedic chart: the body and direction of "
             f"life, the mind, and the deeper temperament."),
        FACTS([("Ascendant", f"{lagna['sign_name']} · {K.SIGN_ELEMENT[lagna['sign']]}, {K.SIGN_MODE[lagna['sign']]}"),
               ("Moon sign", f"{moon['sign_name']} · {K.SIGN_ELEMENT[c.sign['MOON']]}"),
               ("Nakshatra", f"{moon['nakshatra']} · pada {moon['pada']}"),
               ("Ascendant lord", f"{pname(lord)} in {lp['sign_name']}, H{lp['house']}"),
               ("Atmakaraka", pname(ak) if ak else "—"),
               ("Birth dasha", pname(birth_lord) if birth_lord else "—")]),
        H(f"Ascendant: {lagna['sign_name']}"),
        P(K.LAGNA_TEXT[lagna["sign"]]),
        P(f"Your ascendant lord **{pname(lord)}** sits in the {ordinal(lp['house'])} house in {lp['sign_name']} "
          f"({lp['dignity']['status'].lower()}). Where the chart's ruler goes, life's attention follows: much of your "
          f"growth runs through {LORD_OUTLET[lp['house']]}."),
        H(f"Moon: {moon['sign_name']} in the {ordinal(moon['house'])} house"),
        P(K.MOON_TEXT[c.sign["MOON"]]),
        P(f"Placed in your {ordinal(moon['house'])} house, the Moon ties your emotional wellbeing to "
          f"{HOUSE_MEANING[moon['house']]}."),
        H(f"Birth nakshatra: {moon['nakshatra']}, pada {moon['pada']}"),
        P(f"{moon['nakshatra']} is {K.NAKSHATRA_TEXT.get(moon['nakshatra'], '')} The nakshatra lord also starts your "
          f"Vimshottari dasha sequence — you were born in the {pname(birth_lord) if birth_lord else '—'} period."),
        H(f"Sun: {sun['sign_name']} in the {ordinal(sun['house'])} house"),
        P(f"The Sun shows where you seek recognition and how you carry authority. In your {ordinal(sun['house'])} "
          f"house it puts your sense of purpose into {HOUSE_MEANING[sun['house']]}."),
    ]
    if ak:
        blocks += [H(f"Soul significator (Atmakaraka): {pname(ak)}"),
                   P(f"{pname(ak)} holds the highest degree in your chart, which makes it the Atmakaraka in the Jaimini "
                     f"system — the planet of the soul's main lesson. Its themes ({K.PLANET_NATURE[ak]}) are where life "
                     f"keeps asking you to mature.")]
    return chapter("Who you are", blocks, "Ascendant, Moon and nakshatra: the three pillars of your temperament.")


def _strength_chapter(ctx):
    strengths = ctx.r.get("planet_strength") or {}
    blocks = []
    if strengths:
        items = sorted(strengths.items(), key=lambda kv: -kv[1]["score"])
        bars = [(pname(g), round(v["score"]), 100, "good" if v["score"] >= 59.5 else ("gold" if v["score"] >= 45 else "caution"))
                for g, v in items]
        strongest, weakest = items[:2], items[-2:]
        blocks += [P("Each planet's strength combines its dignity, house placement, motion and aspects into a "
                     "transparent score. A strong planet delivers its themes easily; a weak one needs deliberate support."),
                   FLOW(V.Bars(bars, value_suffix="")),
                   P(f"Your strongest planets are **{pname(strongest[0][0])}** and **{pname(strongest[1][0])}**, so "
                     f"{K.PLANET_NATURE[strongest[0][0]]} — and {K.PLANET_NATURE[strongest[1][0]]} — come more naturally "
                     f"to you. The planets that need conscious support are **{pname(weakest[1][0])}** and "
                     f"**{pname(weakest[0][0])}**; their areas improve with routine and effort rather than luck."),
                   NOTE("Heuristic strength score (0–100), not classical Shadbala. Rahu and Ketu are read through their "
                        "dispositors and are not scored.")]
    av = (ctx.r.get("ashtakavarga") or {}).get("sav_by_house") or []
    if av:
        bars = [(f"{x['house']} · {HOUSE_SHORT[x['house']]}", x["sav"], max(40, max(y["sav"] for y in av)),
                 "good" if x["sav"] >= 28 else ("gold" if x["sav"] >= 25 else "caution")) for x in av]
        ranked = sorted(av, key=lambda x: -x["sav"])
        top, low = ranked[:3], ranked[-3:]
        blocks += [H("House support (Sarvashtakavarga)"),
                   P("Ashtakavarga counts the supportive points every planet gives to each house. Houses above the "
                     "average of 28 handle transits well; houses below it need more effort when planets pass through."),
                   FLOW(V.Bars(bars, reference=28, reference_label="average 28")),
                   P(f"Best-supported: {_join([f'{ordinal(x['house'])} ({HOUSE_MEANING[x['house']].split(',')[0]}, {x['sav']})' for x in top])}. "
                     f"Least supported: {_join([f'{ordinal(x['house'])} ({HOUSE_MEANING[x['house']].split(',')[0]}, {x['sav']})' for x in low])}. "
                     f"Lean on the strong houses and approach the weak ones with patience and planning.")]
    return chapter("Planetary strength and house support", blocks, "Which planets carry your chart, and which houses are well supported.")


def _topic_blocks(ctx, key):
    j = ctx.j(key)
    tone, badge = LEAN_TONE.get(j.lean, ("info", j.lean.title()))
    lean_text = (HEALTH_LEAN if key == "health" else LEAN_WORDS).get(j.lean, j.lean_text)
    blocks = [CALL("The verdict", [f"**{cap(lean_text)}.**", sentence(j.theme)], tone, badge),
              H("Why the chart leans this way"),
              BUL([sentence(f.text) for f in j.drivers] or ["No single factor dominates; the result rests on the overall balance."]),
              H("What tempers it"),
              BUL([sentence(f.text) for f in j.counterweights] or ["No major friction in the core houses for this area."]),
              H("Cross-checks"), P(sentence(j.moon_check))]
    if j.varga:
        blocks.append(P(sentence(j.varga["text"])))
    blocks += [H("Timing"), P(sentence(j.activation_now))]
    if j.windows:
        end = max(w.end for w in j.windows)
        rows = [(plabel(w.dasha), w.start, w.end, "good" if w.relevance >= 2 else "info",
                 w.double_transit[0] if w.double_transit else None, w.double_transit[1] if w.double_transit else None)
                for w in j.windows]
        blocks.append(FLOW(V.Timeline(rows, min(w.start for w in j.windows), end, ctx.now, legend=True), 2))
        blocks.append(BUL([f"**{_my(w.start)} – {_my(w.end)} · {plabel(w.dasha)}:** {wtext(w)}" for w in j.windows]))
    else:
        blocks.append(P("No dasha period in the next few years connects directly to this area, so the chart does not "
                        "point to a single dated event. Progress here follows effort rather than timing."))
    guidance = K.TOPIC_GUIDANCE.get(key)
    if guidance:
        blocks += [H("How to work with this"), BUL(guidance["good" if j.lean in ("strong", "supportive") else "work"])]
    notes = [clean(n) for n in j.notes]
    blocks.append(NOTE(f"Evidence confidence: {j.confidence} — {j.confidence_reason}. " + " ".join(notes)))
    return blocks


def _dasha_chapter(ctx, years=None):
    r = ctx.r
    mahas = r["dasha"]["mahadashas"]
    birth = _dt(r["birth"]["utc"])
    horizon_end = _add_years(birth, 95)
    rows = []
    for m in mahas:
        s, e = _dt(m["start"]), _dt(m["end"])
        if s > horizon_end:
            break
        current = s <= ctx.now < e
        rows.append((m["label"] + (" (now)" if current else ""), max(s, birth), min(e, horizon_end),
                     "gold" if current else ("neutral" if e < ctx.now else "info")))
    maha, antar = ctx.running()
    blocks = [P("Vimshottari dasha divides life into planetary periods. The running major period (mahadasha) sets the "
                "background agenda; the sub-period (antardasha) decides which part of it is active now. Events tend "
                "to happen when a period lord is connected to the matter and a transit triggers it."),
              FLOW(V.Timeline(rows, birth, horizon_end, ctx.now))]
    for level, item in (("Major period", maha), ("Sub-period", antar)):
        if not item:
            continue
        g = item["lords"][-1]
        if level == "Sub-period" and maha and g == maha["lords"][0]:
            blocks += [H(f"{level}: {item['label'].replace('-', '–')} ({_my(item['start'])} – {_my(item['end'])})"),
                       P(f"This is {pname(g)}'s own sub-period, which concentrates the major period's agenda: the "
                         f"themes above are at their most direct until {_my(item['end'])}. The next sub-period shifts "
                         f"the emphasis to another planet's houses.")]
            continue
        st = ctx.strength(g)
        blocks += [H(f"{level}: {item['label'].replace('-', '–')} ({_my(item['start'])} – {_my(item['end'])})"),
                   P(f"{pname(g)} brings {K.DASHA_TEXT[g]}"),
                   P(f"In your chart {pname(g)} {ctx.lord_phrase(g)}"
                     + (f", with a strength of {st['score']:.0f}/100 ({st['label']})" if st else "") + ". "
                     f"Those houses are what this period brings to the foreground for you.")]
    if years:
        end = _add_years(ctx.now, years)
        trs = []
        for m in mahas:
            for a in m["antardashas"]:
                s, e = _dt(a["start"]), _dt(a["end"])
                if e >= ctx.now and s <= end:
                    g = a["lords"][-1]
                    houses = ctx.lord_houses(g)
                    act = (f"Rules {_join([ordinal(h) for h in houses])}; " if houses else "") + f"in {ordinal(ctx.planet(g)['house'])}"
                    focus = _join([HOUSE_MEANING[h].split(",")[0] for h in (houses + [ctx.planet(g)["house"]])][:3])
                    trs.append([a["label"].replace("-", "–"), _dmy(max(s, ctx.now)), _dmy(e), act, cap(focus)])
        blocks += [H(f"Sub-periods in the next {years} year{'s' if years > 1 else ''}"),
                   TABLE(["Period", "From", "To", "Lord's role", "Brings into focus"], trs, [1.3, .95, .95, 1.2, 2.1], 7.6)]
    from . import report_extras as X
    blocks += X.yogini_blocks(ctx)
    return chapter("Your planetary periods", blocks, "The dasha clock: which planet is in charge of your life, and when that changes.")


def _yearly_chapters(ctx, years):
    topics = [k for k, _, _ in LIFE_TOPICS]
    judgments = {k: ctx.j(k) for k in topics}
    labels = {k: t for k, t, _ in LIFE_TOPICS}
    mahas = ctx.r["dasha"]["mahadashas"]
    ss_periods = ctx.r["transits"]["sade_sati"]["lifetime_periods"]
    out = [chapter("Year by year", [P(
        "Each year below lists the planetary periods that run through it, where Jupiter and Saturn travel from your "
        "Moon, and which life areas the chart activates — with a focus for the year. Jupiter shows where growth "
        "comes easily; Saturn shows where effort and patience are required."),
        NOTE("Years run from the date this report was prepared.")], f"A {years}-year calendar built from your dashas and transits.")]
    start = ctx.now
    for i in range(years):
        ys, ye = _add_years(start, i), _add_years(start, i + 1)
        mid = ys + (ye - ys) / 2
        periods = []
        for m in mahas:
            for a in m["antardashas"]:
                s, e = _dt(a["start"]), _dt(a["end"])
                if s < ye and e > ys:
                    periods.append((a, s, e))
        dasha_txt = " → ".join(f"{a['label'].replace('-', '–')}" + (f" (from {_my(s)})" if s > ys else "") for a, s, e in periods)
        jup_signs = list(dict.fromkeys([ctx.sign_at("JUPITER", ys), ctx.sign_at("JUPITER", mid), ctx.sign_at("JUPITER", ye)]))
        sat_signs = list(dict.fromkeys([ctx.sign_at("SATURN", ys), ctx.sign_at("SATURN", mid), ctx.sign_at("SATURN", ye)]))
        jup_h = [ctx.from_moon(s) for s in jup_signs]
        sat_h = [ctx.from_moon(s) for s in sat_signs]
        from . import report_extras as X
        node_sign, node_h, node_text = X.node_transit_text(ctx, mid)
        sade = next((p for p in ss_periods if _dt(p["start"]) < ye and (not p["end"] or _dt(p["end"]) > ys)), None)
        score = sum(1 if K.JUPITER_FROM_MOON[h][0] == "good" else 0 for h in jup_h[-1:]) + \
            sum(1 if K.SATURN_FROM_MOON[h][0] == "good" else (-1 if K.SATURN_FROM_MOON[h][0] == "hard" else 0) for h in sat_h[-1:])
        highlights, movers = [], []
        for k in topics:
            jj = judgments[k]
            for w in jj.windows:
                if w.start < ye and w.end > ys:
                    dt = w.double_transit
                    if dt and dt[0] < ye and dt[1] > ys:
                        highlights.append(f"**{labels[k]}:** Jupiter and Saturn together activate this area "
                                          f"{_my(max(dt[0], ys))} – {_my(min(dt[1], ye))}, inside the "
                                          f"{plabel(w.dasha)} period — the year's clearest trigger here.")
                        movers.append(labels[k].split(" and ")[0].lower())
                    elif w.relevance >= 2:
                        why = wtext(w).split(". ")[0]
                        highlights.append(f"**{labels[k]}:** {plabel(w.dasha)} ({_my(max(w.start, ys))} – "
                                          f"{_my(min(w.end, ye))}) — {why}. {YEAR_ACTION[k]}")
                    break
        lead_lord = (periods[0][0]["lords"][-1] if periods else None)
        if movers and score >= 0:
            mood, tone = "A year of movement", "good"
        elif score > 0:
            mood, tone = "A year of steady growth", "good"
        elif score < 0:
            mood, tone = "A year for patience and consolidation", "caution"
        else:
            mood, tone = "A building year", "info"
        focus = f"{mood}. "
        if lead_lord:
            focus += f"The {pname(lead_lord)} sub-period puts {HOUSE_MEANING[ctx.planet(lead_lord)['house']]} in the foreground"
            focus += (f", and {_join(list(dict.fromkeys(movers)))} {'are' if len(set(movers)) > 1 else 'is'} where events are most likely to land." if movers
                      else "; use it to prepare rather than to force outcomes.")
        blocks = [
            FACTS([("Planetary periods", dasha_txt or "—"),
                   ("Jupiter from Moon", " → ".join(f"{SIGNS[s]} ({ordinal(h)})" for s, h in zip(jup_signs, jup_h))),
                   ("Saturn from Moon", " → ".join(f"{SIGNS[s]} ({ordinal(h)})" for s, h in zip(sat_signs, sat_h))),
                   ("Sade Sati", "Running" if sade else "Not running"),
                   ("Rahu–Ketu from Moon", f"Rahu in {node_sign} ({ordinal(node_h)})")], cols=2),
            CALL("Focus for the year", focus, tone),
            H("The transits"),
            P(" ".join(K.JUPITER_FROM_MOON[h][1] for h in dict.fromkeys(jup_h))),
            P(" ".join(K.SATURN_FROM_MOON[h][1] for h in dict.fromkeys(sat_h))),
            P(node_text),
        ]
        if highlights:
            blocks += [H("What the chart activates"), BUL(highlights)]
        else:
            blocks += [H("What the chart activates"),
                       P("No life area reaches a dated trigger this year. Treat it as a year for skills, health and "
                         "relationships — the groundwork that later windows will build on.")]
        out.append(section(f"Year {i + 1} · {ys:%d %b %Y} to {ye:%d %b %Y}", blocks=blocks, sample=(i == 0)))
    return out


def _yoga_blocks(ctx):
    yogas = ctx.r.get("yogas") or []
    analysis = ctx.r.get("yoga_analysis") or {}
    blocks = []
    if analysis.get("headline"):
        blocks.append(CALL("Combined reading", [analysis.get("headline", ""), analysis.get("summary", "")], "gold"))
    for y in yogas:
        impact = y.get("impact") or {}
        act = impact.get("activation") or {}
        cond = impact.get("condition") or {}
        blocks += [H(y["name"]), P(impact.get("summary", "")),
                   BUL([f"**Formed by:** {'; '.join(y.get('evidence') or [])}",
                        f"**Active now?** {cap(act.get('label', ''))} — {act.get('reason', '')}" if act else "",
                        f"**Backing:** {cap(cond.get('label', ''))} ({cond.get('summary', '')})" if cond else "",
                        impact.get("combined_effect", "")]),
                   NOTE(f"Rule: {y.get('rule', '')}")]
    if not yogas:
        blocks.append(P("No classical yoga from this report's catalogue is formed in your chart. That is common and "
                        "neutral: results then follow the house lords and dashas described elsewhere."))
    return blocks


# ---------------------------------------------------------------- doshas

def _dosha_checks(ctx):
    c = ctx.c
    m = manglik(c)[0]
    ks = kaal_sarp(c)[0]
    km = kemadruma(c)
    gc = guru_chandala(c)
    node_sun = c.sign["SUN"] in (c.sign["RAHU"], c.sign["KETU"])
    ninth_node = any(c.house[n] == 9 for n in ("RAHU", "KETU"))
    ninth_lord = c.house_lord[9]
    lord_node = any(c.sign[ninth_lord] == c.sign[n] for n in ("RAHU", "KETU"))
    pitru = [t for t, ok in (("the Sun is joined by Rahu or Ketu", node_sun), ("Rahu or Ketu occupies the 9th house", ninth_node),
                              (f"the 9th lord {pname(ninth_lord)} is joined by a node", lord_node)) if ok]
    cancels = []
    if m["present"]:
        if c.sign["MARS"] in OWN_SIGNS["MARS"] or c.sign["MARS"] == EXALTATION["MARS"][0]:
            cancels.append("Mars is in its own or exaltation sign, which classical texts treat as a strong mitigation.")
        if c.aspects("JUPITER", c.house["MARS"]) or c.house_from("JUPITER", "MARS") == 1:
            cancels.append("Jupiter aspects or joins Mars, softening its heat.")
        if c.house["MARS"] == 2 and c.sign["MARS"] in (2, 5):
            cancels.append("Mars in Gemini or Virgo in the 2nd house is a commonly cited exception.")
        if c.house["MARS"] == 12 and c.sign["MARS"] in (1, 6):
            cancels.append("Mars in Taurus or Libra in the 12th house is a commonly cited exception.")
        if c.house["MARS"] == 4 and c.sign["MARS"] in (0, 7):
            cancels.append("Mars in its own sign in the 4th house is a commonly cited exception.")
    ss = ctx.r["transits"]["sade_sati"]
    km_present = bool(km and km[0].get("present", True) and not km[0].get("cancelled"))
    return {"manglik": m, "manglik_cancels": cancels, "kaal": ks, "pitru": pitru, "kemadruma": km,
            "kemadruma_present": km_present, "guru_chandala": gc, "sade_sati": ss}


def _dosha_summary_facts(d):
    m, ks = d["manglik"], d["kaal"]
    return FACTS([
        ("Manglik (Kuja)", ("Present · " + m["severity"] + (" · mitigated" if d["manglik_cancels"] else "")) if m["present"] else "Not present"),
        ("Kaal Sarp", f"Present · {K.KAAL_SARP_NAMES[ks['houses'][0] if ks['houses'] else 1]} type" if ks["present"] else "Not present"),
        ("Pitru screen", f"{len(d['pitru'])} indicator{'s' if len(d['pitru']) != 1 else ''}" if d["pitru"] else "No indicator"),
        ("Guru-Chandala", "Present" if d["guru_chandala"] else "Not present"),
        ("Kemadruma", "Present" if d["kemadruma_present"] else ("Cancelled" if d["kemadruma"] else "Not present")),
        ("Sade Sati now", d["sade_sati"]["phase"].split(" (")[0].title() + " phase" if d["sade_sati"]["active"] else "Not running"),
    ])


def _manglik_blocks(ctx, d):
    c, m = ctx.c, d["manglik"]
    mars = ctx.planet("MARS")
    yes = lambda flag: "Yes" if flag else "No"
    blocks = [
        CALL("Result", [f"**{'Manglik dosha is present' if m['present'] else 'Manglik dosha is not present'}** by the "
                        f"standard rule (Mars in the 1st, 2nd, 4th, 7th, 8th or 12th house from the ascendant)."
                        + (f" Severity: {m['severity']} — Mars also qualifies from {m['refs_count'] - 1} of the two reference points (Moon, Venus)." if m["present"] else ""),
                        "This is a traditional indicator for marriage matching, not a prediction of harm."],
             "caution" if m["present"] and not d["manglik_cancels"] else ("gold" if m["present"] else "good"),
             m["severity"].title() if m["present"] else "Clear"),
        TABLE(["Counted from", "Mars falls in", "Manglik house?"], [
            ["Ascendant (main rule)", f"{ordinal(c.house['MARS'])} house", yes(m["from_lagna"])],
            ["Moon (reference)", f"{ordinal(c.house_from('MARS', 'MOON'))} house", yes(m["from_moon"])],
            ["Venus (reference)", f"{ordinal(c.house_from('MARS', 'VENUS'))} house", yes(m["from_venus"])],
        ], [1.6, 1.4, 1], 8.4),
        P(f"Mars is in {mars['sign_name']} ({mars['dignity']['status'].lower()}) in your {ordinal(mars['house'])} house. "
          f"Mars is the planet of drive and heat; in the Manglik houses it can make relationships more intense, "
          f"impatient or competitive. The remedy that works best is awareness: channel energy into shared goals and "
          f"physical activity, and choose a partner who can meet that energy."),
    ]
    if m["present"]:
        blocks += [H("Classical cancellations that apply"),
                   BUL(d["manglik_cancels"] or ["None of the commonly cited cancellations apply to this chart."]),
                   P("Matching with another Manglik chart is the most widely accepted balancing condition. Many "
                     "traditions also consider the dosha to weaken after age 28.")]
    return blocks


def _kaal_blocks(ctx, d):
    ks = d["kaal"]
    rahu_h = ctx.c.house["RAHU"]
    ketu_h = ctx.c.house["KETU"]
    if ks["present"]:
        name = K.KAAL_SARP_NAMES[rahu_h]
        return [CALL("Result", [f"**{name} Kaal Sarp Yoga is present** — all seven planets fall on one side of the "
                                f"Rahu–Ketu axis (Rahu in your {ordinal(rahu_h)}, Ketu in your {ordinal(ketu_h)}). The "
                                f"pattern is {ks['severity']}.",
                                f"It concentrates life around the {ordinal(rahu_h)}–{ordinal(ketu_h)} axis: "
                                f"{HOUSE_MEANING[rahu_h]} versus {HOUSE_MEANING[ketu_h]}. Classically it brings delays "
                                f"followed by sudden rises; effort is rewarded later rather than sooner."], "caution", name),
                NOTE(f"Rule: {ks['rule']}. {ks['evidence'][0]}.")]
    return [CALL("Result", [f"**Kaal Sarp Yoga is not present.** At least one planet sits outside the Rahu–Ketu axis "
                            f"(Rahu in your {ordinal(rahu_h)}, Ketu in your {ordinal(ketu_h)}), so the planets are not "
                            f"hemmed in by the nodes."], "good", "Clear"),
            P(f"The nodal axis still matters: Rahu in the {ordinal(rahu_h)} house pulls you toward "
              f"{HOUSE_MEANING[rahu_h]}, while Ketu in the {ordinal(ketu_h)} brings detachment or past skill in "
              f"{HOUSE_MEANING[ketu_h]}."),
            NOTE(f"Rule: {ks['rule']}. {ks['evidence'][0]}.")]


def _pitru_blocks(d):
    if d["pitru"]:
        return [CALL("Screening result", [f"**{len(d['pitru'])} classical indicator{'s' if len(d['pitru']) > 1 else ''} present:** {_join(d['pitru'])}.",
                                          "Traditionally this points to unfinished family or ancestral duties. In practice it "
                                          "asks for respect to elders, remembrance rituals such as Shraddha, and service in "
                                          "their name."], "gold", "Indicated"),
                NOTE("Rule used: Sun joined by a node, a node in the 9th house, or the 9th lord joined by a node. Traditions differ.")]
    return [CALL("Screening result", ["**No Pitru dosha indicator is present** under the rule used (Sun joined by a node, "
                                      "a node in the 9th house, or the 9th lord joined by a node)."], "good", "Clear")]


def _remedy_rows(ctx, planets_with_reasons):
    rows = []
    for g, why in planets_with_reasons:
        rem = K.REMEDY[g]
        rows.append([pname(g), why, rem["day"], rem["mantra"], cap(rem["charity"]), cap(rem["practice"])])
    return TABLE(["Planet", "Why", "Day", "Mantra (108×)", "Charity", "Daily practice"], rows,
                 [.7, 1.3, .65, 1.1, 1.1, 1.6], 7.4)


def _remedies_chapter(ctx, extra_planets=None, title="Remedies and guidance", brk=True):
    maha, antar = ctx.running()
    chosen = []
    if maha:
        chosen.append((maha["lords"][0], "Lord of the running major period"))
    if antar and antar["lords"][-1] not in [g for g, _ in chosen]:
        chosen.append((antar["lords"][-1], "Lord of the running sub-period"))
    strengths = ctx.r.get("planet_strength") or {}
    lagna_lord = ctx.c.house_lord[1]
    if lagna_lord not in [g for g, _ in chosen] and strengths.get(lagna_lord, {}).get("score", 100) < 55:
        chosen.append((lagna_lord, "Ascendant lord, below average strength"))
    for g, why in extra_planets or []:
        if g not in [x for x, _ in chosen]:
            chosen.append((g, why))
    blocks = [P("Remedies in the Vedic tradition are disciplines rather than magic: they focus attention on the "
                "planet whose themes need care. Choose one or two, practise them steadily, and judge them by how they "
                "change your conduct."),
              _remedy_rows(ctx, chosen),
              H("General guidance"),
              BUL(["Start remedies on the planet's weekday and keep them for at least 40 days.",
                   "Charity should be modest, regular and useful to the person receiving it.",
                   "Never stop medical treatment, legal advice or financial planning in favour of a remedy.",
                   "The most reliable remedy for any period is to live its theme well: discipline in Saturn periods, "
                   "learning in Jupiter periods, clear communication in Mercury periods."])]
    return chapter(title, blocks, "Practical, proportionate ways to work with the planets that matter most right now.", brk=brk)


# ---------------------------------------------------------------- products

def _life(ctx, item):
    years = item["years"]
    sections = []
    verdicts = []
    for key, label, _ in LIFE_TOPICS:
        j = ctx.j(key)
        lean = (HEALTH_LEAN if key == "health" else LEAN_WORDS).get(j.lean, j.lean_text)
        verdicts.append(f"**{label}** — {lean}.")
    sections.append(_cover(ctx, "At a glance", verdicts, _how_to_read("life")))
    from . import report_extras as X, report_lalkitab as LK
    sections += [_chart_chapter(ctx), _identity_chapter(ctx), X.avakhada_chapter(ctx), X.numerology_chapter(ctx),
                 _strength_chapter(ctx), X.bhava_chapter(ctx), X.kp_chapter(ctx),
                 LK.lal_kitab_chapter(ctx)]
    for key, label, kicker in LIFE_TOPICS:
        sections.append(chapter(label, _topic_blocks(ctx, key), kicker))
    sections.append(_dasha_chapter(ctx, years))
    sections.append(X.varshaphal_chapter(ctx, min(years, 5)))
    sections += _yearly_chapters(ctx, years)
    sections.append(X.monthly_chapter(ctx, 12))
    d = _dosha_checks(ctx)
    ss = ctx.r["transits"]["sade_sati"]
    sections.append(chapter("Yogas and doshas", _yoga_blocks(ctx) + [
        H("Dosha checks at a glance"), _dosha_summary_facts(d),
        P("Each dosha is explained in detail in the standalone Dosha report. Here it is enough to know which ones "
          "are present and that none of them fixes your fate on its own."),
        H("Sade Sati across your life"), FLOW(_sade_sati_timeline(ctx, ss)),
    ], "Special planetary combinations in your chart and the classical dosha checks."))
    sections.append(_remedies_chapter(ctx))
    sections.append(_appendix(ctx))
    return item["name"], f"A {years}-year reading of career, relationships, wealth, health and timing", sections


def _sade_sati_timeline(ctx, ss):
    birth = _dt(ctx.r["birth"]["utc"])
    end = _add_years(birth, 100)
    rows = []
    for n, p in enumerate(ss["lifetime_periods"], 1):
        s, e = _dt(p["start"]), _dt(p["end"]) if p["end"] else end
        if s > end:
            break
        current = s <= ctx.now <= e
        rows.append((f"{ordinal(n)} Sade Sati" + (" (now)" if current else ""), max(s, birth), min(e, end),
                     "caution" if current else ("neutral" if e < ctx.now else "info")))
    return V.Timeline(rows, birth, end, ctx.now)


def _saturn_phases(ctx, period):
    s, e = _dt(period["start"]), _dt(period["end"])
    out = []
    for a, b, sign in _sign_intervals(ctx.c, "SATURN", s - timedelta(days=1), e + timedelta(days=1)):
        h = ctx.from_moon(sign)
        phase = {12: "Rising", 1: "Peak", 2: "Setting"}.get(h)
        if not phase:
            continue
        if out and out[-1]["phase"] == phase:
            out[-1]["end"] = b
            continue
        out.append({"phase": phase, "start": max(a, s), "end": b, "sign": sign})
    return out


def _sade_sati(ctx, item):
    c, r = ctx.c, ctx.r
    ss = r["transits"]["sade_sati"]
    periods = ss["lifetime_periods"]
    current = next((p for p in periods if _dt(p["start"]) <= ctx.now <= _dt(p["end"] or "2200-01-01")), None)
    upcoming = next((p for p in periods if _dt(p["start"]) > ctx.now), None)
    focus = current or upcoming
    sat, moon = ctx.planet("SATURN"), ctx.planet("MOON")
    sat_houses = ctx.lord_houses("SATURN")
    yogakaraka = any(h in (4, 7, 10) for h in sat_houses) and any(h in (5, 9) for h in sat_houses)
    benefic = yogakaraka or any(h in (1, 5, 9) for h in sat_houses)
    dusthana = any(h in (6, 8, 12) for h in sat_houses) and not benefic
    sat_st, moon_st = ctx.strength("SATURN").get("score", 50), ctx.strength("MOON").get("score", 50)
    sav = {x["sign_name"]: x["sav"] for x in (r.get("ashtakavarga") or {}).get("sav_by_house", [])}
    moon_sign = c.sign["MOON"]
    span_signs = [(moon_sign - 1) % 12, moon_sign, (moon_sign + 1) % 12]
    span_sav = [sav.get(SIGNS[s], 28) for s in span_signs]
    points, reasons = 0, []
    if benefic:
        points += 1
        reasons.append(f"Saturn rules your {_join([ordinal(h) for h in sat_houses])} house{'s' if len(sat_houses) > 1 else ''}, "
                       + ("making it your yogakaraka — its tests come with real rewards." if yogakaraka else "a functionally helpful role for your ascendant."))
    elif dusthana:
        points -= 1
        reasons.append(f"Saturn rules your {_join([ordinal(h) for h in sat_houses])} houses, including a difficult house, so its lessons feel sharper.")
    if sat_st >= 55:
        points += 1
        reasons.append(f"Saturn is reasonably strong in your chart ({sat_st:.0f}/100), so it tends to reward discipline.")
    elif sat_st < 45:
        points -= 1
        reasons.append(f"Saturn is weak in your chart ({sat_st:.0f}/100), so delays can feel heavier.")
    if moon_st >= 55:
        points += 1
        reasons.append(f"Your Moon is well placed ({moon_st:.0f}/100), which gives emotional resilience.")
    elif moon_st < 45:
        points -= 1
        reasons.append(f"Your Moon is on the weaker side ({moon_st:.0f}/100), so emotional load needs active care.")
    avg = sum(span_sav) / 3
    if avg >= 29:
        points += 1
        reasons.append(f"The three signs Saturn crosses carry above-average Ashtakavarga support ({avg:.0f} on average).")
    elif avg < 26:
        points -= 1
        reasons.append(f"The three signs Saturn crosses carry below-average Ashtakavarga support ({avg:.0f} on average).")
    intensity, tone = (("mild", "good") if points >= 2 else ("moderate", "gold") if points >= 0 else ("significant", "caution"))
    status = (f"**Sade Sati is running now — {ss['phase']}.** It runs {_dmy(current['start'])} to {_dmy(current['end'])}."
              if current else f"**Sade Sati is not running now.** The next one begins on {_dmy(upcoming['start'])}." if upcoming
              else "**No further Sade Sati falls within the calculated span.**")
    summary = [status, f"Expected intensity for your chart: **{intensity}**."]
    sections = [_cover(ctx, "Your Sade Sati in brief", summary, _how_to_read("sade_sati"))]
    phases = _saturn_phases(ctx, focus) if focus else []
    grouped = {}
    for p in phases:
        grouped.setdefault(p["phase"], {"phase": p["phase"], "sign": p["sign"], "spans": []})["spans"].append((p["start"], p["end"]))
    phases = list(grouped.values())
    phase_rows = [(f"{p['phase']} · {SIGNS[p['sign']]}", p["spans"], None,
                   "caution" if any(a <= ctx.now <= b for a, b in p["spans"]) else "info") for p in phases]
    analysis = [CALL("Status now", [status, f"Saturn is in your {ordinal(ss['saturn_house_from_moon'])} sign from the Moon."
                     + (" (Ashtama Shani — Saturn 8th from the Moon.)" if ss.get("ashtama_shani") else "")
                     + (" (Kantaka Shani — Saturn 4th from the Moon.)" if ss.get("kantaka_shani") else "")],
                     "caution" if current else "info", (ss["phase"] or "").split(" (")[0].title() or "Not active"),
                H("Every Sade Sati in your life"), FLOW(_sade_sati_timeline(ctx, ss)),
                TABLE(["Period", "Begins", "Ends", "Your age"], [
                    [f"{ordinal(n)} Sade Sati", _dmy(p["start"]), _dmy(p["end"]) if p["end"] else "Open",
                     f"{(_dt(p['start']) - _dt(r['birth']['utc'])).days // 365}–{((_dt(p['end']) if p['end'] else _dt(p['start'])) - _dt(r['birth']['utc'])).days // 365}"]
                    for n, p in enumerate(periods, 1)], [1.4, 1, 1, .8], 8.4)]
    if phases:
        analysis += [H(f"The three phases of the {'current' if current else 'next'} Sade Sati"), FLOW(V.Timeline(phase_rows, phases[0]["spans"][0][0], phases[-1]["spans"][-1][1], ctx.now)),
                     NOTE("Saturn's retrograde loops can carry it back into the previous sign for a few months, so a phase may appear in two pieces.")]
    sections.append(chapter("Sade Sati status and phase analysis", analysis,
                            "Saturn's 7½-year passage over your natal Moon, dated for your chart.", sample=True))
    sections.append(chapter("How strongly it is felt in your chart", [
        CALL("Expected intensity", f"**{intensity.title()}.** Sade Sati is not the same for everyone: it depends on what "
             f"Saturn rules for your ascendant, Saturn's own strength, the Moon's strength and the support in the "
             f"signs Saturn crosses.", tone, intensity.title()),
        BUL(reasons or ["The factors are balanced; expect a moderate, workable period."]),
        FACTS([("Natal Moon", f"{moon['sign_name']} · H{moon['house']} · {moon['nakshatra']}"),
               ("Natal Saturn", f"{sat['sign_name']} · H{sat['house']} · {sat['dignity']['status']}"),
               ("Saturn rules", _join([ordinal(h) for h in sat_houses]) + " houses"),
               ("Saturn strength", f"{sat_st:.0f}/100"), ("Moon strength", f"{moon_st:.0f}/100"),
               ("SAV in the 3 signs", " · ".join(str(x) for x in span_sav))]),
        FLOW(V.Bars([(f"{SIGNS[s]} ({ph})", v, 40, "good" if v >= 28 else "caution") for s, v, ph in
                     zip(span_signs, span_sav, ("rising", "peak", "setting"))], reference=28, reference_label="average 28")),
    ], "Why the same transit is light for some people and heavy for others.", brk=False))
    phase_text = {
        "Rising": "Saturn enters the sign before your Moon, your {h} house from the ascendant ({m}). This phase tends to "
                  "bring expenses, disturbed sleep and endings that make room for what follows. Simplify, save and finish "
                  "old business.",
        "Peak": "Saturn crosses your Moon sign itself, your {h} house from the ascendant ({m}). Emotional load and "
                "responsibility peak; the mind can feel heavy. Routine, rest and honest support from others carry you "
                "through, and maturity gained here lasts.",
        "Setting": "Saturn moves to the sign after your Moon, your {h} house from the ascendant ({m}). Family, money and "
                   "speech need care; it is the consolidation phase, when the work of the previous years starts to pay.",
    }
    pblocks = []
    for p in phases:
        h = ctx.from_lagna(p["sign"])
        dates = "; ".join(f"{_my(a)} – {_my(b)}" for a, b in p["spans"])
        pblocks += [H(f"{p['phase']} phase · Saturn in {SIGNS[p['sign']]} · {dates}"),
                    P(phase_text[p["phase"]].format(h=ordinal(h), m=HOUSE_MEANING[h])),
                    NOTE(f"Ashtakavarga support in {SIGNS[p['sign']]}: {sav.get(SIGNS[p['sign']], '—')} (28 is average).")]
    if pblocks:
        sections.append(chapter("Phase by phase", pblocks, "What each 2½-year phase touches in your life.", brk=False))
    # dasha overlap and other Saturn transits
    rows = []
    if focus:
        fs, fe = _dt(focus["start"]), _dt(focus["end"])
        for m in r["dasha"]["mahadashas"]:
            for a in m["antardashas"]:
                s, e = _dt(a["start"]), _dt(a["end"])
                if s < fe and e > fs:
                    g = a["lords"][-1]
                    rows.append([a["label"].replace("-", "–"), _dmy(max(s, fs)), _dmy(min(e, fe)), cap(ctx.lord_phrase(g))])
    other = []
    for a, b, sign in _sign_intervals(c, "SATURN", ctx.now, _add_years(ctx.now, 30)):
        h = ctx.from_moon(sign)
        if h in (4, 8) and (not other or other[-1][0] != h or (a - other[-1][2]).days > 60):
            other.append([h, a, b])
        elif h in (4, 8) and other:
            other[-1][2] = b
    sections.append(chapter("Dashas during Sade Sati and other Saturn periods", [
        P("A Sade Sati feels different depending on the planetary period running underneath it. A supportive period "
          "softens it; a period of Saturn or of a difficult house lord makes it more noticeable."),
        TABLE(["Sub-period", "From", "To", "What that planet does in your chart"], rows, [1.1, .9, .9, 3.1], 7.6)
        if rows else P("No period data in range."),
        H("Kantaka and Ashtama Shani in the next 30 years"),
        P("Saturn 4th from the Moon (Kantaka) presses on home and peace of mind; 8th from the Moon (Ashtama) is the "
          "most testing of the smaller Saturn periods. Plan big moves outside these windows where you can."),
        TABLE(["Type", "From", "To"], [["Kantaka Shani (4th)" if h == 4 else "Ashtama Shani (8th)", _dmy(a), _dmy(b)] for h, a, b in other],
              [1.6, 1, 1], 8.4) if other else P("None in the next 30 years."),
    ], "The planetary periods that colour your Sade Sati.", brk=False))
    sections.append(_remedies_chapter(ctx, [("SATURN", "Sade Sati planet"), ("MOON", "The Moon Saturn transits")],
                                      "Remedies for Saturn and the Moon"))
    sections[-1]["blocks"].insert(2, BUL([
        "Keep Saturdays simple: service to elders or workers, black sesame or mustard oil as charity.",
        "Hanuman Chalisa or Shani stotra on Saturdays is the most widely followed Sade Sati practice.",
        "Protect sleep and routine during the peak phase; Saturn rewards structure.",
        "Avoid fear-driven decisions — most Sade Sati difficulty comes from rushing, not from Saturn itself.",
    ]))
    return item["name"], "Saturn's 7½-year transit over your Moon: dates, phases, intensity and remedies", sections


def _dosha(ctx, item):
    d = _dosha_checks(ctx)
    present = [n for n, ok in (("Manglik", d["manglik"]["present"]), ("Kaal Sarp", d["kaal"]["present"]),
                                ("Pitru (screen)", bool(d["pitru"])), ("Guru-Chandala", bool(d["guru_chandala"])),
                                ("Kemadruma", d["kemadruma_present"])) if ok]
    summary = [f"**{len(present)} of 5 dosha checks are positive:** {_join(present)}." if present else
               "**None of the five dosha checks is positive** in your chart.",
               "Each result below shows the rule used, what it means in practice and the classical cancellations."]
    sections = [_cover(ctx, "Dosha summary", summary, _how_to_read("dosha"))]
    sections.append(chapter("Dosha summary", [_dosha_summary_facts(d),
                                              P("A dosha is a classical warning sign, not a curse. Most charts carry one or two; what "
                                                "matters is the strength of the planets involved, the cancellations that apply and the "
                                                "dashas that activate them.")],
                            "Five classical checks run on your chart, with results at a glance.", brk=False))
    sections.append(chapter("Manglik (Kuja) Dosha", _manglik_blocks(ctx, d), "Mars and the houses of marriage.", sample=True))
    sections.append(chapter("Kaal Sarp Yoga", _kaal_blocks(ctx, d), "The Rahu–Ketu axis and whether it encloses the planets.", brk=False))
    gc = d["guru_chandala"]
    km = d["kemadruma"]
    other = [H("Pitru dosha (screening)")] + _pitru_blocks(d) + [H("Guru-Chandala Yoga")]
    other += ([CALL("Result", [f"**Present:** {'; '.join(gc[0]['evidence'])}.",
                               "Jupiter (wisdom, teachers) mixed with a node can confuse judgement about advice and "
                               "beliefs. Choose mentors carefully and keep your own ethics clear."], "gold", "Present")]
              if gc else [CALL("Result", "**Not present.** Jupiter is free of Rahu and Ketu's direct influence.", "good", "Clear")])
    other += [H("Kemadruma Yoga")]
    if not km:
        other.append(CALL("Result", "**Not present.** Planets sit next to your Moon, giving it support.", "good", "Clear"))
    elif km[0].get("cancelled"):
        other.append(CALL("Result", [f"**Formed but cancelled:** {'; '.join(km[0].get('cancellation') or [])}.",
                                     "An isolated Moon can feel lonely or unsupported; the cancellation means other "
                                     "planets step in."], "gold", "Cancelled"))
    elif km[0].get("present") is False:
        other.append(CALL("Result", f"**Not present:** {km[0]['evidence'][0]}.", "good", "Clear"))
    else:
        other.append(CALL("Result", ["**Present:** no planet sits beside your Moon.",
                                     "This can bring emotional isolation or uneven finances; steady routines and "
                                     "supportive company are the classical answer."], "caution", "Present"))
    sections.append(chapter("Other classical checks", other, "Ancestral, Jupiter–node and lunar isolation checks.", brk=False))
    extra = []
    if d["manglik"]["present"]:
        extra.append(("MARS", "Manglik dosha"))
    if d["kaal"]["present"]:
        extra += [("RAHU", "Kaal Sarp yoga"), ("KETU", "Kaal Sarp yoga")]
    if d["pitru"]:
        extra.append(("SUN", "Pitru indicators"))
    if gc:
        extra.append(("JUPITER", "Guru-Chandala"))
    sections.append(_remedies_chapter(ctx, extra, "Dosha remedies", brk=False))
    return item["name"], "Manglik, Kaal Sarp, Pitru and other classical checks — explained, with cancellations", sections


def _muhurat_candidates(ctx, windows):
    c = ctx.c
    weekdays = {0, 2, 3, 4}
    nakshatras = {"Rohini", "Mrigashira", "Magha", "Uttara Phalguni", "Hasta", "Swati", "Anuradha",
                  "Uttara Ashadha", "Uttara Bhadrapada", "Revati"}
    tithis = {"Dwitiya", "Tritiya", "Panchami", "Saptami", "Dashami", "Ekadashi", "Trayodashi"}
    found = []
    for start, end, label in windows:
        day = max(ctx.now, start)
        day = day.replace(hour=6, minute=30, second=0, microsecond=0)
        while day <= end and len(found) < 12:
            local = day.astimezone(ctx.tz)
            if local.weekday() in weekdays:
                pos, _ = c.eph.sidereal_positions(day, node=c.options.node)
                tithi = tithi_info(pos["SUN"]["lon"], pos["MOON"]["lon"])
                nak = nakshatra_info(pos["MOON"]["lon"])
                if tithi["name"] in tithis and nak["name"] in nakshatras:
                    found.append([f"{local:%d %b %Y}".lstrip("0"), local.strftime("%A"), f"{tithi['paksha']} {tithi['name']}",
                                  f"{nak['name']} · pada {nak['pada']}", label])
            day += timedelta(days=1)
        if len(found) >= 12:
            break
    return found


def _marriage(ctx, item):
    c, r = ctx.c, ctx.r
    j = ctx.j("marriage")
    seventh = c.house_sign[7]
    lord7 = c.house_lord[7]
    l7 = ctx.planet(lord7)
    venus = ctx.planet("VENUS")
    dk = next((g for g, p in r["planets"].items() if p.get("chara_karaka") == "Darakaraka"), None)
    d9 = r["vargas"]["D9"]
    d9_7 = (d9["lagna"]["sign"] + 6) % 12
    d9_lord = SIGN_LORD[d9_7]
    lean = LEAN_WORDS.get(j.lean, j.lean_text)
    first = j.windows[0] if j.windows else None
    summary = [f"**Marriage prospects: {lean}.**", sentence(j.theme)]
    if first:
        summary.append(f"Most promising window: **{_my(first.start)} – {_my(first.end)}** ({plabel(first.dasha)}).")
    sections = [_cover(ctx, "Marriage in brief", summary, _how_to_read("marriage"))]
    sections.append(_chart_chapter(ctx, title="Your birth chart and navamsha"))
    sections.append(chapter("Marriage conditions", _topic_blocks(ctx, "marriage"),
                            "The 7th house, its lord, Venus and the navamsha read together.", sample=True))
    sections.append(chapter("Your partner as the chart describes", [
        P("Vedic astrology reads the spouse from the 7th house, its lord, Venus (the natural significator of love) and "
          "the Darakaraka — the planet with the lowest degree in the chart. These describe the qualities you are drawn "
          "to and the kind of partnership that works for you, not a specific person."),
        FACTS([("7th house", f"{SIGNS[seventh]} · {K.SIGN_SHORT[seventh]}"),
               ("7th lord", f"{pname(lord7)} in {l7['sign_name']}, H{l7['house']}"),
               ("Venus", f"{venus['sign_name']} · H{venus['house']} · {venus['dignity']['status']}"),
               ("Darakaraka", pname(dk) if dk else "—"),
               ("Navamsha 7th", f"{SIGNS[d9_7]} · lord {pname(d9_lord)}"),
               ("Navamsha ascendant", d9["lagna"]["sign_name"])]),
        H("Temperament"),
        P(f"With {SIGNS[seventh]} on the 7th house, the partner the chart describes is {K.SIGN_SHORT[seventh]}. "
          f"The navamsha 7th in {SIGNS[d9_7]} adds a {K.SIGN_SHORT[d9_7]} quality, which tends to show more after "
          f"marriage than at first meeting."),
        H("Where you are likely to meet, and what the marriage serves"),
        P(f"The 7th lord {pname(lord7)} sits in your {ordinal(l7['house'])} house, linking partnership with "
          f"{LORD_OUTLET[l7['house']]}. Introductions through these areas of life are classically favoured."),
        H("The Darakaraka"),
        P(f"{pname(dk)} is your Darakaraka, so the spouse carries its signature: {K.PLANET_NATURE[dk]}." if dk else ""),
        H("Venus"),
        P(f"Venus in {venus['sign_name']} in your {ordinal(venus['house'])} house shows how you love: through "
          f"{HOUSE_MEANING[venus['house']]}, with a {K.SIGN_SHORT[c.sign['VENUS']]} style."),
    ], "The qualities your chart is drawn to in a partner."))
    d = _dosha_checks(ctx)
    sections.append(chapter("Manglik status for matching", _manglik_blocks(ctx, d), "What to know before horoscope matching.", brk=False))
    windows = [(w.start, w.end, plabel(w.dasha)) for w in j.windows]
    candidates = _muhurat_candidates(ctx, windows) if windows else []
    sections.append(chapter("Candidate Shubh Vivah Muhurat dates", [
        P("These dates fall inside your strongest marriage windows and pass the classical filters: a favourable weekday "
          "(Monday, Wednesday, Thursday or Friday), a favourable tithi and one of the ten nakshatras recommended for "
          "marriage. They are a starting list for your family priest, who will fix the exact lagna and time."),
        TABLE(["Date", "Weekday", "Tithi", "Nakshatra", "Within period"], candidates, [1, .9, 1.3, 1.4, 1.1], 8)
        if candidates else P("No date in the current windows passes all filters; widen the search with a priest."),
        NOTE("Sampled at sunrise local time. Avoid dates falling in Kharmas, Chaturmas or eclipse periods per your tradition."),
    ], "Auspicious dates inside your marriage windows."))
    sections.append(_remedies_chapter(ctx, [("VENUS", "Significator of marriage"), (lord7, "Lord of your 7th house"),
                                            ("JUPITER", "Blessing of marriage")], "Guidance and remedies for marriage"))
    return item["name"], "Marriage prospects, partner profile, timing windows and muhurat dates", sections


def _safe_planets(ctx):
    """Trikona lords are safe to strengthen; lords of 6/8/12 that rule no trikona are avoided."""
    lords = ctx.c.house_lord
    safe = list(dict.fromkeys([lords[1], lords[5], lords[9]]))
    trikona = set(safe)
    avoid = list(dict.fromkeys([lords[h] for h in (6, 8, 12) if lords[h] not in trikona]))
    return safe, avoid


def _suggestion(ctx, item, kind):
    safe, avoid = _safe_planets(ctx)
    lord = ctx.c.house_lord[1]
    role = {ctx.c.house_lord[1]: "ascendant lord", ctx.c.house_lord[5]: "5th lord (intellect, merit)",
            ctx.c.house_lord[9]: "9th lord (fortune)"}
    maha, antar = ctx.running()
    bars = [(f"{pname(g)} · {role[g].split(' (')[0]}", round(ctx.strength(g).get("score", 0)), 100,
             "good" if ctx.strength(g).get("score", 0) >= 55 else "gold") for g in safe]
    title = f"Chart-linked {kind} suggestion"
    if kind == "gemstone":
        gem = K.GEM[lord]
        rem = K.REMEDY[lord]
        summary = [f"**Primary stone: {gem['stone']}** for {pname(lord)}, your ascendant lord.",
                   f"Avoid stones for {_join([pname(g) for g in avoid])}." if avoid else ""]
        sections = [_cover(ctx, "Recommendation in brief", summary, _how_to_read("gemstone"))]
        st = ctx.strength(lord)
        blocks = [CALL("Primary recommendation", [f"**{gem['stone']}** — the stone of {pname(lord)}.",
                       f"{pname(lord)} rules your {ctx.r['lagna']['sign_name']} ascendant, so strengthening it supports "
                       f"health, confidence and overall direction. It is always safe to strengthen the ascendant lord. "
                       f"Its current strength is {st.get('score', 0):.0f}/100 ({st.get('label', '—')})."], "good", "Recommended"),
                  FACTS([("Stone", gem["stone"]), ("Affordable alternative", cap(gem["alt"])), ("Metal", cap(gem["metal"])),
                         ("Finger", cap(gem["finger"])), ("Start on", gem["day"]), ("Mantra", rem["mantra"])]),
                  H("Strength of the planets that are safe to strengthen"), FLOW(V.Bars(bars)),
                  P("The ascendant, 5th and 9th lords (the trikona lords) are the classical safe choices for any chart. "
                    "A weaker trikona lord benefits most from support."),
                  NOTE("Planet strength scores are a transparent heuristic (0–100), not classical Shadbala.")]
        sections.append(chapter(title, blocks, "The stone chosen from your ascendant lord, and why.", sample=True))
        others = [g for g in safe if g != lord]
        sblocks = []
        for g in others:
            gm = K.GEM[g]
            sblocks += [H(f"{gm['stone']} for {pname(g)}"),
                        P(f"{pname(g)} is your {role[g]}. It {ctx.lord_phrase(g)}. A {gm['stone'].split(' (')[0].lower()} "
                          f"(or {gm['alt']}) can be added once the primary stone has suited you for a few months, "
                          f"especially during a {pname(g)} period.")]
        if avoid:
            sblocks += [H("Stones to avoid"),
                        CALL("Not recommended", [f"**{_join([K.GEM[g]['stone'] for g in avoid])}.**",
                             f"{_join([pname(g) for g in avoid])} rule{'s' if len(avoid) == 1 else ''} the 6th, 8th or 12th "
                             f"house for your ascendant without ruling a trikona. Strengthening such a planet can amplify "
                             f"illness, obstacles or losses."], "caution", "Avoid")]
        if any(g == "SATURN" for g in safe):
            sblocks.append(NOTE("Blue sapphire is traditionally tested for a few days before regular wear; remove it at once if sleep or mood is disturbed."))
        sections.append(chapter("Supporting stones and stones to avoid", sblocks, "Secondary options and important cautions.", brk=False))
        sections.append(chapter("How to wear and care for it", [BUL([
            "Buy a natural, untreated stone with a laboratory certificate; avoid heated, filled or synthetic stones.",
            "Traditional weight guidance is about one ratti per 10 kg of body weight, with a minimum of three ratti; "
            "the substitute stones are worn slightly heavier.",
            f"Set it so the stone touches the skin, in {gem['metal']}, for the {gem['finger']} of the working hand.",
            f"Wear it first on a {gem['day']} during the planet's hora, after washing it in raw milk and Ganga water "
            f"and reciting {rem['mantra']} 108 times.",
            "Observe a trial of two to four weeks. Remove it if you notice disturbed sleep, irritation or a run of setbacks.",
            "Clean it monthly; re-energise with the mantra on the planet's weekday.",
        ]), H("If you prefer not to wear a stone"),
            P(f"Mantra, charity and conduct strengthen a planet as well. For {pname(lord)}: recite {rem['mantra']} on "
              f"{rem['day']}s, give {rem['charity']}, and {rem['practice']}.")],
            "Selection, wearing method and alternatives.", brk=False))
        subtitle = "The gemstone chosen for your ascendant, supporting stones, cautions and how to wear it"
    else:
        mukhi, deity, gift = K.RUDRAKSHA[lord]
        summary = [f"**Primary bead: {mukhi} Rudraksha** for {pname(lord)}, your ascendant lord."]
        dasha_lord = (antar or maha or {}).get("lords", [lord])[-1]
        if dasha_lord != lord:
            summary.append(f"Supporting bead for the running {pname(dasha_lord)} period: {K.RUDRAKSHA[dasha_lord][0]}.")
        sections = [_cover(ctx, "Recommendation in brief", summary, _how_to_read("rudraksha"))]
        blocks = [CALL("Primary recommendation", [f"**{mukhi} Rudraksha** — associated with {deity} and with {pname(lord)}.",
                       f"{pname(lord)} rules your {ctx.r['lagna']['sign_name']} ascendant. This bead is traditionally "
                       f"worn for {gift}."], "good", "Recommended"),
                  FACTS([("Bead", f"{mukhi} Rudraksha"), ("Deity", deity), ("Planet", pname(lord)),
                         ("Thread", "Red or yellow silk, or silver"), ("Start on", "Monday morning"), ("Mantra", "Om Namah Shivaya")]),
                  H("Strength of your key planets"), FLOW(V.Bars(bars))]
        if dasha_lord != lord:
            dm, dd, dg = K.RUDRAKSHA[dasha_lord]
            blocks += [H(f"For the running {pname(dasha_lord)} period: {dm} Rudraksha"),
                       P(f"You are in a {pname(dasha_lord)} period. {pname(dasha_lord)} {ctx.lord_phrase(dasha_lord)}. "
                         f"A {dm} bead ({dd}) is traditionally worn for {dg} and can be combined with the primary bead.")]
        sections.append(chapter(title, blocks, "The bead chosen from your ascendant lord and running period.", sample=True))
        sections.append(chapter("How to wear and care for it", [BUL([
            "Choose a genuine bead with naturally formed, clearly visible mukhis; ask for an X-ray or lab certificate for rare mukhis.",
            "Soak it overnight in water or raw milk, then rinse and dry it before first wear.",
            "Wear it on a Monday morning after bathing, reciting Om Namah Shivaya 108 times.",
            "Remove it before sleeping, bathing with soap, and at cremation grounds, per tradition.",
            "Oil it lightly with sandalwood or mustard oil every few months to keep it from drying.",
        ]), H("Practice alongside the bead"), P(f"Recite {K.REMEDY[lord]['mantra']} on {K.REMEDY[lord]['day']}s and "
                                               f"{K.REMEDY[lord]['practice']}.")], "Wearing method and care.", brk=False))
        subtitle = "The rudraksha chosen for your ascendant and running period, with wearing method"
    sections.append(_remedies_chapter(ctx))
    return item["name"], subtitle, sections


KOOTA_MEANING = {
    "varna": "spiritual and ego compatibility", "vashya": "mutual attraction and influence",
    "tara": "birth-star harmony and wellbeing", "yoni": "physical and instinctive compatibility",
    "maitri": "friendship between the Moon-sign lords — mental compatibility", "gana": "temperament (deva, manushya, rakshasa)",
    "bhakoot": "emotional rhythm, finances and family welfare", "nadi": "constitution and health of progeny",
}


def _match(ctx, ctx2, item):
    c1, c2, r1, r2 = ctx.c, ctx2.c, ctx.r, ctx2.r
    m = match_charts(c1, c2, r1, r2)
    n1, n2 = m["person1"]["name"], m["person2"]["name"]
    total = m["total"]
    verdict = ("Excellent agreement" if total >= 32 else "Good agreement" if total >= 24 else
               "Acceptable agreement" if total >= 18 else "Below the traditional threshold")
    tone = "good" if total >= 24 else ("gold" if total >= 18 else "caution")
    d1, d2 = manglik(c1)[0], manglik(c2)[0]
    tiles = [("Guna score", f"{total:g} / 36", m["band"]),
             (f"{n1} · Moon", m["person1"]["moon"]["sign"], m["person1"]["moon"]["nakshatra"]),
             (f"{n2} · Moon", m["person2"]["moon"]["sign"], m["person2"]["moon"]["nakshatra"]),
             ("Manglik", f"{'Yes' if d1['present'] else 'No'} / {'Yes' if d2['present'] else 'No'}", "partner 1 / partner 2")]
    summary = [f"**{total:g} of 36 gunas — {verdict.lower()}.**",
               "18 is the traditional minimum; 24 and above is considered good."]
    sections = [_cover(ctx, "Match in brief", summary, _how_to_read("match"), name=f"{n1} & {n2}",
                       meta=f"{n1}: {_birth_line(r1).replace('Born ', '')}\n{n2}: {_birth_line(r2).replace('Born ', '')}",
                       tiles=tiles, chart=False)]
    low = sorted([k for k in m["kootas"] if k["score"] < k["max"]], key=lambda k: k["score"] / k["max"])[:3]
    full = [k for k in m["kootas"] if k["score"] == k["max"]]
    sections.append(chapter("Match summary", [
        FLOW(V.Gauge(total, 36, [(18, "caution", "below 18"), (24, "gold", "18–24 acceptable"), (32, "good", "24–32 good"),
                                 (36, "good", "32+ excellent")], verdict)),
        CALL("What the score means", [f"**{verdict}.** {m['band']}.",
             f"Full marks on {_join([k['name'].split(' ·')[0] for k in full]) or 'no factor'}; "
             f"the weakest factors are {_join([k['name'].split(' ·')[0] for k in low]) or 'none'}."], tone, f"{total:g}/36"),
        FLOW(V.Bars([(k["name"].split(" ·")[0], k["score"], k["max"],
                      "good" if k["score"] >= k["max"] * .75 else ("gold" if k["score"] > 0 else "caution")) for k in m["kootas"]],
                    show_max=True)),
        NOTE(m["direction"] + " " + m["method"]),
    ], "Ashtakoota guna milan for the two charts.", sample=True))
    from vedic.compat import full_match
    girl_first = not (c1.birth.gender == "male" and c2.birth.gender == "female")
    fm = full_match(*((c1, c2, r1, r2) if girl_first else (c2, c1, r2, r1)), ctx.now)
    adj = (f" After the classical exceptions the score is **{fm['adjusted_score']:g}/36**."
           if fm["adjusted_score"] != fm["score"] else "")
    sections.append(chapter("The complete verdict", [
        CALL(fm["verdict"], [f"Guna Milan **{fm['score']:g}/36**.{adj}",
                             "This verdict also weighs Mangal Dosha on both sides, each person's own marriage promise, "
                             "the navamsha and shared timing."],
             {"good": "good", "gold": "gold"}.get(fm["tone"], "caution"), fm["verdict"].split()[0]),
        H("Why"), BUL(fm["reasons"]),
        H("What to watch"), BUL(fm["watch"] or ["Nothing stands out beyond ordinary care and honest conversation."]),
        H("Remedies"), BUL(fm["remedies"]),
    ], "Beyond the 36-point score: what a careful astrologer weighs."))
    rows = [[k["name"].split(" ·")[0], f"{k['score']:g} / {k['max']:g}", KOOTA_MEANING.get(k["key"], ""),
             f"{k['person1']} / {k['person2']}", k["interpretation"]] for k in m["kootas"]]
    sections.append(chapter("The eight factors explained", [
        P("Each koota compares one quality of the two Moons. Higher-weighted factors (Nadi 8, Bhakoot 7, Gana 6) "
          "matter most; a zero there deserves discussion, while a low score on a light factor matters less."),
        TABLE(["Koota", "Score", "Measures", f"{n1} / {n2}", "Reading"], rows, [.8, .6, 1.5, 1.1, 2.2], 7.4,
              highlight=[(i, 1, "good" if k["score"] >= k["max"] * .75 else ("gold" if k["score"] > 0 else "caution"))
                         for i, k in enumerate(m["kootas"])]),
    ], "What each koota measures and how the two charts compare.", brk=False))
    from vedic.porutham import porutham
    pr = porutham(c1, c2, ctx.now)
    tones = {True: "good", None: "gold", False: "caution"}
    sandhi = pr["dasha_sandhi"]
    sections.append(chapter("Porutham: South Indian matching", [
        P("South Indian families match horoscopes with the ten Poruthams, counted from the bride's birth star to the "
          "groom's. Rajju and Vedha are decisive: if either fails, tradition does not recommend the match whatever the "
          "other scores. The remaining eight are counted as agreeing or not."),
        CALL("Porutham result", [f"**{pr['verdict']}.** {pr['agree']} of 10 poruthams agree"
                                 + (f" and {pr['partly']} partly" if pr["partly"] else "") + ".",
                                 f"Bride's star {pr['bride_star']} · groom's star {pr['groom_star']} · count {pr['count']}."],
             pr["tone"], f"{pr['agree']}/10"),
        TABLE(["Porutham", "Result", "Details", "What it protects"],
              [[x["name"] + (" (key)" if x["weight"] == "decisive" else ""), x["status"], x["detail"], cap(x["meaning"])]
               for x in pr["rows"]], [1, .9, 2.3, 1.8], 7.8,
              highlight=[(i, 1, tones[x["ok"]]) for i, x in enumerate(pr["rows"])]),
        NOTE("(key) marks a decisive porutham. Bride and groom follow the genders on the charts; otherwise partner 1 is read as the bride."),
        H("Papasamyam (balance of malefics)"),
        FACTS([(f"{pr['bride_name']} ({'bride' if pr['genders_known'] else 'partner 1, as bride'})", f"{pr['papa']['bride']:g} points"),
               (f"{pr['groom_name']} ({'groom' if pr['genders_known'] else 'partner 2, as groom'})", f"{pr['papa']['groom']:g} points"),
               ("Result", "Balanced" if pr["papa"]["ok"] else "Bride's side heavier")], cols=3),
        P("Malefics (Mars, Saturn, Rahu, Ketu and, at half weight, the Sun) in the 1st, 2nd, 4th, 7th, 8th or 12th "
          "house are counted from the ascendant, the Moon and Venus. Tradition is satisfied when the groom's total is "
          "equal to or greater than the bride's. "
          + ("That holds here." if pr["papa"]["ok"] else "Here the bride's total is higher, which astrologers weigh "
             "with the rest of the match rather than reject outright.")),
        H("Dasha Sandhi"),
        P("Dasha Sandhi is the junction of major planetary periods. When both partners change major period within a "
          "few months of each other, tradition advises extra care in those months.")
        if not sandhi else
        P("Both partners change major period within six months of each other around "
          + _join([f"{min(a, b):%b %Y}" for a, b in sandhi]) + ". Tradition advises extra patience and care in those months."),
        NOTE("No Dasha Sandhi falls in the next 30 years." if not sandhi else "Checked over the next 30 years."),
    ], "The ten Poruthams, Papasamyam and Dasha Sandhi.", brk=True))
    ind1, ind2 = m["person1"]["relationship_indicators"], m["person2"]["relationship_indicators"]
    sections.append(chapter("The two charts side by side", [
        FLOW(V.SideBySide(V.chart_from_report(r1, "D1", n1, 74 * mm), V.chart_from_report(r2, "D1", n2, 74 * mm))),
        TABLE(["Indicator", n1, n2], [
            ["7th house (partnership)", ind1["seventh_house"], ind2["seventh_house"]],
            ["Venus", ind1["venus"], ind2["venus"]],
            ["Navamsha ascendant", ind1["d9_lagna"], ind2["d9_lagna"]],
            ["Navamsha 7th house", ind1["d9_seventh_house"], ind2["d9_seventh_house"]],
            ["Ascendant", r1["lagna"]["sign_name"], r2["lagna"]["sign_name"]],
        ], [1.3, 1.6, 1.6], 8),
        P("Beyond the Moon-based score, astrologers compare each person's 7th house and Venus. Harmonious elements "
          "and friendly 7th lords add to the match; a strong 7th house in both charts makes commitment easier."),
    ], "Birth charts and the relationship indicators of both partners."))
    cancels = []
    nadi = next(k for k in m["kootas"] if k["key"] == "nadi")
    if nadi["score"] == 0:
        if c1.sign["MOON"] == c2.sign["MOON"] and int(c1.lon["MOON"] // (360 / 27)) != int(c2.lon["MOON"] // (360 / 27)):
            cancels.append("Nadi dosha: same Moon sign with different nakshatras is a classical cancellation.")
        elif SIGN_LORD[c1.sign["MOON"]] == SIGN_LORD[c2.sign["MOON"]]:
            cancels.append("Nadi dosha: both Moon signs share a lord — a commonly cited cancellation.")
        else:
            cancels.append("Nadi dosha is present without a standard cancellation; discuss health and family planning openly.")
    bhakoot = next(k for k in m["kootas"] if k["key"] == "bhakoot")
    if bhakoot["score"] == 0:
        from vedic.chart import natural_relation
        l1, l2 = SIGN_LORD[c1.sign["MOON"]], SIGN_LORD[c2.sign["MOON"]]
        if l1 == l2 or natural_relation(l1, l2) == "Friend":
            cancels.append("Bhakoot dosha is cancelled: the Moon-sign lords are the same or natural friends.")
        else:
            cancels.append("Bhakoot dosha is present without a standard cancellation; align on finances and family expectations.")
    if d1["present"] and d2["present"]:
        cancels.append("Both charts are Manglik, which classically cancels the Manglik mismatch.")
    elif d1["present"] != d2["present"]:
        cancels.append("Only one chart is Manglik — the classic mismatch. Its weight depends on severity and cancellations in that chart.")
    sections.append(chapter("Doshas and cancellations", [
        TABLE(["Check", n1, n2], [
            ["Manglik (Kuja)", f"{'Present · ' + d1['severity'] if d1['present'] else 'Not present'}", f"{'Present · ' + d2['severity'] if d2['present'] else 'Not present'}"],
            ["Kaal Sarp", "Present" if kaal_sarp(c1)[0]["present"] else "Not present", "Present" if kaal_sarp(c2)[0]["present"] else "Not present"],
            ["Moon nakshatra", m["person1"]["moon"]["nakshatra"], m["person2"]["moon"]["nakshatra"]],
        ], [1.3, 1.6, 1.6], 8.4),
        H("Cancellation review"), BUL(cancels or ["No dosha in the match needs cancelling."]),
        NOTE("The 36-point total above is the base score; cancellations are listed for review and do not change it."),
    ], "Manglik, Nadi and Bhakoot doshas and whether they cancel.", brk=False))
    sections.append(chapter("What to talk about", [
        P("A score is a starting point. These are the conversations the chart comparison suggests:"),
        BUL(m["practical_focus"]),
        CALL("Bottom line", [f"**{verdict} ({total:g}/36).** " + ("The traditional factors support this match; "
                             "the conversations above will make it stronger." if total >= 18 else
                             "The traditional factors are below the usual threshold. Many good marriages exist below it; "
                             "weigh the doshas and cancellations above with an astrologer and with each other."),
                             m["caution"]], tone),
    ], "Practical focus for the couple.", brk=False))
    return item["name"], f"Ashtakoota compatibility for {n1} and {n2}, with doshas and practical guidance", sections


def _appendix(ctx, brk=True):
    r = ctx.r
    rows = [[pname(g), p["sign_name"], p["dms"], str(p["house"]), f"{p['nakshatra']} · {p['pada']}",
             p["dignity"]["status"] + (" · R" if p["retrograde"] else "")] for g, p in r["planets"].items()]
    houses = [[str(h["house"]), h["sign_name"], pname(h["lord"]), ", ".join(pname(x) for x in h["occupants"]) or "—",
               ", ".join(pname(x) for x in h["aspected_by"]) or "—"] for h in r["houses"]]
    p = r["panchang"]
    vrows = []
    for key, v in r["vargas"].items():
        vrows.append([key, v["domain"], v["lagna"]["sign_name"],
                      " ".join(f"{V.ABBR[g]}·{pl['sign_name'][:3]}" for g, pl in v["planets"].items())])
    guidance = r.get("birth_time_guidance") or {}
    blocks = [H("Planetary positions"), TABLE(["Planet", "Sign", "Degree", "House", "Nakshatra · pada", "Dignity"], rows,
                                              [.75, .9, .85, .5, 1.4, 1.3], 8),
              H("Houses"), TABLE(["House", "Sign", "Lord", "Occupants", "Aspected by"], houses, [.5, 1, .8, 1.6, 1.6], 8),
              H("Panchang at birth"),
              FACTS([("Tithi", f"{p['tithi']['paksha']} {p['tithi']['name']}"), ("Vara", p["vara"]["name"]),
                     ("Nakshatra", f"{p['nakshatra']['name']} · {p['nakshatra']['pada']}"), ("Yoga", p["yoga"]["name"]),
                     ("Karana", p["karana"]["name"]), ("Sunrise", str(p.get("sunrise") or "—")[11:16] or "—")]),
              H("Divisional charts"),
              TABLE(["Chart", "Domain", "Ascendant", "Planet signs"], vrows, [.45, 1.3, .7, 3.6], 6.6)]
    if guidance:
        blocks += [H("Birth-time sensitivity"),
                   P(f"Robustness of the supplied birth time: {guidance.get('summary', '')}."),
                   BUL(guidance.get("recommendations") or [])]
    from . import report_extras as X
    blocks += X.bav_blocks(ctx)
    return chapter("Technical appendix", blocks, "The calculated data behind every conclusion in this report.", brk=brk)


def _core(ctx):
    r = ctx.r
    sections = [_cover(ctx, "Your chart in brief", [
        f"**{r['lagna']['sign_name']} ascendant**, Moon in **{ctx.planet('MOON')['sign_name']}** ({ctx.planet('MOON')['nakshatra']}).",
        f"Running period: **{(ctx.running()[1] or ctx.running()[0] or {}).get('label', '—').replace('-', '–')}**.",
        "Inside: charts, planets, houses, divisional charts, dashas and transits — each explained."],
        _how_to_read("core"))]
    from . import report_extras as X, report_lalkitab as LK
    sections += [_chart_chapter(ctx), _identity_chapter(ctx), X.avakhada_chapter(ctx), X.numerology_chapter(ctx),
                 _strength_chapter(ctx), X.bhava_chapter(ctx), X.kp_chapter(ctx),
                 LK.lal_kitab_chapter(ctx)]
    keys = [k for k in ("D9", "D10", "D7", "D2", "D3", "D4", "D12", "D60", "D24") if k in r["vargas"]]
    grid = V.ChartGrid([V.chart_from_report(r, k, f"{k} · {r['vargas'][k]['name']}", 50 * mm) for k in keys], cols=3)
    sections.append(chapter("Divisional charts", [
        P("Divisional charts (vargas) divide each sign into finer parts to examine one area of life. They depend on an "
          "accurate birth time — the higher the division, the more sensitive it is."),
        FLOW(grid, 2),
        BUL([f"**{k} {r['vargas'][k]['name']}** — {r['vargas'][k]['domain']}; ascendant {r['vargas'][k]['lagna']['sign_name']}." for k in keys]),
    ], "Navamsha, Dashamsha and the other key vargas."))
    sections.append(_dasha_chapter(ctx, 5))
    transits = r.get("transits") or {}
    trows = [[pname(g), p["sign_name"], f"{p['degree']:.1f}°", ordinal(p["house_from_lagna"]), ordinal(p["house_from_moon"]),
              "Yes" if p["retrograde"] else "—"] for g, p in transits.get("positions", {}).items()]
    ss = transits.get("sade_sati", {})
    jup_h = transits.get("positions", {}).get("JUPITER", {}).get("house_from_moon")
    sat_h = transits.get("positions", {}).get("SATURN", {}).get("house_from_moon")
    sections.append(chapter("Current transits", [
        P(f"Where the planets are now ({_dmy(transits.get('at', ctx.now))}), counted from your ascendant and from your Moon."),
        TABLE(["Planet", "Sign", "Degree", "From ascendant", "From Moon", "Retrograde"], trows, [.9, 1.1, .7, 1, .9, .8], 8),
        H("What the slow planets are doing"),
        P(K.JUPITER_FROM_MOON[jup_h][1] if jup_h else ""), P(K.SATURN_FROM_MOON[sat_h][1] if sat_h else ""),
        CALL("Sade Sati", f"{'Running — ' + ss.get('phase', '') if ss.get('active') else 'Not running now'}.",
             "caution" if ss.get("active") else "good"),
    ], "The sky today, read against your birth chart."))
    sections.append(_remedies_chapter(ctx))
    sections.append(_appendix(ctx))
    return "Your Vedic Kundli", "Birth chart, planets, houses, divisional charts, dashas and transits — explained", sections


def build_report(product_key, c, report, c2=None, report2=None, now=None):
    ctx = Ctx(c, report, now)
    if product_key == "core":
        return _core(ctx)
    item = PRODUCTS[product_key]
    kind = item["kind"]
    if kind == "match":
        if c2 is None or report2 is None:
            raise ValueError("Two charts are required for matchmaking")
        return _match(ctx, Ctx(c2, report2, now), item)
    if kind == "life":
        return _life(ctx, item)
    if kind == "sade_sati":
        return _sade_sati(ctx, item)
    if kind == "dosha":
        return _dosha(ctx, item)
    if kind == "marriage":
        return _marriage(ctx, item)
    if kind in ("gemstone", "rudraksha"):
        return _suggestion(ctx, item, kind)
    if kind == "child":
        from . import report_child
        return report_child.build(ctx, item)
    raise ValueError(f"Unknown report kind {kind!r}")
