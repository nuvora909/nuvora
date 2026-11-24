"""The astrologer's judgment layer: verified conclusions, double transits, calibration and the quality rubric."""
from datetime import datetime, timezone

import pytest

from chat.facts import extract_and_verify
from chat.golden_exemplars import EXEMPLARS
from chat.judgment import CALIBRATION, Judge, double_transits, judge, working_notes
from chat.offline import offline_answer
from chat.quality import score_reading
from chat.session import ChatSession
from chat.topics import TOPICS
from vedic import BirthInput, analyse
from vedic.constants import SIGNS

NOW = datetime(2026, 11, 24, 6, 0, tzinfo=timezone.utc)


@pytest.fixture(scope="module")
def cr():
    b = BirthInput(year=1990, month=1, day=1, hour=12, minute=0, lat=28.6139, lon=77.2090, tz_name="Asia/Kolkata")
    return analyse(b, now=NOW)


@pytest.mark.parametrize("key", list(TOPICS))
def test_working_notes_contain_only_verified_facts(key, cr):
    notes = working_notes(judge(*cr, TOPICS[key], NOW))
    rep = extract_and_verify(notes, *cr)
    bad = [c.as_dict() for c in rep.checks if c.verdict != "verified"]
    assert rep.summary()["total"] >= 5 and not bad, (key, bad)


def test_double_transit_matches_the_sky(cr):
    """Jupiter in Leo (5th aspect) and Saturn in Pisces (10th aspect) both reach Sagittarius in Dec 2026."""
    chart, _ = cr
    tenth = chart.house_sign[10]
    assert SIGNS[tenth] == "Sagittarius"
    hits = double_transits(chart, {tenth: "your 10th house"}, NOW, datetime(2027, 3, 1, tzinfo=timezone.utc))
    assert hits, "expected a Jupiter-Saturn double transit on the 10th house"
    start, end, jupiter, saturn, label = hits[0]
    assert (SIGNS[jupiter], SIGNS[saturn], label) == ("Leo", "Pisces", "your 10th house")
    assert start <= datetime(2026, 12, 25, tzinfo=timezone.utc) <= end


def test_career_windows_rank_the_double_transit_and_explain_it(cr):
    j = judge(*cr, TOPICS["career"], NOW)
    assert j.windows and j.windows[0].double_transit
    assert all(w.start <= w2.start for w, w2 in zip(j.windows, j.windows[1:])), "windows are shown in date order"
    assert "double transit" in j.windows[0].text


def test_a_planet_is_not_counted_twice(cr):
    """Jupiter rules both the 1st and the 10th: its navamsha debility must appear once, not twice."""
    j = judge(*cr, TOPICS["general"], NOW)
    keys = [f.key for f in j.drivers + j.counterweights if f.key]
    assert len(keys) == len(set(keys))


def test_own_sign_malefic_protects_its_house(cr):
    """Mars in its own 9th house guards the house; it must not be read as friction there."""
    texts = " ".join(f.text for f in Judge(*cr, NOW)._house_factors(9, 1.0))
    assert "guarding the house" in texts and "adds friction" not in texts


def test_foreign_reading_is_anchored_on_the_twelfth_house(cr):
    j = judge(*cr, TOPICS["foreign"], NOW)
    assert "12th lord" in j.theme


def test_leans_are_calibrated_per_topic():
    for key, (low, mid, high) in CALIBRATION.items():
        assert key in TOPICS and low < mid < high
    assert Judge.lean_for("career", 99) == "strong" and Judge.lean_for("career", -99) == "demanding"


def test_confidence_never_exceeds_birth_time_limits(cr):
    for key in ("career", "marriage", "general"):
        j = judge(*cr, TOPICS[key], NOW)
        assert j.notes, "this chart's divisional ascendants are birth-time fragile"
        assert j.confidence != "high"


# ------------------------------------------------------------------ quality rubric

def test_rubric_separates_golden_from_template(cr):
    golden = score_reading(EXEMPLARS["career"]["answer"])
    template = ("### Bottom line\n\nThe house has 31 bindus, above the 28-bindu reference. This is one supportive "
                "factor, not a guarantee. The ruling planet sits in a prominent or supportive house, connecting "
                "this topic to other important parts of life.\n\n1. Reflect on what resonates with your lived experience")
    bad = score_reading(template)
    assert golden["score"] >= 92 and bad["score"] < 50
    assert any("template phrases" in issue for issue in bad["issues"])


def test_offline_reader_now_reads_like_a_judgement(cr):
    text = offline_answer(*cr, "How does my career look and when will it move?", question_time=NOW)
    assert text.startswith("### The short answer") and "double transit" in text
    assert score_reading(text)["score"] >= 85


class _MechanicalThenGoodLLM:
    """First answer is factually right but templated; the rewrite request gets a considered answer."""
    class cfg:
        model = "fake"

    def __init__(self):
        self.prompts = []

    def complete(self, system, messages, tools):
        last = messages[-1]["content"]
        self.prompts.append(last)
        if "reads too mechanically" in last:
            return {"text": EXEMPLARS["career"]["answer"], "tool_calls": [], "usage": {}}
        templated = ("### Bottom line\n\n" + " ".join(
            [f'<fact kind="sav" house="10" value="32">The 10th house has 32 bindus</fact>, above the 28-bindu reference. '
             "This is one supportive factor, not a guarantee."] * 14)
            + "\n\nReflect on what resonates with your lived experience.")
        return {"text": templated, "tool_calls": [], "usage": {}}


def test_session_rewrites_a_mechanical_answer_once():
    from chat.golden_exemplars import REFERENCE_ASKED_AT, REFERENCE_BIRTH
    chart, report = analyse(BirthInput(**REFERENCE_BIRTH), now=REFERENCE_ASKED_AT)
    llm = _MechanicalThenGoodLLM()
    out = ChatSession(chart, report, llm=llm, use_golden=True).ask("How does my career look?")
    assert out["mode"] == "llm" and out["summary"]["contradicted"] == 0
    assert out["quality"]["score"] >= 92 and out["repairs"] == 1
    assert sum("reads too mechanically" in p for p in llm.prompts) == 1
    first = llm.prompts[0]
    assert "Astrologer's working notes" in first and "double transit" in first
