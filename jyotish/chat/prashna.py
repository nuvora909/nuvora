"""Question-time Prashna charts for explicit decision questions."""
from __future__ import annotations

import json
from dataclasses import dataclass
from datetime import datetime, timezone

from vedic import BirthInput, Options, analyse
from vedic.constants import SIGNS


@dataclass(frozen=True)
class PrashnaReading:
    chart: object
    report: dict
    asked_at: datetime
    location: str


def build_prashna(natal_chart, asked_at: datetime) -> PrashnaReading:
    asked_at = asked_at.astimezone(timezone.utc).replace(microsecond=0)
    local = asked_at.astimezone(natal_chart.time.local.tzinfo)
    birth = BirthInput(
        year=local.year, month=local.month, day=local.day,
        hour=local.hour, minute=local.minute, second=local.second,
        lat=natal_chart.birth.lat, lon=natal_chart.birth.lon,
        tz_name=natal_chart.time.tz_name,
        utc_offset_hours=None if natal_chart.time.tz_name else natal_chart.time.utc_offset_hours,
        name="Prashna", place=natal_chart.birth.place,
    )
    options = Options(
        node=natal_chart.options.node,
        dasha_year=natal_chart.options.dasha_year,
        node_aspects=natal_chart.options.node_aspects,
        vargas=(),
    )
    chart, report = analyse(birth, options, now=asked_at, include_transits=False, include_sensitivity=False)
    coordinates = f"{birth.lat:.4f}, {birth.lon:.4f}"
    location = f"{birth.place} ({coordinates})" if birth.place.strip() else coordinates
    return PrashnaReading(chart, report, asked_at, location)


def prashna_prompt(reading: PrashnaReading, topic_houses: tuple[int, ...]) -> str:
    chart = reading.chart
    houses = {}
    for house in dict.fromkeys((1, *topic_houses)):
        lord = chart.house_lord[house]
        houses[str(house)] = {
            "sign": SIGNS[chart.house_sign[house]],
            "lord": lord.title(),
            "lord_house": chart.house[lord],
            "sav": reading.report["ashtakavarga"]["sav_by_house"][house - 1]["sav"],
        }
    evidence = {
        "question_time_utc": reading.asked_at.isoformat(),
        "question_time_local": chart.time.local.isoformat(),
        "location_assumption": reading.location + "; saved chart location used because current location was not supplied",
        "lagna": SIGNS[chart.lagna_sign],
        "moon": {"sign": SIGNS[chart.sign["MOON"]], "house": chart.house["MOON"]},
        "houses": houses,
    }
    return (
        "\n\n[Prashna evidence for this explicit decision question. Use H1 for the querent and the topic houses "
        "for the decision, then synthesize it with the natal evidence instead of giving a generic topic reading. "
        "Answer the actual decision directly but condition any lean on real-world due diligence. Identify the "
        "question time and location assumption. Every Prashna chart fact tag MUST include chart=\"Prashna\"; "
        "natal and divisional facts keep their own chart attributes. Do not call Prashna positions birth-chart "
        "placements.]\n" + json.dumps(evidence, ensure_ascii=False)
    )
