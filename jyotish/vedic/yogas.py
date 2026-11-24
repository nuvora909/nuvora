"""Yoga detection. Each rule is explicit and returns its evidence, so a reading can cite it and the
verifier can check it. Definitions follow common Parashari usage; where traditions differ the
variant used is written into `rule`."""
from __future__ import annotations

import re
from datetime import datetime, timezone

from .chart import DUSTHANAS, KENDRAS, TRIKONAS
from .constants import (EXALTATION, NATURAL_BENEFICS, NATURAL_MALEFICS, OWN_SIGNS, SIGN_LORD, SIGNS)

MAHAPURUSHA = {"MARS": "Ruchaka", "MERCURY": "Bhadra", "JUPITER": "Hamsa", "VENUS": "Malavya", "SATURN": "Sasa"}
REAL = ["SUN", "MOON", "MARS", "MERCURY", "JUPITER", "VENUS", "SATURN"]


def _ord(n):
    return f"{n}{'th' if 10 <= n % 100 <= 20 else {1: 'st', 2: 'nd', 3: 'rd'}.get(n % 10, 'th')}"


def _y(name, category, rule, evidence, present=True, **extra):
    return {"name": name, "category": category, "present": present, "rule": rule, "evidence": evidence, **extra}


def _where(c, g):
    return f"{g.title()} in {SIGNS[c.sign[g]]} (house {c.house[g]})"

KARTARI_PLANETS = ["MOON", "MARS", "MERCURY", "JUPITER", "VENUS", "SATURN"]  # Sun and nodes excluded by tradition


def _t(g):
    return g.title()


def _strong_benefic(c, g):
    """Jupiter/Venus always; Moon/Mercury only when not debilitated or combust (Parashari conditional rule)."""
    if g in NATURAL_BENEFICS:
        return True
    if g in ("MOON", "MERCURY"):
        return not c.dignity[g]["in_debilitation_sign"] and not c.combust[g]["combust"]
    return False


def _strong_malefic(c, g):
    if g in NATURAL_MALEFICS:
        return True
    if g in ("MOON", "MERCURY"):
        return c.dignity[g]["in_debilitation_sign"] or c.combust[g]["combust"]
    return False


def _yoga_strength(c, planets):
    """Explainable 0..100 strength label from dignity, combustion and motion of the planets involved."""
    if not planets:
        return {"score": 0.0, "label": "none", "planets": []}
    scores = []
    for g in planets:
        st = c.dignity[g]["status"]
        s = 1.0 if st in ("Exalted", "Moolatrikona") else (0.8 if st == "Own sign" else (
            0.6 if "Friend" in st else 0.45 if "Neutral" in st else 0.3))
        if c.combust[g]["combust"]:
            s -= 0.15
        if c.retro[g]:
            s += 0.05
        scores.append(max(0.1, min(1.0, s)))
    mean = sum(scores) / len(scores)
    label = "strong" if mean >= 0.75 else ("clear" if mean >= 0.55 else "weak")
    return {"score": round(mean * 100, 1), "label": label, "planets": list(planets)}


def pancha_mahapurusha(c):
    out = []
    for g, name in MAHAPURUSHA.items():
        s = c.sign[g]
        if c.house[g] in KENDRAS and (s in OWN_SIGNS[g] or s == EXALTATION[g][0]):
            kind = "exalted" if s == EXALTATION[g][0] else "own sign"
            ev = [f"{_where(c, g)}: {kind}, kendra from lagna"]
            notes = []
            if c.combust[g]["combust"]:
                notes.append("weakened: combust")
            out.append(_y(f"{name} Yoga", "Pancha Mahapurusha",
                          f"{g.title()} in own/exaltation sign in a kendra (1/4/7/10) from lagna", ev,
                          caveats=notes))
    return out


def gajakesari(c):
    h = c.house_from("JUPITER", "MOON")
    if h in KENDRAS:
        caveats = []
        if c.dignity["JUPITER"]["in_debilitation_sign"]:
            caveats.append("Jupiter debilitated")
        if c.combust["JUPITER"]["combust"]:
            caveats.append("Jupiter combust")
        return [_y("Gajakesari Yoga", "Lunar", "Jupiter in a kendra (1/4/7/10) from the Moon",
                   [f"Jupiter is {h} from the Moon", _where(c, "JUPITER"), _where(c, "MOON")], caveats=caveats)]
    return []


def budhaditya(c):
    if c.sign["SUN"] == c.sign["MERCURY"]:
        cav = ["Mercury combust: yoga is common and weakened"] if c.combust["MERCURY"]["combust"] else []
        return [_y("Budhaditya Yoga", "Solar", "Sun and Mercury in the same sign",
                   [_where(c, "SUN"), _where(c, "MERCURY")], caveats=cav)]
    return []


def chandra_mangala(c):
    h = c.house_from("MARS", "MOON")
    if h in (1, 7):
        return [_y("Chandra-Mangala Yoga", "Dhana", "Moon and Mars conjunct or in mutual 7th",
                   [_where(c, "MOON"), _where(c, "MARS")])]
    return []


def kemadruma(c):
    others = ["MARS", "MERCURY", "JUPITER", "VENUS", "SATURN"]   # Sun and nodes excluded
    near = [g for g in others if c.house_from(g, "MOON") in (1, 2, 12)]
    if near:
        return [_y("Kemadruma Yoga", "Lunar", "No planet (excl. Sun, nodes) in 2nd/12th from or with the Moon",
                   [f"{', '.join(g.title() for g in near)} adjacent to/with the Moon"], present=False)]
    cancel = [g for g in REAL if g != "MOON" and (c.house[g] in KENDRAS or c.house_from(g, "MOON") in KENDRAS)]
    if c.house["MOON"] in KENDRAS:
        cancel.append("MOON (in kendra from lagna)")
    return [_y("Kemadruma Yoga", "Lunar", "No planet (excl. Sun, nodes) in 2nd/12th from or with the Moon",
               ["2nd, 12th and Moon's own sign are empty of Mars..Saturn"],
               cancelled=bool(cancel), planets=["MOON"], houses=[c.house["MOON"]],
               cancellation=[f"{g.title()} in kendra from lagna or Moon" for g in cancel])]


def raja_yogas(c):
    out = []
    kendra_lords = {h: c.house_lord[h] for h in KENDRAS}
    trikona_lords = {h: c.house_lord[h] for h in (5, 9)}
    # Yogakaraka: one planet ruling both a kendra (4/7/10) and a trikona (5/9)
    for g in REAL:
        k = [h for h in (4, 7, 10) if c.house_lord[h] == g]
        t = [h for h in (5, 9) if c.house_lord[h] == g]
        if k and t:
            out.append(_y(f"Yogakaraka {g.title()}", "Raja",
                          "One planet rules both a kendra (4/7/10) and a trikona (5/9)",
                          [f"{g.title()} rules houses {k + t}", _where(c, g)]))
    seen = set()
    for kh, kl in kendra_lords.items():
        for th, tl in trikona_lords.items():
            if kl == tl or (kl, tl) in seen or (tl, kl) in seen:
                continue
            how = c.associated(kl, tl)
            strong = [x for x in how if x in ("conjunction", "exchange", "mutual aspect")]
            if strong:
                seen.add((kl, tl))
                out.append(_y("Raja Yoga", "Raja",
                              "Lord of a kendra associated with lord of a trikona (conjunction/exchange/mutual aspect)",
                              [f"{_ord(kh)} lord {kl.title()} + {_ord(th)} lord {tl.title()}: {', '.join(strong)}",
                               _where(c, kl), _where(c, tl)]))
    return out


def dhana_yogas(c):
    out, lords = [], {h: c.house_lord[h] for h in (1, 2, 5, 9, 11)}
    pairs = [(2, 11), (2, 5), (2, 9), (11, 5), (11, 9), (1, 2), (1, 11)]
    for a, b in pairs:
        la, lb = lords[a], lords[b]
        if la == lb:
            continue
        strong = [x for x in c.associated(la, lb) if x in ("conjunction", "exchange", "mutual aspect")]
        if strong:
            out.append(_y("Dhana Yoga", "Dhana", "Lords of wealth houses (1/2/5/9/11) associated, with 2nd or 11th involved",
                          [f"{_ord(a)} lord {la.title()} + {_ord(b)} lord {lb.title()}: {', '.join(strong)}"]))
    return out


def viparita(c):
    out = []
    for h, name in ((6, "Harsha"), (8, "Sarala"), (12, "Vimala")):
        lord = c.house_lord[h]
        if c.house[lord] in DUSTHANAS:
            out.append(_y(f"{name} (Viparita Raja) Yoga", "Viparita Raja",
                          f"Lord of {_ord(h)} placed in a dusthana (6/8/12)",
                          [f"{_ord(h)} lord {lord.title()} in house {c.house[lord]}"]))
    return out


def neecha_bhanga(c):
    out = []
    for g in REAL:
        if not c.dignity[g]["in_debilitation_sign"]:
            continue
        s = c.sign[g]
        lord = SIGN_LORD[s]
        exalter = next((p for p, (es, _) in EXALTATION.items() if es == s and p in REAL), None)
        conds = []

        def kendra_any(p):
            return c.house[p] in KENDRAS or c.house_from(p, "MOON") in KENDRAS

        if kendra_any(lord):
            conds.append(f"dispositor {lord.title()} in kendra from lagna/Moon")
        if exalter and kendra_any(exalter):
            conds.append(f"{exalter.title()} (exalted in {SIGNS[s]}) in kendra from lagna/Moon")
        if lord != g and (c.sign[lord] == s or c.aspects(lord, c.house[g])):
            conds.append(f"dispositor {lord.title()} conjoins/aspects {g.title()}")
        d9 = c.varga.get(9, {}).get("planets", {}).get(g)
        if d9 and d9["sign"] == EXALTATION[g][0]:
            conds.append(f"{g.title()} exalted in navamsha")
        out.append(_y("Neecha Bhanga Raja Yoga" if conds else "Debilitation (uncancelled)", "Dignity",
                      "Debilitated planet with at least one classical cancellation condition",
                      [_where(c, g) + ": debilitated"] + conds, present=bool(conds),
                      planet=g))
    return out


def manglik(c):
    houses = (1, 2, 4, 7, 8, 12)
    from_lagna = c.house["MARS"]
    from_moon = c.house_from("MARS", "MOON")
    from_venus = c.house_from("MARS", "VENUS")
    refs = [from_lagna in houses, from_moon in houses, from_venus in houses]
    present = from_lagna in houses
    count = sum(refs)
    severity = "none" if not present else ("severe" if count == 3 else ("moderate" if count == 2 else "mild"))
    return [_y("Manglik (Kuja) Dosha", "Dosha",
               "Mars in 1/2/4/7/8/12 from lagna (Moon and Venus shown for reference; some schools omit the 2nd)",
               [f"Mars is house {from_lagna} from lagna, {from_moon} from Moon, {from_venus} from Venus"],
               present=present, from_lagna=refs[0], from_moon=refs[1], from_venus=refs[2],
               planets=["MARS"], houses=[from_lagna],
               severity=severity, refs_count=count,
               strength=_yoga_strength(c, ["MARS"]))]


def kaal_sarp(c):
    rahu = c.lon["RAHU"]
    rel = [((c.lon[g] - rahu) % 360.0) for g in REAL]
    one_side = all(0 < x < 180 for x in rel) or all(180 < x < 360 for x in rel)
    spread = (max(rel) - min(rel)) if rel else 0.0
    severity = "none" if not one_side else ("strong" if spread < 100 else ("clear" if spread < 160 else "wide"))
    return [_y("Kaal Sarp Yoga", "Dosha", "All seven planets strictly on one side of the Rahu-Ketu axis (by longitude)",
               [f"planets span {min(rel):.1f}..{max(rel):.1f} deg measured from Rahu (spread {spread:.1f} deg)"],
               present=one_side, spread_deg=round(spread, 2), severity=severity,
               planets=REAL + ["RAHU", "KETU"], houses=sorted({c.house["RAHU"], c.house["KETU"]}))]


def parivartana(c):
    out = []
    for i, a in enumerate(REAL):
        for b in REAL[i + 1:]:
            if SIGN_LORD[c.sign[a]] == b and SIGN_LORD[c.sign[b]] == a:
                ha, hb = c.house[a], c.house[b]
                hs = {ha, hb}
                kind = "Dainya" if hs & set(DUSTHANAS) else ("Khala" if 3 in hs else "Maha")
                out.append(_y(f"{kind} Parivartana Yoga", "Exchange", "Two planets in each other's signs",
                              [_where(c, a), _where(c, b)]))
    return out


def adhi(c):
    """Adhi Yoga: benefics in the 6th, 7th and 8th from the Moon."""
    h6 = [g for g in KARTARI_PLANETS if c.house_from(g, "MOON") == 6 and _strong_benefic(c, g)]
    h7 = [g for g in KARTARI_PLANETS if c.house_from(g, "MOON") == 7 and _strong_benefic(c, g)]
    h8 = [g for g in KARTARI_PLANETS if c.house_from(g, "MOON") == 8 and _strong_benefic(c, g)]
    present = bool(h6 and h7 and h8)
    involved = sorted(set(h6 + h7 + h8))
    ev = [f"{', '.join(_t(g) for g in h6)} in the 6th from the Moon",
          f"{', '.join(_t(g) for g in h7)} in the 7th from the Moon",
          f"{', '.join(_t(g) for g in h8)} in the 8th from the Moon",
          _where(c, "MOON")]
    return [_y("Adhi Yoga", "Lunar",
               "Benefics in the 6th, 7th and 8th houses from the Moon (conditional benefics counted when strong)",
               ev, present=present, strength=_yoga_strength(c, involved))]


def sunapha_anapha(c):
    """Sunapha (2nd from Moon), Anapha (12th from Moon), Durudhara (both)."""
    in2 = [g for g in KARTARI_PLANETS if g != "MOON" and c.house_from(g, "MOON") == 2]
    in12 = [g for g in KARTARI_PLANETS if g != "MOON" and c.house_from(g, "MOON") == 12]
    out = []
    if in2:
        out.append(_y("Sunapha Yoga", "Lunar", "Planet(s) other than Sun/nodes in the 2nd from the Moon",
                      [f"{', '.join(_t(g) for g in in2)} in the 2nd from the Moon", _where(c, "MOON")],
                      strength=_yoga_strength(c, in2)))
    if in12:
        out.append(_y("Anapha Yoga", "Lunar", "Planet(s) other than Sun/nodes in the 12th from the Moon",
                      [f"{', '.join(_t(g) for g in in12)} in the 12th from the Moon", _where(c, "MOON")],
                      strength=_yoga_strength(c, in12)))
    if in2 and in12:
        both = sorted(set(in2 + in12))
        out.append(_y("Durudhara Yoga", "Lunar", "Planets on both sides of the Moon (2nd and 12th)",
                      [f"{', '.join(_t(g) for g in both)} flank the Moon"], strength=_yoga_strength(c, both)))
    return out


def kartari(c):
    """Shubha/Papa Kartari: benefics or malefics flanking the 2nd and 12th from lagna and Moon."""
    out = []
    for ref, label in (("LAGNA", "lagna"), ("MOON", "Moon")):
        base = c.lagna_sign if ref == "LAGNA" else c.sign["MOON"]
        second, twelfth = (base + 1) % 12, (base + 11) % 12
        bene2 = [g for g in KARTARI_PLANETS if c.sign[g] == second and _strong_benefic(c, g)]
        bene12 = [g for g in KARTARI_PLANETS if c.sign[g] == twelfth and _strong_benefic(c, g)]
        mala2 = [g for g in KARTARI_PLANETS if c.sign[g] == second and _strong_malefic(c, g)]
        mala12 = [g for g in KARTARI_PLANETS if c.sign[g] == twelfth and _strong_malefic(c, g)]
        where = f"from the {label}"
        if bene2 and bene12:
            out.append(_y("Shubha Kartari Yoga", "Kartari", f"Benefics in the 2nd and 12th {where}",
                          [f"{', '.join(_t(g) for g in bene2)} in the 2nd {where}",
                           f"{', '.join(_t(g) for g in bene12)} in the 12th {where}"],
                          strength=_yoga_strength(c, bene2 + bene12)))
        if mala2 and mala12:
            out.append(_y("Papa Kartari Yoga", "Kartari", f"Malefics in the 2nd and 12th {where}",
                          [f"{', '.join(_t(g) for g in mala2)} in the 2nd {where}",
                           f"{', '.join(_t(g) for g in mala12)} in the 12th {where}"],
                          strength=_yoga_strength(c, mala2 + mala12)))
    return out


def guru_chandala(c):
    """Guru-Chandala: Jupiter conjunct or aspected by Rahu or Ketu."""
    out = []
    for node in ("RAHU", "KETU"):
        how = c.associated("JUPITER", node)
        if how:
            out.append(_y("Guru-Chandala Yoga", "Dosha",
                          "Jupiter conjunct or aspected by Rahu/Ketu",
                          [f"{node.title()} {'; '.join(how)} Jupiter", _where(c, "JUPITER"), _where(c, node)],
                          planet="JUPITER", strength=_yoga_strength(c, ["JUPITER"])))
    return out


def all_yogas(c):
    found = []
    for fn in (pancha_mahapurusha, gajakesari, budhaditya, chandra_mangala, raja_yogas, dhana_yogas,
               viparita, neecha_bhanga, parivartana, kemadruma, manglik, kaal_sarp,
               adhi, sunapha_anapha, kartari, guru_chandala):
        found.extend(fn(c))
    return found


HOUSE_IMPACTS = {
    1: "identity, vitality and life direction", 2: "family, speech, savings and values",
    3: "courage, communication, skills and siblings", 4: "home, property, emotional security and inner peace",
    5: "intelligence, creativity, children and judgment", 6: "work routines, competition, debts and health habits",
    7: "marriage, partnerships, contracts and public dealings", 8: "shared resources, transformation and vulnerability",
    9: "fortune, higher learning, teachers and principles", 10: "career, status, responsibility and visible work",
    11: "income, gains, networks and ambitions", 12: "expenses, rest, foreign connections and release",
}

YOGA_THEMES = (
    ("ruchaka", "courage, initiative, executive ability and the disciplined use of Mars"),
    ("bhadra", "intellect, communication, analysis and practical skill"),
    ("hamsa", "judgment, teaching, ethics and protective guidance"),
    ("malavya", "relationships, refinement, comfort and artistic or social intelligence"),
    ("sasa", "endurance, organisation, responsibility and authority built through effort"),
    ("gajakesari", "judgment, guidance, reputation and emotional resilience"),
    ("budhaditya", "learning, communication, visibility and applied intelligence"),
    ("chandra-mangala", "enterprise, emotional drive, initiative and financial decisions"),
    ("kemadruma", "emotional self-reliance, support networks and fluctuations in reassurance"),
    ("neecha bhanga", "recovery of a debilitated planet through specific support conditions"),
    ("debilitation", "the restrained or inconsistent expression of a debilitated planet"),
    ("viparita", "problem-solving and reversals that can follow pressure or disruption"),
    ("dainya", "pressure exchanged between the linked houses, requiring adjustment and realism"),
    ("khala", "effort, communication and initiative linking the exchanged house agendas"),
    ("parivartana", "a two-way connection between planets and their life areas"),
    ("manglik", "assertiveness, impatience and the management of friction in close relationships"),
    ("kaal sarp", "concentrated lessons around the nodal axis, without implying a curse or denial"),
    ("guru-chandala", "beliefs, teachers, judgment and the need to question unconventional influences"),
    ("papa kartari", "pressure surrounding the reference point, calling for boundaries and support"),
    ("shubha kartari", "protection and support surrounding the reference point"),
    ("adhi", "social support, capability and constructive influence around the Moon"),
    ("sunapha", "self-generated resources, skills and support following the Moon"),
    ("anapha", "preparation, reflection and support preceding the Moon"),
    ("durudhara", "support on both sides of the Moon and greater continuity of resources"),
    ("dhana", "earning, saving, resource development and the linking of wealth-house lords"),
    ("yogakaraka", "a planet unusually capable of connecting purpose with visible responsibility"),
    ("raja yoga", "status, responsibility, opportunity and the connection of angular and trinal house lords"),
    ("viparita", "resilience and improvement through difficult-house problem-solving"),
)


def _yoga_nature(y):
    name, category = y["name"].lower(), y["category"]
    if "neecha bhanga" in name or category == "Viparita Raja" or "khala" in name:
        return "mixed"
    if category == "Dosha" or "kemadruma" in name or "debilitation" in name or "dainya" in name:
        return "challenging"
    return "supportive"


def _yoga_theme(y):
    name = y["name"].lower()
    return next((theme for key, theme in YOGA_THEMES if key in name),
                "the combined agenda of the planets and houses named in this yoga")


def _participants(c, y):
    planets = list(y.get("planets") or (y.get("strength") or {}).get("planets") or [])
    if y.get("planet"):
        planets.append(y["planet"])
    houses = list(y.get("houses") or [])
    explicit_houses = bool(houses)
    for text in y.get("evidence", []):
        for g in REAL + ["RAHU", "KETU"]:
            if re.search(rf"\b{g.title()}\b", text):
                planets.append(g)
        if not explicit_houses:
            houses.extend(int(x) for x in re.findall(r"\(house (\d+)\)", text))
            houses.extend(int(x) for x in re.findall(r"\b(\d+)(?:st|nd|rd|th) lord\b", text))
    if not explicit_houses:
        houses.extend(c.house[g] for g in planets if g in c.house)
    order = {g: i for i, g in enumerate(REAL + ["RAHU", "KETU"])}
    return sorted(set(planets), key=lambda g: order[g]), sorted(set(houses))


def _interaction_kind(a, b):
    if a == b == "supportive":
        return "reinforcing"
    if a == b == "challenging":
        return "compounding"
    if "supportive" in (a, b) and "challenging" in (a, b):
        return "balancing"
    return "qualifying"


def synthesize_yogas(c, yogas, strengths=None, ashtakavarga_data=None, now=None):
    """Personalise detected yogas and expose the evidence connecting their interactions."""
    strengths = strengths or {}
    now = now or datetime.now(timezone.utc)
    if now.tzinfo is None:
        now = now.replace(tzinfo=timezone.utc)
    running = c.dasha.running(now, depth=3)
    running_lords = [p.lord for p in running]
    running_label = "-".join(g.title() for g in running_lords)
    present = [dict(y) for y in yogas if y.get("present")]
    enriched = []
    for y in present:
        planets, houses = _participants(c, y)
        activation_planets = set(planets) | {c.house_lord[h] for h in houses}
        active = list(dict.fromkeys(g for g in running_lords if g in activation_planets))
        if y.get("cancelled"):
            activation = {"status": "softened", "label": "present but substantially cancelled",
                          "reason": "Classical cancellation conditions are present; do not read the difficult pattern at full force."}
        elif active:
            activation = {"status": "active", "label": "activated now",
                          "reason": f"Current dasha link: {', '.join(g.title() for g in active)}. The {running_label} period gives this natal pattern a relevant trigger."}
        else:
            activation = {"status": "potential", "label": "natal potential",
                          "reason": f"None of its main planets or linked house lords is a current dasha lord ({running_label}); its expression is less directly activated now."}
        condition_rows = [{"planet": g, "score": strengths[g]["score"], "label": strengths[g]["label"]}
                          for g in planets if g in strengths]
        scores = [row["score"] for row in condition_rows]
        mean = sum(scores) / len(scores) if scores else None
        condition_label = ("not separately scored" if mean is None else "strong backing" if mean >= 72 else
                           "workable backing" if mean >= 55 else "limited backing")
        condition = {"label": condition_label, "planets": condition_rows,
                     "summary": "; ".join(f"{row['planet'].title()} {row['score']}/100 ({row['label']})"
                                           for row in condition_rows) or
                                "Nodes or unranked participants are assessed through the yoga evidence rather than a numerical score."}
        life_areas = [HOUSE_IMPACTS[h] for h in houses]
        modifiers = list(y.get("caveats") or [])
        if y.get("cancelled"):
            modifiers.extend(y.get("cancellation") or [])
        sav_rows = ((ashtakavarga_data or {}).get("sav_by_house") or [])
        sav_values = [row["sav"] for row in sav_rows if row["house"] in houses]
        if sav_values:
            sav_mean = sum(sav_values) / len(sav_values)
            if sav_mean >= 28:
                modifiers.append(f"Above-average SAV support across the linked houses ({sav_mean:.1f} mean bindus)")
            elif sav_mean < 25:
                modifiers.append(f"Lower SAV support across the linked houses ({sav_mean:.1f} mean bindus), leaving less margin for error")
        nature = _yoga_nature(y)
        direction = "mixed" if y.get("cancelled") or nature == "mixed" or (nature == "supportive" and mean is not None and mean < 55) else nature
        theme = _yoga_theme(y)
        area_text = "; ".join(life_areas[:3]) if life_areas else "the life areas named by this combination"
        summary = f"For you, this yoga connects {theme} with {area_text}. "
        if direction == "supportive":
            summary += "Its indication is constructive, but delivery still depends on activation and real-world action."
        elif direction == "challenging":
            summary += "It describes pressure or inconsistency to manage, not a fixed denial or an inevitable harmful event."
        else:
            summary += "Its indication is mixed: support and qualification must be read together rather than calling it wholly good or bad."
        impact = {"direction": direction, "theme": theme, "life_areas": life_areas, "summary": summary,
                  "activation": activation, "condition": condition, "modifiers": modifiers,
                  "interactions": [], "combined_effect": "No direct yoga interaction has been added yet."}
        enriched.append({**y, "impact": impact, "_nature": nature, "_planets": planets, "_houses": houses})

    interactions = []
    for i, a in enumerate(enriched):
        for b in enriched[i + 1:]:
            shared_planets = sorted(set(a["_planets"]) & set(b["_planets"]))
            shared_houses = sorted(set(a["_houses"]) & set(b["_houses"]))
            aspect_links = []
            if not shared_planets and not shared_houses:
                for g in a["_planets"]:
                    aspect_links.extend(f"{g.title()} aspects house {h}" for h in b["_houses"] if c.aspects(g, h))
                for g in b["_planets"]:
                    aspect_links.extend(f"{g.title()} aspects house {h}" for h in a["_houses"] if c.aspects(g, h))
                aspect_links = sorted(set(aspect_links))[:6]
            if not shared_planets and not shared_houses and not aspect_links:
                continue
            kind = _interaction_kind(a["_nature"], b["_nature"])
            links = []
            if shared_planets:
                links.append("shared " + ", ".join(g.title() for g in shared_planets))
            if shared_houses:
                links.append("linked house" + ("s " if len(shared_houses) > 1 else " ") + ", ".join(map(str, shared_houses)))
            if aspect_links:
                links.append("aspect connections (" + "; ".join(aspect_links) + ")")
            link = " and ".join(links)
            if kind == "reinforcing":
                text = f"{a['name']} and {b['name']} reinforce each other through {link}; their supportive indications are more consistent together."
            elif kind == "compounding":
                text = f"{a['name']} and {b['name']} concentrate pressure through {link}; manage this area carefully rather than treating either difficult pattern in isolation."
            elif kind == "balancing":
                text = f"{a['name']} and {b['name']} counterbalance through {link}; support can make the pressure more workable, but it does not erase the difficult indication."
            else:
                text = f"{a['name']} and {b['name']} qualify each other through {link}; expect a mixed expression shaped by the stronger and better-activated pattern."
            row = {"yogas": [a["name"], b["name"]], "kind": kind, "shared_planets": shared_planets,
                   "shared_houses": shared_houses, "aspects": aspect_links, "text": text}
            interactions.append(row)
            for own, other in ((a, b), (b, a)):
                own["impact"]["interactions"].append({**row, "other": other["name"]})

    for y in enriched:
        impact = y["impact"]
        kinds = {row["kind"] for row in impact["interactions"]}
        names = {kind: [row["other"] for row in impact["interactions"] if row["kind"] == kind]
                 for kind in ("reinforcing", "balancing", "compounding", "qualifying")}
        if kinds & {"balancing", "qualifying"}:
            impact["direction"] = "mixed"
        if "reinforcing" in kinds and kinds & {"balancing", "qualifying", "compounding"}:
            impact["combined_effect"] = (f"Reinforced by {', '.join(names['reinforcing'])}, but also qualified by other combinations; "
                                         "the combined result is mixed rather than uniformly favourable.")
        elif "reinforcing" in kinds:
            if impact["direction"] == "mixed":
                impact["combined_effect"] = (f"Reinforced by {', '.join(names['reinforcing'])}, which adds coherence, but participant condition "
                                             "or other qualifications keep the net result mixed rather than uniformly favourable.")
            else:
                impact["combined_effect"] = (f"Reinforced by {', '.join(names['reinforcing'])} through shared chart factors, "
                                             "making this supportive pattern more coherent when activated.")
        elif "balancing" in kinds:
            impact["combined_effect"] = (f"Counterbalanced by {', '.join(names['balancing'])}. This makes the net indication more mixed and "
                                         "potentially more workable, but neither side should be treated as cancelling the other.")
        elif "compounding" in kinds:
            impact["combined_effect"] = (f"Pressure is concentrated with {', '.join(names['compounding'])} in the same planets or life areas; "
                                         "this is where the chart needs the most patience and practical support.")
        elif "qualifying" in kinds:
            impact["combined_effect"] = f"Modified by {', '.join(names['qualifying'])}; read the result as conditional and mixed."
        else:
            impact["combined_effect"] = ("No other detected yoga shares its main factors or has a direct aspect link to them. "
                                         "Its impact therefore depends more directly on participant condition and dasha activation.")
        impact["reinforced_by"] = names["reinforcing"]
        impact["balanced_by"] = names["balancing"]
        impact["pressure_with"] = names["compounding"]

    active_names = [y["name"] for y in enriched if y["impact"]["activation"]["status"] == "active"]
    area_counts = {}
    for y in enriched:
        for area in y["impact"]["life_areas"]:
            area_counts[area] = area_counts.get(area, 0) + 1
    dominant_areas = [area for area, _ in sorted(area_counts.items(), key=lambda item: (-item[1], item[0]))[:3]]
    if not enriched:
        headline = "No catalogued yoga is present; the chart must be read through its houses, lords and dashas."
    elif active_names:
        headline = f"{len(active_names)} detected yoga" + ("s are" if len(active_names) != 1 else " is") + " directly activated by the current dasha."
    else:
        headline = "The detected yogas are natal potentials; none has a direct current-dasha trigger through its main participants."
    kind_counts = {kind: sum(row["kind"] == kind for row in interactions)
                   for kind in ("reinforcing", "balancing", "compounding", "qualifying")}
    summary = (f"Across {len(enriched)} detected combinations, there are {kind_counts['reinforcing']} reinforcing, "
               f"{kind_counts['balancing']} counterbalancing and {kind_counts['compounding']} pressure-concentrating connections. ")
    if dominant_areas:
        summary += "The most connected life themes are " + "; ".join(dominant_areas) + ". "
    summary += "Read the individual activation and interaction notes below: a yoga is neither an isolated promise nor a simple good-versus-bad score."
    for y in enriched:
        del y["_nature"], y["_planets"], y["_houses"]
    return {"yogas": enriched, "headline": headline, "summary": summary, "active_now": active_names,
            "dominant_areas": dominant_areas, "interaction_counts": kind_counts, "interactions": interactions,
            "note": "Traditional, chart-specific synthesis. Activation describes a period of expression, not certainty that an event will occur."}
