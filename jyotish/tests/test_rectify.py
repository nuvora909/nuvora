"""Birth-time correction recovers a known time from life events and refuses to change it on thin evidence."""
import sys
from dataclasses import replace
from datetime import datetime, timedelta, timezone
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parent.parent
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from chat.golden_exemplars import REFERENCE_BIRTH  # noqa: E402
from vedic.chart import BirthInput, Chart, Options  # noqa: E402
from vedic.rectify import Event, rectify, score_chart  # noqa: E402
from tests.test_accounts import signup  # noqa: E402
from tests.test_reading_jobs import api_client  # noqa: E402,F401

TRUE = BirthInput(**REFERENCE_BIRTH)          # 12:00 IST, New Delhi


@pytest.fixture(scope="module")
def planted():
    """Events placed where the true 12:00 chart explains them best, one search per event type."""
    c = Chart(TRUE, Options(vargas=()))
    events = []
    for kind in ("marriage", "job", "child", "property", "abroad"):
        best = None
        d = datetime(2014, 3, 1, 12, tzinfo=timezone.utc)
        while d < datetime(2026, 1, 1, tzinfo=timezone.utc):
            slow = {d: tuple(int(c.eph.sidereal_longitude_series([d], p)[0] // 30) for p in ("JUPITER", "SATURN"))}
            s, _ = score_chart(c, [Event(kind, d)], slow)
            if best is None or s > best[0]:
                best = (s, d)
            d += timedelta(days=11)
        events.append(Event(kind, best[1]))
    return events


@pytest.mark.parametrize("offset", [-25, 40])
def test_a_wrong_time_is_corrected_back_to_the_true_one(planted, offset):
    t = datetime(1990, 1, 1, 12) + timedelta(minutes=offset)
    res = rectify(replace(TRUE, hour=t.hour, minute=t.minute), planted, window_minutes=60)
    assert res["verdict"] == "change"
    best = datetime.strptime(res["best"]["time"], "%H:%M")
    assert abs((best - datetime(1900, 1, 1, 12)).total_seconds()) <= 5 * 60, res["best_range"]


def test_the_true_time_is_kept(planted):
    res = rectify(TRUE, planted, window_minutes=30)
    assert res["verdict"] == "keep", res["message"]


def test_too_few_events_never_change_the_time():
    res = rectify(TRUE, [Event.parse("marriage", "2018-02-10")], window_minutes=20)
    assert res["verdict"] == "need_more_events" and res["confidence"] == "low"


def test_events_before_birth_are_rejected():
    with pytest.raises(ValueError):
        rectify(TRUE, [Event.parse("marriage", "1980-01-01")], window_minutes=10)


def test_rectify_api(api_client):
    signup(api_client)
    body = {"date": "1990-01-01", "time": "12:40", "lat": 28.6139, "lon": 77.209, "tz": "Asia/Kolkata",
            "events": [{"kind": "marriage", "date": "2024-02-18"}, {"kind": "job", "date": "2014-03-01"},
                       {"kind": "child", "date": "2024-02-18"}], "window_minutes": 30}
    r = api_client.post("/api/rectify", json=body)
    assert r.status_code == 200, r.text
    assert r.json()["verdict"] in ("keep", "change") and r.json()["curve"]
    bad = api_client.post("/api/rectify", json={**body, "events": [{"kind": "nonsense", "date": "2020-01-01"}]})
    assert bad.status_code == 400
