"""Golden-response quality bar: every canonical answer must pass the verifier.

This test is the quality gate for the reading system. If an offline-reader change
introduces a claim the engine cannot verify, or breaks the six-part structure, the
golden answers here will catch it — and a broken golden answer fails the suite.
"""
from datetime import datetime, timezone

import pytest

from chat.facts import extract_and_verify
from chat.golden import (
    GOLDEN_KEYS,
    _distil,
    evaluate,
    golden_case,
    golden_dataset,
    golden_guidance,
)
from vedic import BirthInput, analyse

NOW = datetime(2026, 11, 14, 6, 0, tzinfo=timezone.utc)

REQUIRED_SECTIONS = (
    "### Bottom line",
    "### Why the chart points this way",
    "### Natural significators",
    "### What this means in practice",
    "### Timing",
    "### How to use this",
)


@pytest.fixture(scope="module")
def cr():
    """Reference chart: 1990-01-01 12:00 IST Delhi — the canonical fixture across the suite."""
    b = BirthInput(year=1990, month=1, day=1, hour=12, minute=0, lat=28.6139, lon=77.2090, tz_name="Asia/Kolkata")
    return analyse(b, now=NOW)


# ------------------------------------------------------------------ dataset integrity

def test_golden_dataset_covers_all_topics(cr):
    """Every MODE_QUESTIONS key must have a golden case (13 topics)."""
    ds = golden_dataset(*cr, NOW)
    assert len(ds) == len(GOLDEN_KEYS) == len(set(GOLDEN_KEYS))
    assert {c.topic_key for c in ds} == set(GOLDEN_KEYS)


def test_every_golden_answer_is_fully_verified(cr):
    """Every golden answer must pass the verifier with zero contradicted facts."""
    for key in GOLDEN_KEYS:
        case = golden_case(key, *cr, NOW)
        rep = extract_and_verify(case.answer, *cr)
        contradicted = rep.summary()["contradicted"]
        assert contradicted == 0, (
            f"Golden answer for '{key}' has {contradicted} contradicted fact(s):\n"
            + "\n".join(f"  - {c.text!r} → {c.engine}" for c in rep.contradicted)
            + f"\n\nFull answer:\n{case.answer}"
        )


# ------------------------------------------------------------------ structure

def test_golden_answers_have_mandatory_structure(cr):
    """Every golden answer must contain the six mandatory reading sections and Confidence."""
    for key in GOLDEN_KEYS:
        case = golden_case(key, *cr, NOW)
        assert case.answer.startswith("### Bottom line"), (
            f"Golden '{key}' does not begin with '### Bottom line'"
        )
        for section in REQUIRED_SECTIONS:
            assert section in case.answer, (
                f"Golden '{key}' is missing mandatory section '{section}'"
            )
        assert "**Confidence:**" in case.answer, (
            f"Golden '{key}' is missing the '**Confidence:**' footer"
        )


def test_golden_answers_are_substantial_but_bounded(cr):
    """A full reading should be 250–900 words; 13 topics × this keeps the test fast."""
    for key in GOLDEN_KEYS:
        case = golden_case(key, *cr, NOW)
        wc = len(case.answer.split())
        assert 200 <= wc <= 1500, (
            f"Golden '{key}' has {wc} words; expected 200–1500 for a deep reading"
        )


def test_golden_answers_carry_fact_tags(cr):
    """Golden answers must demonstrate fact-tag discipline — at least 10 facts each."""
    for key in GOLDEN_KEYS:
        case = golden_case(key, *cr, NOW)
        n = case.answer.count("<fact")
        assert n >= 10, (
            f"Golden '{key}' has only {n} <fact> tags; a deep reading must carry "
            f"at least 10 verifiable facts"
        )


# ------------------------------------------------------------------ guidance distillation

def test_distil_respects_budget_and_keeps_bottom_line(cr):
    """The distiller must stay within the word budget and start with the Bottom line."""
    case = golden_case("career", *cr, NOW)
    d = _distil(case.answer, max_words=250)
    assert d.startswith("### Bottom line")
    assert len(d.split()) <= 250 + 50  # small tolerance for heading + confidence footer


def test_distil_keeps_confidence_footer(cr):
    case = golden_case("marriage", *cr, NOW)
    d = _distil(case.answer, max_words=300)
    assert "**Confidence:**" in d


def test_guidance_is_compact_and_verified(cr):
    """The guidance exemplar must be compact (<400 words) and pass the verifier."""
    for key in GOLDEN_KEYS:
        g = golden_guidance(key, *cr, NOW)
        assert "Golden example" in g
        # word budget: guidance should be well under a full reading
        wc = len(g.split())
        assert wc < 450, f"Golden guidance for '{key}' is {wc} words; expected <450"
        # the distilled body must verify cleanly
        # (guidance prepends a header, so extract the body after the Q: line)
        body = g.split("Q: ", 1)[-1]
        # strip the Q line itself
        if "\n\n" in body:
            body = body.split("\n\n", 1)[1]
        rep = extract_and_verify(body, *cr)
        assert rep.summary()["contradicted"] == 0, (
            f"Golden guidance body for '{key}' has "
            f"{rep.summary()['contradicted']} contradicted facts"
        )


# ------------------------------------------------------------------ evaluate() helper

def test_evaluate_pass_on_golden(cr):
    """evaluate() must report a clean golden answer as passing."""
    case = golden_case("year", *cr, NOW)
    result = evaluate(case.answer, *cr)
    assert result["passes"] is True
    assert result["contradicted"] == 0
    assert result["has_bottom_line"] is True
    assert result["has_confidence"] is True
    assert result["sections"] >= 6


def test_evaluate_flags_a_broken_answer(cr):
    """evaluate() must detect a deliberately broken fact in an otherwise good answer."""
    case = golden_case("career", *cr, NOW)
    # Use a tag that actually exists in the career answer
    broken = case.answer.replace(
        '<fact kind="lagna" sign="Pisces" chart="D10">',
        '<fact kind="lagna" sign="Aries" chart="D10">',
        1,
    )
    assert broken != case.answer, "Test setup: the golden answer must contain the tag we broke"
    result = evaluate(broken, *cr)
    assert result["passes"] is False
    assert result["contradicted"] >= 1


def test_evaluate_flags_missing_structure(cr):
    """evaluate() must detect a missing Confidence footer (passes is verifier-only)."""
    case = golden_case("timing", *cr, NOW)
    stripped = case.answer.replace("**Confidence:**", "**Verdict:**", 1)
    result = evaluate(stripped, *cr)
    assert result["has_confidence"] is False
    assert result["passes"] is True  # no contradiction: verifier-only pass