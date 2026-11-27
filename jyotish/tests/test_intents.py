"""The built-in reader answers what was actually asked, part by part, in a human voice."""
import re
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parent.parent
for p in (ROOT, ROOT / "server", ROOT / "chat"):
    if str(p) not in sys.path:
        sys.path.insert(0, str(p))

from chat.facts import extract_and_verify  # noqa: E402
from chat.golden_exemplars import REFERENCE_ASKED_AT, REFERENCE_BIRTH  # noqa: E402
from chat.intents import intent_of, split_parts, topic_of  # noqa: E402
from chat.offline import offline_answer  # noqa: E402
from vedic import BirthInput, Options, analyse  # noqa: E402


@pytest.fixture(scope="module")
def chart():
    return analyse(BirthInput(**REFERENCE_BIRTH), Options(), REFERENCE_ASKED_AT)


@pytest.mark.parametrize("question,intent,topic", [
    ("When will I get married?", "when", "marriage"),
    ("Will I get married in 2027?", "year", "marriage"),
    ("When will I buy a house?", "when", "property"),
    ("Tell me about my personality", "personality", None),
    ("What remedies should I do?", "remedies", None),
    ("Which gemstone should I wear?", "gemstone", None),
    ("Is my Sade Sati over?", "sade_sati", None),
    ("When will my bad time end?", "bad_time", None),
    ("Which career suits me best?", "career_choice", "career"),
    ("Love marriage or arranged marriage for me?", "love_arranged", "marriage"),
    ("Will I get a government job?", "govt_job", "career"),
    ("Should I start my own business or stay in a job?", "business_job", "career"),
    ("Will I win my court case?", "legal", None),
    ("Is this a good time to sign a contract?", "muhurta", None),
    ("Will my father's health improve?", "relative:father", None),
])
def test_intent_and_topic_are_understood(question, intent, topic):
    assert intent_of(question) == intent
    if topic:
        assert topic_of(question, intent).key == topic


def test_multi_part_questions_are_split():
    parts = split_parts("Will I get married and will my husband be supportive and well settled?")
    assert parts == ["Will I get married", "will my husband be supportive and well settled"]
    assert intent_of(parts[1]) == "relative:husband"  # "well" must not turn this into a health question


@pytest.mark.parametrize("question,must", [
    ("When will I get married?", r"most likely window is \*\*\w+ \d{4}"),
    ("Will I get married in 2027?", r"2027"),
    ("What remedies should I do?", r"Om \w+"),
    ("Which gemstone should I wear?", r"recommend is \*\*"),
    ("Is my Sade Sati over?", r"\d{1,2} \w+ \d{4}"),
    ("Is this a good time to sign a contract?", r"best days in the next month"),
    ("Will I get married and will my husband be supportive and well settled?", r"\*\*Well settled:\*\*.*\n\n\*\*Supportive:\*\*"),
])
def test_answers_lead_with_what_was_asked_and_stay_verified(chart, question, must):
    c, r = chart
    text = offline_answer(c, r, question, question_time=REFERENCE_ASKED_AT)
    assert re.search(must, text, re.S), text[:400]
    assert not extract_and_verify(text, c, r).contradicted
    assert not re.search(r"\b(mars|saturn|jupiter|venus|mercury)\b", text)  # planet names keep their capitals


def test_built_in_only_switch(monkeypatch):
    from chat import llm
    monkeypatch.setenv("NUVORA_AI_READER", "off")
    assert llm.LLMConfig.from_env() is None and llm.get_llm() is None
    assert llm.status()["disabled"] is True
