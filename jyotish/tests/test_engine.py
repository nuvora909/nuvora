import json
from datetime import datetime, timezone

import pytest

from chat.context import build_context
from chat.facts import Verifier
from chat.offline import offline_answer
from chat.tools import run_tool
from vedic import (ENGINE_VERSION, EVENT_TOPICS, BirthInput, Chart, analyse, birth_time_guidance, event_windows,
                   reading_confidence)


@pytest.fixture(scope="module")
def calculated():
    birth = BirthInput(year=1990, month=1, day=1, hour=12, minute=0, lat=28.6139, lon=77.209,
                       tz_name="Asia/Kolkata")
    return analyse(birth, now=datetime(2026, 11, 18, tzinfo=timezone.utc))


def test_full_report_exposes_strength_timing_events_and_engine_metadata(calculated):
    chart, report = calculated
    assert ENGINE_VERSION == "0.4.0"
    assert set(report["planet_strength"]) == {"SUN", "MOON", "MARS", "MERCURY", "JUPITER", "VENUS", "SATURN"}
    assert all(0 <= row["score"] <= 100 and row["factors"] for row in report["planet_strength"].values())
    assert "not classical Shadbala" in report["strength_summary"]["note"]
    assert report["timing"]["current"]["mahadasha"]
    assert report["timing"]["periods"]
    assert set(report["event_windows"]) == set(EVENT_TOPICS)
    assert report["engine_summary"]["version"] == ENGINE_VERSION
    assert report["confidence"]["level"] in {"low", "moderate", "high"}
    assert report["birth_time_guidance"]["recommendations"]


def test_yoga_impacts_are_personalised_and_connected(calculated):
    chart, report = calculated
    analysis = report["yoga_analysis"]
    present = [y for y in report["yogas"] if y["present"]]
    assert present and analysis["headline"]
    assert "not certainty" in analysis["note"]
    assert analysis["interactions"]
    for yoga in present:
        impact = yoga["impact"]
        assert impact["direction"] in {"supportive", "mixed", "challenging"}
        assert impact["activation"]["status"] in {"active", "potential", "softened"}
        assert impact["summary"] and impact["combined_effect"]
        assert impact["condition"]["summary"]
        assert "For you" in impact["summary"]
        assert "guarantee" not in impact["summary"].lower()
    linked = next(y for y in present if y["name"] == "Dhana Yoga")
    assert any(row["other"] == "Anapha Yoga" for row in linked["impact"]["interactions"])
    json.dumps(report)


def test_yoga_impacts_reach_ai_and_offline_readers(calculated):
    chart, report = calculated
    context = build_context(report)
    assert "Combined yoga synthesis" in context
    assert "Personal impact" in context and "Combined effect" in context
    answer = offline_answer(chart, report, "Give me a full life reading")
    assert "Your connected yoga pattern" in answer
    assert "activated now" in answer or "natal potential" in answer


def test_yoga_synthesis_links_aspect_relationships():
    from vedic.yogas import synthesize_yogas
    lons = {"SUN": 0, "MOON": 180, "MARS": 30, "MERCURY": 60, "JUPITER": 90,
            "VENUS": 120, "SATURN": 150, "RAHU": 210}
    chart = Chart.from_longitudes(0, lons)
    yogas = [{"name": "Test Support", "category": "Raja", "present": True, "evidence": [],
              "planets": ["SUN"], "houses": [1]},
             {"name": "Test Pressure", "category": "Dosha", "present": True, "evidence": [],
              "planets": ["MOON"], "houses": [7]}]
    result = synthesize_yogas(chart, yogas, now=datetime(2026, 11, 18, tzinfo=timezone.utc))
    assert len(result["interactions"]) == 1
    link = result["interactions"][0]
    assert link["kind"] == "balancing"
    assert link["aspects"]
    assert "counterbalance" in link["text"]

def test_transit_sav_and_activation_periods_are_consistent(calculated):
    chart, report = calculated
    for row in report["transits"]["positions"].values():
        assert isinstance(row["sav_in_sign"], int)
    previous = ""
    for period in report["timing"]["periods"]:
        assert period["start"] >= previous
        previous = period["start"]
        assert period["start"] < period["end"]
        assert period["mahadasha"] and period["antardasha"]
        assert period["relevance"] in {"direct", "supporting", "background"}


def test_event_windows_are_ranked_activations_not_event_promises(calculated):
    chart, report = calculated
    for topic, data in report["event_windows"].items():
        assert data["topic"] == topic
        assert "not predictions" in data["note"]
        assert len(data["windows"]) <= 12
        for window in data["windows"]:
            assert window["start"] < window["end"]
            assert window["direction"] in {"supportive", "mixed", "demanding"}
            assert window["confidence"] in {"low", "moderate"}
            assert window["reasons"]
    with pytest.raises(ValueError):
        event_windows(chart, "certain-lottery-win")


def test_confidence_and_guidance_follow_birth_time_robustness():
    robust = {"lagna_sign": {"rating": "robust"}, "moon_nakshatra": {"rating": "robust"},
              "thresholds_min": {"fragile": "<10"}}
    assert reading_confidence(robust)["level"] == "high"
    assert reading_confidence({**robust, "navamsha_lagna": {"rating": "sensitive"}})["level"] == "moderate"
    low = reading_confidence({**robust, "dashamsha_lagna": {"rating": "fragile"}})
    assert low["level"] == "low"
    assert low["fragile_factors"] == ["dashamsha_lagna"]
    guidance = birth_time_guidance({**robust, "dashamsha_lagna": {"rating": "fragile"},
                                    "dasha_shift_per_10_min_days": 12.5})
    assert "dashamsha_lagna" in guidance["watch_factors"]
    assert any("12.5 days" in row for row in guidance["recommendations"])


def test_strength_fact_verification_and_event_tool(calculated):
    chart, report = calculated
    actual = report["planet_strength"]["JUPITER"]
    verifier = Verifier(chart, report)
    assert verifier.check("strength", {"planet": "Jupiter", "label": actual["label"], "score": actual["score"]})[0] == "verified"
    wrong = "weak" if actual["label"] != "weak" else "strong"
    verdict, truth = verifier.check("strength", {"planet": "Jupiter", "label": wrong})
    assert verdict == "contradicted"
    assert "not classical Shadbala" in truth
    result = json.loads(run_tool(chart, "get_event_windows", {"topic": "career", "horizon_years": 1}))
    assert result["topic"] == "career"
    assert "windows" in result and "not predictions" in result["note"]
