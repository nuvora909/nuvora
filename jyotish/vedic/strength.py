"""Transparent planetary strength index (Shadbala-inspired heuristic).

Full Shadbala needs ephemeris declinations, weekday lordship, divisional charts and
ruling-party tables. This module computes a deliberately simple, explainable index from
factors the engine already verifies: dignity, house, motion, combustion, vargottama and
aspects received. Every factor is exposed so a reading can cite it and the fact-checker
can refuse to treat it as a classical Shadbala value.
"""
from __future__ import annotations

from .chart import KENDRAS, TRIKONAS
from .constants import NATURAL_BENEFICS, NATURAL_MALEFICS

DIGNITY_SCORE = {
    "Exalted": 1.00, "Moolatrikona": 0.90, "Own sign": 0.80,
    "Great Friend's sign": 0.72, "Friend's sign": 0.66, "Neutral's sign": 0.58,
    "Enemy's sign": 0.42, "Great Enemy's sign": 0.35, "Debilitated": 0.20,
}


def _dignity_score(status: str) -> float:
    if status in DIGNITY_SCORE:
        return DIGNITY_SCORE[status]
    if status == "Neutral (node)":
        return 0.50
    return 0.55


def _house_score(house: int) -> float:
    if house in KENDRAS:
        return 1.00
    if house in TRIKONAS:
        return 0.90
    if house in (2, 11):
        return 0.80
    if house == 3:
        return 0.70
    if house in (6, 8, 12):
        return 0.45
    return 0.65


def planet_strength(chart, g: str) -> dict:
    """Strength index in [0.05, 0.98] with the exact arithmetic shown in actors."""
    factors = []

    dignity_status = chart.dignity[g]["status"]
    d_score = _dignity_score(dignity_status)
    score = 0.45 * d_score
    factors.append(f"dignity {dignity_status} (0.45 x {d_score:.2f})")

    h_score = _house_score(chart.house[g])
    score += 0.25 * h_score
    factors.append(f"house {chart.house[g]} (0.25 x {h_score:.2f})")

    if g in ("RAHU", "KETU"):
        motion = 0.60
        factors.append("node: motion excluded (0.00)")
    else:
        motion = 1.00 if chart.retro[g] else 0.85
        factors.append(("retrograde (0.10 x 1.00)" if chart.retro[g] else "direct (0.10 x 0.85)"))
    score += 0.10 * motion

    if chart.combust[g]["combust"]:
        score -= 0.15
        factors.append(f"combust within {chart.combust[g]['distance_from_sun']:.1f} deg of Sun (-0.15)")
    if chart.planet_dict(g)["vargottama"]:
        score += 0.05
        factors.append("vargottama, same sign in D1 and D9 (+0.05)")

    aspect_bonus = 0.0
    for other in chart.aspected_by[chart.house[g]]:
        if other == g:
            continue
        step = 0.05 if other in NATURAL_BENEFICS else (-0.05 if other in NATURAL_MALEFICS else 0.0)
        aspect_bonus += step
        if step:
            factors.append(f"aspected by {other.title()} ({step:+.2f})")
    score += max(-0.15, min(0.15, aspect_bonus))

    score = round(max(0.05, min(0.98, score)) * 100, 1)
    label = "strong" if score >= 72 else ("clear" if score >= 55 else "weak")
    return {"score": score, "label": label, "factors": factors,
            "note": "Explainable heuristic, not classical Shadbala."}


def strength_summary(chart) -> dict:
    rows = [(g, planet_strength(chart, g)) for g in ("SUN", "MOON", "MARS", "MERCURY", "JUPITER", "VENUS", "SATURN")]
    ranked = sorted(rows, key=lambda x: x[1]["score"], reverse=True)
    mean = round(sum(s["score"] for _, s in rows) / len(rows), 3)
    return {
        "strongest": [{"planet": g, "score": s["score"], "label": s["label"]} for g, s in ranked[:3]],
        "weakest": [{"planet": g, "score": s["score"], "label": s["label"]} for g, s in ranked[-3:]],
        "mean": mean,
        "note": "Ranked across the seven classical grahas; nodes are excluded. Transparent heuristic, not classical Shadbala.",
    }
