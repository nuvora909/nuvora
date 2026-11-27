"""Krishnamurti Paddhati (KP): Placidus cusps, star/sub/sub-sub lords, significators and cuspal promise.

Cusps use the Placidus system (trisection of each quadrant's diurnal/nocturnal semi-arc), computed from the
same apparent sidereal time, obliquity and ayanamsa as the rest of the engine. KP traditionally uses the
Krishnamurti ayanamsa, about 6 arc-minutes smaller than Lahiri; this module uses Lahiri, so a longitude close
to a sub-lord boundary is flagged as sensitive."""
from __future__ import annotations

import math

import numpy as np
from skyfield.nutationlib import mean_obliquity

from .astro import _nutation, _wrap360
from .constants import DASHA_YEARS, NAKSHATRAS, SIGN_LORD, SIGNS

NAK_SPAN = 360 / 27
ORDER = ["KETU", "VENUS", "SUN", "MOON", "MARS", "RAHU", "JUPITER", "SATURN", "MERCURY"]
GRAHAS = ["SUN", "MOON", "MARS", "MERCURY", "JUPITER", "VENUS", "SATURN", "RAHU", "KETU"]
BOUNDARY_DEG = 0.12  # Lahiri vs Krishnamurti ayanamsa difference, with a little margin

# KP house groups for common questions: favourable houses and the houses that deny.
EVENTS = {
    "marriage": (7, {2, 7, 11}, {1, 6, 10}, "Marriage"),
    "career": (10, {2, 6, 10, 11}, {5, 8, 12}, "Job and career"),
    "money": (11, {2, 6, 11}, {5, 8, 12}, "Financial gains"),
    "children": (5, {2, 5, 11}, {1, 4, 10}, "Children"),
    "property": (4, {4, 11, 12}, {3, 5, 10}, "Property and home"),
    "foreign": (12, {3, 9, 12}, {2, 4, 11}, "Foreign travel and settlement"),
    "education": (4, {4, 9, 11}, {3, 8, 12}, "Education"),
}


def _lords_at(lon: float) -> tuple[str, str, str, str]:
    """(sign lord, star lord, sub lord, sub-sub lord) of a sidereal longitude."""
    lon %= 360
    sign_lord = SIGN_LORD[int(lon // 30)]
    nak = int(lon // NAK_SPAN)
    star = ORDER[nak % 9]
    pos = lon - nak * NAK_SPAN
    subs = []
    start = ORDER.index(star)
    span = NAK_SPAN
    for _ in range(2):
        for i in range(9):
            lord = ORDER[(start + i) % 9]
            part = span * DASHA_YEARS[lord] / 120
            if pos < part or i == 8:
                subs.append(lord)
                start = ORDER.index(lord)
                span = part
                break
            pos -= part
    return sign_lord, star, subs[0], subs[1]


def _near_sub_boundary(lon: float) -> bool:
    return any(_lords_at(lon - d)[2] != _lords_at(lon)[2] for d in (BOUNDARY_DEG, -BOUNDARY_DEG))


def placidus_cusps(chart) -> list[float]:
    """Twelve sidereal Placidus cusps (degrees), cusp 1 = ascendant."""
    eph = chart.eph
    t = eph.time(chart.time.utc)
    _, deps = _nutation(t)
    eps = math.radians(float(mean_obliquity(t.tdb)) / 3600.0 + math.degrees(float(deps)))
    ramc = float(_wrap360(t.gast * 15.0 + chart.birth.lon))
    phi = math.radians(chart.birth.lat)
    _, ayan = eph.ayanamsa(t)
    ayan = float(ayan)

    def lon_from_ra(ra):
        r = math.radians(ra)
        return math.degrees(math.atan2(math.sin(r), math.cos(r) * math.cos(eps))) % 360

    def cusp(fraction, above):
        lam = lon_from_ra(ramc + fraction * 90 if above else ramc + 180 - fraction * 90)
        for _ in range(40):
            dec = math.asin(math.sin(eps) * math.sin(math.radians(lam)))
            x = max(-1.0, min(1.0, math.tan(phi) * math.tan(dec)))
            ad = math.degrees(math.asin(x))
            if above:
                ra = ramc + fraction * (90 + ad)
            else:
                ra = ramc + 180 - fraction * (90 - ad)
            new = lon_from_ra(ra)
            if abs((new - lam + 180) % 360 - 180) < 1e-7:
                break
            lam = new
        return lam

    mc = lon_from_ra(ramc)
    asc = float(eph.ascendant_at(chart.time.utc, chart.birth.lat, chart.birth.lon)) + ayan  # tropical
    c11, c12 = cusp(1 / 3, True), cusp(2 / 3, True)
    c2, c3 = cusp(2 / 3, False), cusp(1 / 3, False)
    tropical = [asc, c2, c3, mc + 180, c11 + 180, c12 + 180, asc + 180, c2 + 180, c3 + 180, mc, c11, c12]
    return [float(_wrap360(x - ayan)) for x in tropical]


def _house_of(lon: float, cusps: list[float]) -> int:
    for i in range(12):
        a, b = cusps[i], cusps[(i + 1) % 12]
        if (lon - a) % 360 < (b - a) % 360:
            return i + 1
    return 12


def kp_chart(chart) -> dict:
    cusps = placidus_cusps(chart)
    planets = {}
    for g in GRAHAS:
        lon = chart.lon[g]
        sl, star, sub, subsub = _lords_at(lon)
        planets[g] = {"lon": lon, "sign": SIGNS[int(lon // 30)], "deg": lon % 30, "nakshatra": NAKSHATRAS[int(lon // NAK_SPAN)],
                      "sign_lord": sl, "star_lord": star, "sub_lord": sub, "sub_sub_lord": subsub,
                      "house": _house_of(lon, cusps), "sensitive": _near_sub_boundary(lon)}
    cusp_rows = []
    for i, lon in enumerate(cusps, 1):
        sl, star, sub, subsub = _lords_at(lon)
        cusp_rows.append({"cusp": i, "lon": lon, "sign": SIGNS[int(lon // 30)], "deg": lon % 30, "sign_lord": sl,
                          "star_lord": star, "sub_lord": sub, "sub_sub_lord": subsub, "sensitive": _near_sub_boundary(lon)})
    owned = {g: sorted(c["cusp"] for c in cusp_rows if c["sign_lord"] == g) for g in GRAHAS}
    occupied = {g: planets[g]["house"] for g in GRAHAS}
    # Rahu/Ketu also act for their sign lord (classical KP agency)
    for node in ("RAHU", "KETU"):
        agent = planets[node]["sign_lord"]
        owned[node] = sorted(set(owned[node]) | set(owned.get(agent, [])))

    def signifies(g: str) -> list[int]:
        star = planets[g]["star_lord"]
        houses = {occupied[star], occupied[g]} | set(owned.get(star, [])) | set(owned.get(g, []))
        return sorted(houses)

    significators = {}
    for h in range(1, 13):
        occupants = [g for g in GRAHAS if occupied[g] == h]
        owner = cusp_rows[h - 1]["sign_lord"]
        level1 = [g for g in GRAHAS if planets[g]["star_lord"] in occupants]
        level3 = [g for g in GRAHAS if planets[g]["star_lord"] == owner]
        significators[h] = {"a": level1, "b": occupants, "c": level3, "d": [owner]}
    sig_houses = {g: signifies(g) for g in GRAHAS}
    events = {}
    for key, (cusp_no, good, bad, label) in EVENTS.items():
        sub = cusp_rows[cusp_no - 1]["sub_lord"]
        houses = set(sig_houses[sub])
        hits, against = sorted(houses & good), sorted(houses & bad)
        promised = bool(hits) and len(hits) >= len(against)
        events[key] = {"label": label, "cusp": cusp_no, "sub_lord": sub, "signifies": sorted(houses),
                       "favourable": hits, "against": against, "promised": promised,
                       "sensitive": cusp_rows[cusp_no - 1]["sensitive"]}
    return {"cusps": cusp_rows, "planets": planets, "significators": significators, "signifies": sig_houses,
            "events": events}
