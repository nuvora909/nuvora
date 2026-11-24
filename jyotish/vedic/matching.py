"""Deterministic North Indian Ashtakoota compatibility using two calculated charts."""
from __future__ import annotations

from .chart import natural_relation
from .constants import NAKSHATRAS, SIGN_LORD, SIGNS
from .panchang import nakshatra_info

YONIS = ["Horse", "Elephant", "Sheep", "Serpent", "Dog", "Cat", "Rat", "Cow", "Buffalo", "Tiger",
         "Deer", "Monkey", "Mongoose", "Lion"]
YONI_BY_NAKSHATRA = [
    "Horse", "Elephant", "Sheep", "Serpent", "Serpent", "Dog", "Cat", "Sheep", "Cat",
    "Rat", "Rat", "Cow", "Buffalo", "Tiger", "Buffalo", "Tiger", "Deer", "Deer",
    "Dog", "Monkey", "Mongoose", "Monkey", "Lion", "Horse", "Lion", "Cow", "Elephant",
]
YONI_MATRIX = [
    [4, 2, 2, 3, 2, 2, 2, 1, 0, 1, 3, 3, 2, 1],
    [2, 4, 3, 3, 2, 2, 2, 2, 3, 1, 2, 3, 2, 0],
    [2, 3, 4, 2, 1, 2, 1, 3, 3, 1, 2, 0, 3, 1],
    [3, 3, 2, 4, 2, 1, 1, 1, 1, 2, 2, 2, 0, 2],
    [2, 2, 1, 2, 4, 2, 1, 2, 2, 1, 0, 2, 1, 1],
    [2, 2, 2, 1, 2, 4, 0, 2, 2, 1, 3, 3, 2, 1],
    [2, 2, 1, 1, 1, 0, 4, 2, 2, 2, 2, 2, 1, 2],
    [1, 2, 3, 1, 2, 2, 2, 4, 3, 0, 3, 2, 2, 1],
    [0, 3, 3, 1, 2, 2, 2, 3, 4, 1, 2, 2, 2, 1],
    [1, 1, 1, 2, 1, 1, 2, 0, 1, 4, 1, 1, 2, 1],
    [1, 2, 2, 2, 0, 3, 2, 3, 2, 1, 4, 2, 2, 1],
    [3, 3, 0, 2, 2, 3, 2, 2, 2, 1, 2, 4, 3, 2],
    [2, 2, 3, 0, 1, 2, 1, 2, 2, 2, 2, 3, 4, 2],
    [1, 0, 1, 2, 1, 1, 2, 1, 2, 1, 1, 2, 2, 4],
]
VASHYA_MATRIX = {
    "Quadruped": [2, 0, 0, 0.5, 0],
    "Human": [1, 2, 1, 0.5, 1],
    "Jalachara": [0.5, 1, 2, 1, 1],
    "Vanachara": [0, 0, 0, 2, 0],
    "Keeta": [1, 1, 1, 0, 2],
}
VASHYA_ORDER = list(VASHYA_MATRIX)
GANA_BY_NAKSHATRA = [
    "Deva", "Manushya", "Rakshasa", "Manushya", "Deva", "Manushya", "Deva", "Deva", "Rakshasa",
    "Rakshasa", "Manushya", "Manushya", "Deva", "Rakshasa", "Deva", "Rakshasa", "Deva", "Rakshasa",
    "Rakshasa", "Manushya", "Manushya", "Deva", "Rakshasa", "Rakshasa", "Manushya", "Manushya", "Deva",
]
GANA_MATRIX = {
    "Deva": {"Deva": 6, "Manushya": 6, "Rakshasa": 0},
    "Manushya": {"Deva": 5, "Manushya": 6, "Rakshasa": 0},
    "Rakshasa": {"Deva": 1, "Manushya": 0, "Rakshasa": 6},
}
NADI_PATTERN = ["Adi", "Madhya", "Antya", "Antya", "Madhya", "Adi"]
MAXIMA = {"varna": 1, "vashya": 2, "tara": 3, "yoni": 4, "gana": 6, "maitri": 5, "bhakoot": 7, "nadi": 8}


def _moon(chart):
    sign = chart.sign["MOON"]
    degree = chart.deg["MOON"]
    nak = int(chart.lon["MOON"] // (360 / 27))
    return sign, degree, nak


def _varna(sign):
    if sign in (3, 7, 11):
        return "Brahmin", 3
    if sign in (0, 4, 8):
        return "Kshatriya", 2
    if sign in (1, 5, 9):
        return "Vaishya", 1
    return "Shudra", 0


def _vashya(sign, degree):
    if sign in (0, 1) or (sign == 8 and degree >= 15) or (sign == 9 and degree < 15):
        return "Quadruped"
    if sign in (2, 5, 6, 10) or (sign == 8 and degree < 15):
        return "Human"
    if sign in (3, 11) or (sign == 9 and degree >= 15):
        return "Jalachara"
    return "Vanachara" if sign == 4 else "Keeta"


def _tara(from_nak, to_nak):
    count = (to_nak - from_nak) % 27 + 1
    remainder = count % 9 or 9
    return count, remainder, remainder not in (3, 5, 7)


def _maitri(bride_lord, groom_lord):
    if bride_lord == groom_lord:
        return 5
    pair = {natural_relation(bride_lord, groom_lord), natural_relation(groom_lord, bride_lord)}
    if pair == {"Friend"}:
        return 5
    if pair == {"Friend", "Neutral"}:
        return 4
    if pair == {"Neutral"}:
        return 3
    if pair == {"Friend", "Enemy"}:
        return 1
    if pair == {"Neutral", "Enemy"}:
        return 0.5
    return 0


def _factor(key, name, score, p1, p2, note):
    return {"key": key, "name": name, "score": score, "max": MAXIMA[key],
            "person1": p1, "person2": p2, "interpretation": note}


def _person(chart, report, label):
    sign, _, nak = _moon(chart)
    seventh_lord = chart.house_lord[7]
    d9 = chart.varga[9]
    d9_lagna = d9["lagna"]["sign"]
    d9_seventh_sign = (d9_lagna + 6) % 12
    d9_seventh_lord = SIGN_LORD[d9_seventh_sign]
    sensitivity = None
    if report:
        item = report.get("sensitivity", {}).get("navamsha_lagna")
        if item:
            sensitivity = {"rating": item["rating"], "nearest_change_min": item["nearest_change_min"]}
    return {
        "label": label,
        "name": chart.birth.name or label,
        "gender": chart.birth.gender,
        "moon": {"sign": SIGNS[sign], "nakshatra": NAKSHATRAS[nak], "pada": nakshatra_info(chart.lon["MOON"])["pada"]},
        "relationship_indicators": {
            "seventh_house": f"{SIGNS[chart.house_sign[7]]}; lord {seventh_lord.title()} in house {chart.house[seventh_lord]}",
            "venus": f"{SIGNS[chart.sign['VENUS']]} in house {chart.house['VENUS']}",
            "d9_lagna": SIGNS[d9_lagna],
            "d9_seventh_house": f"{SIGNS[d9_seventh_sign]}; lord {d9_seventh_lord.title()} in D9 house {d9['planets'][d9_seventh_lord]['house']}",
        },
        "d9_sensitivity": sensitivity,
    }


def match_charts(chart1, chart2, report1=None, report2=None):
    genders = {chart1.birth.gender, chart2.birth.gender}
    if genders == {"female", "male"}:
        bride, groom = (chart1, chart2) if chart1.birth.gender == "female" else (chart2, chart1)
        direction = "Traditional directional rows use the female chart as bride and the male chart as groom."
    else:
        bride, groom = chart1, chart2
        direction = "Traditional directional rows use Partner 1 as bride and Partner 2 as groom because no female/male pair was specified."
    bride_is_first = bride is chart1
    bs, bd, bn = _moon(bride)
    gs, gd, gn = _moon(groom)

    b_varna, b_rank = _varna(bs)
    g_varna, g_rank = _varna(gs)
    varna_score = int(g_rank >= b_rank)
    b_vashya, g_vashya = _vashya(bs, bd), _vashya(gs, gd)
    vashya_score = VASHYA_MATRIX[b_vashya][VASHYA_ORDER.index(g_vashya)]

    bg_count, bg_rem, bg_ok = _tara(bn, gn)
    gb_count, gb_rem, gb_ok = _tara(gn, bn)
    tara_score = 1.5 * (bg_ok + gb_ok)

    b_yoni, g_yoni = YONI_BY_NAKSHATRA[bn], YONI_BY_NAKSHATRA[gn]
    yoni_score = YONI_MATRIX[YONIS.index(b_yoni)][YONIS.index(g_yoni)]
    b_gana, g_gana = GANA_BY_NAKSHATRA[bn], GANA_BY_NAKSHATRA[gn]
    gana_score = GANA_MATRIX[b_gana][g_gana]

    b_lord, g_lord = SIGN_LORD[bs], SIGN_LORD[gs]
    maitri_score = _maitri(b_lord, g_lord)
    from_bride, from_groom = (gs - bs) % 12 + 1, (bs - gs) % 12 + 1
    difficult_bhakoot = {from_bride, from_groom} in ({2, 12}, {5, 9}, {6, 8})
    bhakoot_score = 0 if difficult_bhakoot else 7
    b_nadi, g_nadi = NADI_PATTERN[bn % 6], NADI_PATTERN[gn % 6]
    nadi_score = 0 if b_nadi == g_nadi else 8

    def values(b_value, g_value):
        return (b_value, g_value) if bride_is_first else (g_value, b_value)

    v1, v2 = values(b_varna, g_varna)
    va1, va2 = values(b_vashya, g_vashya)
    y1, y2 = values(b_yoni, g_yoni)
    ga1, ga2 = values(b_gana, g_gana)
    l1, l2 = values(b_lord.title(), g_lord.title())
    n1, n2 = values(b_nadi, g_nadi)
    kootas = [
        _factor("varna", "Varna · values and ego", varna_score, v1, v2,
                "Full point under the traditional directional hierarchy." if varna_score else "No point under the traditional directional hierarchy; discuss respect and decision-making explicitly."),
        _factor("vashya", "Vashya · mutual influence", vashya_score, va1, va2,
                f"Directional Vashya table: {vashya_score:g}/2. This describes a traditional influence pattern, not consent or control."),
        _factor("tara", "Tara · nakshatra rhythm", tara_score,
                f"{NAKSHATRAS[bn]}; {bg_count} steps, remainder {bg_rem}" if bride_is_first else f"{NAKSHATRAS[gn]}; {gb_count} steps, remainder {gb_rem}",
                f"{NAKSHATRAS[gn]}; {gb_count} steps, remainder {gb_rem}" if bride_is_first else f"{NAKSHATRAS[bn]}; {bg_count} steps, remainder {bg_rem}",
                f"Bride→groom {'supportive' if bg_ok else 'challenging'}; groom→bride {'supportive' if gb_ok else 'challenging'}. Remainders 3, 5 and 7 receive no point in that direction."),
        _factor("yoni", "Yoni · intimacy symbolism", yoni_score, y1, y2,
                "Same-symbol and friendly combinations score higher in the traditional table. Real intimacy depends on communication, consent and compatibility conversations."),
        _factor("gana", "Gana · temperament", gana_score, ga1, ga2,
                "The table compares Deva, Manushya and Rakshasa temperaments; these are symbolic categories, not moral labels."),
        _factor("maitri", "Graha Maitri · mental rapport", maitri_score, l1, l2,
                f"Moon-sign lords {b_lord.title()} and {g_lord.title()} produce {maitri_score:g}/5 under the natural-friendship table."),
        _factor("bhakoot", "Bhakoot · emotional direction", bhakoot_score,
                f"{SIGNS[bs if bride_is_first else gs]}; {from_bride if bride_is_first else from_groom} signs away",
                f"{SIGNS[gs if bride_is_first else bs]}; {from_groom if bride_is_first else from_bride} signs away",
                f"Moon signs are {from_bride}/{from_groom} from each other. " + ("This is a 2/12, 5/9 or 6/8 combination and receives zero base points." if difficult_bhakoot else "This is outside the 2/12, 5/9 and 6/8 combinations and receives seven points.")),
        _factor("nadi", "Nadi · traditional constitution", nadi_score, n1, n2,
                "Same Nadi receives zero and different Nadi receives eight in the base rule. This is not a medical, fertility or genetic assessment."),
    ]
    total = round(sum(k["score"] for k in kootas), 1)
    if total < 18:
        band = "Below the traditional matching threshold"
    elif total < 24:
        band = "Within the traditional acceptable range"
    elif total < 32:
        band = "Strong traditional factor agreement"
    else:
        band = "Very strong traditional factor agreement"

    focus = []
    low = {k["key"]: k for k in kootas if k["score"] < k["max"]}
    if "nadi" in low:
        focus.append("Nadi scores zero here. Treat it as a traditional review point only—not as a prediction about health, fertility or children.")
    if "bhakoot" in low:
        focus.append("Bhakoot scores zero here. Discuss emotional timing, family expectations and how each person responds during stress.")
    if "maitri" in low:
        focus.append("Moon-sign lord friendship is limited. Test communication directly: clarify meaning before reacting and agree how to repair conflict.")
    if "gana" in low:
        focus.append("Temperament categories differ. Compare pace, independence, social needs and conflict styles with real examples rather than assumptions.")
    if "yoni" in low:
        focus.append("The traditional intimacy score is qualified. Talk privately about affection, boundaries, desire and consent; the table cannot establish intimate compatibility.")
    if "tara" in low:
        focus.append("One or both Tara directions are challenging in the base rule. Use stressful periods as a reason to adjust plans, not as a prediction of harm.")
    if not focus:
        focus.append("The eight factors agree strongly in this system. Still validate communication, safety, values, finances and life goals through direct experience.")
    focus.append("Do not accept, reject or stay in a relationship because of this score. Use the relationship indicators and real conversations alongside it.")

    return {
        "system": "North Indian Ashtakoota (36-point base scoring)",
        "total": total,
        "maximum": 36,
        "band": band,
        "direction": direction,
        "method": "Sidereal Lahiri Moon signs and nakshatras from both calculated charts. Split Vashya signs use the Moon's degree at 15°. Base scores are shown without dosha-cancellation exceptions.",
        "person1": _person(chart1, report1, "Partner 1"),
        "person2": _person(chart2, report2, "Partner 2"),
        "kootas": kootas,
        "calculated_factors": len(kootas),
        "practical_focus": focus[:5],
        "caution": "This is a traditional astrological comparison, not a probability of relationship success, not a medical assessment, and not a substitute for consent, safety and compatibility conversations.",
    }
