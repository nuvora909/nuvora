"""South Indian marriage matching: the ten Poruthams, Papasamyam (malefic balance) and Dasha Sandhi.

Counts run from the bride's birth star (nakshatra) to the groom's, as in the Tamil and Kerala traditions.
Rajju and Vedha are treated as the decisive factors; the others are counted as agreeing or not."""
from __future__ import annotations

from datetime import timedelta

from .constants import NAKSHATRAS, SIGN_LORD, SIGNS
from .matching import GANA_BY_NAKSHATRA, YONI_BY_NAKSHATRA, YONI_MATRIX, YONIS, _maitri, _moon

NAK_SPAN = 360 / 27
RAJJU_PATTERN = ["Paada (feet)", "Kati (waist)", "Nabhi (navel)", "Kantha (neck)", "Siro (head)",
                 "Kantha (neck)", "Nabhi (navel)", "Kati (waist)", "Paada (feet)"]
RAJJU_EFFECT = {"Paada (feet)": "wandering and instability", "Kati (waist)": "financial hardship",
                "Nabhi (navel)": "concerns for children", "Kantha (neck)": "concerns for the wife's well-being",
                "Siro (head)": "concerns for the husband's well-being"}
# Vedha (mutually obstructing stars), 1-based nakshatra numbers
VEDHA_PAIRS = [(1, 18), (2, 17), (3, 16), (4, 15), (6, 22), (7, 21), (8, 20), (9, 19), (10, 27), (11, 26),
               (12, 25), (13, 24), (5, 14), (5, 23), (14, 23)]
# Tamil Vasya table: for each sign, the signs it holds in its sway
VASYA = {0: {4, 7}, 1: {3, 6}, 2: {5}, 3: {7, 8}, 4: {6}, 5: {11, 2}, 6: {9, 5}, 7: {3}, 8: {11},
         9: {0, 10}, 10: {0}, 11: {9}}
MALEFICS = {"MARS": 1.0, "SATURN": 1.0, "RAHU": 1.0, "KETU": 1.0, "SUN": 0.5}
PAPA_HOUSES = {1, 2, 4, 7, 8, 12}


def _ord(n):
    return f"{n}{'th' if 10 <= n % 100 <= 20 else {1: 'st', 2: 'nd', 3: 'rd'}.get(n % 10, 'th')}"


def _row(key, name, ok, detail, meaning, weight="normal"):
    status = {True: "Agrees", None: "Partly", False: "Does not agree"}[ok]
    return {"key": key, "name": name, "ok": ok, "status": status, "detail": detail, "meaning": meaning,
            "weight": weight}


def papasamyam(chart) -> float:
    """Malefic points: malefics in houses 1, 2, 4, 7, 8, 12 counted from the ascendant (full), Moon (half)
    and Venus (quarter). The Sun counts half as much as the other malefics."""
    total = 0.0
    for planet, w in MALEFICS.items():
        if chart.house[planet] in PAPA_HOUSES:
            total += w
        if chart.house_from(planet, "MOON") in PAPA_HOUSES:
            total += w / 2
        if planet != "VENUS" and chart.house_from(planet, "VENUS") in PAPA_HOUSES:
            total += w / 4
    return round(total, 2)


def _dasha_sandhi(bride, groom, start, years=30):
    """Mahadasha changes of both partners that fall within six months of each other."""
    end = start + timedelta(days=365.25 * years)
    b = [p.start for p in bride.dasha.mahadashas if start < p.start < end]
    g = [p.start for p in groom.dasha.mahadashas if start < p.start < end]
    return [(x, y) for x in b for y in g if abs((x - y).days) <= 183]


def porutham(chart1, chart2, now):
    genders = {chart1.birth.gender, chart2.birth.gender}
    if genders == {"female", "male"}:
        bride, groom = (chart1, chart2) if chart1.birth.gender == "female" else (chart2, chart1)
    else:
        bride, groom = chart1, chart2
    bs, _, bn = _moon(bride)
    gs, _, gn = _moon(groom)
    n = (gn - bn) % 27 + 1  # count from the bride's star to the groom's, inclusive
    rows = []

    rem = n % 9
    rows.append(_row("dina", "Dina", True if rem in (2, 4, 6, 8, 0) else (None if n == 1 else False),
                     f"Count {n} from the bride's star (remainder {rem or 9})",
                     "day-to-day health and harmony", "normal"))
    bg, gg = GANA_BY_NAKSHATRA[bn], GANA_BY_NAKSHATRA[gn]
    gana_ok = True if bg == gg or {bg, gg} == {"Deva", "Manushya"} else False
    rows.append(_row("gana", "Gana", gana_ok, f"{bg} (bride) · {gg} (groom)", "temperament", "normal"))
    rows.append(_row("mahendra", "Mahendra", n in (4, 7, 10, 13, 16, 19, 22, 25),
                     f"Count {n}", "prosperity and children", "normal"))
    rows.append(_row("stree_deergha", "Stree Deergha", True if n > 13 else (None if n > 7 else False),
                     f"Count {n} ({'more than 13' if n > 13 else 'between 8 and 13' if n > 7 else '7 or less'})",
                     "the bride's well-being and long married life", "normal"))
    yb, yg = YONI_BY_NAKSHATRA[bn], YONI_BY_NAKSHATRA[gn]
    ys = YONI_MATRIX[YONIS.index(yb)][YONIS.index(yg)]
    rows.append(_row("yoni", "Yoni", True if ys >= 3 else (None if ys == 2 else False),
                     f"{yb} (bride) · {yg} (groom)", "physical and instinctive compatibility", "normal"))
    r = (gs - bs) % 12 + 1
    rasi_ok = r == 1 or (r >= 7 and r != 8)  # 7th onwards from the bride's sign, except the 6/8 axis
    rows.append(_row("rasi", "Rasi", True if rasi_ok else False,
                     f"Groom's Moon sign is {_ord(r)} from the bride's ({SIGNS[bs]} → {SIGNS[gs]})",
                     "family growth and lineage", "normal"))
    m = _maitri(SIGN_LORD[bs], SIGN_LORD[gs])
    rows.append(_row("rasi_adhipati", "Rasi Adhipati", True if m >= 4 else (None if m >= 1 else False),
                     f"{SIGN_LORD[bs].title()} (bride) · {SIGN_LORD[gs].title()} (groom)",
                     "friendship of the Moon-sign lords — mutual understanding", "normal"))
    vasya_ok = gs in VASYA[bs] or bs in VASYA[gs]
    rows.append(_row("vasya", "Vasya", True if vasya_ok else False,
                     f"{SIGNS[bs]} and {SIGNS[gs]}", "mutual attraction", "normal"))
    rb, rg = RAJJU_PATTERN[bn % 9], RAJJU_PATTERN[gn % 9]
    rows.append(_row("rajju", "Rajju", rb != rg,
                     f"{rb} (bride) · {rg} (groom)" + ("" if rb != rg else f" — same rajju: traditionally {RAJJU_EFFECT[rb]}"),
                     "longevity of the marriage — the most important porutham", "decisive"))
    a, b = bn + 1, gn + 1
    vedha = (min(a, b), max(a, b)) in VEDHA_PAIRS
    rows.append(_row("vedha", "Vedha", not vedha,
                     f"{NAKSHATRAS[bn]} and {NAKSHATRAS[gn]}" + (" obstruct each other" if vedha else " do not obstruct"),
                     "freedom from mutual affliction", "decisive"))

    agree = sum(1 for x in rows if x["ok"] is True)
    partly = sum(1 for x in rows if x["ok"] is None)
    decisive_ok = all(x["ok"] for x in rows if x["weight"] == "decisive")
    if not decisive_ok:
        verdict, tone = "Not recommended by the traditional rule (Rajju or Vedha does not agree)", "caution"
    elif agree >= 7:
        verdict, tone = "Uttamam — excellent agreement", "good"
    elif agree >= 5:
        verdict, tone = "Madhyamam — acceptable agreement", "gold"
    else:
        verdict, tone = "Adhamam — weak agreement", "caution"
    pb, pg = papasamyam(bride), papasamyam(groom)
    papa_ok = pg >= pb
    sandhi = _dasha_sandhi(bride, groom, now)
    return {"rows": rows, "agree": agree, "genders_known": genders == {"female", "male"}, "partly": partly, "count": n, "verdict": verdict, "tone": tone,
            "decisive_ok": decisive_ok, "bride_name": bride.birth.name or "Bride", "groom_name": groom.birth.name or "Groom",
            "bride_star": NAKSHATRAS[bn], "groom_star": NAKSHATRAS[gn],
            "papa": {"bride": pb, "groom": pg, "ok": papa_ok},
            "dasha_sandhi": sandhi}
