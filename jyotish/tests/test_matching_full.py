"""Boy-and-girl matching: classical exceptions, both Manglik checks, a plain verdict, and a free preview."""
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parent.parent
for p in (ROOT, ROOT / "server"):
    if str(p) not in sys.path:
        sys.path.insert(0, str(p))

from vedic import BirthInput, Options, analyse  # noqa: E402
from vedic.compat import full_match  # noqa: E402
from tests.test_accounts import signup  # noqa: E402
from tests.test_reading_jobs import api_client  # noqa: E402,F401

GIRL = dict(year=1994, month=3, day=12, hour=8, minute=20, lat=28.61, lon=77.21, tz_name="Asia/Kolkata",
            name="Priya", gender="female")
BOY = dict(year=1991, month=11, day=2, hour=21, minute=5, lat=19.07, lon=72.88, tz_name="Asia/Kolkata",
           name="Rahul", gender="male")


@pytest.fixture(scope="module")
def pair():
    g, b = analyse(BirthInput(**GIRL), Options()), analyse(BirthInput(**BOY), Options())
    return g, b


def test_full_match_gives_a_reasoned_verdict(pair):
    (cg, rg), (cb, rb) = pair
    m = full_match(cg, cb, rg, rb)
    assert m["verdict"] in ("Excellent match", "Good match", "Workable match, with care", "Challenging match by tradition")
    assert 0 <= m["score"] <= m["adjusted_score"] <= 36
    assert len(m["kootas"]) == 8 and m["reasons"] and m["remedies"]
    assert m["manglik"]["balance"] in ("balanced", "clear", "imbalanced")
    assert m["girl"]["name"] == "Priya" and m["boy"]["name"] == "Rahul"


def test_cancelled_nadi_dosha_gets_its_points_back(pair):
    (cg, rg), _ = pair
    m = full_match(cg, cg, rg, rg)          # same chart: same Nadi, same sign, same nakshatra and pada
    kootas = {k["key"]: k for k in m["kootas"]}
    assert kootas["nadi"]["score"] == 0
    # Same Moon sign lord on both sides is a classical cancellation, so the 8 points come back.
    assert m["exceptions"]["nadi"] and m["adjusted_score"] >= m["score"] + 8


def _req(d):
    return {"name": d["name"], "date": f"{d['year']}-{d['month']:02d}-{d['day']:02d}",
            "time": f"{d['hour']:02d}:{d['minute']:02d}:00", "lat": d["lat"], "lon": d["lon"], "tz": d["tz_name"]}


def test_free_users_see_the_verdict_and_score_only(api_client):
    signup(api_client)
    r = api_client.post("/api/matching", json={"girl": _req(GIRL), "boy": _req(BOY)})
    assert r.status_code == 200, r.text
    j = r.json()
    assert j["locked"] is True and "verdict" in j and "kootas" not in j and "remedies" not in j
    assert api_client.post("/api/matching/pdf", json={"girl": _req(GIRL), "boy": _req(BOY)}).status_code == 402
