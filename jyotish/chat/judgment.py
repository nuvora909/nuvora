"""The astrologer's judgment: weigh the chart before writing about it.

A mechanical reader lists placements. An experienced Parashari astrologer first decides what the
chart *says* about a question, by checking four independent layers and letting their agreement set
the confidence:

1. Promise      D1: the topic houses, their lords (dignity in D1 and D9), occupants, aspects,
                natural significators, and the same houses counted from the Moon.
2. Confirmation the topic's divisional chart (D9, D10, D7, ...), compared with D1.
3. Activation   the running and coming Vimshottari periods: does the dasha lord own, occupy or
                otherwise connect to the topic houses?
4. Trigger      the Jupiter-Saturn double transit: both slow planets reaching the topic house or
                its lord (by occupation or their special aspects) at the same time.

Windows where an activating dasha overlaps a double transit are the classical high-probability
periods; a dasha without the transit is build-up, a transit without the dasha is background.
The result is a structured Judgment plus two renderings: working notes for the AI reader and
ready-made, fact-tagged paragraphs for the offline reader. Nothing here promises an event.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone

from vedic.chart import DUSTHANAS, KENDRAS, TRIKONAS
from vedic.constants import DEBILITATION, EXALTATION, OWN_SIGNS, SIGN_LORD, SIGNS
from vedic.transits import ingresses

from .offline import HOUSE_MEANING, PLANET_MEANING, Reader, _ord, _t
from .topics import Topic

# The house a topic is anchored on for its theme, Moon cross-check and double transit (default: first house).
ANCHOR = {"foreign": 12}

JUPITER_REACH = (0, 4, 6, 8)   # occupation plus the 5th, 7th and 9th aspects, as sign offsets
SATURN_REACH = (0, 2, 6, 9)    # occupation plus the 3rd, 7th and 10th aspects

# Classical "lord of the topic house placed in house N": where the topic finds its outlet.
LORD_OUTLET = {
    1: "your own initiative, personality and personal reputation",
    2: "family resources, finance, speech, food or valuables",
    3: "communication, media, skills, short journeys and your own effort",
    4: "property, education, home-based work and emotional security",
    5: "intellect, advice, creativity, teaching and calculated risk",
    6: "service, problem-solving, competition, health, law or debt-related work",
    7: "partnership, clients, trade and dealing with the public",
    8: "research, shared or hidden resources, crisis handling and deep change",
    9: "teaching, mentors, law, higher learning, long journeys and principle",
    10: "authority, visible responsibility and public standing",
    11: "networks, large organisations, gains and long-range goals",
    12: "foreign connections, institutions, behind-the-scenes work and letting go",
}
# Topic-specific readings of the main house lord's placement (classical bhava-lord-in-bhava results,
# paraphrased). Used for the theme sentence; other topics fall back to LORD_OUTLET.
TOPIC_OUTLET = {
    ("career", 10): {
        1: "self-made work where your own name is the brand: leadership, independent roles or work that carries your personal reputation",
        2: "finance, family enterprise, speech-led work such as teaching, sales or advisory, or handling valuables",
        3: "communication, media, writing, marketing and technical skills, with work that rewards initiative and movement",
        4: "property, education, vehicles, land or public-welfare work, and a career that grows from a stable base",
        5: "advisory, teaching, creative, investment or policy roles where judgement and intelligence are the product",
        6: "service, competition and problem-solving: law, medicine, operations or finance, careers that win by out-working rivals",
        7: "partnerships, clients, consulting, trade or diplomacy; working with others suits better than working alone",
        8: "research, investigation, insurance, tax, crisis management or hidden-resource work, with sudden turns along the way",
        9: "teaching, law, publishing, higher education, long-distance work or mentoring, careers guided by principle",
        10: "authority and visible responsibility: management, government or leadership built steadily on your own standing",
        11: "large organisations, networks and technology, gains-driven roles and long-range ambitions",
        12: "foreign companies, overseas work, hospitals, institutions, research or behind-the-scenes roles",
    },
    ("marriage", 7): {
        1: "partners who shape your identity; partnership feels central to who you are and often comes through your own initiative",
        2: "family, finances and shared values; family approval matters and the partnership can strengthen family resources",
        3: "conversation and shared skills; partners met through siblings, neighbours, short travel or communication",
        4: "home, comfort and emotional security; family elders and domestic life weigh heavily in the relationship",
        5: "romance, creativity and shared ideas; love and personal choice play a strong role",
        6: "daily routines, service and fairness; health or conflict themes need conscious, practical handling",
        7: "a well-defined partner type; partnership is a major, self-contained life area",
        8: "transformation; shared money, in-laws and privacy matter, and timing can be sudden or delayed",
        9: "learning, principle or travel; the partner may come from a different background and partnership can bring fortune",
        10: "your career and public life; relationship and status interact strongly",
        11: "friends, networks and shared ambitions; partnership tends to bring gains and fulfil goals",
        12: "distance, privacy or sacrifice; foreign connections or solitude need balancing with closeness",
    },
    ("money", 2): {
        1: "your own effort and personality; wealth is self-earned rather than inherited",
        2: "steady accumulation through family resources, savings and careful speech",
        3: "skills, communication, media, sales and your own initiative",
        4: "property, land, vehicles, education or the family home",
        5: "intelligence, advice, investments or creative output, with speculation needing firm discipline",
        6: "service, competition or lending, with debts and disputes around money to watch",
        7: "partnership, clients, trade or the spouse",
        8: "shared resources, inheritance, insurance, research or sudden events, which fluctuate unless managed",
        9: "fortune, mentors, teaching, law or long-distance work",
        10: "career standing and visible responsibility",
        11: "networks, large organisations and steady, repeatable income streams",
        12: "outflow: foreign sources, institutions or spending, so saving needs deliberate structure",
    },
}
TOPIC_NOUN = {
    "general": "your life direction", "career": "your career", "marriage": "partnership",
    "money": "wealth", "property": "home and property", "education": "learning",
    "children": "children and creative legacy", "foreign": "life abroad", "spiritual": "your inner life",
    "health": "vitality", "timing": "this period", "year": "the coming year", "month": "the coming month",
    "lifetime": "the long arc of your life",
}
LEAN_WORDS = {
    "strong": "strongly supported",
    "supportive": "supported, with a clear condition",
    "mixed": "mixed: real support alongside real friction",
    "demanding": "demanding: it asks for patience and structure",
}
HEALTH_LEAN = {
    "strong": "robust: vitality has good reserves",
    "supportive": "generally resilient, with one area that needs routine care",
    "mixed": "mixed: resilience depends on steady routines",
    "demanding": "in need of deliberate care and early professional advice when symptoms appear",
}


# Per-topic (15th, 55th, 85th) percentiles of the natal promise score over 200 sampled births, from
# scripts/calibrate_judgment.py. Re-run it whenever the weights above change. With these cut-offs a
# reading is "strong" for roughly the top 15% of charts on that topic, "supportive" for the next 30%,
# "mixed" for the middle 40% and "demanding" for the bottom 15%: most charts are honestly mixed.
CALIBRATION = {
    "general": (0.32, 3.95, 7.55),
    "career": (1.25, 4.81, 7.38),
    "marriage": (-1.04, 3.28, 5.47),
    "money": (-0.68, 3.49, 6.2),
    "property": (0.17, 4.12, 6.47),
    "education": (-0.97, 3.12, 6.15),
    "children": (-0.8, 2.59, 5.5),
    "foreign": (0.17, 3.7, 6.19),
    "spiritual": (-1.43, 2.88, 5.1),
    "health": (0.55, 3.72, 6.03),
    "timing": (-0.2, 2.85, 5.34),
    "year": (-0.57, 3.14, 5.83),
    "month": (-0.69, 2.77, 5.54),
    "lifetime": (-0.15, 3.42, 6.61),
}


@dataclass
class Factor:
    text: str          # fact-tagged sentence fragment the reader can quote
    label: str         # short plain label
    weight: float      # internal weight; never shown as a score
    layer: str         # promise | moon | confirmation | activation | trigger
    key: tuple = ()    # identifies the underlying finding so one planet is not counted twice


@dataclass
class Window:
    start: datetime
    end: datetime
    dasha: object
    relevance: int                     # 2 direct, 1 supporting
    double_transit: tuple | None       # (start, end, jupiter_sign, saturn_sign, target) or None
    score: float
    text: str = ""


@dataclass
class Judgment:
    topic: Topic
    lean: str
    lean_text: str
    theme: str
    drivers: list[Factor]
    counterweights: list[Factor]
    moon_check: str
    varga: dict | None
    activation_now: str
    activation_relevance: int
    windows: list[Window]
    score: float
    layers: dict[str, bool | None]
    confidence: str
    confidence_reason: str
    notes: list[str] = field(default_factory=list)


def _sign_intervals(chart, planet: str, start: datetime, end: datetime):
    """(from, to, sign) intervals for a slow planet, using the shared ingress cache."""
    sign = int(chart.eph.sidereal_longitude_series([start], planet)[0] // 30)
    out, cursor = [], start
    for ing in ingresses(chart.eph, planet, start, end):
        out.append((cursor, ing["time"], sign))
        cursor, sign = ing["time"], ing["to_sign"]
    out.append((cursor, end, sign))
    return out


def double_transits(chart, targets: dict[int, str], start: datetime, end: datetime):
    """Intervals when Jupiter and Saturn both reach one of the target signs.

    `targets` maps sign -> description ("the 10th house", "the 10th lord"). Returns merged intervals
    (start, end, jupiter_sign, saturn_sign, description) where each planet occupies or aspects a target."""
    jup = _sign_intervals(chart, "JUPITER", start, end)
    sat = _sign_intervals(chart, "SATURN", start, end)
    hits = []
    for j0, j1, js in jup:
        for s0, s1, ss in sat:
            lo, hi = max(j0, s0), min(j1, s1)
            if hi <= lo:
                continue
            jt = [s for s in targets if (s - js) % 12 in JUPITER_REACH]
            st = [s for s in targets if (s - ss) % 12 in SATURN_REACH]
            if jt and st:
                shared = [s for s in jt if s in st]
                label = targets[shared[0]] if shared else f"{targets[jt[0]]} (Jupiter) and {targets[st[0]]} (Saturn)"
                hits.append((lo, hi, js, ss, label))
    merged = []
    for h in sorted(hits):
        if merged and h[0] <= merged[-1][1] + timedelta(days=1) and h[2:4] == merged[-1][2:4]:
            merged[-1] = (merged[-1][0], max(merged[-1][1], h[1]), *merged[-1][2:])
        else:
            merged.append(h)
    return merged


class Judge:
    def __init__(self, chart, report, now: datetime | None = None):
        self.c, self.r = chart, report
        self.reader = Reader(chart, report)
        self.now = now or self.reader.now
        self.tz = chart.time.local.tzinfo

    # ---------------------------------------------------------------- promise
    def _d9_dignity(self, g):
        if 9 not in self.c.varga or g in ("RAHU", "KETU"):
            return None, 0.0
        sign = self.c.varga[9]["planets"][g]["sign"]
        if EXALTATION[g][0] == sign:
            status, weight = "exalted", 1.0
        elif DEBILITATION[g][0] == sign:
            status, weight = "debilitated", -1.0
        elif sign in OWN_SIGNS.get(g, set()):
            status, weight = "own", 0.75
        else:
            return None, 0.0
        tag = (f'<fact kind="dignity" planet="{_t(g)}" status="{status}" chart="D9">'
               f'{_t(g)} is {"in its own sign" if status == "own" else status} in the navamsha</fact>')
        return tag, weight

    def _moon_check(self, topic: Topic) -> tuple[str, float]:
        """The main topic house counted from the Moon, as the classical second ascendant."""
        h = self.anchor(topic)
        moon = self.c.sign["MOON"]
        sign = (moon + h - 1) % 12
        lord = SIGN_LORD[sign]
        from_moon = (self.c.sign[lord] - moon) % 12 + 1
        occupants = [g for g in self.c.sign if self.c.sign[g] == sign and g not in ("RAHU", "KETU")]
        if from_moon in KENDRAS or from_moon in TRIKONAS:
            weight, how = 0.75, "well placed from the Moon too, so the emotional and practical sides of the topic pull together"
        elif from_moon in DUSTHANAS:
            weight, how = -0.75, "in a difficult house counted from the Moon, so the topic can feel harder inwardly than it looks on paper"
        else:
            weight, how = 0.0, "neutrally placed from the Moon, so the Moon chart neither adds to nor subtracts from the D1 picture"
        tag = (f'<fact kind="placement" planet="{_t(lord)}" sign="{SIGNS[self.c.sign[lord]]}">'
               f'{_t(lord)} in {SIGNS[self.c.sign[lord]]}</fact>')
        text = (f"Counted from the Moon, the {_ord(h)} house is {SIGNS[sign]}; its lord, {tag}, falls "
                f"{_ord(from_moon)} from the Moon, {how}.")
        if occupants:
            text += " " + ", ".join(_t(g) for g in occupants) + f" also sit{'s' if len(occupants) == 1 else ''} in that sign."
        return text, weight

    def _house_factors(self, h: int, scale: float) -> list[Factor]:
        """Specific cause-and-effect findings for one house; weights are private ordering aids."""
        c, rd = self.c, self.reader
        lord = c.house_lord[h]
        lh = c.house[lord]
        area = HOUSE_MEANING[h]
        out = []

        def add(text, label, weight, key):
            out.append(Factor(text, label, weight * scale, "promise", key))

        if lh in KENDRAS or lh in TRIKONAS:
            add(f"{rd.f_lord(h)}, a strong position that plugs {area} into {LORD_OUTLET[lh]}",
                f"the {_ord(h)} lord {_t(lord)} in a strong house", 1.25, ("lord_place", lord))
        elif lh in DUSTHANAS:
            if h in DUSTHANAS:
                add(f"{rd.f_lord(h)}; two difficult houses linked together can turn trouble against itself "
                    "(a viparita pattern), so setbacks here often clear the way rather than block it",
                    f"the {_ord(h)} lord {_t(lord)} working through another difficult house", 0.25, ("lord_place", lord))
            else:
                add(f"{rd.f_lord(h)}, a house of strain, so {area} develops through obstacles, detours or behind-the-scenes effort",
                    f"the {_ord(h)} lord {_t(lord)} in a house of strain", -1.25, ("lord_place", lord))
        status = c.dignity[lord]["status"]
        dig = rd.f_dignity(lord)
        if dig and status in ("Exalted", "Own sign", "Moolatrikona"):
            add(f"{dig}, so the {_ord(h)} lord delivers with confidence", f"{_t(lord)}'s dignity as {_ord(h)} lord", 1.5,
                ("dignity", lord))
        elif dig and status == "Debilitated":
            add(f"{dig}, so the {_ord(h)} lord needs help from other factors before it delivers",
                f"{_t(lord)}'s debilitation as {_ord(h)} lord", -1.5, ("dignity", lord))
        if c.combust[lord]["combust"]:
            add(f"{rd.f_combust(lord)}, so its agenda can be overshadowed by authority figures, urgency or other people's priorities",
                f"{_t(lord)}'s combustion", -1.0, ("combust", lord))
        tag, w = self._d9_dignity(lord)
        if tag:
            add(f"{tag}; " + ("the planet's strength holds in the chart of maturity, so this area tends to improve with age"
                             if w > 0 else "the planet weakens in the chart of maturity, so early gains need consolidating"),
                f"{_t(lord)}'s {'strength' if w > 0 else 'weakness'} in the navamsha", w, ("d9", lord))
        if c.sign[lord] == c.varga.get(9, {}).get("planets", {}).get(lord, {}).get("sign", -1):
            add(f'<fact kind="vargottama" planet="{_t(lord)}" value="true">{_t(lord)} is vargottama</fact>, '
                "holding the same sign in D1 and D9, which makes its results steadier and more reliable",
                f"vargottama {_t(lord)}", 0.75, ("vargottama", lord))
        for g in c.occupants[h]:
            at_home = g == lord or c.dignity[g]["status"] in ("Exalted", "Own sign", "Moolatrikona")
            if g in ("JUPITER", "VENUS"):
                add(f"{rd.f_place(g)} brings {PLANET_MEANING[g]} straight into this house",
                    f"{_t(g)} in the {_ord(h)} house", 1.0, ("occupant", g, h))
            elif g in ("SATURN", "MARS", "SUN", "RAHU", "KETU"):
                if at_home and g not in ("RAHU", "KETU"):
                    add(f"{rd.f_place(g)}, a planet strong in its own sign guarding the house it occupies, "
                        f"which protects {area} even though it is a demanding planet",
                        f"{_t(g)} guarding the {_ord(h)} house", 0.75, ("occupant", g, h))
                elif h in (3, 6, 10, 11):
                    add(f"{rd.f_place(g)}, pressure in a growth house that turns into drive when handled with discipline",
                        f"{_t(g)}'s productive pressure on the {_ord(h)} house", 0.25, ("occupant", g, h))
                else:
                    add(f"{rd.f_place(g)}, which adds friction, delay or intensity to {area}",
                        f"{_t(g)}'s pressure on the {_ord(h)} house", -0.75, ("occupant", g, h))
        for g in c.aspected_by[h]:
            if g in c.occupants[h]:
                continue
            if g in ("JUPITER", "VENUS"):
                add(f"{rd.f_aspect(g, h)}, a protective influence that softens difficulties there",
                    f"{_t(g)}'s protective aspect on the {_ord(h)} house", 0.75, ("aspect", g, h))
            elif g in ("SATURN", "MARS"):
                add(f"{rd.f_aspect(g, h)}, adding pressure, delay or a need for structure",
                    f"{_t(g)}'s aspect on the {_ord(h)} house", -0.5, ("aspect", g, h))
        sav_tag, sav = rd.f_sav(h)
        if sav >= 28:
            add(f"{sav_tag}, above the 28-bindu average, so transits through this house tend to land constructively",
                f"strong Ashtakavarga support for the {_ord(h)} house", 1.0, ("sav", h))
        elif sav < 25:
            add(f"{sav_tag}, below average, so this house needs more deliberate effort to deliver",
                f"thin Ashtakavarga support for the {_ord(h)} house", -1.0, ("sav", h))
        return out

    def _karaka_factor(self, g: str) -> Factor | None:
        c, rd = self.c, self.reader
        score, bits = 0.0, [rd.f_place(g)]
        if c.house[g] in KENDRAS or c.house[g] in TRIKONAS:
            score += 0.5
        elif c.house[g] in DUSTHANAS:
            score -= 0.5
        status = c.dignity[g]["status"]
        if status in ("Exalted", "Own sign", "Moolatrikona"):
            score += 1.0
            bits.append(rd.f_dignity(g))
        elif status == "Debilitated":
            score -= 1.0
            bits.append(rd.f_dignity(g))
        if c.combust[g]["combust"]:
            score -= 0.75
            bits.append(rd.f_combust(g))
        if not score:
            return None
        meaning = ("strengthens the natural signifier of this topic" if score > 0
                   else "makes the natural signifier of this topic work harder")
        return Factor(f"{_t(g)}, the natural signifier of {PLANET_MEANING[g]}: {', '.join(b for b in bits if b)}, which {meaning}",
                      f"{_t(g)} as natural signifier", score * 0.8, "promise", ("karaka", g))

    def _promise(self, topic: Topic):
        """Findings for the topic houses and significators; a planet that recurs (for example the lord of
        two topic houses) is described once, with extra weight because it carries both houses."""
        anchor = self.anchor(topic)
        merged: dict[tuple, Factor] = {}
        ordered = [anchor] + [h for h in topic.houses if h != anchor]
        factors = [f for h in ordered for f in self._house_factors(h, 1.0 if h == anchor else 0.7)]
        factors += [k for k in (self._karaka_factor(g) for g in topic.karakas) if k]
        for f in factors:
            if f.key and f.key in merged:
                merged[f.key].weight += 0.5 * f.weight
            else:
                merged[f.key or (id(f),)] = f
        return list(merged.values())

    @staticmethod
    def anchor(topic: Topic) -> int:
        return ANCHOR.get(topic.key, topic.houses[0])

    # ---------------------------------------------------------------- outlet and theme
    def _theme(self, topic: Topic, lean: str, drivers, counters) -> str:
        h = self.anchor(topic)
        lord = self.c.house_lord[h]
        sits = self.c.house[lord]
        noun = TOPIC_NOUN.get(topic.key, topic.label.lower())
        outlet = TOPIC_OUTLET.get((topic.key, h), LORD_OUTLET)[sits]
        because = f"because the {_ord(h)} lord {_t(lord)} sits in the {_ord(sits)} house"
        if topic.key in ("timing", "year", "month", "lifetime", "general"):
            lead = f"The chart's direction runs through {outlet}, because the ascendant lord {_t(lord)} sits in the {_ord(sits)} house"
        elif topic.key == "health":
            lead = f"Your resilience is tied to {outlet}, {because}"
        elif (topic.key, h) in TOPIC_OUTLET:
            lead = f"{noun[0].upper() + noun[1:]} finds its outlet through {outlet}, {because}"
        else:
            lead = f"{noun[0].upper() + noun[1:]} is closely tied to {outlet}, {because}"
        if sits == h:
            lead = (f"{noun[0].upper() + noun[1:]} is self-directed: the {_ord(h)} lord {_t(lord)} sits in its own house, "
                    "so results depend heavily on how deliberately you build them")
        tail = ""
        if drivers and counters:
            tail = f"; the strongest support is {drivers[0].label}, and the main condition is {counters[0].label}"
        elif drivers:
            tail = f"; the strongest support is {drivers[0].label}"
        elif counters:
            tail = f"; the main condition is {counters[0].label}"
        return lead + tail + "."

    # ---------------------------------------------------------------- activation
    def _link(self, g, topic: Topic) -> str:
        """Why a period lord matters for this topic, in the same terms as its relevance."""
        rd = self.reader
        own_main = [h for h in topic.houses if self.c.house_lord[h] == g]
        own_side = [h for h in topic.secondary if self.c.house_lord[h] == g]
        lord_tag = lambda h: (f'<fact kind="house_lord" house="{h}" lord="{_t(g)}">the {_ord(h)} house</fact>')
        aspect_tag = lambda h: f'<fact kind="aspect" planet="{_t(g)}" house="{h}">the {_ord(h)} house</fact>'
        join = lambda items: items[0] if len(items) == 1 else ", ".join(items[:-1]) + " and " + items[-1]
        bits = []
        if own_main:
            bits.append("rules " + join([lord_tag(h) for h in own_main]))
        if self.c.house[g] in topic.houses:
            bits.append("occupies a core house as " + rd.f_place(g, compact=True))
        aspected = [h for h in topic.houses if self.c.aspects(g, h) and self.c.house[g] != h]
        if aspected and not bits:
            bits.append("aspects " + join([aspect_tag(h) for h in aspected[:2]]))
        if not bits and own_side:
            bits.append("supports the question as lord of " + join([lord_tag(h) for h in own_side]))
        if not bits and self.c.house[g] in topic.secondary:
            bits.append("sits in a supporting house as " + rd.f_place(g, compact=True))
        return "; ".join(bits) or "works only in the background for this question"

    def _relevance(self, g, topic: Topic) -> int:
        rel = self.reader.relevance(g, topic)
        if rel == 0 and any(self.c.aspects(g, h) for h in topic.houses):
            rel = 1
        return rel

    def _activation_now(self, topic: Topic) -> tuple[str, int]:
        running = self.c.dasha.running(self.now, depth=2)
        if not running:
            return "No running dasha in range.", 0
        rel = max(self._relevance(p.lord, topic) for p in running)
        parts = []
        for i, p in enumerate(running):
            if i and p.lord == running[i - 1].lord:
                parts.append(f"{self.reader.f_dasha(p)}, the same lord's own sub-period, which concentrates that agenda")
            else:
                parts.append(f"{self.reader.f_dasha(p)}, whose lord {self._link(p.lord, topic)}")
        verdict = ("The running period speaks directly to this question, so it is live now."
                   if rel == 2 else
                   "The running period touches the question indirectly; expect preparation more than decisive movement."
                   if rel == 1 else
                   "The running period is about other parts of life; this topic is quieter until a connected period begins.")
        return "Now running: " + "; then ".join(parts) + ". " + verdict, rel

    # ---------------------------------------------------------------- windows
    def _horizon(self, topic: Topic):
        return {"month": (45, 3), "year": (550, 3), "timing": (550, 3), "lifetime": (36525, 1)}.get(
            topic.key, (int(365.25 * 5), 2))

    def _targets(self, topic: Topic) -> dict[int, str]:
        h = self.anchor(topic)
        lord = self.c.house_lord[h]
        targets = {self.c.house_sign[h]: f"your {_ord(h)} house"}
        targets.setdefault(self.c.sign[lord], f"your {_ord(h)} lord {_t(lord)}")
        return targets

    def _windows(self, topic: Topic) -> list[Window]:
        days, depth = self._horizon(topic)
        end = self.now + timedelta(days=days)
        try:
            dt = double_transits(self.c, self._targets(topic), self.now, end) if topic.key != "lifetime" else []
        except ValueError:     # outside the ephemeris range
            dt = []
        current = self.c.dasha.running(self.now, depth=depth)
        current_lords = current[-1].lords if current else None
        out = []
        for p in self.c.dasha.between(self.now, end, depth=depth):
            if p.end <= self.now:
                continue
            rel = self._relevance(p.lord, topic)
            if rel == 0 and topic.key != "lifetime":
                continue
            start, finish = max(p.start, self.now), min(p.end, end)
            overlap = None
            for d in dt:
                lo, hi = max(start, d[0]), min(finish, d[1])
                if (hi - lo).days >= 20 and (overlap is None or (hi - lo) > (overlap[1] - overlap[0])):
                    overlap = (lo, hi, d[2], d[3], d[4])
            md_rel = self._relevance(p.lords[0], topic) if len(p.lords) > 1 else 0
            score = 1.2 * rel + (1.5 if overlap else 0.0) + 0.4 * (md_rel > 0) - (0.3 if p.lords == current_lords else 0.0)
            out.append(Window(start, finish, p, rel, overlap, score))
        out.sort(key=lambda w: (-w.score, w.start))
        best = sorted(out[:3], key=lambda w: w.start)
        for w in best:
            w.text = self._window_text(w, topic)
        return best

    def _window_text(self, w: Window, topic: Topic) -> str:
        base = f"{self.reader.f_dasha(w.dasha)}: the period lord {self._link(w.dasha.lord, topic)}"
        if w.double_transit:
            lo, hi, js, ss, label = w.double_transit
            mid = (lo + (hi - lo) / 2).astimezone(self.tz).date().isoformat()
            jtag = f'<fact kind="transit" planet="Jupiter" sign="{SIGNS[js]}" date="{mid}">Jupiter in {SIGNS[js]}</fact>'
            stag = f'<fact kind="transit" planet="Saturn" sign="{SIGNS[ss]}" date="{mid}">Saturn in {SIGNS[ss]}</fact>'
            span = f"{lo.astimezone(self.tz):%b %Y} to {hi.astimezone(self.tz):%b %Y}"
            return (f"{base}. Inside it, from {span}, {jtag} and {stag} both reach {label} — a Jupiter–Saturn "
                    "double transit, the classical trigger that turns a period's promise into visible movement. "
                    "This is the most concrete window of the set.")
        return (f"{base}. No Jupiter–Saturn double transit falls inside it, so treat it as a build-up period: "
                "good for preparation, applications and groundwork rather than a single decisive event.")

    # ---------------------------------------------------------------- judgment
    def promise_score(self, topic: Topic) -> float:
        factors = self._promise(topic)
        promise = sum(f.weight for f in factors) + self._moon_check(topic)[1]
        varga = self.reader.varga_assessment(topic.varga, topic.varga_house, promise) if topic.varga else None
        return promise + (0.5 * varga["score"] if varga else 0.0)

    @staticmethod
    def lean_for(topic_key: str, promise: float) -> str:
        low, mid, high = CALIBRATION.get(topic_key, CALIBRATION["general"])
        if promise >= high:
            return "strong"
        if promise >= mid:
            return "supportive"
        if promise <= low:
            return "demanding"
        return "mixed"

    def judge(self, topic: Topic) -> Judgment:
        factors = self._promise(topic)
        moon_text, moon_w = self._moon_check(topic)
        promise = sum(f.weight for f in factors) + moon_w
        varga = self.reader.varga_assessment(topic.varga, topic.varga_house, promise) if topic.varga else None
        if varga:
            promise += 0.5 * varga["score"]
        lean = self.lean_for(topic.key, promise)
        drivers = sorted([f for f in factors if f.weight > 0], key=lambda f: -f.weight)[:3]
        counters = sorted([f for f in factors if f.weight < 0], key=lambda f: f.weight)[:2]
        activation_now, act_rel = self._activation_now(topic)
        windows = self._windows(topic)
        notes = self.reader.sensitivity_notes(topic)
        layers = {
            "promise": {"strong": True, "supportive": True, "demanding": False}.get(lean),
            "confirmation": (None if not varga else varga["agreement"] == "agree"),
            "activation": act_rel >= 1,
            "trigger": any(w.double_transit for w in windows) if topic.key != "lifetime" else None,
        }
        agree = sum(1 for v in layers.values() if v)
        disagree = sum(1 for v in layers.values() if v is False)
        applicable = sum(1 for v in layers.values() if v is not None)
        if layers["promise"] is None:
            confidence = "moderate" if agree >= 2 and disagree == 0 else "low"
            reason = ("the natal promise itself is mixed, so even well-timed periods bring mixed results"
                      if confidence == "moderate" else
                      "the natal promise is mixed and the timing layers do not line up")
        elif agree >= 3 and disagree == 0:
            confidence = "high"
            reason = f"all {agree} applicable layers point the same way"
        elif agree >= 2 and disagree <= 1:
            confidence, reason = "moderate", f"{agree} of {applicable} layers agree, but not all of them"
        else:
            confidence, reason = "low", "the layers disagree, so the chart supports themes more than firm conclusions"
        if notes and confidence == "high":
            confidence = "moderate"
            reason += ", but birth-time sensitivity limits precise timing"
        elif notes:
            reason += "; birth-time sensitivity limits precise timing"
        lean_text = (HEALTH_LEAN if topic.key == "health" else LEAN_WORDS)[lean]
        return Judgment(topic, lean, lean_text, self._theme(topic, lean, drivers, counters), drivers, counters,
                        moon_text, varga, activation_now, act_rel, windows, round(promise, 2), layers, confidence,
                        reason, notes)


def judge(chart, report, topic: Topic, now: datetime | None = None) -> Judgment:
    return Judge(chart, report, now).judge(topic)


def working_notes(j: Judgment) -> str:
    """Compact, fact-tagged conclusions for the AI reader: write from these, don't recite tables."""
    def layer(v):
        return {True: "agrees", False: "disagrees", None: "neutral / not applicable"}[v]
    lines = [
        "## Astrologer's working notes (engine judgment for this question — write the reading FROM these conclusions)",
        f"- Overall lean: **{j.lean_text}**.",
        f"- Central theme: {j.theme}",
        "- Strongest supports: " + (" | ".join(f.text for f in j.drivers) or "none stand out"),
        "- Main counterweights: " + (" | ".join(f.text for f in j.counterweights) or "no major friction in the core houses"),
        f"- Moon cross-check: {j.moon_check}",
    ]
    if j.varga:
        lines.append(f"- Divisional confirmation: {j.varga['text']}")
    lines.append(f"- Activation: {j.activation_now}")
    if j.windows:
        lines.append("- Ranked windows (dasha activation × Jupiter–Saturn double transit), nearest first:")
        lines += [f"  {i}. {w.text}" for i, w in enumerate(j.windows, 1)]
    else:
        lines.append("- No dasha period in the horizon connects directly to this topic; do not force a date.")
    lines.append("- Layer agreement: " + ", ".join(f"{k} {layer(v)}" for k, v in j.layers.items()))
    lines.append(f"- Confidence the evidence supports: **{j.confidence}** — {j.confidence_reason}.")
    lines.append("Use these as your reasoning backbone: open with the lean and the theme in plain words, explain the "
                 "two or three supports and the main counterweight as cause and effect, then the windows with their "
                 "reasons. You may reorder or rephrase; never contradict a fact tag, and keep the tags you reuse intact.")
    return "\n".join(lines)
