"""Vedic timing: slow-planet ingresses and dasha-based activation windows."""
from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Any

from .chart import KENDRAS, TRIKONAS
from .constants import GRAHAS
from .transits import ingresses


def _house_from_sign(chart, sign: int, ref: str = "lagna") -> int:
    if ref == "moon":
        return (sign - chart.sign["MOON"]) % 12 + 1
    return chart.house_of_sign(sign)


def _planet_rules_house(chart, planet: str, house: int) -> bool:
    return chart.house_lord[house] == planet


def _planet_occupies_house(chart, planet: str, house: int) -> bool:
    return chart.house[planet] == house


def _relevance_for_planet(chart, planet: str, houses: list[int] | tuple[int, ...]) -> str:
    linked = [h for h in houses if _planet_rules_house(chart, planet, h) or _planet_occupies_house(chart, planet, h)]
    if any(h in KENDRAS or h in TRIKONAS for h in linked):
        return "direct"
    if any(h in (2, 11) for h in linked):
        return "supporting"
    return "background"


def slow_ingresses(chart, start: datetime, end: datetime) -> list[dict[str, Any]]:
    """Slow-planet sign changes, including retrograde re-entries and natal contacts."""
    out = []
    for planet in ("JUPITER", "SATURN", "RAHU", "KETU"):
        for ing in ingresses(chart.eph, planet, start, end, step_days=2.0):
            to_sign = ing["to_sign"]
            ing["house_from_lagna"] = chart.house_of_sign(to_sign)
            ing["house_from_moon"] = _house_from_sign(chart, to_sign, "moon")
            ing["over_natal"] = [g for g in GRAHAS if chart.sign[g] == to_sign]
            out.append(ing)
    out.sort(key=lambda x: x["time"])
    return out


def _current_dasha_info(chart, when: datetime) -> dict[str, str]:
    periods = chart.dasha.running(when, depth=3)
    names = ("mahadasha", "antardasha", "pratyantardasha")
    return {name: periods[i].lord if len(periods) > i else "" for i, name in enumerate(names)}


def activation_windows(chart, when: datetime | None = None, horizon_years: float = 3.0) -> dict[str, Any]:
    """Combine the chart's actual Vimshottari periods with slow-planet triggers."""
    if horizon_years <= 0 or horizon_years > 20:
        raise ValueError("horizon_years must be greater than 0 and no more than 20")
    when = when or datetime.now(timezone.utc)
    if when.tzinfo is None:
        when = when.replace(tzinfo=timezone.utc)
    end = when + timedelta(days=365.25 * horizon_years)
    slow = slow_ingresses(chart, when, end)
    periods = []
    for period in chart.dasha.between(when, end, depth=2):
        start, finish = max(period.start, when), min(period.end, end)
        lord = period.lord
        houses = [h for h in range(1, 13) if _planet_rules_house(chart, lord, h) or _planet_occupies_house(chart, lord, h)]
        triggers = [{"planet": ing["planet"], "time": ing["time"].isoformat(), "to_sign": ing["to"],
                     "house_from_lagna": ing["house_from_lagna"], "house_from_moon": ing["house_from_moon"]}
                    for ing in slow if start <= ing["time"] <= finish]
        periods.append({"mahadasha": period.lords[0], "antardasha": lord, "level": "antardasha",
                        "start": start.isoformat(), "end": finish.isoformat(), "houses_activated": houses,
                        "transit_triggers": triggers, "relevance": _relevance_for_planet(chart, lord, houses),
                        "note": f"{lord.title()} antardasha" + (f" with {len(triggers)} slow-ingress trigger(s)" if triggers else "")})
    return {"at": when.isoformat(), "horizon_years": horizon_years, "current": _current_dasha_info(chart, when),
            "periods": periods, "windows": periods,
            "slow_ingresses": [{**ingress, "time": ingress["time"].isoformat()} for ingress in slow],
            "note": "Antardasha periods combined with Jupiter, Saturn, Rahu and Ketu ingresses. These are activation windows, not guaranteed events."}
