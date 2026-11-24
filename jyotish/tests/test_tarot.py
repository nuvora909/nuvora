"""Tarot readings: composed answers read the spread as a whole, golden readings set the bar."""
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parent.parent
for sub in ("server", "chat"):
    if str(ROOT / sub) not in sys.path:
        sys.path.insert(0, str(ROOT / sub))

from chat.quality import score_tarot  # noqa: E402
from tarot_golden import CANONICAL_DRAWS, TAROT_EXEMPLARS, tarot_golden_guidance  # noqa: E402
from tarot_reading import _fallback, _fallback_classic, draw_cards, interpret  # noqa: E402

QUESTIONS = {
    "1": ["What energy should I focus on today?", "Will this week go well?"],
    "3": ["Should I accept the new job offer?", "Does Rahul still love me?", "Is this a good time to save money?"],
    "7": ["I feel stuck in life. What do I need to understand to move forward?", "Where is my career heading this year?"],
}


@pytest.mark.parametrize("spread,question", [(s, q) for s, qs in QUESTIONS.items() for q in qs])
def test_composed_reading_reads_like_a_reader(spread, question):
    cards = CANONICAL_DRAWS[spread]
    reading = _fallback(question, cards, "en")
    q = score_tarot(reading, cards)
    assert q["score"] >= 85, (question, q["score"], q["issues"])
    assert len(reading["card_readings"]) == len(cards)
    text = " ".join([reading["summary"], reading["synthesis"]] + [r["text"] for r in reading["card_readings"]])
    assert "The The" not in text and "the The" not in text


def test_composed_reading_beats_the_old_template():
    cards = CANONICAL_DRAWS["3"]
    question = "Should I accept the new job offer?"
    assert score_tarot(_fallback(question, cards, "en"), cards)["score"] >= \
        score_tarot(_fallback_classic(question, cards, "en"), cards)["score"] + 25


def test_other_person_questions_stay_honest():
    reading = _fallback("Does Rahul still love me?", CANONICAL_DRAWS["3"], "en")
    assert reading["verdict"] != "YES"
    assert "private feelings" in reading["summary"]


def test_random_draws_always_compose_cleanly():
    for spread in (1, 3, 7):
        for _ in range(25):
            cards = draw_cards(spread)
            reading = _fallback("Should I start my own business?", cards, "en")
            assert reading["verdict"] in {"YES", "NO", "MAYBE", "POSSIBLE"}
            assert score_tarot(reading, cards)["score"] >= 75


def test_high_stakes_questions_get_the_professional_notice():
    out = interpret("Should I stop my medical treatment?", 3, "en")
    assert out["reading"]["verdict"] == "MAYBE" and "professional" in out["reading"]["summary"].lower()


def test_hindi_keeps_its_devanagari_reader():
    reading = _fallback("क्या मुझे नई नौकरी लेनी चाहिए?", CANONICAL_DRAWS["3"], "hi")
    assert any("ऀ" <= ch <= "ॿ" for ch in reading["summary"])


@pytest.mark.parametrize("spread", list(TAROT_EXEMPLARS))
def test_golden_tarot_readings_meet_the_bar(spread):
    ex = TAROT_EXEMPLARS[spread]
    assert score_tarot(ex["reading"], CANONICAL_DRAWS[spread])["score"] >= 95
    assert [r["position"] for r in ex["reading"]["card_readings"]] == [c["position"] for c in CANONICAL_DRAWS[spread]]


def test_guidance_uses_the_hand_written_reading():
    g = tarot_golden_guidance("3", "anything")
    assert "DIFFERENT QUESTION AND CARDS" in g and "Should I accept the new job offer?" in g


class _CfgLLM:
    class cfg:
        temperature, max_tokens, model = 0.2, 4096, "fake"

    def complete(self, system, messages, tools):
        return {"text": "not json", "tool_calls": [], "usage": {}}


def test_tarot_does_not_change_the_shared_model_settings():
    llm = _CfgLLM()
    interpret("Will the project succeed?", 3, "en", llm=llm, ai_consent=True)
    assert (llm.cfg.temperature, llm.cfg.max_tokens) == (0.2, 4096)
