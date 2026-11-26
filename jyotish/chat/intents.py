"""Question understanding and human-voiced, rule-based answers for the built-in Kundli reader.

A question is split into its parts ("Will I marry, and will my husband be supportive?" is two questions), each
part is matched to an intent (when, a specific year, remedies, gemstone, personality, Sade Sati, a hard phase,
career choice, love vs arranged, government job, business vs job, a legal case, a good day to act, a relative,
or a plain question about a life area), and each intent has its own answer written the way an experienced
astrologer would speak: the direct answer first, then the reasons, then what to do. Every statement is computed
from the chart."""
from __future__ import annotations

import re
from datetime import datetime, timedelta, timezone

from vedic.constants import NAKSHATRAS, SIGN_LORD, SIGNS

from .judgment import HEALTH_LEAN, judge
from .near_term import GOOD_TARA, CHANDRABALA_GOOD, analyse as near_term, good_days
from .topics import TOPICS, detect_topic

NAK_SPAN = 360 / 27
GRAHAS = ["SUN", "MOON", "MARS", "MERCURY", "JUPITER", "VENUS", "SATURN", "RAHU", "KETU"]
DUSTHANA = {6, 8, 12}

INTENTS = [
    ("sade_sati", r"sade\s*-?\s*sati|saade\s*saati|shani\s*(dhaiya|dhaiyya)|saturn('s)? transit"),
    ("remedies", r"remed|upay|upaay|totka|what should i do to (improve|fix|reduce)|how (can|do) i (improve|fix|reduce)"),
    ("gemstone", r"gem\s?stone|\bgem\b|\bstone\b|ratna|rudraksh|which ring"),
    ("personality", r"personality|my nature|strengths?|weakness|who am i|my character|temperament|what am i like|"
                    r"good at|talents?"),
    ("career_choice", r"which (career|field|profession|line|job|sector|stream)|career (suits|options|path)|"
                      r"what (career|profession|field|kind of (job|work))|best career|suitable career|career for me"),
    ("love_arranged", r"love (or|vs\.?|versus) arranged|arranged (or|vs\.?|versus) love|love marriage|arranged marriage|"
                      r"marry (my )?(boyfriend|girlfriend|lover)"),
    ("govt_job", r"government job|govt\.? job|\bgovt\b|sarkari|public sector|\bpsu\b|\bias\b|\bupsc\b|\bssc\b|"
                 r"civil service|bank (po|job)|railway job"),
    ("business_job", r"business (or|vs\.?|versus) (a )?job|job (or|vs\.?|versus) (a )?business|(own|my own|a) business|"
                     r"self.?employ|start(ing)? up\b|startup|entrepreneur"),
    ("legal", r"court|legal|lawsuit|litigation|\bcase\b|police|dispute|\bfir\b|property dispute|judgement|verdict"),
    ("muhurta", r"good (time|day|date) to|auspicious (day|date|time)|muhurat|right time to (sign|start|buy|launch|begin|"
                r"meet|move|travel)|should i (sign|start|launch) (it )?(today|tomorrow|this week)"),
    ("bad_time", r"bad (time|phase|period|luck)|tough (time|phase)|difficult (time|phase)|hard (time|phase)|"
                 r"struggl|suffering|delays?|obstacles?|why (am i|is my life|is everything)|nothing (is )?work|"
                 r"when will (things|my life|life|time) (improve|get better|change)|(phase|time) (end|be over)"),
]
RELATIVES = {
    "father": (9, "SUN", "your father"), "dad": (9, "SUN", "your father"), "papa": (9, "SUN", "your father"),
    "mother": (4, "MOON", "your mother"), "mom": (4, "MOON", "your mother"), "mummy": (4, "MOON", "your mother"),
    "wife": (7, "VENUS", "your wife"), "husband": (7, "JUPITER", "your husband"), "spouse": (7, "VENUS", "your spouse"),
    "son": (5, "JUPITER", "your son"), "daughter": (5, "JUPITER", "your daughter"),
    "brother": (3, "MARS", "your brother"), "sister": (3, "MARS", "your sister"),
}
CAREER_FIELDS = {
    "SUN": "government, administration, management, politics or medicine",
    "MOON": "hospitality, healthcare and nursing, food, travel, public-facing roles or psychology",
    "MARS": "engineering, defence or police, sports, surgery, real estate or technical work",
    "MERCURY": "business and trade, accounts, IT and data, writing, media or teaching",
    "JUPITER": "teaching, law, banking and finance, advisory work or counselling",
    "VENUS": "the arts, design, fashion, entertainment, luxury goods, hospitality or beauty",
    "SATURN": "engineering and manufacturing, research, law and judiciary, mining, oil or long, structured projects",
    "RAHU": "technology, foreign companies, aviation, media, research or unconventional fields",
    "KETU": "research, programming, analysis, alternative medicine or spiritual work",
}
GEM = {"SUN": "Ruby", "MOON": "Natural pearl", "MARS": "Red coral", "MERCURY": "Emerald", "JUPITER": "Yellow sapphire",
       "VENUS": "Diamond or white sapphire", "SATURN": "Blue sapphire", "RAHU": "Hessonite", "KETU": "Cat's eye"}
REMEDY = {
    "SUN": ("Sunday", "Om Suryaya Namah", "offer water to the rising Sun and keep your word with seniors"),
    "MOON": ("Monday", "Om Somaya Namah", "protect your sleep and spend time with your mother or near water"),
    "MARS": ("Tuesday", "Om Angarakaya Namah", "exercise daily and turn anger into disciplined effort"),
    "MERCURY": ("Wednesday", "Om Budhaya Namah", "study, journal and keep your speech honest in business"),
    "JUPITER": ("Thursday", "Om Gurave Namah", "respect teachers, learn something meaningful and support education"),
    "VENUS": ("Friday", "Om Shukraya Namah", "be kind in relationships and keep pleasures in moderation"),
    "SATURN": ("Saturday", "Om Shanaischaraya Namah", "keep punctual routines and serve without expecting anything back"),
    "RAHU": ("Saturday", "Om Rahave Namah", "avoid shortcuts and intoxicants and keep ambitions ethical"),
    "KETU": ("Tuesday", "Om Ketave Namah", "meditate and let go of what is complete"),
}
NATURE = {
    "SUN": "confidence and leadership", "MOON": "empathy and emotional intelligence", "MARS": "courage and drive",
    "MERCURY": "quick thinking and communication", "JUPITER": "wisdom and good judgement",
    "VENUS": "charm, taste and a gift for relationships", "SATURN": "discipline and staying power",
    "RAHU": "ambition and originality", "KETU": "intuition and depth",
}
LAGNA_VOICE = [
    "direct, energetic and quick to start things", "steady, loyal and practical", "curious, witty and adaptable",
    "caring, protective and intuitive", "warm, proud and generous", "precise, helpful and analytical",
    "diplomatic, fair-minded and refined", "intense, private and resilient", "principled, optimistic and outspoken",
    "disciplined, responsible and ambitious", "independent, inventive and idealistic", "gentle, imaginative and compassionate",
]
MONTH_NAMES = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october",
               "november", "december"]


def _ord(n: int) -> str:
    return f"{n}{'th' if 10 <= n % 100 <= 20 else {1: 'st', 2: 'nd', 3: 'rd'}.get(n % 10, 'th')}"


def _t(g: str) -> str:
    return g.title()


def _join(items) -> str:
    items = [i for i in items if i]
    return items[0] if len(items) == 1 else ", ".join(items[:-1]) + " and " + items[-1] if items else ""


def _my(d) -> str:
    return f"{d:%B %Y}"


def _day(d) -> str:
    return f"{d:%A} {d.day} {d:%B %Y}"


def _strip(text: str) -> str:
    return re.sub(r"<fact[^>]*>(.*?)</fact>", r"\1", text or "").strip()


def _lc(text: str) -> str:
    """Lower-case the first letter only when it starts with an ordinary word, never a planet or proper name."""
    first = text.split(" ", 1)[0].lower()
    return text[:1].lower() + text[1:] if first in ("the", "a", "an", "your", "this", "its", "their", "counted") else text


def _date(iso: str) -> str:
    d = datetime.fromisoformat(str(iso)[:10])
    return f"{d.day} {d:%B %Y}"


# ---------------------------------------------------------------- understanding the question

def split_parts(question: str) -> list[str]:
    """Split a multi-part question into its parts, keeping each part self-contained."""
    q = re.sub(r"\s+", " ", question.strip())
    pieces = [p.strip() for p in re.split(r"\?+", q) if p.strip()]
    out = []
    for piece in pieces:
        sub = re.split(r"\s*(?:,\s*)?\b(?:and|also|plus)\s+(?=(?:will|when|is|are|should|how|what|which|can|do|does|"
                        r"would|am|my|whether|why)\b)", piece, flags=re.I)
        out += [s.strip(" ,.") for s in sub if len(s.strip(" ,.")) > 3]
    return out or [question]


def intent_of(part: str) -> str:
    p = part.lower()
    for key, rx in INTENTS:
        if re.search(rx, p):
            return key
    rel = next((w for w in RELATIVES if re.search(rf"\b{w}('s)?\b", p)), None)
    if rel and not re.search(r"\b(my|our) (own )?(marriage|wedding)\b", p) and \
            re.search(r"health|well|recover|improve|surgery|hospital|life|future|career|job|marri|okay|fine|support|settled|"
                      r"nature|rich|kind|caring|loyal|look|educated|family|like", p):
        return "relative:" + rel
    if re.search(r"\b20\d\d\b", p) or re.search(r"\b(this|next|coming) year\b", p):
        return "year"
    if re.search(r"\bwhen\b|\bhow soon\b|\bby when\b|\bwhich (year|month)\b|\bhow long\b", p):
        return "when"
    return "topic"


def topic_of(part: str, intent: str):
    p = part.lower()
    if re.search(r"\b(house|home|flat|apartment|land|plot|property|car|vehicle)\b", p) and \
            re.search(r"\b(buy|purchase|own|get|construct|build)\b", p):
        return TOPICS["property"]
    if intent in ("love_arranged",):
        return TOPICS["marriage"]
    if intent in ("career_choice", "govt_job", "business_job"):
        return TOPICS["career"]
    t = detect_topic(part)
    if t.key in ("timing", "year", "month") and intent in ("when", "year", "topic"):
        for key, rx in (("marriage", r"marr(y|i)|wedding|spouse|partner|love|shaadi|shadi"), ("career", r"job|career|promotion|work"),
                        ("money", r"money|rich|wealth|income|financ|debt|loan"), ("children", r"child|baby|son|daughter"),
                        ("foreign", r"abroad|foreign|visa|settle"), ("education", r"exam|study|college|degree"),
                        ("health", r"health|illness|recover")):
            if re.search(rx, p):
                return TOPICS[key]
    return t


# ---------------------------------------------------------------- shared reasoning helpers

class Ctx:
    def __init__(self, chart, report, now):
        self.c, self.r, self.now = chart, report, now
        self._j = {}

    def j(self, topic):
        if topic.key not in self._j:
            self._j[topic.key] = judge(self.c, self.r, topic, self.now)
        return self._j[topic.key]

    def strength(self, g):
        return (self.r.get("planet_strength") or {}).get(g, {}).get("score")

    def lord_houses(self, g):
        return [h for h, lord in self.c.house_lord.items() if lord == g]

    def running(self):
        chain = self.c.dasha.running(self.now, depth=2)
        return (chain[0] if chain else None), (chain[1] if len(chain) > 1 else None)


def _lean_phrase(lean: str, health=False) -> str:
    if health:
        return HEALTH_LEAN.get(lean, lean)
    return {"strong": "clearly in your favour", "supportive": "in your favour, with one condition to respect",
            "mixed": "genuinely mixed — real support, real friction", "demanding": "asking for patience and structure"}.get(lean, lean)


def _verdict_word(lean: str) -> str:
    return {"strong": "Yes — the chart is clearly on your side.", "supportive": "Yes, very likely — with one condition.",
            "mixed": "It can happen, but it won't be handed to you.", "demanding": "Not easily, and not quickly."}.get(lean, "")


def _windows_text(ctx, topic, limit=2, after=None, before=None) -> list[str]:
    j = ctx.j(topic)
    lines = []
    for w in j.windows:
        if after and w.end < after or before and w.start > before:
            continue
        label = "–".join(_t(x) for x in w.dasha.lords)
        trigger = ""
        if w.double_transit:
            a, b = w.double_transit[0], w.double_transit[1]
            trigger = f", with the strongest push between {_my(a)} and {_my(b)} when Jupiter and Saturn both reach the area"
        lines.append(f"**{_my(w.start)} – {_my(w.end)}** (the {label} period{trigger})")
        if len(lines) >= limit:
            break
    return lines


# ---------------------------------------------------------------- answers by intent

def answer_topic(ctx, part, topic, mode="topic"):
    j = ctx.j(topic)
    health = topic.key == "health"
    q = part.lower()
    yes_no = bool(re.match(r"\s*(will|is|am|are|can|do|does|would|could|shall)\b", q))
    nt = near_term(ctx.c, topic, part, ctx.now)
    lead = []
    if nt:
        best = ", ".join(_my(m.start) for m in nt.best)
        lead.append(f"Looking at the months you asked about, the best stretch is **{best}**"
                    + (f" — {next((r[2] for r in nt.best[0].reasons if r[0]), '')}" if nt.best and any(r[0] for r in nt.best[0].reasons) else "")
                    + ".")
        if nt.hardest:
            lead.append(f"Be more careful in **{_my(nt.hardest.start)}**.")
    if yes_no and not health:
        lead.insert(0, _verdict_word(j.lean))
    elif not nt:
        lead.insert(0, f"For {topic.label.lower()}, your chart is {_lean_phrase(j.lean, health)}.")
    why = [f.text for f in j.drivers[:2]]
    body = []
    if why:
        body.append("Here's why I say that: " + "; and ".join(_lc(w) for w in why) + ".")
    if j.counterweights:
        cw = j.counterweights[0].text
        body.append(f"What asks for care is this: {_lc(cw)}.")
    wins = _windows_text(ctx, topic)
    if wins and mode != "year":
        body.append("As for timing, the periods that matter most are " + _join(wins) + ".")
    elif not wins:
        body.append("No single period ahead is tied tightly to this, so progress here comes from steady effort rather "
                    "than one big moment.")
    if nt and nt.days and nt.event:
        body.append("If you have a meeting or decision to plan, good days are " + _join([_day(t) for t, _ in nt.days[:4]]) + ".")
    tip = topic.actions[0] if topic.actions else ""
    if tip:
        body.append(f"My practical advice: {_lc(tip)}")
    return " ".join(lead), body


def answer_when(ctx, part, topic):
    j = ctx.j(topic)
    wins = _windows_text(ctx, topic, limit=3)
    if not wins:
        return (f"I'll be honest: your chart doesn't point to one sharp date for this in the next few years.",
                [f"For {topic.label.lower()} the chart is {_lean_phrase(j.lean, topic.key == 'health')}, and "
                 "progress here builds through effort rather than a single event. Watch the months when your running "
                 f"period changes — {_strip(j.activation_now).split('.')[0]}."])
    first = wins[0]
    lead = f"The most likely window is {first}."
    body = []
    if len(wins) > 1:
        body.append("If it doesn't happen then, the next opportunities are " + _join(wins[1:]) + ".")
    why = [f.text for f in j.drivers[:2]]
    if why:
        body.append("I'm basing this on the chart itself: " + "; and ".join(_lc(w) for w in why)
                    + ". These periods activate exactly that.")
    if j.windows and j.windows[0].double_transit:
        body.append("Within a window, the stretch where Jupiter and Saturn both reach the area is when things usually move "
                    "from talk to action.")
    running = j.activation_now.split(". ")[0]
    if running:
        body.append(f"For context, here is what is running now: {_lc(running)}.")
    body.append("Treat these as the times to push, apply and say yes — not dates when something will happen to you "
                "without effort.")
    return lead, body


def answer_year(ctx, part, topic):
    m = re.search(r"\b(20\d\d)\b", part)
    year = int(m.group(1)) if m else (ctx.now.year + (1 if re.search(r"next year", part.lower()) else 0))
    start = max(ctx.now, datetime(year, 1, 1, tzinfo=timezone.utc))
    end = datetime(year, 12, 31, 23, tzinfo=timezone.utc)
    if end < ctx.now:
        return f"{year} has already passed, so let me answer for the time ahead instead.", answer_topic(ctx, part, topic)[1]
    nt = near_term(ctx.c, topic, "next 12 months", start)
    months = [mm for mm in (nt.months if nt else []) if mm.start.year == year]
    wins = _windows_text(ctx, topic, limit=2, after=start, before=end)
    good = [mm for mm in months if mm.label in ("strong", "favourable")]
    if wins and good:
        lead = (f"Yes, {year} looks genuinely promising for {topic.label.lower()}. The window {wins[0]} falls in that "
                f"year, and the strongest months are **{_join([_my(x.start) for x in good[:3]])}**.")
    elif wins:
        lead = f"{year} has potential: the window {wins[0]} overlaps it, though the monthly transits are mixed."
    elif good:
        lead = (f"{year} is supportive rather than decisive: there's no major period trigger, but "
                f"**{_join([_my(x.start) for x in good[:3]])}** are your better months to act.")
    else:
        lead = f"{year} is more of a building year for {topic.label.lower()} than a breakthrough year."
    body = []
    hard = [mm for mm in months if mm.label == "demanding"]
    if hard:
        body.append(f"Go easier in {_join([_my(x.start) for x in hard[:2]])}.")
    j = ctx.j(topic)
    if j.drivers:
        d = j.drivers[0].text
        body.append(f"Underneath it all: {_lc(d)}. That's what these months draw on.")
    return lead, body


def answer_remedies(ctx, part, topic):
    maha, antar = ctx.running()
    picks = []
    if maha:
        picks.append((maha.lords[0], "you are running its major period"))
    if antar and antar.lords[-1] not in [p for p, _ in picks]:
        picks.append((antar.lords[-1], "its sub-period is running now"))
    lagna_lord = ctx.c.house_lord[1]
    if (ctx.strength(lagna_lord) or 60) < 50 and lagna_lord not in [p for p, _ in picks]:
        picks.append((lagna_lord, "it rules your ascendant and is on the weaker side"))
    lines = []
    for g, why in picks:
        day, mantra, practice = REMEDY[g]
        lines.append(f"- **{_t(g)}** ({why}): on {day}s, recite *{mantra}* 108 times, and in daily life {practice}.")
    lead = ("Here are the remedies that fit your chart right now — I've kept them few, because a couple of remedies "
            "done faithfully work far better than many done half-heartedly.")
    body = ["\n".join(lines),
            "Start on the planet's weekday and keep going for at least 40 days. Charity should be modest and genuinely "
            "useful to whoever receives it. And please don't let any remedy replace medical, legal or financial advice."]
    return lead, body


def answer_gemstone(ctx, part, topic):
    lords = ctx.c.house_lord
    safe = list(dict.fromkeys([lords[1], lords[5], lords[9]]))
    avoid = [lords[h] for h in (6, 8, 12) if lords[h] not in safe]
    primary = lords[1]
    st = ctx.strength(primary)
    lead = (f"The stone I'd recommend is **{GEM[primary]}**, for {_t(primary)} — the planet that rules your "
            f"{SIGNS[ctx.c.lagna_sign]} ascendant. Strengthening the ascendant lord is always safe, and it supports your "
            "health, confidence and overall direction.")
    body = []
    if st is not None:
        body.append(f"{_t(primary)} scores {st:.0f}/100 in your chart, so " +
                    ("it will genuinely benefit from the support." if st < 55 else "the stone will amplify an already decent planet."))
    others = [g for g in safe if g != primary]
    if others:
        body.append("Later, if the first stone suits you, " + _join([f"{GEM[g]} ({_t(g)})" for g in others]) +
                    " are also safe for your chart.")
    if avoid:
        body.append("Please **avoid** " + _join([f"{GEM[g]}" for g in dict.fromkeys(avoid)]) + ": those planets rule "
                    "difficult houses for your ascendant, and strengthening them can backfire.")
    body.append("Buy a natural, certified stone, wear it first on the planet's day, and remove it if you notice "
                "disturbed sleep or a run of setbacks in the first few weeks.")
    return lead, body


def answer_personality(ctx, part, topic):
    c, r = ctx.c, ctx.r
    moon = r["planets"]["MOON"]
    strengths = sorted([g for g in GRAHAS[:7] if ctx.strength(g) is not None], key=lambda g: -ctx.strength(g))
    ak = next((g for g, p in r["planets"].items() if p.get("chara_karaka") == "Atmakaraka"), None)
    lead = (f"You come across as {LAGNA_VOICE[c.lagna_sign]} — that's your {SIGNS[c.lagna_sign]} ascendant. Inside, "
            f"with the Moon in {moon['sign_name']}, you are {LAGNA_VOICE[c.sign['MOON']]}, and your birth star "
            f"{moon['nakshatra']} adds its own colour.")
    body = []
    if strengths:
        body.append(f"Your real strengths are {NATURE[strengths[0]]}, and {NATURE[strengths[1]]} — {_t(strengths[0])} and "
                    f"{_t(strengths[1])} are your strongest planets, so these qualities come naturally to you.")
        body.append(f"Where you grow is around {NATURE[strengths[-1]]}: {_t(strengths[-1])} is your least supported "
                    "planet, so it develops through conscious practice rather than by default.")
    if ak:
        body.append(f"Your soul's main lesson, by the Atmakaraka {_t(ak)}, is about {NATURE[ak]} — life keeps bringing "
                    "you situations that ask you to mature in exactly that.")
    return lead, body


def answer_sade_sati(ctx, part, topic):
    ss = (ctx.r.get("transits") or {}).get("sade_sati") or {}
    periods = ss.get("lifetime_periods") or []
    now = ctx.now.date().isoformat()
    current = next((p for p in periods if p["start"] <= now <= (p["end"] or "9999")), None)
    upcoming = next((p for p in periods if p["start"] > now), None)
    if current:
        phase = {"rising (1st phase)": "first, rising phase", "peak (2nd phase)": "second, peak phase",
                 "setting (3rd phase)": "third and final, setting phase"}.get(ss.get("phase"), "current phase")
        lead = (f"Your Sade Sati is running right now — you're in its {phase}. "
                f"It ends on **{_date(current['end'])}**.")
        body = [{"rising (1st phase)": "This first phase is about clearing out: expenses, rest and endings make room "
                                       "for what comes next.",
                 "peak (2nd phase)": "This is the heaviest phase emotionally — responsibilities peak and the mind can "
                                     "feel weighed down. Routine and support carry you through.",
                 "setting (3rd phase)": "This is the final, easing phase: family and money need care, but the effort of "
                                        "the last few years starts to pay off now."}.get(ss.get("phase"), "")]
    else:
        lead = "No — you're not in Sade Sati at the moment."
        body = []
    if upcoming:
        body.append(f"Your next Sade Sati begins on {_date(upcoming['start'])}.")
    body.append("Sade Sati isn't a curse: it's Saturn asking for discipline, patience and honesty, and many people do "
                "their most lasting work during it. Saturday service, steady routines and Hanuman Chalisa are the "
                "traditional supports.")
    return lead, [b for b in body if b]


def answer_bad_time(ctx, part, topic):
    maha, antar = ctx.running()
    ss = (ctx.r.get("transits") or {}).get("sade_sati") or {}
    reasons, ends = [], []
    sat_house = ctx.c.house["SATURN"]
    if ss.get("active"):
        p = next((x for x in ss.get("lifetime_periods", []) if x["start"] <= ctx.now.date().isoformat() <= (x["end"] or "9999")), None)
        reasons.append(f"you're in the {ss.get('phase', 'current phase').split(' (')[0]} phase of Sade Sati, Saturn's long test of patience")
        if p and p.get("end"):
            ends.append(f"Sade Sati lifts on {_date(p['end'])}")
    if maha and maha.lords[0] in ("SATURN", "RAHU", "KETU"):
        reasons.append(f"you're running the {_t(maha.lords[0])} major period, which works slowly and asks for structure")
    if antar:
        lord = antar.lords[-1]
        if set(ctx.lord_houses(lord)) & DUSTHANA or (ctx.strength(lord) or 60) < 45:
            reasons.append(f"the current {_t(maha.lords[0])}–{_t(lord)} sub-period leans on harder houses of your chart")
        ends.append(f"the current sub-period changes in {_my(antar.end)}")
    if sat_house in (1, 4, 7, 10) or ctx.c.aspects("SATURN", 1):
        reasons.append("Saturn has a strong hold on your chart's angles, which makes results slow but durable")
    nt = near_term(ctx.c, TOPICS["general"], "next 12 months", ctx.now)
    lead = "I understand — it's exhausting when effort doesn't seem to pay. Your chart does explain it."
    body = ["Here's what's going on:\n" + "\n".join(f"- {r[0].upper() + r[1:]}." for r in reasons)
            if reasons else "It's a phase of building rather than harvesting."]
    if ends:
        body.append("The good news is that it has an end: " + _join(ends) + ".")
    if nt and nt.best:
        body.append("Within the next year, **" + _join([_my(m.start) for m in nt.best]) + "** look like your better months "
                    "— plan your important moves there.")
    body.append("Saturn rewards exactly three things: routine, patience and honest work. Keep those up through this "
                "phase and its results tend to be the ones that last.")
    return lead, body


def answer_career_choice(ctx, part, topic):
    c, r = ctx.c, ctx.r
    tenth_lord = c.house_lord[10]
    occupants = [g for g in GRAHAS if c.house[g] == 10]
    amk = next((g for g, p in r["planets"].items() if p.get("chara_karaka") == "Amatyakaraka"), None)
    d10 = (r.get("vargas") or {}).get("D10")
    d10_lord = SIGN_LORD[d10["lagna"]["sign"]] if d10 else None
    candidates = list(dict.fromkeys([g for g in [*occupants, tenth_lord, amk, d10_lord] if g]))
    ranked = sorted(candidates, key=lambda g: -(ctx.strength(g) or 50))
    top = ranked[:2]
    lead = (f"The fields that suit you best are {CAREER_FIELDS[top[0]]}"
            + (f", and next to that {CAREER_FIELDS[top[1]]}" if len(top) > 1 else "") + ".")
    body = [f"I get there from your 10th house of career in {SIGNS[c.house_sign[10]]}, its lord {_t(tenth_lord)} in your "
            f"{_ord(c.house[tenth_lord])} house"
            + (f", {_join([_t(g) for g in occupants])} sitting in the 10th" if occupants else "")
            + (f", your career significator (Amatyakaraka) {_t(amk)}" if amk else "")
            + (f" and the ruler of your career chart (D10), {_t(d10_lord)}" if d10_lord else "") + "."]
    j = ctx.j(TOPICS["career"])
    body.append(f"Overall your career promise is {_lean_phrase(j.lean)}. " + _strip(j.theme).split(";")[0] + ".")
    body.append("Choose the role where you can use these strengths daily — the chart rewards depth in one field more "
                "than hopping between many.")
    return lead, body


def answer_love_arranged(ctx, part, topic):
    c = ctx.c
    l5, l7 = c.house_lord[5], c.house_lord[7]
    love, arranged = [], []
    if l5 == l7 or c.associated(l5, l7):
        love.append(f"your 5th lord (romance) {_t(l5)} and 7th lord (marriage) {_t(l7)} are connected")
    if c.house[l5] == 7 or c.house[l7] == 5:
        love.append("the lords of romance and marriage sit in each other's houses")
    for g in ("MARS", "RAHU"):
        if c.associated("VENUS", g):
            love.append(f"Venus, the planet of love, is linked with {_t(g)}, which favours a self-chosen partner")
    l9 = c.house_lord[9]
    if l7 == l9 or c.associated(l7, l9):
        arranged.append(f"your 7th lord {_t(l7)} is connected with the 9th lord {_t(l9)} (family and tradition)")
    if c.aspects("JUPITER", 7) or c.house["JUPITER"] == 7:
        arranged.append("Jupiter blesses your 7th house, a classic sign of family involvement")
    if c.house[l7] in (2, 4, 9):
        arranged.append(f"the 7th lord sits in your {_ord(c.house[l7])} house, a family house")
    if len(love) > len(arranged):
        lead = "Your chart leans towards a **love marriage** — someone you choose yourself."
    elif len(arranged) > len(love):
        lead = "Your chart leans towards an **arranged marriage**, or at least one where family plays a big part."
    else:
        lead = ("Your chart points to a **love-cum-arranged** marriage: you're likely to have a say in the choice, "
                "with family blessing it.")
    body = []
    if love:
        body.append("On the love side: " + "; ".join(love) + ".")
    if arranged:
        body.append("On the arranged side: " + "; ".join(arranged) + ".")
    wins = _windows_text(ctx, TOPICS["marriage"], limit=1)
    if wins:
        body.append(f"Either way, the most likely time for marriage is {wins[0]}.")
    return lead, body


def answer_govt_job(ctx, part, topic):
    c = ctx.c
    sun_st = ctx.strength("SUN") or 50
    signs = []
    if c.house["SUN"] in (1, 10, 11, 9):
        signs.append(f"the Sun, the planet of government, sits in your {_ord(c.house['SUN'])} house")
    if sun_st >= 55:
        signs.append(f"the Sun is strong in your chart ({sun_st:.0f}/100)")
    l10 = c.house_lord[10]
    if l10 == "SUN" or c.associated("SUN", l10):
        signs.append(f"the Sun is connected with your 10th lord {_t(l10)}")
    if c.aspects("JUPITER", 10) or c.house["JUPITER"] == 10:
        signs.append("Jupiter supports your 10th house")
    if c.house[c.house_lord[6]] in (6, 10, 11, 1):
        signs.append("your 6th lord (service and competitive exams) is well placed")
    if len(signs) >= 3:
        lead = "Yes — your chart has a genuine government or public-sector signature."
    elif len(signs) == 2:
        lead = "There's a fair chance, especially if you prepare seriously for competitive exams."
    else:
        lead = "A government job isn't the strongest indication in your chart; private or independent work suits you better."
    body = ["What I see: " + ("; ".join(signs) if signs else "the Sun and your 10th house aren't strongly linked") + "."]
    wins = _windows_text(ctx, TOPICS["career"], limit=2)
    if wins:
        body.append("The best periods to sit exams and apply are " + _join(wins) + ".")
    return lead, body


def answer_business_job(ctx, part, topic):
    c = ctx.c
    biz, job = 0, 0
    notes_b, notes_j = [], []
    l7, l6, l10 = c.house_lord[7], c.house_lord[6], c.house_lord[10]
    if (ctx.strength(l7) or 50) >= 55:
        biz += 1; notes_b.append(f"your 7th lord {_t(l7)} (trade and clients) is strong")
    if c.house[l10] in (7, 1, 3, 11):
        biz += 1; notes_b.append(f"your 10th lord sits in the {_ord(c.house[l10])} house, a house of independent effort")
    if (ctx.strength("MERCURY") or 50) >= 55:
        biz += 1; notes_b.append("Mercury, the planet of commerce, is strong")
    if c.house["MARS"] in (1, 3, 10, 11):
        biz += 1; notes_b.append("Mars gives you initiative")
    if (ctx.strength(l6) or 50) >= 55 or c.house[l6] in (6, 10):
        job += 1; notes_j.append(f"your 6th lord {_t(l6)} (service) is well placed")
    if c.house[l10] in (6, 10, 2):
        job += 1; notes_j.append("your 10th lord favours steady, salaried work")
    if (ctx.strength("SATURN") or 50) >= 55:
        job += 1; notes_j.append("a strong Saturn rewards structured roles")
    if biz > job:
        lead = "Your chart favours **business** — working for yourself suits you better than a long career as an employee."
    elif job > biz:
        lead = "Your chart favours a **job** — you'll build more, with less stress, inside an organisation."
    else:
        lead = ("Your chart supports both. The safest route is to keep your job and grow a business on the side "
                "until it proves itself.")
    body = [b for b in ("For business: " + "; ".join(notes_b) + "." if notes_b else "",
                        "For a job: " + "; ".join(notes_j) + "." if notes_j else "") if b]
    wins = _windows_text(ctx, TOPICS["career"], limit=1)
    if wins:
        body.append(f"Whichever you choose, {wins[0]} is the period to make the move.")
    return lead, body


def answer_legal(ctx, part, topic):
    c = ctx.c
    l6 = c.house_lord[6]
    score, notes = 0, []
    mal6 = [g for g in ("SUN", "MARS", "SATURN", "RAHU", "KETU") if c.house[g] in (6, 3, 11)]
    if mal6:
        score += 1; notes.append(_join([f"{_t(g)} in your {_ord(c.house[g])} house" for g in mal6])
                                 + " — houses of victory over opponents")
    if (ctx.strength(l6) or 50) >= 55 or c.house[l6] in (6, 3, 11, 10):
        score += 1; notes.append(f"your 6th lord {_t(l6)} (disputes) is well placed")
    if (ctx.strength("MARS") or 50) >= 55:
        score += 1; notes.append("a strong Mars gives fighting power")
    if c.house[c.house_lord[12]] in (6, 8) or any(c.house[g] == 12 for g in ("SATURN", "MARS")):
        score -= 1; notes.append("the 12th house warns of costs and delays")
    maha, antar = ctx.running()
    if antar and (6 in ctx.lord_houses(antar.lords[-1]) or c.house[antar.lords[-1]] in (6, 11)):
        score += 1; notes.append(f"the running {_t(antar.lords[-1])} sub-period activates your 6th or 11th house")
    if score >= 2:
        lead = "Your chart gives you the upper hand in disputes — with good preparation, the outcome is likely to favour you."
    elif score >= 1:
        lead = "You have a fair chance, but expect it to take time; a settlement may serve you better than a long fight."
    else:
        lead = "This is not the strongest time to fight it out; look seriously at settlement or mediation."
    body = ["What I see: " + ("; ".join(notes) if notes else "no strong indicator either way") + ".",
            "Please rely on your lawyer for the actual strategy — the chart speaks of strength and timing, not legal merit."]
    return lead, body


def answer_muhurta(ctx, part, topic):
    c = ctx.c
    birth_nak = int(c.lon["MOON"] // NAK_SPAN)
    natal_moon = c.sign["MOON"]
    tz = c.time.local.tzinfo

    def check(t):
        ml = float(c.eph.sidereal_longitude_series([t], "MOON")[0])
        sl = float(c.eph.sidereal_longitude_series([t], "SUN")[0])
        tara = (int(ml // NAK_SPAN) - birth_nak) % 27 % 9 + 1
        house = (int(ml // 30) - natal_moon) % 12 + 1
        tithi = int(((ml - sl) % 360) // 12)
        ok = tara in GOOD_TARA and house in CHANDRABALA_GOOD and (tithi % 15 + 1) not in (4, 9, 14) and tithi != 29
        return ok, tara, house, NAKSHATRAS[int(ml // NAK_SPAN)]

    today = ctx.now.astimezone(tz).replace(hour=10, minute=0)
    ok, tara, house, nak = check(today)
    lead = (f"Today is a good day for it — the Moon is in {nak}, a favourable star for you, and well placed from your "
            "birth Moon." if ok else
            f"I'd wait — today isn't ideal: the Moon in {nak} doesn't give you good tarabala or chandrabala.")
    days = good_days(c, TOPICS["money"], ctx.now, ctx.now + timedelta(days=30), [])
    body = []
    if days:
        body.append("The best days in the next month are " + _join([_day(t) for t, _ in days[:4]]) + ".")
    body.append("Mornings are traditionally better, and avoid starting anything important during Rahu Kaal.")
    return lead, body


def answer_relative(ctx, part, who):
    house, karaka, label = RELATIVES[who]
    c = ctx.c
    p = part.lower()
    lord = c.house_lord[house]
    st_k, st_l = ctx.strength(karaka), ctx.strength(lord)
    afflicted = [g for g in ("SATURN", "MARS", "RAHU", "KETU") if c.house[g] == house or c.aspects(g, house)]
    health = bool(re.search(r"health|recover|\bill\b|illness|sick|surgery|hospital|disease|operation", p))
    if who in ("wife", "husband", "spouse") and not health:
        return answer_spouse(ctx, part, label)
    good = sum(x is not None and x >= 55 for x in (st_k, st_l)) - (1 if len(afflicted) >= 2 else 0)
    if health:
        lead = (f"For {label}'s health, your chart shows " +
                ("good resilience — recovery is well supported." if good >= 2 else
                 "reasonable support, though it will take steady care and patience." if good >= 1 else
                 "that this needs careful attention and good medical support."))
    else:
        lead = f"For {label}, your chart is " + ("encouraging." if good >= 2 else "mixed but workable." if good >= 1 else "asking for patience.")
    body = [f"In your chart {label} is read from your {_ord(house)} house and {_t(karaka)}: the house lord {_t(lord)} "
            f"scores {st_l or 0:.0f}/100 and {_t(karaka)} {st_k or 0:.0f}/100"
            + (f", while {_join([_t(g) for g in afflicted])} put pressure on that house" if afflicted else "") + "."]
    tr = (ctx.r.get("transits") or {}).get("positions", {})
    for g in ("JUPITER", "SATURN"):
        if g in tr and tr[g].get("house_from_lagna") == house:
            body.append(f"Transiting {_t(g)} is in that house right now, "
                        + ("which supports recovery." if g == "JUPITER" else "so things move slowly for now."))
    body.append(f"{label[0].upper() + label[1:]}'s own birth chart would give a much more reliable answer — "
                "and for health, the doctors' advice comes first.")
    return lead, body


def answer_spouse(ctx, part, label):
    """Spouse's temperament, how settled they are and how supportive the marriage is, from the 7th house, its lord,
    the marriage significator, the navamsha and the Darakaraka."""
    c, r = ctx.c, ctx.r
    p = part.lower()
    seventh, l7 = c.house_sign[7], c.house_lord[7]
    karaka = "JUPITER" if "husband" in label else "VENUS"
    dk = next((g for g, x in r["planets"].items() if x.get("chara_karaka") == "Darakaraka"), None)
    st7, stk = ctx.strength(l7) or 50, ctx.strength(karaka) or 50
    settled = c.house[l7] in (2, 10, 11, 9, 1) or st7 >= 60
    supportive = (c.aspects("JUPITER", 7) or c.house["JUPITER"] == 7 or stk >= 55) and not (
        c.house["SATURN"] == 7 and c.house["MARS"] == 7)
    lead = (f"From your chart, {label} comes across as {LAGNA_VOICE[seventh]} — that's the {SIGNS[seventh]} sign on your "
            f"7th house of marriage.")
    body = []
    if re.search(r"settled|rich|wealth|career|job|financial|earn|well off|stable", p) or True:
        body.append(("**Well settled:** yes, the signs are good. " if settled else "**Well settled:** they'll build it over time. ")
                    + f"Your 7th lord {_t(l7)} sits in your {_ord(c.house[l7])} house"
                    + (f" and is strong ({st7:.0f}/100)" if st7 >= 60 else "")
                    + (", linking your partner with income, status or fortune." if c.house[l7] in (2, 10, 11, 9) else "."))
    if re.search(r"support|caring|kind|loyal|good|understand|nature|loving", p) or True:
        sat7 = c.aspects("SATURN", 7) or c.house["SATURN"] == 7
        body.append(("**Supportive:** yes. " if supportive else "**Supportive:** in their own way, with effort from both sides. ")
                    + (f"{_t(karaka)}, the marriage significator for you, scores {stk:.0f}/100" + (" and Jupiter blesses the 7th house" if c.aspects("JUPITER", 7) else "") + ". ")
                    + ("Saturn's aspect on the 7th suggests a serious, responsible partner who shows love through duty "
                       "more than words." if sat7 else ""))
    if dk:
        body.append(f"Your Darakaraka (spouse significator) is {_t(dk)}, so expect {NATURE[dk]} in your partner.")
    return lead, body


COMPOSERS = {
    "remedies": answer_remedies, "gemstone": answer_gemstone, "personality": answer_personality,
    "sade_sati": answer_sade_sati, "bad_time": answer_bad_time, "career_choice": answer_career_choice,
    "love_arranged": answer_love_arranged, "govt_job": answer_govt_job, "business_job": answer_business_job,
    "legal": answer_legal, "muhurta": answer_muhurta, "when": answer_when, "year": answer_year,
}


def _library_prompts() -> set[str]:
    """The site's own deep-analysis prompts, which always get the complete structured reading."""
    from . import topics as T
    out = set()

    def walk(x):
        if isinstance(x, str):
            out.add(x.strip())
        elif isinstance(x, dict):
            for v in x.values():
                walk(v)
        elif isinstance(x, (list, tuple)):
            for v in x:
                walk(v)
    for name in ("MODE_QUESTIONS", "PROMPT_LIBRARY", "QUICK_QUESTIONS", "PRECOMPUTE_QUESTIONS", "ANALYSIS_MODES"):
        walk(getattr(T, name, None))
    return out


GENERIC_TOPICS = {"timing", "general", "year", "month"}


def resolve_topics(parts: list[str]) -> list[tuple[str, str, object]]:
    """(part, intent, topic) for each part; a part with no subject of its own ("and when will it move?")
    inherits the topic of the part before it."""
    out, last = [], None
    for part in parts:
        intent = intent_of(part)
        topic = topic_of(part, intent)
        if topic.key in GENERIC_TOPICS and last is not None and intent in ("when", "year", "topic"):
            topic = last
        if topic.key not in GENERIC_TOPICS:
            last = topic
        out.append((part, intent, topic))
    return out


def special_intent(question: str) -> bool:
    """True when the built-in reader should answer with the intent composers. Deep-analysis prompts and broad
    questions about one life area (even with a "when") keep the complete structured reading, which already
    covers nature and timing."""
    if question.strip() in _library_prompts():
        return False
    resolved = resolve_topics(split_parts(question))
    intents = [i for _, i, _ in resolved]
    topics = {t.key for _, _, t in resolved}
    if len(resolved) > 1 and set(intents) <= {"topic", "when"} and len(topics) == 1:
        return False
    if len(resolved) == 1 and intents[0] in ("year", "when") and resolved[0][2].key in GENERIC_TOPICS:
        return False  # "what does this year hold?" is best served by the full yearly reading
    return len(resolved) > 1 or intents[0] != "topic"


def compose(chart, report, question: str, now: datetime) -> str:
    ctx = Ctx(chart, report, now)
    parts = split_parts(question)
    blocks = []
    for part, intent, topic in resolve_topics(parts):
        if intent.startswith("relative:"):
            lead, body = answer_relative(ctx, part, intent.split(":", 1)[1])
        elif intent in COMPOSERS:
            lead, body = COMPOSERS[intent](ctx, part, topic)
        else:
            lead, body = answer_topic(ctx, part, topic)
        text = lead + ("\n\n" + "\n\n".join(b for b in body if b) if body else "")
        if len(parts) > 1:
            text = f"### {part[0].upper() + part[1:]}?\n\n{text}"
        blocks.append(text)
    opener = "You asked a few things, so let me take them one at a time.\n\n" if len(parts) > 1 else ""
    closing = ("\n\n*This reading is calculated from your birth chart. It describes tendencies and timing, not fixed "
               "fate — your choices still matter most.*")
    return opener + "\n\n".join(blocks) + closing
