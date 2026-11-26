"""Questions about a coming period are answered month by month, with dated good days, not just natal promise."""
import re
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parent.parent
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from chat.facts import extract_and_verify  # noqa: E402
from chat.golden_exemplars import REFERENCE_ASKED_AT, REFERENCE_BIRTH  # noqa: E402
from chat.near_term import analyse as near_term, event_of, horizon_months, notes  # noqa: E402
from chat.offline import offline_answer  # noqa: E402
from chat.topics import detect_topic  # noqa: E402
from vedic import BirthInput, Options, analyse  # noqa: E402

MONEY_Q = "i want to know how will be my coming months in terms of finances. Will i crack any meeting with great money outcomes?"


@pytest.fixture(scope="module")
def chart():
    return analyse(BirthInput(**REFERENCE_BIRTH), Options(), REFERENCE_ASKED_AT)


@pytest.mark.parametrize("question,months", [
    (MONEY_Q, 6), ("How will the next 3 months be for my career?", 3), ("What about this month?", 2),
    ("How will next year be for money?", 12), ("Is my chart good for wealth?", None),
])
def test_horizon_is_read_from_the_question(question, months):
    assert horizon_months(question) == months


def test_meeting_questions_are_recognised():
    assert event_of(MONEY_Q) == "meeting"
    assert event_of("Will I get a promotion soon?") == "job"


def test_money_question_is_answered_month_by_month(chart):
    c, r = chart
    text = offline_answer(c, r, MONEY_Q, question_time=REFERENCE_ASKED_AT)
    short = text.split("### Month by month")[0]
    assert "Over the next 6 months" in short and "money meeting" in short
    assert "### Month by month" in text and "### Good days for money meetings" in text
    assert len(re.findall(r"^- \*\*(?:January|February|March|April|May|June|July|August|September|October|November|December) 20\d\d — ",
                          text, re.M)) == 6
    rep = extract_and_verify(text, c, r)
    assert not rep.contradicted, [ch.as_dict() for ch in rep.contradicted]


def test_good_days_pass_every_filter(chart):
    c, _ = chart
    nt = near_term(c, detect_topic(MONEY_Q), MONEY_Q, REFERENCE_ASKED_AT)
    assert nt.days and all(t.weekday() in (2, 3, 4) for t, _ in nt.days)  # Wednesday, Thursday, Friday
    assert all("tara" in why for _, why in nt.days)
    assert "LEAD with this" in notes(nt, detect_topic(MONEY_Q))


def test_plain_questions_keep_the_natal_reading(chart):
    c, r = chart
    text = offline_answer(c, r, "Is my chart good for wealth?", question_time=REFERENCE_ASKED_AT)
    assert "### Month by month" not in text and "### Why the chart says this" in text
