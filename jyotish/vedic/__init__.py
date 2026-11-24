"""Nuvora Vedic engine. Public entry points: Chart, BirthInput, Options, full_report."""
from datetime import datetime

from .ashtakavarga import ashtakavarga
from .chart import ENGINE_VERSION, BirthInput, Chart, Options
from .events import TOPICS as EVENT_TOPICS, birth_time_guidance, event_windows, reading_confidence
from .sensitivity import sensitivity
from .strength import planet_strength, strength_summary
from .timing import activation_windows, slow_ingresses
from .transits import transits
from .yogas import all_yogas, synthesize_yogas


def full_report(birth: BirthInput, options: Options | None = None, now: datetime | None = None,
                include_transits: bool = True, include_sensitivity: bool = True) -> dict:
    return analyse(birth, options, now, include_transits, include_sensitivity)[1]


def analyse(birth: BirthInput, options: Options | None = None, now: datetime | None = None,
            include_transits: bool = True, include_sensitivity: bool = True) -> tuple[Chart, dict]:
    """(Chart object, JSON-ready report). The chat verifier needs both."""
    c = Chart(birth, options)
    out = c.to_dict(now=now)
    out["ashtakavarga"] = ashtakavarga(c)
    out["planet_strength"] = {g: planet_strength(c, g) for g in c.sign if g not in ("RAHU", "KETU")}
    yoga_analysis = synthesize_yogas(c, all_yogas(c), out["planet_strength"], out["ashtakavarga"], now)
    out["yogas"] = yoga_analysis["yogas"]
    out["yoga_analysis"] = {key: value for key, value in yoga_analysis.items() if key != "yogas"}
    out["strength_summary"] = strength_summary(c)
    if include_sensitivity:
        out["sensitivity"] = sensitivity(c)
        out["confidence"] = reading_confidence(out["sensitivity"])
        out["birth_time_guidance"] = birth_time_guidance(out["sensitivity"])
    if include_transits:
        out["transits"] = transits(c, now)
        out["timing"] = activation_windows(c, now)
    # Compute the dasha/ingress activation once and share it; without transits (Prashna charts) each of
    # the ten topics below used to rebuild it on its own.
    activation = out.get("timing") or activation_windows(c, now)
    out["event_windows"] = {topic: event_windows(c, topic, now, ashtakavarga=out["ashtakavarga"],
                                                  planet_strength=out["planet_strength"], activation=activation)
                            for topic in EVENT_TOPICS}
    out["engine_summary"] = {
        "version": ENGINE_VERSION, "zodiac": "Sidereal · Lahiri", "houses": "Whole sign",
        "dasha": "Vimshottari", "strength_method": "Transparent heuristic, not classical Shadbala",
        "event_method": "Topical dasha activation ranked with SAV, heuristic strength and slow-transit triggers",
        "yoga_method": "Personalised house, participant-condition, dasha-activation and inter-yoga synthesis",
        "topics": list(EVENT_TOPICS),
    }
    return c, out


__all__ = ["BirthInput", "Chart", "Options", "full_report", "analyse", "ENGINE_VERSION",
           "planet_strength", "strength_summary", "activation_windows", "slow_ingresses",
           "synthesize_yogas", "event_windows", "reading_confidence", "birth_time_guidance", "EVENT_TOPICS"]
