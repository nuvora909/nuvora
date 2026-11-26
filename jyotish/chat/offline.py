"""Deterministic Parashari readings used when no LLM is configured or the provider fails.

The reader uses the same topic blueprints as the live model. It synthesises house lords,
occupants, aspects, dignity, natural significators, divisional charts, dashas and transits.
Every generated chart statement is fact-tagged and passes through the same verifier as an
AI answer. Internal weights only organise the evidence; they are never presented as a score.
"""
from __future__ import annotations

import re
from datetime import datetime, timedelta, timezone

from vedic.chart import DUSTHANAS, KENDRAS, TRIKONAS
from vedic.constants import NATURAL_BENEFICS, NATURAL_MALEFICS, SIGN_LORD, SIGNS
from vedic.transits import ingresses

from .prashna import build_prashna
from .topics import Topic, detect_topic, is_decision_question, is_join_decision

LABEL = "Offline rule-based deep reading (no AI model configured)"

HOUSE_MEANING = {
    1: "self, body and direction", 2: "family, speech and savings", 3: "effort, courage and siblings",
    4: "home, mother, property and inner peace", 5: "intelligence, children and creativity",
    6: "work routines, health issues, debts and competition", 7: "partnership and marriage",
    8: "transformation, shared money and the hidden", 9: "fortune, teachers and dharma",
    10: "career, status and visible work", 11: "gains, networks and ambitions",
    12: "expenses, foreign lands, rest and release",
}
PLANET_MEANING = {
    "SUN": "authority, vitality and self-confidence", "MOON": "the mind, adaptation and emotional needs",
    "MARS": "drive, property, courage and decisiveness", "MERCURY": "intellect, communication and trade",
    "JUPITER": "wisdom, guidance, children and growth", "VENUS": "relationships, comfort, vehicles and art",
    "SATURN": "discipline, work, endurance and slow results", "RAHU": "ambition, foreign connections and the unconventional",
    "KETU": "detachment, intuition and specialised insight",
}
UPACHAYAS = {3, 6, 10, 11}
SENSITIVITY_KEYS = {7: "saptamsha_lagna", 9: "navamsha_lagna", 10: "dashamsha_lagna", 60: "shashtiamsha_lagna"}


def _ord(n):
    return f"{n}{'th' if 10 <= n % 100 <= 20 else {1: 'st', 2: 'nd', 3: 'rd'}.get(n % 10, 'th')}"


def _t(g):
    return g.title()


def _cap(text: str) -> str:
    """Capitalise the first visible letter, looking past a leading fact tag."""
    m = re.match(r"(\s*(?:<fact[^>]*>)?)(\w)", text)
    return text if not m else text[:m.end(1)] + m.group(2).upper() + text[m.end(2):]


def _point(text, label, weight):
    return {"text": text, "label": label, "weight": weight}


class Reader:
    def __init__(self, chart, report):
        self.c, self.r = chart, report
        self.tz = chart.time.local.tzinfo
        at = report.get("transits", {}).get("at")
        self.now = (datetime.fromisoformat(at).astimezone(timezone.utc) if at
                    else datetime.now(timezone.utc))

    def f_place(self, g, n=1, compact=False):
        if n == 1:
            sign, house = SIGNS[self.c.sign[g]], self.c.house[g]
        else:
            p = self.c.varga[n]["planets"][g]
            sign, house = p["sign_name"], p["house"]
        chart = "" if n == 1 else f' chart="D{n}"'
        visible = (f'{_t(g)} in the {_ord(house)} house' if compact else
                   f'{_t(g)} in {sign} in the {_ord(house)} house' + (f' of D{n}' if n != 1 else ''))
        return (f'<fact kind="placement" planet="{_t(g)}" sign="{sign}" house="{house}"{chart}>'
                f'{visible}</fact>')

    def f_lagna(self, n=1):
        L = self.r["lagna"] if n == 1 else self.c.varga[n]["lagna"]
        chart = "" if n == 1 else f' chart="D{n}"'
        label = "ascendant" if n == 1 else f"D{n} ascendant"
        return f'<fact kind="lagna" sign="{L["sign_name"]}"{chart}>{L["sign_name"]} {label}</fact>'

    def f_lord(self, h, compact=False):
        lord = self.c.house_lord[h]
        if compact:
            return (f'<fact kind="house_lord" house="{h}" lord="{_t(lord)}">'
                    f'the {_ord(h)} lord {_t(lord)}</fact>')
        return (f'<fact kind="house_lord" house="{h}" lord="{_t(lord)}" in_house="{self.c.house[lord]}">'
                f'the {_ord(h)} lord {_t(lord)}, placed in the {_ord(self.c.house[lord])} house</fact>')

    def f_aspect(self, g, h):
        return (f'<fact kind="aspect" planet="{_t(g)}" house="{h}">'
                f'{_t(g)} aspects the {_ord(h)} house</fact>')

    def f_dignity(self, g):
        st = self.c.dignity[g]["status"]
        key = {"Exalted": "exalted", "Debilitated": "debilitated", "Own sign": "own",
               "Moolatrikona": "moolatrikona", "Great Friend": "great friend", "Friend": "friend",
               "Neutral": "neutral", "Enemy": "enemy", "Great Enemy": "great enemy"}
        if st not in key:
            return None
        phrase = {"Own sign": "in its own sign", "Moolatrikona": "in its moolatrikona sign",
                  "Great Friend": "in a great friend's sign", "Friend": "in a friend's sign",
                  "Neutral": "in a neutral sign", "Enemy": "in an enemy's sign",
                  "Great Enemy": "in a great enemy's sign"}.get(st, st.lower())
        return f'<fact kind="dignity" planet="{_t(g)}" status="{key[st]}">{_t(g)} is {phrase}</fact>'

    def f_combust(self, g):
        return f'<fact kind="combust" planet="{_t(g)}" value="true">{_t(g)} is combust</fact> (too close to the Sun)'

    def f_retro(self, g):
        return f'<fact kind="retrograde" planet="{_t(g)}" value="true">{_t(g)} is retrograde</fact>'

    def f_sav(self, h):
        v = self.r["ashtakavarga"]["sav_by_house"][h - 1]["sav"]
        return (f'<fact kind="sav" house="{h}" value="{v}">'
                f'{v} Sarvashtakavarga bindus in the {_ord(h)} house</fact>'), v

    def f_dasha(self, p):
        """A period with exact dates in the tag (for the verifier) and readable dates in the text."""
        label = "-".join(_t(x) for x in p.lords)
        s, e = p.start.astimezone(self.tz), p.end.astimezone(self.tz)
        shown = "–".join(_t(x) for x in p.lords)
        if len(p.lords) == 1:
            visible = f"{shown} major period ({s:%Y} – {e:%Y})"
        else:
            visible = f"{shown} period ({s:%b %Y} – {e:%b %Y})"
        return (f'<fact kind="dasha" lords="{label}" start="{s.date().isoformat()}" end="{e.date().isoformat()}">'
                f'{visible}</fact>')

    def f_transit(self, g):
        p = self.r["transits"]["positions"][g]
        return (f'<fact kind="transit" planet="{_t(g)}" sign="{p["sign_name"]}" '
                f'house="{p["house_from_lagna"]}" from="lagna">'
                f'{_t(g)} transits {p["sign_name"]}, the {_ord(p["house_from_lagna"])} house from lagna</fact>')

    def house_assessment(self, h):
        """Return evidence, not just a total. Weights organise the answer and stay private."""
        c = self.c
        lord = c.house_lord[h]
        lh = c.house[lord]
        points = []
        opening = f"The {_ord(h)} lord is {self.f_lord(h)}."
        if lh in KENDRAS or lh in TRIKONAS:
            points.append(_point(
                "The ruling planet sits in a prominent or supportive house, connecting this topic to other important parts of life.",
                f"a well-anchored {_ord(h)} lord", 1.25))
        elif lh in DUSTHANAS:
            if h in DUSTHANAS:
                points.append(_point(
                    "Both houses are traditionally considered demanding, so this topic may involve change or adjustment rather than a straight path.",
                    f"the {_ord(h)} lord works through a demanding house", -0.25))
            else:
                points.append(_point(
                    f"Its lord is placed in the {_ord(lh)} house, a traditionally demanding area; progress may need extra planning or behind-the-scenes effort.",
                    f"the {_ord(h)} lord falls in a demanding house", -1.25))
        else:
            points.append(_point(
                "The lord's placement is not a strong support or obstacle by itself, so the surrounding factors matter more.",
                f"a neutral setting for the {_ord(h)} lord", 0.0))
        d = self.f_dignity(lord)
        st = c.dignity[lord]["status"]
        if d and st in ("Exalted", "Own sign", "Moolatrikona"):
            points.append(_point(f"This strengthens the ruling planet's ability to support the topic: {d}.", f"dignity of the {_ord(h)} lord", 1.5))
        elif d and st == "Debilitated":
            points.append(_point(
                f"Dignity is the qualification: {d}, so the lord needs support from other factors rather than being read as automatically strong.",
                f"debilitation of the {_ord(h)} lord", -1.5))
        if c.combust[lord]["combust"]:
            points.append(_point(
                f"Combustion adds friction: {self.f_combust(lord)}. Its agenda can be overshadowed by authority, urgency or competing priorities.",
                f"combustion of the {_ord(h)} lord", -1.0))
        occ = list(c.occupants[h])
        benefics = [g for g in occ if g in NATURAL_BENEFICS]
        malefics = [g for g in occ if g in NATURAL_MALEFICS]
        if benefics:
            points.append(_point(
                "Benefic occupation supports the house through " + ", ".join(self.f_place(g) for g in benefics) + ".",
                f"benefic support inside the {_ord(h)} house", float(len(benefics))))
        if malefics:
            if h in UPACHAYAS:
                points.append(_point(
                    "The house also contains " + ", ".join(self.f_place(g) for g in malefics) +
                    ". In a house associated with growth through effort, this can become productive when handled with discipline.",
                    f"productive pressure in the {_ord(h)} house", 0.25 * len(malefics)))
            else:
                points.append(_point(
                    "The house carries greater pressure from " + ", ".join(self.f_place(g) for g in malefics) +
                    ". This adds pressure and can make results less straightforward; it is not a denial by itself.",
                    f"malefic pressure on the {_ord(h)} house", -0.75 * len(malefics)))
        aspects = [g for g in c.aspected_by[h] if g not in occ]
        helpful = [g for g in aspects if g in NATURAL_BENEFICS]
        difficult = [g for g in aspects if g in NATURAL_MALEFICS]
        if helpful:
            tags = ", ".join(self.f_aspect(g, h) for g in helpful)
            interpretation = (" Jupiter can add a protective influence, but it does not remove other conditions."
                              if "JUPITER" in helpful else ".")
            points.append(_point("Protective influence comes from " + tags + interpretation,
                                 f"benefic aspects to the {_ord(h)} house", 0.75 * len(helpful)))
        if difficult:
            points.append(_point(
                "There is also demanding influence: " + ", ".join(self.f_aspect(g, h) for g in difficult) +
                ". This can bring friction, delays, or extra effort in this area.",
                f"demanding aspects to the {_ord(h)} house", -0.5 * len(difficult)))
        tag, sav = self.f_sav(h)
        if sav >= 28:
            points.append(_point(f"The house has {tag}, above the 28-bindu reference. This is one supportive factor, not a guarantee.",
                                 f"above-average SAV support in the {_ord(h)} house", 1.0))
        elif sav < 25:
            points.append(_point(f"The house has {tag}, below the 28-bindu reference. Treat this as a qualification, not a prediction of failure.",
                                 f"lower SAV support in the {_ord(h)} house", -1.0))
        else:
            points.append(_point(f"The house has {tag}, close to the middle range rather than an extreme.",
                                 f"average SAV support in the {_ord(h)} house", 0.0))
        supports = [p for p in points if p["weight"] > 0]
        challenges = [p for p in points if p["weight"] < 0]
        return {"house": h, "opening": opening, "points": points, "supports": supports,
                "challenges": challenges, "score": sum(p["weight"] for p in points)}

    def karaka_assessment(self, g):
        c = self.c
        evidence = [self.f_place(g)]
        score = 0.5 if c.house[g] in KENDRAS or c.house[g] in TRIKONAS else (-0.5 if c.house[g] in DUSTHANAS else 0.0)
        st = c.dignity[g]["status"]
        d = self.f_dignity(g)
        if d and st in ("Exalted", "Own sign", "Moolatrikona", "Debilitated", "Great Enemy", "Enemy"):
            evidence.append(d)
        if st in ("Exalted", "Own sign", "Moolatrikona"):
            score += 1.0
        elif st == "Debilitated":
            score -= 1.0
        elif st in ("Great Enemy", "Enemy"):
            score -= 0.25
        if c.combust[g]["combust"]:
            evidence.append(self.f_combust(g))
            score -= 0.75
        if c.retro[g] and g not in ("RAHU", "KETU"):
            evidence.append(self.f_retro(g))
        if score >= 1:
            meaning = "It reinforces the natal promise rather than merely describing the topic."
        elif score < 0:
            meaning = "It makes the topic more conditional: support, maturity and timing matter before the promise expresses cleanly."
        else:
            meaning = "It neither clearly overrides nor cancels the house evidence; it adds a secondary, mixed confirmation."
        return {"planet": g, "text": f"**{_t(g)} — {PLANET_MEANING[g]}:** " + "; ".join(evidence) + ". " + meaning,
                "score": score, "label": f"{_t(g)} as natural significator"}

    @staticmethod
    def _varga_placement_weight(house):
        if house in KENDRAS or house in TRIKONAS:
            return 1.0
        if house in DUSTHANAS:
            return -1.0
        return 0.0

    def varga_assessment(self, n, focus_house, d1_score):
        v = self.c.varga.get(n)
        if not v:
            return None
        lag = v["lagna"]["sign"]
        lagna_lord = SIGN_LORD[lag]
        focus_lord = SIGN_LORD[(lag + focus_house - 1) % 12]
        lords = [lagna_lord] if lagna_lord == focus_lord else [lagna_lord, focus_lord]
        score = sum(self._varga_placement_weight(v["planets"][g]["house"]) for g in lords)
        if lagna_lord == focus_lord:
            placements = (f"The same planet, {_t(lagna_lord)}, rules both the D{n} ascendant and its focus house; "
                          f"it appears as {self.f_place(lagna_lord, n)}.")
        else:
            placements = (f"The D{n} lagna lord appears as {self.f_place(lagna_lord, n)}, while the "
                          f"{_ord(focus_house)} lord of D{n} appears as {self.f_place(focus_lord, n)}.")
        d1_dir = 1 if d1_score >= 2 else (-1 if d1_score <= -2 else 0)
        v_dir = 1 if score >= 1 else (-1 if score <= -1 else 0)
        if d1_dir and d1_dir == v_dir:
            agreement = "agree"
            explanation = ("both lean constructive, so the divisional chart confirms rather than dilutes the D1 indication."
                           if d1_dir > 0 else
                           "both require effort or adjustment, so the D1 constraint should not be explained away.")
        elif d1_dir and v_dir and d1_dir != v_dir:
            agreement = "do not fully agree"
            explanation = "one layer is more cooperative than the other, so expect mixed expression rather than a simple yes or no."
        else:
            agreement = "partly agree"
            explanation = "at least one layer is neutral or mixed, making this a qualified confirmation rather than a decisive one."
        text = (f"For D{n} {v['name']} ({v['domain']}), the chart has {self.f_lagna(n)}. {placements} "
                f"On this structural comparison, D1 and D{n} **{agreement}**: {explanation}")
        return {"text": text, "agreement": agreement, "score": score, "placements": placements,
                "explanation": explanation, "name": v["name"], "domain": v["domain"], "n": n}

    def relevance(self, g, topic: Topic):
        own = set(self.c.lord_of[g])
        if own & set(topic.houses) or self.c.house[g] in topic.houses:
            return 2
        if own & set(topic.secondary) or self.c.house[g] in topic.secondary:
            return 1
        return 0

    def activation_reason(self, g, topic: Topic, compact=True):
        own_main = sorted(set(self.c.lord_of[g]) & set(topic.houses))
        own_secondary = sorted(set(self.c.lord_of[g]) & set(topic.secondary))
        bits = []
        if own_main:
            bits.append("directly activates " + ", ".join(self.f_lord(h, compact=compact) for h in own_main))
        if self.c.house[g] in topic.houses:
            bits.append("occupies a core house: " + self.f_place(g, compact=compact))
        if not bits and own_secondary:
            bits.append("supports through " + ", ".join(self.f_lord(h, compact=compact) for h in own_secondary))
        if not bits and self.c.house[g] in topic.secondary:
            bits.append("occupies a supporting house: " + self.f_place(g, compact=compact))
        if not bits:
            bits.append("works indirectly; watch its sub-periods rather than expecting this topic to dominate")
        return "; ".join(bits)

    def current_periods(self, topic: Topic):
        running = self.c.dasha.running(self.now, depth=3)
        if not running:
            return []
        names = ["Mahadasha", "Antardasha", "Pratyantardasha"]
        roles = ["sets the long-term agenda", "describes the present delivery channel", "acts as the short-term trigger"]
        out = []
        for i, p in enumerate(running):
            repeated = i and p.lord == running[i - 1].lord
            emphasis = ("The repeated lord concentrates the same agenda instead of introducing a new one."
                        if repeated else f"The {_t(p.lord)} layer emphasises {PLANET_MEANING[p.lord]}.")
            out.append(f"- **{names[i]} — {roles[i]}:** {self.f_dasha(p)} — "
                       f"{self.activation_reason(p.lord, topic)}. {emphasis}")
        return out

    def timing_windows(self, topic: Topic):
        if topic.key == "month":
            days, depth = 45, 3
        elif topic.key in ("year", "timing"):
            days, depth = 550, 3
        elif topic.key == "lifetime":
            days, depth = 36525, 1
        elif topic.key == "general":
            days, depth = int(365.25 * 5), 2
        else:
            days, depth = int(365.25 * 10), 2
        running = self.c.dasha.running(self.now, depth=depth)
        current = running[-1].lords if running else None
        periods = [p for p in self.c.dasha.between(self.now, self.now + timedelta(days=days), depth=depth)
                   if p.end > self.now and (topic.key == "lifetime" or self.relevance(p.lord, topic)) and p.lords != current]
        rows = ["| Period | Activation | Timing read |", "|---|---|---|"]
        for p in periods[:(9 if topic.key == "lifetime" else 5)]:
            rel = self.relevance(p.lord, topic)
            read = ("Direct activation; moderate confidence" if rel == 2 else
                    "Supporting activation; low–moderate confidence" if rel == 1 else
                    "Background chapter; use its sub-periods for specific timing")
            rows.append(f"| {self.f_dasha(p)} | {self.activation_reason(p.lord, topic)} | {read} |")
        if len(rows) == 1:
            return ("No sub-period lord in the selected horizon has a direct house connection to this topic. "
                    "That argues against forcing a date: use the current-period agenda and transit calendar instead.")
        return ("These are **activation windows, not guaranteed events**. A direct period brings the topic forward; "
                "whether the result is easy or demanding still depends on the natal evidence above.\n\n" + "\n".join(rows))

    def transit_lines(self, topic: Topic):
        t = self.r.get("transits")
        if not t:
            return []
        out = []
        for g in ("JUPITER", "SATURN", "RAHU"):
            p = t["positions"][g]
            houses = {p["house_from_lagna"], p["house_from_moon"]}
            if houses & set(topic.houses):
                rel = "This directly touches the houses being read, so it can make the topic more visible now."
            elif houses & set(topic.secondary):
                rel = "This touches a supporting area rather than the core house, so its effect is likely to be indirect."
            else:
                rel = "This is background climate for the question, not the main trigger."
            out.append(f"- {self.f_transit(g)}. {rel}")
        ss = t["sade_sati"]
        if ss["active"]:
            out.append(f'- <fact kind="sade_sati" active="true">Sade Sati is active</fact> ({ss["phase"]}). '
                       "Treat it as a discipline and simplification cycle, not as a curse or a guaranteed loss.")
        else:
            out.append('- <fact kind="sade_sati" active="false">Sade Sati is not active</fact> at the report date.')
        relevant = [i for i in t.get("upcoming_ingresses", [])
                    if i["planet"] in ("JUPITER", "SATURN")
                    and (i["house_from_lagna"] in topic.houses or i["house_from_moon"] in topic.houses)]
        if relevant:
            out.append("The engine's slow-transit calendar then marks " + "; ".join(
                f"{_t(i['planet'])} entering {i['to']} on {i['time'][:10]} "
                f"({_ord(i['house_from_lagna'])} from lagna, {_ord(i['house_from_moon'])} from Moon)"
                for i in relevant[:3]) + ". Use these as review dates around the dasha windows, not standalone promises.")
        if topic.key == "month":
            end = self.now + timedelta(days=45)
            changes = []
            for g in ("SUN", "MERCURY", "VENUS", "MARS"):
                step = 0.5 if g == "SUN" else 1.0
                for i in ingresses(self.c.eph, g, self.now, end, step_days=step)[:3]:
                    when = i["time"].astimezone(self.tz)
                    changes.append((when, f"{_t(g)} enters {i['to']} on {when.date().isoformat()} "
                                          f"({_ord(self.c.house_of_sign(i['to_sign']))} from lagna)"))
            if changes:
                out.append("Short-term sign changes: " + "; ".join(text for _, text in sorted(changes)[:8]) +
                           ". These colour shorter phases within the dasha; they do not override the natal promise.")
        return out

    def practical_synthesis(self, topic: Topic, assessments):
        """Translate the compared houses into a decision, rather than repeating placements."""
        by_house = {a["house"]: a for a in assessments}
        if topic.key == "career":
            service, status = by_house[6]["score"], by_house[10]["score"]
            if status > service + 0.75:
                return ("Visible ownership, leadership or independent responsibility has the stronger base here. "
                        "That can be expressed inside a job; it does not automatically mean entrepreneurship. "
                        "Test a business through a bounded pilot during a direct 10th/11th-house period, with cash flow and demand checked separately.")
            return ("A structured role is the more reliable foundation because service and status are closely linked. "
                    "Independent work is not denied, but it should build on an established skill, reputation and network rather than a desire to escape an unsuitable role.")
        if topic.key == "foreign":
            home, distance = by_house[4]["score"], by_house[12]["score"]
            if distance > home + 0.75:
                return ("Distance and foreign connections have the clearer activation channel, while the home base needs a deliberate plan. "
                        "Separate an extended assignment from permanent relocation: the first tests the opportunity without prematurely disturbing the second.")
            return ("The home base remains an important anchor, so travel may be easier to support than permanent relocation. "
                    "A move becomes more credible when the career, visa and support-network pieces improve together, not from the 12th-house indication alone.")
        if topic.key == "money":
            strongest = max((2, 11, 9), key=lambda h: by_house[h]["score"])
            channel = {2: "retention, reserves and family-resource management", 11: "income channels, networks and gains",
                       9: "mentors, education and longer-range opportunity"}[strongest]
            return (f"The more useful wealth lever is {channel}. Treat earning, saving and speculation as different processes: "
                    "a good gains period cannot compensate for weak reserves, and no dasha makes an unsuitable investment safe.")
        if topic.key == "education":
            strongest = max((4, 5, 9), key=lambda h: by_house[h]["score"])
            channel = {4: "structured foundations and consistent study", 5: "conceptual ability, problem-solving and creative application",
                       9: "higher learning, teachers and a well-chosen specialisation"}[strongest]
            return (f"The learning pattern is best approached through {channel}. Choose courses by testing that strength in real work; "
                    "use the slower periods for revision and credentials rather than interpreting them as a denial of education.")
        if topic.key == "health":
            return ("The practical reading is about resilience, not disease: stabilise daily routines first, respect recovery periods and "
                    "use demanding phases as reminders for appropriate screening or clinical advice. No house or period here can diagnose an illness.")
        strongest = max(assessments, key=lambda a: a["score"])
        weakest = min(assessments, key=lambda a: a["score"])
        if strongest["house"] == weakest["house"]:
            return f"The main area to work consciously is {HOUSE_MEANING[strongest['house']]}; the evidence is mixed rather than one-sided."
        return (f"The clearest channel for progress is {HOUSE_MEANING[strongest['house']]}, while "
                f"{HOUSE_MEANING[weakest['house']]} needs more deliberate management. Use the stronger area to support the weaker one "
                "instead of expecting every part of the topic to develop at the same speed.")

    def sensitivity_notes(self, topic: Topic):
        s = self.r.get("sensitivity", {})
        notes = []
        n = topic.varga
        key = SENSITIVITY_KEYS.get(n) if n else None
        if key and key in s and s[key]["rating"] != "robust":
            item = s[key]
            notes.append(f'<fact kind="sensitivity" factor="{key}" rating="{item["rating"]}">'
                         f'The D{n} ascendant is {item["rating"]} to birth time</fact>: it changes '
                         f'{item["nearest_change_min"]} minutes away, so that divisional confirmation is provisional.')
        elif n and n not in SENSITIVITY_KEYS:
            notes.append(f"D{n} is more birth-time dependent than D1 and has no dedicated sensitivity metric in this report; "
                         "use it as secondary confirmation rather than the sole basis for a decision.")
        moon = s.get("moon_nakshatra", {})
        if moon.get("rating") not in (None, "robust"):
            notes.append(f'<fact kind="sensitivity" factor="moon_nakshatra" rating="{moon["rating"]}">'
                         f'The Moon nakshatra is {moon["rating"]} to birth time</fact>. Dasha dates shift about '
                         f'{s["dasha_shift_per_10_min_days"]} days per 10 minutes of birth-time error, so widen the timing windows.')
        return notes

    def plain_sensitivity(self, topic: Topic) -> str | None:
        """Birth-time sensitivity in one or two plain sentences, still fact-tagged for the verifier."""
        s = self.r.get("sensitivity", {})
        out = []
        n = topic.varga
        key = SENSITIVITY_KEYS.get(n) if n else None
        if key and key in s and s[key]["rating"] != "robust":
            item = s[key]
            out.append(f'<fact kind="sensitivity" factor="{key}" rating="{item["rating"]}">The D{n} chart is '
                       f'{item["rating"]} to birth time</fact>: it would change if your birth time were about '
                       f'{round(float(item["nearest_change_min"]))} minutes off, so treat that cross-check as provisional.')
        moon = s.get("moon_nakshatra", {})
        if moon.get("rating") not in (None, "robust"):
            days = round(float(s["dasha_shift_per_10_min_days"]))
            out.append(f'<fact kind="sensitivity" factor="moon_nakshatra" rating="{moon["rating"]}">Your Moon\'s '
                       f'nakshatra is {moon["rating"]} to birth time</fact>, so every 10 minutes of error in the birth '
                       f'time moves the period dates by about {days} days.')
        return " ".join(out) or None

    @staticmethod
    def verdict(score):
        if score >= 5:
            return "well-supported, with several factors pointing the same way"
        if score >= 2:
            return "somewhat supportive, with a clear qualification"
        if score <= -4:
            return "challenging, with significant friction to manage"
        if score < 0:
            return "mixed, with some friction"
        return "mixed or balanced, without a clear yes or no"

    def prashna_section(self, prashna, topic: Topic):
        reader = Reader(prashna.chart, prashna.report)
        houses = tuple(dict.fromkeys((1, *topic.houses)))
        assessments = [reader.house_assessment(h) for h in houses]
        score = sum(a["score"] for a in assessments)
        local = prashna.chart.time.local
        lines = [
            f"Question asked at **{local:%Y-%m-%d %H:%M:%S %Z}** "
            f"(**{prashna.asked_at:%Y-%m-%d %H:%M:%S} UTC**).",
            f"**Location used:** {prashna.location}. This is the saved chart location because no current location was supplied.",
            f"The Prashna ascendant is {reader.f_lagna()}, and the question-time Moon is {reader.f_place('MOON')}.",
        ]
        for assessment in assessments:
            house = assessment["house"]
            lines.append(f"- **Prashna H{house}:** {reader.f_lord(house, compact=True)}; {reader.f_sav(house)[0]}.")
        lines.append(
            f"For this specific decision, the Prashna houses are **{reader.verdict(score)}**. "
            "H1 represents you; the topic houses describe the choice. This is a separate question-time chart, "
            "not a replacement for your natal promise or practical checks."
        )
        text = "### Prashna — chart at the time of your question\n\n" + "\n\n".join(lines)
        return text.replace("<fact ", '<fact chart="Prashna" '), score

    def decision_bottom(self, question: str, natal_score: float, prashna_score: float, prashna_verdict: str):
        joining = is_join_decision(question)
        focus = "joining this company or accepting this role" if joining else "this decision"
        if prashna_score <= -2:
            lean = ("The Prashna evidence leans **toward waiting or renegotiating rather than joining immediately**."
                    if joining else "The Prashna evidence leans **toward waiting rather than committing immediately**.")
        elif prashna_score >= 2 and natal_score > -2:
            lean = ("The combined evidence leans **toward joining**, provided the role, manager, pay and written terms check out."
                    if joining else "The combined evidence leans **toward proceeding**, subject to the practical facts checking out.")
        elif natal_score >= 3 and prashna_score >= 0:
            lean = ("The natal pattern supports the move, but the Prashna confirmation is modest: **join only after checking the specific offer**."
                    if joining else "The natal pattern supports proceeding, but the Prashna confirmation is modest.")
        else:
            lean = ("There is **no clean yes or no**; clarify the role, manager, pay and stability before deciding."
                    if joining else "There is **no clean yes or no**; gather the missing practical facts before deciding.")
        return (f"For **{focus}**, the question-time Prashna is **{prashna_verdict}**, while the natal topic pattern is "
                f"**{self.verdict(natal_score)}**. {lean} This is a rule-based astrological lean, not a guarantee or a substitute for due diligence.")

    def strength_line(self, topic: Topic) -> str | None:
        strengths = self.r.get("planet_strength") or {}
        planet = next((g for g in topic.karakas if g in strengths), None)
        if planet is None:
            return None
        s = strengths[planet]
        tag = (f'<fact kind="strength" planet="{planet.title()}" label="{s["label"]}" score="{s["score"]}">'
               f'{planet.title()} is {s["label"]} ({s["score"]}/100)</fact>')
        return ("Within Nuvora's transparent strength heuristic, " + tag +
                ". This is not classical Shadbala or a probability; the placement, dignity, house and condition factors above explain the rating.")

    def foreign_answer(self, question, assessments, varga, notes, score):
        by_house = {item["house"]: item for item in assessments}
        by_house[3] = self.house_assessment(3)
        verdict = self.verdict(score)
        parts = [
            "### In a nutshell\n\n"
            f"The chart leans {verdict} on foreign travel or settlement. The chart shows foreign themes, but a lasting move depends on how those indicators combine with your home and career picture — a 12th-house placement alone doesn't guarantee permanent settlement."
        ]
        meanings = {3: "short trips", 9: "long-distance journeys", 12: "foreign stays", 4: "home and settlement"}
        findings = []
        for house in (3, 9, 12, 4):
            item = by_house[house]
            selected = []
            if item["supports"]:
                selected.append(max(item["supports"], key=lambda point: point["weight"]))
            if item["challenges"]:
                selected.append(min(item["challenges"], key=lambda point: point["weight"]))
            if not selected:
                selected = sorted(item["points"], key=lambda point: abs(point["weight"]), reverse=True)[:1]
            findings.append(f"**H{house} — {meanings[house]}:** {item['opening']} " + " ".join(point["text"] for point in selected))
        parts.append("### What the chart shows\n\n" + "\n\n".join(findings))

        parts.append(
            "### Foreign interest and adjustment\n\n"
            f"{self.f_place('RAHU')} can make foreign settings more prominent in the chart, but it's not proof of a move. "
            f"{self.f_place('MOON')} points to everyday routines and work demands as part of how adjustment might feel. "
            "Neither placement tells you which country, visa route, or outcome to expect."
        )
        if varga:
            parts.append("### D4 cross-check\n\n" + varga["text"] + " Treat D4 as secondary, especially if the recorded birth time is uncertain.")

        if re.search(r"\b(when|timing|date|dates|period|window|year|month)\b", question, re.I):
            current = self.current_periods(detect_topic(question))
            windows = self.timing_windows(detect_topic(question))
            timing_parts = []
            if current:
                timing_parts.append("**Right now:** " + " ".join(current))
            if "No sub-period" not in windows and "No activation" not in windows:
                timing_parts.append("**Windows ahead:** " + windows)
            if timing_parts:
                parts.append("### Timing — when things may activate\n\n" + "\n\n".join(timing_parts))

        parts.append(
            "### Practical checks\n\n"
            "Before making plans, confirm visa eligibility, a realistic work or study route, finances, housing, family needs, and support at the destination. Treat the chart as a reflection tool, not a substitute for those checks."
        )
        confidence = "low" if notes else "moderate"
        reason = "the indicators are mixed" if len(assessments) else "limited chart evidence"
        if notes:
            reason += ", with a birth-time limitation"
        parts.append(f"**Confidence:** {confidence} — {reason}.")
        return "\n\n".join(parts)

    def foundation_text(self) -> str:
        L = self.r["lagna"]
        moon = self.r["planets"]["MOON"]
        core = (f"Your chart's foundation is {self.f_lagna()}, guided by {self.f_place(L['lord'])}. "
                f"Your emotional nature and adaptation show through {self.f_place('MOON')}, in "
                f'{moon["nakshatra"]} nakshatra pada {moon["pada"]}. '
                "Think of the houses below as expressions of this foundation, not as separate predictions.")
        yogas = [y for y in self.r.get("yogas", []) if y["present"]]
        if yogas:
            yoga_bits = []
            for y in yogas[:4]:
                impact = y.get("impact") or {}
                activation = impact.get("activation") or {}
                if impact:
                    yoga_bits.append(f"**{y['name']}:** {impact.get('summary', '')} **{activation.get('label', 'natal potential')}.** {impact.get('combined_effect', '')}")
                else:
                    yoga_bits.append(f"**{y['name']}**")
            analysis = self.r.get("yoga_analysis") or {}
            core += ("\n\n**Your connected yoga pattern.** " + (analysis.get("summary") or
                     "Confirmed combinations add specific emphasis, but their results depend on dasha activation and planetary condition. ")
                     + " ".join(yoga_bits))
        return core

    def answer(self, question: str, prashna=None, classic: bool = False) -> str:
        """English readings are composed from the astrologer's judgment (chat/judgment.py). The classic
        house-by-house composition remains for the Hindi renderer, whose phrase table matches it, and for
        the specialised foreign-residence answer."""
        topic = detect_topic(question)
        if classic:
            return self.answer_classic(question, prashna)
        # Questions with a specific intent (when, a year, remedies, career choice, love vs arranged, a relative...)
        # or several parts get a direct, human answer to each part; plain topic questions keep the full reading.
        from .intents import compose, special_intent
        if special_intent(question):
            return compose(self.c, self.r, question, self.now)
        return self.answer_judged(question, topic, prashna)

    def foreign_split(self) -> str:
        """Short trips, a temporary stay abroad and lasting settlement are different outcomes."""
        score = {h: self.house_assessment(h)["score"] for h in (3, 9, 12, 4)}
        grade = lambda s: "well supported" if s >= 2 else ("supported with conditions" if s >= 0 else "mixed")
        temporary = (score[9] + score[12]) / 2
        if score[12] > score[4] + 0.75:
            settle = "plausible but conditional: the foreign-stay house is stronger than your home base"
        elif score[4] > score[12] + 0.75:
            settle = "less indicated than travel: your home base pulls strongly, so stays abroad tend to be chapters, not a permanent move"
        else:
            settle = "open either way: the foreign-stay and home-base houses are evenly matched"
        return ("- **Short journeys (3rd house):** " + grade(score[3]) + ".\n"
                "- **Long-distance travel or a temporary work/study stay (9th and 12th houses):** " + grade(temporary) + ".\n"
                "- **Permanent settlement (12th against the 4th house of home):** " + settle + ".")

    def answer_judged(self, question: str, topic: Topic, prashna=None) -> str:
        """The full reading, in the order a person needs it: the verdict and the best dates first, then the
        reasons, what pushes back, the independent cross-checks, the timing, what to do and how sure it is."""
        from .judgment import Judge
        judge = Judge(self.c, self.r, self.now)
        j = judge.judge(topic)
        theme = j.theme.split("; the strongest")[0].split("; the main condition")[0].rstrip(".") + "."
        best = max(j.windows, key=lambda w: (w.score, -w.start.timestamp())) if j.windows and topic.key != "lifetime" else None
        parts = []
        prashna_text = None
        if prashna:
            prashna_text, prashna_score = self.prashna_section(prashna, topic)
            opening = (self.decision_bottom(question, j.score, prashna_score, self.verdict(prashna_score))
                       + f" On the birth-chart side, the picture is {j.lean_text}. {theme}")
        else:
            if topic.key == "health":
                opening = f"Your health picture is **{j.lean_text}**."
            else:
                opening = {"strong": "Straight answer: your chart is **strongly on your side** here.",
                           "supportive": "Straight answer: your chart **supports this, with one clear condition**.",
                           "mixed": "Honest answer: this one is **genuinely mixed** — real support alongside real friction.",
                           "demanding": "Honest answer: this area is **demanding** — it asks for patience and structure.",
                           }.get(j.lean, f"Your chart is **{j.lean_text}** here.")
            if best:
                if best.double_transit:
                    lo, hi = best.double_transit[0], best.double_transit[1]
                    opening += (f" Your best window is **{judge.span(lo, hi)}**, when Jupiter and Saturn together "
                                f"reach {best.double_transit[4].removesuffix(' between them')}.")
                else:
                    opening += (f" Your best window is **{judge.span(best.start, best.end)}**, during the "
                                f"{'–'.join(_t(x) for x in best.dasha.lords)} period.")
            if j.counterweights:
                opening += f" {theme} The main condition is {j.counterweights[0].label}."
            else:
                opening += f" {theme}"
        # A question about a coming period ("next few months") is answered month by month first;
        # the natal promise becomes the background.
        from .near_term import analyse as near_term, offline_sections
        nt = None if prashna or topic.key == "lifetime" else near_term(self.c, topic, question, self.now)
        near_sections = []
        if nt:
            opening, near_sections = offline_sections(nt, topic, j.lean_text)
        if topic.key == "foreign":
            opening += ("\n\nThese are three different outcomes, and the chart treats them differently:\n"
                        + self.foreign_split())
        parts.append("### The short answer\n\n" + opening)
        parts += near_sections
        if prashna_text:
            parts.append(prashna_text)
        if topic.key == "general":
            parts.append("### Your chart's foundation\n\n" + self.foundation_text())

        why = [f"- {_cap(f.text)}." for f in j.drivers] or \
            ["- No single factor dominates; the result comes from several modest supports."]
        why.append(f"- {j.moon_check}")
        parts.append("### Why the chart says this\n\n" + "\n".join(why))

        if j.counterweights:
            push = [f"- {_cap(f.text)}." for f in j.counterweights]
            push.append("These do not cancel the supports; they decide how much effort and patience the result asks for.")
        else:
            push = ["No major friction shows in the houses that matter here. The real limit is timing: results arrive "
                    "when a connected period runs, not because the chart is free of difficulty."]
        parts.append("### What pushes back\n\n" + "\n".join(push))

        second = []
        if j.varga:
            v = j.varga
            verb = {"agree": "agrees with", "do not fully agree": "does not fully agree with",
                    "partly agree": "partly agrees with"}[v["agreement"]]
            domain = " and ".join(v["domain"].rsplit(", ", 1))
            explanation = v["explanation"].replace("the D1 indication", "the birth chart").replace("D1", "the birth chart")
            second.append(f"**The {v['name']} (D{v['n']}), the divisional chart for {domain}, {verb} the birth "
                          f"chart.** It has a {self.f_lagna(v['n'])}. {v['placements']} In short, {explanation}")
        if j.kp:
            k = j.kp
            houses = lambda hs: ", ".join(str(h) for h in hs[:-1]) + (" and " if len(hs) > 1 else "") + str(hs[-1])
            verdict = "promises it" if k["promised"] else "does not clearly promise it"
            line = (f"**KP, a separate system, {'agrees' if k['promised'] else 'is more cautious'}.** KP decides an event "
                    f"by the sub lord of its house cusp. Your {_ord(k['cusp'])} cusp's sub lord is {_t(k['sub_lord'])}, "
                    f"which connects to houses {houses(k['signifies'])}; KP looks for houses {houses(k['wanted'])} for "
                    f"{k['label'].lower()}, so it {verdict}.")
            if k["against"]:
                line += f" It also touches house{'s' if len(k['against']) > 1 else ''} {houses(k['against'])}, which can add delay or conditions."
            if k["sensitive"]:
                line += " This cusp sits near a boundary, so the KP result depends on an exact birth time and is not counted."
            second.append(line)
        if second:
            parts.append("### Second opinions\n\n" + "\n\n".join(second))

        timing = [j.activation_now]
        if topic.key == "lifetime":
            timing.append(self.timing_windows(topic))
        elif j.windows:
            lines = []
            for i, w in enumerate(j.windows, 1):
                mark = " **This is the strongest window.**" if best is w and len(j.windows) > 1 else ""
                lines.append(f"{i}. {w.text}{mark}")
            timing.append("The windows ahead, in date order:\n" + "\n".join(lines))
        else:
            timing.append("No period in the next few years connects directly to this topic, so the honest answer is not "
                          "to force a date: work with the present period's agenda instead.")
        ss = (self.r.get("transits") or {}).get("sade_sati")
        if ss and ss["active"]:
            timing.append(f'In the background, <fact kind="sade_sati" active="true">Sade Sati is active</fact> '
                          f"({ss['phase']}): a long Saturn cycle that asks for simplification and endurance, not a curse.")
        if topic.key == "month":
            timing += [line for line in self.transit_lines(topic) if line.startswith("Short-term sign changes")]
        parts.append("### Timing\n\n" + "\n\n".join(timing))

        parts.append("### What to do with this\n\n" + "\n".join(f"- {a}" for a in topic.actions))
        reminder = {
            "health": "This is not a medical assessment: symptoms, screening, medication and treatment belong with a qualified clinician.",
            "money": "This is not investment, tax or debt advice; take actual financial decisions with a qualified adviser.",
            "children": "Nothing here predicts fertility, pregnancy or a child's health; those decisions belong with medical professionals.",
            "foreign": "Before any plan, check visa eligibility, a realistic work or study route, finances, housing, family needs "
                       "and support at the destination; the chart cannot tell you which country or visa outcome to expect.",
        }.get(topic.key)
        if reminder:
            parts.append(reminder)
        confidence = f"**Confidence:** {j.confidence} — {j.confidence_reason}."
        note = self.plain_sensitivity(topic)
        parts.append(confidence + (f" {note}" if note else ""))
        return "\n\n".join(parts)

    def answer_classic(self, question: str, prashna=None) -> str:
        topic = detect_topic(question)
        assessments = [self.house_assessment(h) for h in topic.houses]
        karakas = [self.karaka_assessment(g) for g in topic.karakas]
        score = sum(a["score"] for a in assessments) + sum(k["score"] for k in karakas)
        supports = [p for a in assessments for p in a["supports"]]
        challenges = [p for a in assessments for p in a["challenges"]]
        strongest = max(supports, key=lambda p: p["weight"]) if supports else None
        constraint = min(challenges, key=lambda p: p["weight"]) if challenges else None
        varga = self.varga_assessment(topic.varga, topic.varga_house, score) if topic.varga else None
        notes = self.sensitivity_notes(topic)
        prashna_text, prashna_score = self.prashna_section(prashna, topic) if prashna else (None, 0)
        if topic.key == "foreign" and not prashna:
            return self.foreign_answer(question, assessments, varga, notes, score)
        if prashna:
            bottom = self.decision_bottom(question, score, prashna_score, self.verdict(prashna_score))
            bottom += (f" The clearest natal support is {strongest['label']}" if strongest else "")
            bottom += (f"; the main natal qualification is {constraint['label']}." if constraint else ".")
        else:
            verdict_text = self.verdict(score)
            if strongest:
                support_text = f"The clearest support comes from {strongest['label']}"
            else:
                support_text = "The evidence is mostly neutral"
            if constraint:
                constraint_text = f"The main qualification is {constraint['label']}"
            else:
                constraint_text = "there's no major internal contradiction among the factors examined"

            if topic.label.lower() in ["career", "money", "foreign"]:
                bottom = (f"For your question about {topic.label.lower()}, the chart leans {verdict_text.lower()}. "
                          f"{support_text}; {constraint_text}. "
                          "This is a reading of tendencies and activation periods, not a promise that an event must occur.")
            elif topic.label.lower() in ["marriage", "relationship"]:
                bottom = (f"For your question about {topic.label.lower()}, the chart leans {verdict_text.lower()}. "
                          f"{support_text}; {constraint_text}. "
                          "This reflects the emotional landscape around your question — it doesn't speak for anyone's private feelings.")
            elif topic.label.lower() in ["health", "children"]:
                bottom = (f"For your question about {topic.label.lower()}, the chart leans {verdict_text.lower()}. "
                          f"{support_text}; {constraint_text}. "
                          "This is not medical or fertility advice — please consult qualified professionals for decisions.")
            else:
                bottom = (f"For your question, the chart leans {verdict_text.lower()}. "
                          f"{support_text}; {constraint_text}. "
                          "This is a reading of tendencies and activation periods, not a promise that an event must occur.")
        parts = ["### In a nutshell\n\n" + bottom]
        if prashna_text:
            parts.append(prashna_text)
        if topic.key == "general":
            parts.append("### Your chart's foundation\n\n" + self.foundation_text())

        # Why the chart points this way - human-friendly
        findings = []
        for a in assessments:
            evidence = sorted(a["points"], key=lambda p: abs(p["weight"]), reverse=True)[:3]
            findings.append(f"**H{a['house']} — {HOUSE_MEANING[a['house']]}.** "
                            + a["opening"] + " " + " ".join(p["text"] for p in evidence))
        parts.append("### What the chart shows\n\n" + "\n\n".join(findings))
        # Natural significators - human-friendly
        natural_parts = [k["text"] for k in karakas]
        strength = self.strength_line(topic)
        if strength:
            natural_parts.append(strength)
        natural_text = "\n\n".join(natural_parts)
        parts.append("### The planets at play\n\n" + natural_text)

        # What this means in practice
        practical = self.practical_synthesis(topic, assessments)
        if practical:
            parts.append("### What this means for you\n\n" + practical)
        if varga:
            parts.append(f"### Divisional-chart confirmation — D{topic.varga}\n\n" + varga["text"])
        # What pushes back - human-friendly
        if constraint:
            pushback = (f"The main thing to watch is **{constraint['label']}**. It doesn't cancel out the supportive factors, "
                        "but it changes how they express themselves. You'll get better results by preparing well, "
                        "setting clear boundaries, and pacing yourself realistically — not by counting on one favourable placement.")
        else:
            pushback = ("No single strong contradiction stands out in the houses examined. The real limitation is different: "
                        "even a balanced chart needs the right dasha timing and practical action. Balance isn't a guarantee of smooth sailing.")
        parts.append("### What to watch\n\n" + pushback)

        # Timing - human-friendly
        timing_parts = []
        current = self.current_periods(topic)
        if current:
            timing_parts.append("**Right now:** " + " ".join(current))
        windows = self.timing_windows(topic)
        if "No sub-period" not in windows and "No activation" not in windows:
            timing_parts.append("**Windows ahead:** " + windows)
        transits = self.transit_lines(topic)
        if transits:
            timing_parts.append("**Transit context:** " + " ".join(transits))
        if timing_parts:
            parts.append("### Timing — when things may activate\n\n" + "\n\n".join(timing_parts))

        # How to use this - human-friendly
        actions = topic.actions if hasattr(topic, 'actions') and topic.actions else [
            "Reflect on what resonates with your lived experience",
            "Identify one practical step you can take this week",
            "Check the practical facts before making decisions",
            "Use demanding periods for preparation, not panic"
        ]
        action_text = "\n".join(f"{i}. {a}" for i, a in enumerate(actions, 1))
        parts.append("### How to use this reading\n\n" + action_text)
        if notes:
            parts.append("### A note on timing and decisions\n\n" + "\n\n".join(notes))

        # Topic-specific gentle reminders
        if topic.key == "health":
            parts.append("**A gentle reminder:** This isn't a medical assessment. Symptoms, screening, medication, and treatment belong with a qualified clinician. The chart is here to help you reflect on routines, resilience, and stress management.")
        elif topic.key == "money":
            parts.append("**A gentle reminder:** This isn't investment, tax, or debt advice. Please consult a qualified financial professional for actual decisions. A favourable astrological window doesn't mean a particular asset or loan is right for you.")
        elif topic.key == "children":
            parts.append("**A gentle reminder:** Nothing here guarantees fertility, pregnancy, or a child's outcome. Medical and care decisions belong with qualified professionals.")
        elif topic.key == "foreign":
            parts.append("**A gentle reminder:** This isn't immigration or visa advice. The chart can highlight themes, but visa eligibility, work routes, finances, and family needs need separate, practical verification.")

        confidence = "low" if notes else "moderate"
        if varga:
            reason = f"D1 and D{topic.varga} {varga['agreement']}"
        else:
            reason = "based on D1, dasha, and transit evidence"
        if notes:
            reason += ", with a birth-time factor limiting precision"
        else:
            reason += "; the reading follows transparent rules but can't replace an astrologer's judgement or your own discernment"
        parts.append(f"**Confidence:** {confidence} — {reason}.")
        return "\n\n".join(parts)


def offline_answer(chart, report, question: str, question_time=None, prashna=None, language: str = "en") -> str:
    if prashna is None and is_decision_question(question):
        prashna = build_prashna(chart, question_time or datetime.now(timezone.utc))
    text = Reader(chart, report).answer(question, prashna, classic=language == "hi")
    if language == "hi":
        from .hindi import translate_reading
        return translate_reading(text)
    return text
