"""Ashtakavarga (Parashari): Bhinnashtakavarga for the seven grahas and Sarvashtakavarga."""
from __future__ import annotations

from .constants import ASHTAKAVARGA, BAV_TOTALS, SEVEN, SIGNS


def ashtakavarga(chart):
    ref_sign = {g: chart.sign[g] for g in SEVEN}
    ref_sign["LAGNA"] = chart.lagna_sign
    bav = {}
    for planet, table in ASHTAKAVARGA.items():
        row = [0] * 12
        for contributor, houses in table.items():
            base = ref_sign[contributor]
            for h in houses:
                row[(base + h - 1) % 12] += 1
        if sum(row) != BAV_TOTALS[planet]:
            raise AssertionError(f"BAV {planet} total {sum(row)} != {BAV_TOTALS[planet]}")
        bav[planet] = row
    sav = [sum(bav[p][s] for p in SEVEN) for s in range(12)]
    if sum(sav) != 337:
        raise AssertionError("SAV total must be 337")
    by_house = [{"house": h, "sign": chart.house_sign[h], "sign_name": SIGNS[chart.house_sign[h]],
                 "sav": sav[chart.house_sign[h]]} for h in range(1, 13)]
    return {
        "bav_by_sign": {p: bav[p] for p in SEVEN},          # index 0 = Aries
        "sav_by_sign": sav,
        "sav_by_house": by_house,
        "note": "SAV above 28 in a sign is conventionally favourable for transits; below 25 weak.",
    }
