"""Golden-response quality bar.

Two layers are enforced here:
- the hand-written golden exemplars must stay fully verified against the reference chart and keep a
  near-perfect quality score, because the live model is taught from them;
- the offline reader's answer to every canonical question must be fully verified and meet the
  quality rubric, because it is the fallback whenever the AI reader is unavailable or switched off.
"""
from datetime import datetime, timezone

import pytest

from chat.facts import extract_and_verify
from chat.golden import GOLDEN_KEYS, evaluate, golden_case, golden_dataset, golden_guidance
from chat.golden_exemplars import EXEMPLARS, REFERENCE_ASKED_AT, REFERENCE_BIRTH, TOPIC_FALLBACK, exemplar_for
from chat.quality import score_reading
from vedic import BirthInput, analyse

NOW = datetime(2026, 11, 14, 6, 0, tzinfo=timezone.utc)


@pytest.fixture(scope="module")
def cr():
    """Reference chart: 1990-01-01 12:00 IST Delhi — the canonical fixture across the suite."""
    b = BirthInput(year=1990, month=1, day=1, hour=12, minute=0, lat=28.6139, lon=77.2090, tz_name="Asia/Kolkata")
    return analyse(b, now=NOW)


@pytest.fixture(scope="module")
def ref():
    """The exemplars' own chart and question date."""
    return analyse(BirthInput(**REFERENCE_BIRTH), now=REFERENCE_ASKED_AT)


# ------------------------------------------------------------------ hand-written exemplars

@pytest.mark.parametrize("key", list(EXEMPLARS))
def test_every_exemplar_fact_is_verified(key, ref):
    rep = extract_and_verify(EXEMPLARS[key]["answer"], *ref)
    bad = [c.as_dict() for c in rep.checks if c.verdict != "verified"]
    assert not bad, (key, bad)
    assert rep.summary()["total"] >= 8, f"exemplar '{key}' cites too little chart evidence"


@pytest.mark.parametrize("key", list(EXEMPLARS))
def test_every_exemplar_meets_the_quality_bar(key):
    q = score_reading(EXEMPLARS[key]["answer"])
    assert q["score"] >= 92, (key, q["score"], q["issues"])
    assert 300 <= q["words"] <= 800, (key, q["words"])


def test_every_topic_has_an_exemplar_to_learn_from():
    for key in GOLDEN_KEYS:
        chosen, ex = exemplar_for(key)
        assert chosen in EXEMPLARS and ex["answer"].startswith("### The short answer")
    assert set(TOPIC_FALLBACK.values()) <= set(EXEMPLARS)


def test_guidance_teaches_reasoning_without_leaking_facts():
    for key in GOLDEN_KEYS:
        g = golden_guidance(key)
        assert "DIFFERENT PERSON'S CHART" in g
        assert "<fact" not in g, f"guidance for '{key}' must not carry another chart's fact tags"
        assert "**Confidence:**" in g
        assert len(g.split()) < 1100


# ------------------------------------------------------------------ offline regression set

def test_golden_dataset_covers_all_topics(cr):
    ds = golden_dataset(*cr, NOW)
    assert len(ds) == len(GOLDEN_KEYS) == len(set(GOLDEN_KEYS))
    assert {c.topic_key for c in ds} == set(GOLDEN_KEYS)


def test_every_offline_answer_is_verified_and_reads_well(cr):
    for case in golden_dataset(*cr, NOW):
        result = evaluate(case.answer, *cr)
        assert result["passes"] and result["contradicted"] == 0, case.topic_key
        assert result["has_confidence"], case.topic_key
        assert result["quality"] >= 85, (case.topic_key, result["quality"], result["quality_issues"])


# ------------------------------------------------------------------ evaluate()

def test_evaluate_flags_a_broken_fact(cr):
    case = golden_case("career", *cr, NOW)
    broken = case.answer.replace('<fact kind="lagna" sign="Pisces" chart="D10">',
                                 '<fact kind="lagna" sign="Aries" chart="D10">', 1)
    assert broken != case.answer, "test setup: the career answer must contain the D10 lagna tag"
    result = evaluate(broken, *cr)
    assert result["passes"] is False and result["contradicted"] >= 1


def test_evaluate_reports_missing_confidence(cr):
    case = golden_case("timing", *cr, NOW)
    result = evaluate(case.answer.replace("**Confidence:**", "**Verdict:**", 1), *cr)
    assert result["has_confidence"] is False
    assert result["quality"] < evaluate(case.answer, *cr)["quality"]
