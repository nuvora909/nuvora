"""Saved charts always answer from today's periods and transits, and readings stay in plain language."""
import re
import sys
from datetime import datetime, timezone
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parent.parent
for p in (ROOT, ROOT / "server", ROOT / "chat"):
    if str(p) not in sys.path:
        sys.path.insert(0, str(p))

import server.app as appmod  # noqa: E402
from chat.facts import extract_and_verify  # noqa: E402
from chat.golden_exemplars import REFERENCE_ASKED_AT, REFERENCE_BIRTH  # noqa: E402
from chat.offline import offline_answer  # noqa: E402
from chat.session import ChatSession  # noqa: E402
from vedic import BirthInput, Options, analyse  # noqa: E402


@pytest.fixture(scope="module")
def chart():
    return analyse(BirthInput(**REFERENCE_BIRTH), Options(), REFERENCE_ASKED_AT)


def _visible(text):
    return re.sub(r"<fact[^>]*>|</fact>", "", text)


def test_an_old_session_is_recalculated_for_today(chart):
    c, r = chart                                   # calculated for the 2026 reference date, not today
    sess = ChatSession(c, r, use_env_llm=False)
    sess.chart_request = appmod.ChartRequest(date="1990-01-01", time="12:00", lat=28.6139, lon=77.209,
                                             tz="Asia/Kolkata")
    appmod._keep_current(sess)
    tz = sess.chart.time.local.tzinfo
    at = datetime.fromisoformat(sess.report["transits"]["at"]).astimezone(tz).date()
    assert at == datetime.now(tz).date()
    assert sess.full_report is sess.report and str(at) in sess.system


def test_saved_answers_expire_with_the_day(monkeypatch):
    req = appmod.ChartRequest(date="1990-01-01", time="12:00", lat=51.5, lon=-0.12, tz="Europe/London")
    today = appmod._chart_key(req)
    assert today == appmod._chart_key(req)         # stable within a day

    class Tomorrow(datetime):
        @classmethod
        def now(cls, tz=None):
            return datetime(2099, 1, 2, tzinfo=tz or timezone.utc)
    monkeypatch.setattr(appmod, "datetime", Tomorrow)
    assert appmod._chart_key(req) != today         # a new day never reuses yesterday's answers


@pytest.mark.parametrize("question", ["How will my career be?", "Will I get married?", "How is my money?"])
def test_readings_are_plain_and_cross_checked(chart, question):
    c, r = chart
    text = offline_answer(c, r, question, question_time=REFERENCE_ASKED_AT)
    shown = _visible(text)
    assert not re.search(r"\b\d{4}-\d{2}-\d{2}\b", shown), "dates are written for people, not as ISO strings"
    assert not re.search(r"\bH\d{1,2}\b", shown) and "bindus" not in shown and "plugs" not in shown
    assert "most concrete window" not in shown
    assert shown.count("the classical trigger that turns") <= 1, "the trigger is explained once"
    assert "Your best window is **" in shown.split("### Why")[0]
    assert "**KP, a separate system" in shown
    assert not extract_and_verify(text, c, r).contradicted
