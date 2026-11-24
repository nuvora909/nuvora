"""Tools the reading model can call. Neutral JSON-schema definitions plus a deterministic executor."""
from __future__ import annotations

import json
from datetime import datetime, timedelta, timezone

from vedic.ashtakavarga import ashtakavarga
from vedic.constants import GRAHAS, VARGA_NAMES, VARGAS
from vedic.events import TOPICS as EVENT_TOPICS, event_windows
from vedic.strength import planet_strength
from vedic.transits import ingresses, transits

TOOLS = [
    {"name": "get_varga",
     "description": "Divisional chart: lagna and each graha's sign and house in D-n. Available: "
                    + ", ".join(f"D{n} {VARGA_NAMES[n]}" for n in VARGAS),
     "parameters": {"type": "object", "properties": {"n": {"type": "integer", "enum": VARGAS}}, "required": ["n"]}},
    {"name": "get_dasha",
     "description": "Vimshottari periods overlapping a date range. depth 1=maha, 2=antar, 3=pratyantar.",
     "parameters": {"type": "object", "properties": {
         "start": {"type": "string", "description": "YYYY-MM-DD"},
         "end": {"type": "string", "description": "YYYY-MM-DD"},
         "depth": {"type": "integer", "minimum": 1, "maximum": 3}}, "required": ["start", "end"]}},
    {"name": "get_transits",
     "description": "Positions of all grahas on a date, with houses counted from natal lagna and natal Moon, "
                    "and Sade Sati status on that date.",
     "parameters": {"type": "object", "properties": {"date": {"type": "string", "description": "YYYY-MM-DD"}},
                    "required": ["date"]}},
    {"name": "get_event_windows",
     "description": "Ranked topical dasha activation windows with SAV support, heuristic planetary strength and slow-transit triggers. "
                    "These are not guaranteed events or scientific probabilities.",
     "parameters": {"type": "object", "properties": {
         "topic": {"type": "string", "enum": list(EVENT_TOPICS)},
         "horizon_years": {"type": "number", "minimum": 0.25, "maximum": 10}}, "required": ["topic"]}},
]

MAX_RANGE_DAYS = {1: 365.25 * 130, 2: 365.25 * 40, 3: 365.25 * 6}


def _date(s: str, tz) -> datetime:
    d = datetime.strptime(s.strip()[:10], "%Y-%m-%d")
    return d.replace(tzinfo=tz).astimezone(timezone.utc)


def run_tool(chart, name: str, args: dict) -> str:
    """Returns a JSON string. Errors are returned as {"error": ...} so the model can recover."""
    try:
        return json.dumps(_run(chart, name, args or {}), ensure_ascii=False)
    except Exception as e:   # tool errors must never crash the chat loop
        return json.dumps({"error": f"{type(e).__name__}: {e}"})


def _run(chart, name, a):
    tz = chart.time.local.tzinfo
    if name == "get_varga":
        n = int(str(a["n"]).lstrip("Dd"))
        if n not in chart.varga:
            return {"error": f"D{n} not available; choose one of {VARGAS}"}
        v = chart.varga[n]
        return {"chart": f"D{n}", "name": v["name"], "domain": v["domain"], "lagna": v["lagna"]["sign_name"],
                "planets": {g.title(): {"sign": p["sign_name"], "house": p["house"]} for g, p in v["planets"].items()}}
    if name == "get_dasha":
        depth = max(1, min(3, int(a.get("depth", 2))))
        s, e = _date(a["start"], tz), _date(a["end"], tz)
        if e <= s:
            return {"error": "end must be after start"}
        if (e - s).days > MAX_RANGE_DAYS[depth]:
            return {"error": f"range too long for depth {depth}; max {int(MAX_RANGE_DAYS[depth] / 365.25)} years"}
        return {"periods": [{"lords": p.as_dict(tz)["label"], "start": p.start.astimezone(tz).date().isoformat(),
                             "end": p.end.astimezone(tz).date().isoformat()}
                            for p in chart.dasha.between(s, e, depth)]}
    if name == "get_transits":
        when = _date(a["date"], tz) + timedelta(hours=12)
        t = transits(chart, when, horizon_years=0.0)
        ss = t["sade_sati"]
        return {"date": t["at"][:10],
                "positions": {g.title(): {"sign": p["sign_name"], "degree": p["degree"], "retrograde": p["retrograde"],
                                          "house_from_lagna": p["house_from_lagna"],
                                          "house_from_moon": p["house_from_moon"],
                                          "over_natal": [x.title() for x in p["over_natal"]]}
                              for g, p in t["positions"].items()},
                "sade_sati_active": ss["active"], "sade_sati_phase": ss["phase"],
                "saturn_house_from_moon": ss["saturn_house_from_moon"]}
    if name == "get_ingresses":
        g = a["planet"].upper()
        if g not in GRAHAS:
            return {"error": "unknown planet"}
        s, e = _date(a["start"], tz), _date(a["end"], tz)
        if (e - s).days > 365.25 * 30:
            return {"error": "max 30 years"}
        step = 0.25 if g == "MOON" else (1.0 if g in ("SUN", "MERCURY", "VENUS", "MARS") else 2.0)
        if g == "MOON" and (e - s).days > 120:
            return {"error": "Moon ingresses limited to 120 days"}
        return {"ingresses": [{"time": i["time"].astimezone(tz).isoformat(timespec="minutes"), "to": i["to"],
                               "house_from_lagna": chart.house_of_sign(i["to_sign"]),
                               "house_from_moon": (i["to_sign"] - chart.sign["MOON"]) % 12 + 1}
                              for i in ingresses(chart.eph, g, s, e, step_days=step)]}
    if name == "get_event_windows":
        strengths = {g: planet_strength(chart, g) for g in GRAHAS if g not in ("RAHU", "KETU")}
        return event_windows(chart, a["topic"], horizon_years=float(a.get("horizon_years", 3.0)),
                             ashtakavarga=ashtakavarga(chart), planet_strength=strengths)
    return {"error": f"unknown tool {name}"}
