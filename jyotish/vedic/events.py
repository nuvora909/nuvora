"""Transparent topical activation windows and birth-time confidence guidance."""
from __future__ import annotations

from datetime import datetime
from typing import Any

from .constants import SIGN_LORD
from .timing import activation_windows

TOPICS = {
    "career": {"label": "Career, status and visible work", "houses": (6, 10, 11), "karakas": ("SATURN", "SUN", "MERCURY")},
    "relationships": {"label": "Marriage and partnerships", "houses": (7, 2, 11), "karakas": ("VENUS", "JUPITER")},
    "wealth": {"label": "Income, savings and gains", "houses": (2, 11, 5), "karakas": ("JUPITER", "VENUS", "MERCURY")},
    "property": {"label": "Home, property and vehicles", "houses": (4, 11, 12), "karakas": ("MARS", "VENUS", "MOON")},
    "education": {"label": "Education and learning", "houses": (4, 5, 9), "karakas": ("MERCURY", "JUPITER")},
    "children": {"label": "Children and creativity", "houses": (5, 9, 11), "karakas": ("JUPITER",)},
    "foreign": {"label": "Foreign travel and residence", "houses": (12, 9, 3, 4), "karakas": ("RAHU", "MOON", "SATURN")},
    "spiritual": {"label": "Spiritual life and inner growth", "houses": (9, 12, 5, 8), "karakas": ("JUPITER", "KETU")},
    "health": {"label": "Vitality, routines and resilience", "houses": (1, 6, 8), "karakas": ("SUN", "MARS", "SATURN")},
    "general": {"label": "Personal direction and life decisions", "houses": (1, 9, 10, 11), "karakas": ("JUPITER", "SATURN")},
}


def _direction(score: float) -> str:
    if score >= 0.75:
        return "supportive"
    if score <= -0.75:
        return "demanding"
    return "mixed"


def event_windows(chart, topic: str = "general", when: datetime | None = None,
                  horizon_years: float = 3.0, ashtakavarga: dict | None = None,
                  planet_strength: dict | None = None, activation: dict | None = None,
                  limit: int | None = 12) -> dict[str, Any]:
    """Rank dasha periods for a life area; these are activations, not event promises."""
    if topic not in TOPICS:
        raise ValueError(f"Unknown topic {topic!r}; choose one of {', '.join(TOPICS)}")
    spec = TOPICS[topic]
    houses = spec["houses"]
    topical_lords = {SIGN_LORD[(chart.lagna_sign + h - 1) % 12] for h in houses}
    activation = activation or activation_windows(chart, when, horizon_years)
    sav_rows = {r["house"]: r["sav"] for r in (ashtakavarga or {}).get("sav_by_house", [])}
    strengths = planet_strength or {}
    windows = []
    for period in activation["periods"]:
        antar = period["antardasha"]
        maha = period["mahadasha"]
        owned = sorted(h for h in houses if SIGN_LORD[(chart.lagna_sign + h - 1) % 12] == antar)
        occupied = sorted(h for h in houses if chart.house[antar] == h)
        relevant = bool(owned or occupied or antar in spec["karakas"] or maha in topical_lords)
        sav = [sav_rows[h] for h in houses if h in sav_rows]
        sav_mean = sum(sav) / len(sav) if sav else 28.0
        scores = [strengths[g]["score"] for g in (antar, maha) if g in strengths]
        strength_mean = sum(scores) / len(scores) if scores else 60.0
        score = max(-2.0, min(2.0, (sav_mean - 28) / 4 + (strength_mean - 60) / 20 + (0.35 if relevant else -0.35)))
        triggers = []
        for ingress in activation["slow_ingresses"]:
            date = ingress["time"][:10]
            if period["start"] <= date < period["end"] and ingress["house_from_lagna"] in houses:
                triggers.append({"planet": ingress["planet"], "date": date, "to": ingress["to"],
                                 "house_from_lagna": ingress["house_from_lagna"]})
        reasons = []
        if owned:
            reasons.append(f"{antar.title()} rules topical house" + ("s" if len(owned) > 1 else "") + " " + ", ".join(map(str, owned)))
        if occupied:
            reasons.append(f"{antar.title()} occupies topical house" + ("s" if len(occupied) > 1 else "") + " " + ", ".join(map(str, occupied)))
        if antar in spec["karakas"]:
            reasons.append(f"{antar.title()} is a natural significator for this topic")
        if not reasons:
            reasons.append("Indirect activation through the running mahadasha; confirmation is limited")
        if sav:
            reasons.append(f"Mean SAV across the topical houses is {sav_mean:.1f}")
        reasons.append(f"Mean heuristic strength of the period lords is {strength_mean:.0f}/100")
        confidence = "moderate" if relevant and (owned or occupied or triggers) else "low"
        windows.append({"topic": topic, "label": spec["label"], "start": period["start"], "end": period["end"],
                        "mahadasha": maha, "antardasha": antar, "houses": list(houses), "direction": _direction(score),
                        "support_score": round(score, 2), "confidence": confidence, "reasons": reasons,
                        "transit_triggers": triggers[:4]})
    priority = {"supportive": 2, "mixed": 1, "demanding": 0}
    windows.sort(key=lambda w: (w["confidence"] == "moderate", priority[w["direction"]], w["support_score"]), reverse=True)
    return {"topic": topic, "label": spec["label"], "generated_at": activation["at"], "horizon_years": horizon_years,
            "windows": windows if limit is None else windows[:max(0, limit)],
            "note": "Ranked astrological activation windows, not predictions that an event must occur. Confirm with real-world circumstances."}


def reading_confidence(sensitivity: dict) -> dict[str, Any]:
    ratings = {k: v.get("rating") for k, v in sensitivity.items() if isinstance(v, dict) and v.get("rating")}
    fragile = sorted(k for k, rating in ratings.items() if rating == "fragile")
    sensitive = sorted(k for k, rating in ratings.items() if rating == "sensitive")
    level = "low" if fragile else ("moderate" if sensitive else "high")
    limitations = []
    if fragile:
        limitations.append("Some chart factors change within 10 minutes of the supplied birth time")
    if sensitive:
        limitations.append("Some divisional or lunar factors change within 30 minutes")
    if sensitivity.get("moon_nakshatra", {}).get("rating") != "robust":
        limitations.append("The Moon nakshatra boundary can alter the Vimshottari sequence")
    return {"level": level, "basis": "Robustness of computed chart factors to small birth-time changes, not certainty about life events",
            "fragile_factors": fragile, "sensitive_factors": sensitive, "limitations": limitations,
            "note": "Use low or moderate confidence for precise timing whenever a relevant factor is not robust."}


def birth_time_guidance(sensitivity: dict) -> dict[str, Any]:
    confidence = reading_confidence(sensitivity)
    focus = [k for k in ("lagna_sign", "navamsha_lagna", "dashamsha_lagna", "saptamsha_lagna", "moon_nakshatra")
             if sensitivity.get(k, {}).get("rating") != "robust"]
    recommendations = ["Treat the recorded time as an input to verify, not an unquestionable fact"]
    if focus:
        recommendations.append("Avoid precise divisional-chart or event-date claims until the birth time is corroborated")
    else:
        recommendations.append("The inspected factors are comparatively stable, but this does not validate the recorded time itself")
    if sensitivity.get("dasha_shift_per_10_min_days"):
        recommendations.append(f"Allow about {sensitivity['dasha_shift_per_10_min_days']} days of dasha-date movement per 10 minutes of birth-time error")
    return {"summary": confidence["level"] + " robustness for the supplied birth time", "watch_factors": focus,
            "recommendations": recommendations, "thresholds_min": sensitivity.get("thresholds_min", {})}
