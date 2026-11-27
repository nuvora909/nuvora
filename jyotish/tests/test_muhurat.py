"""Daily muhurat matches the standard rules and, for a checked day, Drik Panchang to the minute."""
import sys
from datetime import date
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parent.parent
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from vedic.muhurat import day_muhurat  # noqa: E402
from tests.test_accounts import signup  # noqa: E402
from tests.test_reading_jobs import api_client  # noqa: E402,F401

DELHI = (28.6139, 77.209, "Asia/Kolkata")


@pytest.fixture(scope="module")
def friday():
    return day_muhurat(date(2026, 11, 27), *DELHI)


def _hm(m, name, n=0):
    p = [x for x in m["periods"] if x["name"] == name][n]
    return p["start"][11:16], p["end"][11:16]


def test_matches_drik_panchang_for_new_delhi(friday):
    # Drik Panchang, New Delhi, Friday 27 November 2026
    assert friday["weekday"] == "Friday" and friday["sunrise"][11:16] == "06:53" and friday["sunset"][11:16] == "17:24"
    assert _hm(friday, "Rahu Kaal") == ("10:50", "12:09")
    assert _hm(friday, "Yamaganda") == ("14:46", "16:05")
    assert _hm(friday, "Gulika Kaal") == ("08:12", "09:31")
    assert _hm(friday, "Abhijit Muhurat") == ("11:48", "12:30")
    assert _hm(friday, "Brahma Muhurat") == ("05:05", "05:59")
    assert _hm(friday, "Dur Muhurat", 0) == ("08:59", "09:41") and _hm(friday, "Dur Muhurat", 1) == ("12:30", "13:12")
    v = _hm(friday, "Varjyam")
    assert v[0] in ("01:59", "02:00") and v[1] == "03:26"
    assert friday["panchang"]["nakshatra"][0]["name"] == "Ardra"
    assert friday["panchang"]["nakshatra"][0]["until"][11:16] in ("15:08", "15:09")   # Drik: 15:08
    assert friday["panchang"]["yoga"][0]["name"] == "Shubha"


def test_choghadiya_follows_the_weekday(friday):
    day = [c["name"] for c in friday["choghadiya"] if c["part"] == "day"]
    night = [c["name"] for c in friday["choghadiya"] if c["part"] == "night"]
    assert day[0] == "Char" and day[-1] == "Char" and night[0] == "Rog" and len(day) == len(night) == 8
    assert friday["hora"][0]["planet"] == "Venus" and len(friday["hora"]) == 24


def test_best_windows_avoid_the_bad_periods(friday):
    bad = [(p["start"], p["end"]) for p in friday["periods"] if p["kind"] == "bad"]
    for b in friday["best"].values():
        for w in b["windows"]:
            assert all(w["end"] <= x or w["start"] >= y for x, y in bad), (b["label"], w)


def test_muhurat_api(api_client):
    signup(api_client)
    r = api_client.get("/api/muhurat", params={"date": "2026-11-28", "lat": DELHI[0], "lon": DELHI[1], "tz": DELHI[2]})
    assert r.status_code == 200 and r.json()["weekday"] == "Saturday"
    assert api_client.get("/api/muhurat", params={"date": "2026-11-28", "lat": 1, "lon": 1, "tz": "Not/AZone"}).status_code == 400
